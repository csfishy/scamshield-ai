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
  FINALIZE_SCRIPT,
  PREFLIGHT_SCRIPT,
  START_SCRIPT,
} from "./quota-scripts";

export type QuotaFinalOutcome =
  "success" | "provider_failure" | "neutral_failure";
export type CircuitTransition =
  "none" | "provider_cb_opened" | "provider_cb_closed";
export interface QuotaLease {
  readonly circuitState: "closed" | "half_open";
  finalize(outcome: QuotaFinalOutcome): Promise<CircuitTransition>;
  /** Idempotent compatibility helper: release without committing success. */
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
  "device_quota_exceeded",
  "ip_safety_limit_exceeded",
  "daily_quota_exceeded",
  "global_quota_exceeded",
  "analysis_busy",
  "service_busy",
  "provider_temporarily_unavailable",
] as const;
function accept(
  result: unknown,
  allowed: readonly string[],
  successes: readonly string[] = ["ok"],
): string {
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
  if (successes.includes(code) && retry === 0) return code;
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

const deviceHeader = "x-scamshield-device-id";
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function identityCodes(
  request: Request,
  config: QuotaConfig,
): { ipCode: string; deviceCode: string } {
  const ip = resolveQuotaIp(request, config);
  const ipCode = createHmac("sha256", config.hmacSecret)
    .update("ip\0")
    .update(ip)
    .digest("hex");
  const supplied = request.headers.get(deviceHeader);
  if (supplied !== null && !uuidV4.test(supplied))
    throw new AppError("invalid_request", "input");
  // Legacy/non-browser clients fall back to a privacy-safe IP-derived device
  // bucket. They remain usable, while the web client gets an independent UUID.
  const stable = supplied?.toLowerCase() ?? `legacy-ip:${ip}`;
  const deviceCode = createHmac("sha256", config.hmacSecret)
    .update("device\0")
    .update(stable)
    .digest("hex");
  return { ipCode, deviceCode };
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
      const { ipCode, deviceCode } = identityCodes(request, config);
      accept(
        await run(
          PREFLIGHT_SCRIPT,
          [
            control,
            `${prefix}:rate:ip:${ipCode}:minute`,
            `${prefix}:quota:ip:${ipCode}:day`,
          ],
          [requestId, String(config.windowLimit), String(config.ipDailyLimit)],
          signal,
        ),
        ["client_rate_limited", "ip_safety_limit_exceeded"],
      );
      const deviceCounter = `${prefix}:quota:device:${deviceCode}:day`,
        deviceReservations = `${deviceCounter}:reservations`,
        globalCounter = `${prefix}:quota:global:day`,
        globalReservations = `${prefix}:quota:global:reservations`,
        leases = `${prefix}:provider:concurrency`,
        receipt = `${prefix}:provider:lease:${requestId}`,
        cbState = `${prefix}:provider:cb:state`,
        cbFailures = `${prefix}:provider:cb:failures`,
        cbProbes = `${prefix}:provider:cb:half-open-probes`;
      const owners = new WeakMap<QuotaLease, string>();
      const token = randomUUID();
      return {
        async acquire(acquireSignal) {
          const admission = accept(
            await run(
              ACQUIRE_SCRIPT,
              [
                control,
                deviceCounter,
                deviceReservations,
                globalCounter,
                globalReservations,
                leases,
                receipt,
                cbState,
                cbFailures,
                cbProbes,
              ],
              [
                token,
                String(config.deviceDailyLimit),
                String(config.globalDailyLimit),
                String(config.concurrencyLimit),
                String(config.leaseMs),
                config.circuitBreakerEnabled ? "1" : "0",
                String(config.circuitBreakerFailureThreshold),
                String(config.circuitBreakerWindowSeconds * 1000),
                String(config.circuitBreakerOpenSeconds * 1000),
                String(config.circuitBreakerHalfOpenMaxProbes),
              ],
              acquireSignal,
            ),
            [
              "device_quota_exceeded",
              "global_quota_exceeded",
              "service_busy",
              "provider_temporarily_unavailable",
            ],
            ["ok", "ok_half_open"],
          );
          let finalization: Promise<CircuitTransition> | undefined;
          const finish = (outcome: QuotaFinalOutcome) => {
            finalization ??= (async () => {
              const result = accept(
                await run(
                  FINALIZE_SCRIPT,
                  [
                    deviceCounter,
                    deviceReservations,
                    globalCounter,
                    globalReservations,
                    leases,
                    receipt,
                    cbState,
                    cbFailures,
                    cbProbes,
                  ],
                  [
                    token,
                    outcome,
                    config.circuitBreakerEnabled ? "1" : "0",
                    String(config.circuitBreakerFailureThreshold),
                    String(config.circuitBreakerWindowSeconds * 1000),
                    String(config.circuitBreakerOpenSeconds * 1000),
                  ],
                ),
                [],
                ["ok", "ok_cb_opened", "ok_cb_closed"],
              );
              if (result === "ok_cb_opened") return "provider_cb_opened";
              if (result === "ok_cb_closed") return "provider_cb_closed";
              return "none";
            })();
            return finalization;
          };
          const lease: QuotaLease = {
            circuitState: admission === "ok_half_open" ? "half_open" : "closed",
            finalize: finish,
            async release() {
              await finish("neutral_failure");
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
              [owner, "25000"],
              startSignal,
            ),
            [],
          );
        },
      };
    },
  };
}
