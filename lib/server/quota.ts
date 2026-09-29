import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { AppError, type FailureKind } from "./errors";
import {
  getQuotaConfig,
  quotaControlKey,
  quotaPrefix,
  type QuotaConfig,
} from "./quota-config";
import {
  ACQUIRE_SCRIPT,
  PREFLIGHT_SCRIPT,
  RELEASE_SCRIPT,
  START_SCRIPT,
} from "./quota-scripts";

export interface QuotaLease {
  release(): Promise<void>;
}
export interface QuotaAttempt {
  acquire(signal: AbortSignal): Promise<QuotaLease>;
  assertEnabled(lease: QuotaLease, signal: AbortSignal): Promise<void>;
}
export interface QuotaService {
  preflight(
    request: Request,
    requestId: string,
    signal: AbortSignal,
  ): Promise<QuotaAttempt>;
}
export type RedisExecutor = (
  script: string,
  keys: string[],
  args: string[],
  signal?: AbortSignal,
) => Promise<unknown>;
const unavailable = (kind: FailureKind = "schema") =>
  new AppError("rate_limit_unavailable", kind);

export function normalizeIp(value: string): string {
  if (
    !value ||
    value !== value.trim() ||
    value.includes("%") ||
    value.includes(",")
  )
    throw unavailable("configuration");
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) throw unavailable("configuration");
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (mapped) {
    const high = parseInt(mapped[1], 16),
      low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return normalized;
}

export function resolveQuotaIp(request: Request, config: QuotaConfig): string {
  // Trust was established using deployment configuration, never request headers.
  if (config.trustedProxy === "vercel")
    return normalizeIp(request.headers.get("x-vercel-forwarded-for") ?? "");
  if (config.developmentIp) return normalizeIp(config.developmentIp);
  throw unavailable("configuration");
}

export function createRedisExecutor(
  config: QuotaConfig,
  transport: typeof fetch = fetch,
): RedisExecutor {
  return async (script, keys, args, parent) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (parent?.aborted) throw unavailable("cancelled");
    parent?.addEventListener("abort", cancel, { once: true });
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, config.redisTimeoutMs);
    try {
      const work = async () => {
        // One POST only. No SDK retries, fail-open fallback, redirect, or cache.
        const response = await transport(config.redisUrl, {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${config.redisToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(["EVAL", script, keys.length, ...keys, ...args]),
          signal: controller.signal,
        });
        if (controller.signal.aborted)
          throw unavailable(timeout ? "timeout" : "cancelled");
        if (!response.ok)
          throw unavailable(
            response.status === 401 || response.status === 403
              ? "configuration"
              : "network",
          );
        const body: unknown = await response.json();
        if (controller.signal.aborted)
          throw unavailable(timeout ? "timeout" : "cancelled");
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).length !== 1 ||
          !("result" in body)
        )
          throw unavailable();
        return body.result;
      };
      // Also bound transports/body readers that do not cooperate with cancellation.
      // The observed late result never becomes an AI admission.
      return await new Promise<unknown>((resolve, reject) => {
        const aborted = () =>
          reject(unavailable(timeout ? "timeout" : "cancelled"));
        controller.signal.addEventListener("abort", aborted, { once: true });
        work().then(
          (value) => {
            controller.signal.removeEventListener("abort", aborted);
            resolve(value);
          },
          (error: unknown) => {
            controller.signal.removeEventListener("abort", aborted);
            reject(error);
          },
        );
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable(
        timeout ? "timeout" : parent?.aborted ? "cancelled" : "network",
      );
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    }
  };
}

const limits = [
  "client_rate_limited",
  "daily_quota_exceeded",
  "global_quota_exceeded",
  "analysis_busy",
] as const;
function accept(result: unknown, allowed: readonly string[]): void {
  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    typeof result[0] !== "string" ||
    !Number.isSafeInteger(result[1]) ||
    result[1] < 0 ||
    result[1] > 86400
  )
    throw unavailable();
  const [code, retry] = result as [string, number];
  if (code === "ok" && retry === 0) return;
  if (code === "analysis_disabled" && retry === 0)
    throw new AppError("analysis_disabled", "configuration");
  if (
    allowed.includes(code) &&
    limits.includes(code as (typeof limits)[number]) &&
    retry > 0
  )
    throw new AppError(
      code as (typeof limits)[number],
      "rate_limit",
      String(retry),
    );
  throw unavailable();
}

export function createQuotaService(
  config: QuotaConfig = getQuotaConfig(),
  dependencies: { execute?: RedisExecutor; fetch?: typeof fetch } = {},
): QuotaService {
  const execute =
    dependencies.execute ?? createRedisExecutor(config, dependencies.fetch);
  const prefix = quotaPrefix(config),
    control = quotaControlKey(config);
  const run: RedisExecutor = async (...args) => {
    if (args[3]?.aborted) throw unavailable("cancelled");
    try {
      const value = await execute(...args);
      if (args[3]?.aborted) throw unavailable("cancelled");
      return value;
    } catch (error) {
      throw error instanceof AppError ? error : unavailable("network");
    }
  };
  return {
    async preflight(request, requestId, signal) {
      if (!config.deploymentEnabled)
        throw new AppError("analysis_disabled", "configuration");
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw unavailable();
      const ip = resolveQuotaIp(request, config);
      const code = createHmac("sha256", config.hmacSecret)
        .update(ip)
        .digest("hex");
      accept(
        await run(
          PREFLIGHT_SCRIPT,
          [control, `${prefix}:window:${code}`],
          [requestId, String(config.windowLimit)],
          signal,
        ),
        ["client_rate_limited"],
      );
      const leases = `${prefix}:leases`,
        receipt = `${prefix}:receipt:${requestId}`;
      const owners = new WeakMap<QuotaLease, string>();
      const token = randomUUID();
      return {
        async acquire(acquireSignal) {
          accept(
            await run(
              ACQUIRE_SCRIPT,
              [
                control,
                `${prefix}:daily:${code}`,
                `${prefix}:daily:global`,
                leases,
                receipt,
              ],
              [
                token,
                String(config.ipDailyLimit),
                String(config.globalDailyLimit),
                String(config.concurrencyLimit),
                String(config.leaseMs),
              ],
              acquireSignal,
            ),
            limits,
          );
          const lease: QuotaLease = {
            async release() {
              const result = await run(RELEASE_SCRIPT, [leases], [token]);
              if (result !== 0 && result !== 1) throw unavailable();
            },
          };
          owners.set(lease, token);
          return lease;
        },
        async assertEnabled(lease, startSignal) {
          const owner = owners.get(lease);
          if (!owner) throw unavailable();
          accept(
            await run(
              START_SCRIPT,
              [control, leases, receipt],
              [owner],
              startSignal,
            ),
            [],
          );
        },
      };
    },
  };
}
