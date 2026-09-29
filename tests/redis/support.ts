import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { QuotaConfig } from "../../lib/server/quota-config";
import {
  ACQUIRE_SCRIPT,
  PREFLIGHT_SCRIPT,
  RELEASE_SCRIPT,
  START_SCRIPT,
  TAIPEI_DAY_LUA,
} from "../../lib/server/quota-scripts";

export type RedisCommand = (parts: string[]) => Promise<unknown>;
export const TEST_COMMAND_CAP = 250;
export const TEMPORARY_KEY_TTL_MS = 600000;
export const DAY_TEST_SCRIPT = `${TAIPEI_DAY_LUA}\nlocal day, reset = taipei_day(tonumber(ARGV[1])); return {day, reset}`;
export const SEED_HASH_SCRIPT = `redis.call('HSET', KEYS[1], unpack(ARGV)); redis.call('PEXPIRE', KEYS[1], 600000); return 1`;
export const SEED_ZSET_SCRIPT = `redis.call('ZADD', KEYS[1], unpack(ARGV)); redis.call('PEXPIRE', KEYS[1], 600000); return 1`;
const allowedScripts = new Set([
  ACQUIRE_SCRIPT,
  PREFLIGHT_SCRIPT,
  RELEASE_SCRIPT,
  START_SCRIPT,
  DAY_TEST_SCRIPT,
  SEED_HASH_SCRIPT,
  SEED_ZSET_SCRIPT,
]);
export class RedisTestError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "connection"
      | "http"
      | "response"
      | "timeout"
      | "command_limit"
      | "isolation"
      | "cleanup",
  ) {
    super(`REDIS_TEST_${code.toUpperCase()}`);
  }
}

export function validateRestTarget(
  env: Record<string, string | undefined>,
  options: { expectedHost?: string; allowWrite: boolean },
): { url: string; token: string; fingerprint: string } {
  // Deliberately never fall back to application, Vercel, or Production settings.
  if (
    !options.allowWrite ||
    !options.expectedHost ||
    !/^[a-z0-9-]+\.upstash\.io$/.test(options.expectedHost)
  )
    throw new RedisTestError("configuration");
  try {
    const url = new URL(env.TEST_UPSTASH_REDIS_REST_URL ?? "");
    const token = env.TEST_UPSTASH_REDIS_REST_TOKEN ?? "";
    if (
      url.protocol !== "https:" ||
      url.hostname !== options.expectedHost ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !token ||
      /\s/.test(token)
    )
      throw new RedisTestError("configuration");
    return {
      url: url.origin,
      token,
      fingerprint: createHash("sha256")
        .update(url.hostname)
        .digest("hex")
        .slice(0, 16),
    };
  } catch {
    throw new RedisTestError("configuration");
  }
}

