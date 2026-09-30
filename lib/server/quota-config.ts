import "server-only";
import { AppError } from "./errors";

export interface QuotaConfig {
  deploymentEnabled: boolean;
  redisUrl: string;
  redisToken: string;
  environment: "development" | "preview" | "production";
  namespace: string;
  hmacSecret: string;
  trustedProxy: "none" | "vercel";
  developmentIp?: string;
  windowLimit: number;
  deviceDailyLimit: number;
  ipDailyLimit: number;
  globalDailyLimit: number;
  concurrencyLimit: number;
  redisTimeoutMs: number;
  leaseMs: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerFailureThreshold: number;
  circuitBreakerWindowSeconds: number;
  circuitBreakerOpenSeconds: number;
  circuitBreakerHalfOpenMaxProbes: number;
  controlKeySuffix: string;
}

const invalid = () => new AppError("rate_limit_unavailable", "configuration");
const identifier = /^[a-z][a-z0-9-]{0,47}$/;

export function getQuotaConfig(
  env: Record<string, string | undefined> = process.env,
): QuotaConfig {
  if (env.ANALYSIS_ENABLED && !["true", "false"].includes(env.ANALYSIS_ENABLED))
    throw invalid();
  const base: QuotaConfig = {
    deploymentEnabled: env.ANALYSIS_ENABLED === "true",
    redisUrl: "",
    redisToken: "",
    environment: "development",
    namespace: "scamshield",
    hmacSecret: "",
    trustedProxy: "none",
    windowLimit: 5,
    deviceDailyLimit: 30,
    ipDailyLimit: 150,
    globalDailyLimit: 3000,
    concurrencyLimit: 5,
    redisTimeoutMs: 1000,
    leaseMs: 60000,
    circuitBreakerEnabled: true,
    circuitBreakerFailureThreshold: 5,
    circuitBreakerWindowSeconds: 60,
    circuitBreakerOpenSeconds: 30,
    circuitBreakerHalfOpenMaxProbes: 1,
    controlKeySuffix: "analysis-enabled",
  };
  // A safe disabled deployment does not require live service credentials.
  if (!base.deploymentEnabled) return base;
  const environment = env.QUOTA_ENVIRONMENT;
  if (
    !environment ||
    !["development", "preview", "production"].includes(environment)
  )
    throw invalid();
  base.environment = environment as QuotaConfig["environment"];
  if (
    env.VERCEL === "1" &&
    (env.VERCEL_ENV !== environment || environment === "development")
  )
    throw invalid();
  if (env.NODE_ENV === "production" && environment === "development")
    throw invalid();
  base.namespace = env.QUOTA_NAMESPACE ?? base.namespace;
  base.controlKeySuffix = env.QUOTA_CONTROL_KEY_SUFFIX ?? base.controlKeySuffix;
  if (
    !identifier.test(base.namespace) ||
    !identifier.test(base.controlKeySuffix)
  )
    throw invalid();
  try {
    const url = new URL(env.UPSTASH_REDIS_REST_URL ?? "");
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw invalid();
    base.redisUrl = url.origin;
  } catch {
    throw invalid();
  }
  base.redisToken = env.UPSTASH_REDIS_REST_TOKEN ?? "";
  base.hmacSecret = env.QUOTA_IP_HMAC_SECRET ?? "";
  if (
    !base.redisToken ||
    /\s/.test(base.redisToken) ||
    Buffer.byteLength(base.hmacSecret) < 32 ||
    /[\r\n]/.test(base.hmacSecret)
  )
    throw invalid();
  if (env.QUOTA_TRUST_PROXY === "vercel") {
    if (env.VERCEL !== "1" || environment === "development") throw invalid();
    base.trustedProxy = "vercel";
  } else if (env.QUOTA_TRUST_PROXY && env.QUOTA_TRUST_PROXY !== "none")
    throw invalid();
  if (env.QUOTA_DEV_IP) {
    if (
      env.NODE_ENV !== "development" ||
      environment !== "development" ||
      env.VERCEL === "1"
    )
      throw invalid();
    base.developmentIp = env.QUOTA_DEV_IP;
  }
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw invalid();
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw invalid();
    return value;
  };
  base.windowLimit = integer("QUOTA_WINDOW_LIMIT", 5, 1, 100);
  base.deviceDailyLimit = integer("QUOTA_DEVICE_DAILY_LIMIT", 30, 1, 10000);
  base.ipDailyLimit = integer("QUOTA_IP_DAILY_LIMIT", 150, 1, 100000);
  base.globalDailyLimit = integer("QUOTA_GLOBAL_DAILY_LIMIT", 3000, 1, 1000000);
  base.concurrencyLimit = integer("QUOTA_CONCURRENCY_LIMIT", 5, 1, 100);
  base.redisTimeoutMs = integer("QUOTA_REDIS_TIMEOUT_MS", 1000, 100, 3000);
  // Existing API maximum is 20 seconds. At least 25 seconds of additional margin.
  base.leaseMs = integer("QUOTA_LEASE_MS", 60000, 45000, 120000);
  if (
    env.PROVIDER_CB_ENABLED &&
    !["true", "false"].includes(env.PROVIDER_CB_ENABLED)
  )
    throw invalid();
  base.circuitBreakerEnabled = env.PROVIDER_CB_ENABLED !== "false";
  base.circuitBreakerFailureThreshold = integer(
    "PROVIDER_CB_FAILURE_THRESHOLD",
    5,
    1,
    100,
  );
  base.circuitBreakerWindowSeconds = integer(
    "PROVIDER_CB_WINDOW_SECONDS",
    60,
    1,
    3600,
  );
  base.circuitBreakerOpenSeconds = integer(
    "PROVIDER_CB_OPEN_SECONDS",
    30,
    1,
    3600,
  );
  base.circuitBreakerHalfOpenMaxProbes = integer(
    "PROVIDER_CB_HALF_OPEN_MAX_PROBES",
    1,
    1,
    10,
  );
  return base;
}

export function quotaPrefix(config: QuotaConfig): string {
  return `{scamshield:${config.environment}:${config.namespace}}`;
}

export function quotaControlKey(config: QuotaConfig): string {
  return `${quotaPrefix(config)}:control:${config.controlKeySuffix}`;
}