export function createRestCommand(
  target: { url: string; token: string },
  transport: typeof fetch = fetch,
  timeoutMs = 3000,
): RedisCommand {
  return async (parts) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const work = async () => {
      const response = await transport(target.url, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${target.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parts),
      });
      if (!response.ok) throw new RedisTestError("http");
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !("result" in body)
      )
        throw new RedisTestError("response");
      if (controller.signal.aborted) throw new RedisTestError("timeout");
      return body.result;
    };
    try {
      return await new Promise((resolve, reject) => {
        const abort = () => reject(new RedisTestError("timeout"));
        controller.signal.addEventListener("abort", abort, { once: true });
        work().then(
          (value) => {
            controller.signal.removeEventListener("abort", abort);
            resolve(value);
          },
          (error: unknown) => {
            controller.signal.removeEventListener("abort", abort);
            reject(error);
          },
        );
      });
    } catch (error) {
      throw error instanceof RedisTestError
        ? error
        : new RedisTestError(timedOut ? "timeout" : "connection");
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createTestConfig(
  environment: "development" | "preview",
): QuotaConfig {
  return {
    deploymentEnabled: true,
    redisUrl: "",
    redisToken: "",
    environment,
    namespace: `integration-${randomUUID()}`,
    hmacSecret: randomUUID() + randomUUID(),
    // Identity is injected only into this private test harness; no public test mode.
    trustedProxy: "vercel",
    windowLimit: 3,
    ipDailyLimit: 10,
    globalDailyLimit: 200,
    concurrencyLimit: 3,
    redisTimeoutMs: 1000,
    leaseMs: 60000,
    controlKeySuffix: "analysis-enabled",
  };
}

/** Guard every test command, reserve two requests for exact cleanup + verification. */
export function createGuardedCommands(
  transport: RedisCommand,
  prefixes: string[],
  cap = TEST_COMMAND_CAP,
) {
  if (
    !Number.isSafeInteger(cap) ||
    cap < 3 ||
    cap > TEST_COMMAND_CAP ||
    !prefixes.length ||
    prefixes.some(
      (prefix) =>
        !/^\{scamshield:(?:development|preview):integration-[a-z0-9-]+\}$/.test(
          prefix,
        ),
    )
  )
    throw new RedisTestError("isolation");
  const touched = new Set<string>(),
    pending = new Set<Promise<unknown>>();
  let count = 0,
    closed = false;
  let cleanupPromise: Promise<"confirmed" | "not_needed"> | undefined;
  const own = (key: string) =>
    prefixes.some((prefix) => key.startsWith(`${prefix}:`));
  const command: RedisCommand = async (parts) => {
    if (closed) throw new RedisTestError("isolation");
    const verb = parts[0];
    let keys: string[];
    if (verb === "EVAL") {
      if (!allowedScripts.has(parts[1])) throw new RedisTestError("isolation");
      const length = Number(parts[2]);
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 20 ||
        parts.length < 3 + length
      )
        throw new RedisTestError("isolation");
      keys = parts.slice(3, 3 + length);
    } else if (["DEL", "EXISTS"].includes(verb)) keys = parts.slice(1);
    else if (
      ["SET", "HGET", "ZCARD", "ZSCORE", "ZRANGE", "PTTL", "PEXPIRE"].includes(
        verb,
      )
    )
      keys = [parts[1]];
    else if ((verb === "PING" || verb === "TIME") && parts.length === 1)
      keys = [];
    else if (verb === "INFO" && parts.length === 2 && parts[1] === "server")
      keys = [];
    else throw new RedisTestError("isolation");
    if (keys.some((key) => !own(key))) throw new RedisTestError("isolation");
    // Seed strings (especially control keys) always expire if a process is interrupted.
    if (
      verb === "SET" &&
      (parts.length !== 5 ||
        parts[3] !== "PX" ||
        parts[4] !== String(TEMPORARY_KEY_TTL_MS))
    )
      throw new RedisTestError("isolation");
    if (count >= cap - 2) throw new RedisTestError("command_limit");
    count++;
    keys.forEach((key) => touched.add(key));
    const work = transport(parts);
    pending.add(work);
    try {
      return await work;
    } finally {
      pending.delete(work);
    }
  };
  return {
    command,
    get commandCount() {
      return count;
    },
    cleanup(): Promise<"confirmed" | "not_needed"> {
      cleanupPromise ??= (async () => {
        closed = true;
        await Promise.allSettled([...pending]);
        if (!touched.size) return "not_needed";
        const keys = [...touched];
        // No SCAN/KEYS/FLUSH or external namespace names, including on failure.
        count++;
        await transport(["DEL", ...keys]);
        count++;
        const remaining = await transport(["EXISTS", ...keys]);
        if (remaining !== 0) throw new RedisTestError("cleanup");
        return "confirmed";
      })();
      return cleanupPromise;
    },
  };
}

export async function settleAll<T>(work: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(work);
  if (results.some((result) => result.status === "rejected")) {
    const failed = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    throw failed.reason;
  }
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

export function safeFailureCode(error: unknown): string {
  return error instanceof RedisTestError
    ? error.code
    : "assertion_or_application_failure";
}

export function revisionEvidence(scripts: Record<string, string>) {
  let gitSha: string | undefined;
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[a-f0-9]{40}$/.test(value)) gitSha = value;
  } catch {
    /* Exact script hashes still identify the exercised code. */
  }
  return {
    gitSha,
    scriptSha256: Object.fromEntries(
      Object.entries(scripts).map(([name, script]) => [
        name,
        createHash("sha256").update(script).digest("hex"),
      ]),
    ),
  };
}
