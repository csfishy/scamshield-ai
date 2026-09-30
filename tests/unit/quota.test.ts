import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  getQuotaConfig,
  quotaControlKey,
  quotaPrefix,
  type QuotaConfig,
} from "../../lib/server/quota-config";
import {
  createQuotaService,
  createRedisExecutor,
  normalizeIp,
  resolveQuotaIp,
  type RedisExecutor,
} from "../../lib/server/quota";
import {
  ACQUIRE_SCRIPT,
  FINALIZE_SCRIPT,
  PREFLIGHT_SCRIPT,
  RELEASE_SCRIPT,
  START_SCRIPT,
} from "../../lib/server/quota-scripts";

const env = {
  ANALYSIS_ENABLED: "true",
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  QUOTA_ENVIRONMENT: "preview",
  QUOTA_NAMESPACE: "unit-test",
  QUOTA_TRUST_PROXY: "vercel",
  UPSTASH_REDIS_REST_URL: "https://unit-test.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token-not-real",
  QUOTA_IP_HMAC_SECRET: "unit-test-only-secret-with-32-bytes-minimum",
};
const config = (changes: Partial<QuotaConfig> = {}) => ({
  ...getQuotaConfig(env),
  ...changes,
});
const signal = () => new AbortController().signal;
const request = (ip = "192.0.2.1", deviceId?: string) =>
  new Request("http://localhost/analyze", {
    method: "POST",
    headers: {
      "x-vercel-forwarded-for": ip,
      ...(deviceId ? { "x-scamshield-device-id": deviceId } : {}),
    },
  });

// This is an application-logic test double, NOT evidence of Redis/Lua atomicity.
class QuotaModel {
  now = Date.parse("2026-09-29T15:59:00Z");
  enabled = true;
  windows = new Map<string, { id: string; time: number }[]>();
  ipDaily = new Map<string, { day: number; count: number }>();
  daily = new Map<string, { day: number; count: number }>();
  reservations = new Map<string, Map<string, number>>();
  leases = new Map<string, number>();
  receipts = new Map<
    string,
    { token: string; state: string; day: number; probe: number }
  >();
  cbState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  cbOpenedAt = 0;
  failures: number[] = [];
  probes = new Map<string, number>();
  execute: RedisExecutor = async (script, keys, args) => {
    if (script === RELEASE_SCRIPT) return this.leases.delete(args[0]) ? 1 : 0;
    if (script === PREFLIGHT_SCRIPT) {
      if (!this.enabled) return ["analysis_disabled", 0];
      const window = (this.windows.get(keys[1]) ?? []).filter(
        (x) => x.time > this.now - 60000,
      );
      if (window.some((x) => x.id === args[0])) return ["unavailable", 0];
      if (window.length >= Number(args[1]))
        return [
          "client_rate_limited",
          Math.max(1, Math.ceil((window[0].time + 60000 - this.now) / 1000)),
        ];
      const day = Math.floor((this.now + 28800000) / 86400000);
      const reset = (day + 1) * 86400000 - 28800000;
      const ip =
        this.ipDaily.get(keys[2])?.day === day
          ? this.ipDaily.get(keys[2])!.count
          : 0;
      if (ip >= Number(args[2]))
        return [
          "ip_safety_limit_exceeded",
          Math.ceil((reset - this.now) / 1000),
        ];
      window.push({ id: args[0], time: this.now });
      this.windows.set(keys[1], window);
      this.ipDaily.set(keys[2], { day, count: ip + 1 });
      return ["ok", 0];
    }
    if (script === ACQUIRE_SCRIPT) {
      if (!this.enabled) return ["analysis_disabled", 0];
      if (this.receipts.has(keys[6])) return ["unavailable", 0];
      const day = Math.floor((this.now + 28800000) / 86400000);
      const reset = (day + 1) * 86400000 - 28800000;
      const count = (key: string) =>
        this.daily.get(key)?.day === day ? this.daily.get(key)!.count : 0;
      const reserved = (key: string) => {
        const entries = this.reservations.get(key) ?? new Map();
        for (const [token, expiry] of entries)
          if (expiry <= this.now) entries.delete(token);
        this.reservations.set(key, entries);
        return entries;
      };
      const deviceReservations = reserved(keys[2]);
      const globalReservations = reserved(keys[4]);
      if (count(keys[1]) + deviceReservations.size >= Number(args[1]))
        return ["device_quota_exceeded", Math.ceil((reset - this.now) / 1000)];
      if (count(keys[3]) + globalReservations.size >= Number(args[2]))
        return ["global_quota_exceeded", Math.ceil((reset - this.now) / 1000)];
      for (const [token, until] of this.leases)
        if (until <= this.now) this.leases.delete(token);
      if (this.leases.size >= Number(args[3]))
        return [
          "service_busy",
          Math.ceil(
            ([...this.leases.values()].sort((a, b) => a - b)[0] - this.now) /
              1000,
          ),
        ];
      let probe = 0;
      if (args[5] === "1") {
        this.failures = this.failures.filter(
          (time) => time > this.now - Number(args[7]),
        );
        for (const [probeToken, expiry] of this.probes)
          if (expiry <= this.now) this.probes.delete(probeToken);
        if (this.cbState === "OPEN") {
          if (this.now < this.cbOpenedAt + Number(args[8]))
            return [
              "provider_temporarily_unavailable",
              Math.max(
                1,
                Math.ceil(
                  (this.cbOpenedAt + Number(args[8]) - this.now) / 1000,
                ),
              ),
            ];
          this.cbState = "HALF_OPEN";
        }
        if (this.cbState === "HALF_OPEN") {
          if (this.probes.size >= Number(args[9]))
            return ["provider_temporarily_unavailable", 1];
          probe = 1;
        }
      }
      this.daily.set(keys[1], { day, count: count(keys[1]) });
      this.daily.set(keys[3], { day, count: count(keys[3]) });
      const expiry = this.now + Number(args[4]);
      deviceReservations.set(args[0], expiry);
      globalReservations.set(args[0], expiry);
      this.leases.set(args[0], expiry);
      this.receipts.set(keys[6], {
        token: args[0],
        state: "acquired",
        day,
        probe,
      });
      if (probe) this.probes.set(args[0], expiry);
      return [probe ? "ok_half_open" : "ok", 0];
    }
    if (script === START_SCRIPT) {
      if (!this.enabled) return ["analysis_disabled", 0];
      const receipt = this.receipts.get(keys[2]);
      if (
        (this.leases.get(args[0]) ?? 0) <= this.now + Number(args[1]) ||
        receipt?.token !== args[0] ||
        receipt.state !== "acquired"
      )
        return ["unavailable", 0];
      receipt.state = "started";
      return ["ok", 0];
    }
    if (script === FINALIZE_SCRIPT) {
      const receipt = this.receipts.get(keys[5]);
      if (
        receipt?.token !== args[0] ||
        !["acquired", "started"].includes(receipt.state)
      )
        return ["unavailable", 0];
      const active =
        (this.reservations.get(keys[1])?.get(args[0]) ?? 0) > this.now &&
        (this.reservations.get(keys[3])?.get(args[0]) ?? 0) > this.now;
      this.reservations.get(keys[1])?.delete(args[0]);
      this.reservations.get(keys[3])?.delete(args[0]);
      this.leases.delete(args[0]);
      this.probes.delete(args[0]);
      receipt.state = "finalized";
      if (args[1] === "success") {
        if (!active) return ["unavailable", 0];
        for (const key of [keys[0], keys[2]]) {
          const value = this.daily.get(key)!;
          if (value.day === receipt.day) value.count++;
        }
      }
      if (args[2] === "1") {
        if (
          args[1] === "success" &&
          receipt.probe === 1 &&
          this.cbState === "HALF_OPEN"
        ) {
          this.cbState = "CLOSED";
          this.failures = [];
          this.probes.clear();
          return ["ok_cb_closed", 0];
        }
        if (args[1] === "provider_failure") {
          this.failures = this.failures.filter(
            (time) => time > this.now - Number(args[4]),
          );
          this.failures.push(this.now);
          if (
            (receipt.probe === 1 && this.cbState !== "OPEN") ||
            (this.cbState === "CLOSED" &&
              this.failures.length >= Number(args[3]))
          ) {
            this.cbState = "OPEN";
            this.cbOpenedAt = this.now;
            this.probes.clear();
            return ["ok_cb_opened", 0];
          }
        }
      }
      return ["ok", 0];
    }
    throw new Error("Unexpected test script");
  };
}
const setup = (changes: Partial<QuotaConfig> = {}) => {
  const model = new QuotaModel();
  const service = createQuotaService(config(changes), {
    execute: model.execute,
  });
  const preflight = (ip?: string, deviceId?: string) =>
    service.preflight(request(ip, deviceId), randomUUID(), signal());
  const acquire = async (ip?: string, deviceId?: string) =>
    (await preflight(ip, deviceId)).acquire(signal());
  return { model, service, preflight, acquire };
};

describe("quota configuration and trusted identity", () => {
  it("defaults disabled and does not contact Redis", async () => {
    const execute = vi.fn();
    const service = createQuotaService(getQuotaConfig({}), { execute });
    await expect(
      service.preflight(request(), randomUUID(), signal()),
    ).rejects.toMatchObject({ code: "analysis_disabled" });
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    { ANALYSIS_ENABLED: "yes" },
    { QUOTA_ENVIRONMENT: undefined },
    { VERCEL_ENV: "production" },
    { QUOTA_ENVIRONMENT: "development", VERCEL: undefined },
    { QUOTA_NAMESPACE: "a}:production" },
    { QUOTA_CONTROL_KEY_SUFFIX: "../other" },
    { QUOTA_IP_HMAC_SECRET: "short" },
    { UPSTASH_REDIS_REST_TOKEN: "token\r\nheader" },
    { UPSTASH_REDIS_REST_URL: "http://unit-test.upstash.io" },
    { UPSTASH_REDIS_REST_URL: "https://evil.invalid" },
    { UPSTASH_REDIS_REST_URL: "https://unit-test.upstash.io/?token=secret" },
    { UPSTASH_REDIS_REST_URL: "https://secret@unit-test.upstash.io" },
    { QUOTA_TRUST_PROXY: "forwarded" },
    { QUOTA_TRUST_PROXY: "vercel", VERCEL: undefined },
    { QUOTA_DEV_IP: "127.0.0.1" },
    { QUOTA_WINDOW_LIMIT: "0" },
    { QUOTA_LEASE_MS: "20000" },
    { QUOTA_REDIS_TIMEOUT_MS: "99999" },
    { PROVIDER_CB_ENABLED: "yes" },
    { PROVIDER_CB_FAILURE_THRESHOLD: "0" },
    { PROVIDER_CB_HALF_OPEN_MAX_PROBES: "0" },
  ])("rejects unsafe configuration %#", (changes) => {
    expect(() => getQuotaConfig({ ...env, ...changes })).toThrow(
      "rate_limit_unavailable",
    );
  });
  it("uses the production hardening defaults", () => {
    expect(getQuotaConfig(env)).toMatchObject({
      windowLimit: 5,
      deviceDailyLimit: 30,
      ipDailyLimit: 150,
      globalDailyLimit: 3000,
      concurrencyLimit: 5,
      circuitBreakerEnabled: true,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerWindowSeconds: 60,
      circuitBreakerOpenSeconds: 30,
      circuitBreakerHalfOpenMaxProbes: 1,
    });
  });
  it("accepts a fixed development-only IP without trusting request headers", () => {
    const cfg = getQuotaConfig({
      ...env,
      NODE_ENV: "development",
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      QUOTA_ENVIRONMENT: "development",
      QUOTA_TRUST_PROXY: "none",
      QUOTA_DEV_IP: "127.0.0.1",
    });
    expect(resolveQuotaIp(request("203.0.113.9"), cfg)).toBe("127.0.0.1");
  });
  it.each([
    ["2001:0DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["2001:db8::1", "2001:db8::1"],
    ["::ffff:192.0.2.1", "192.0.2.1"],
    ["0:0:0:0:0:ffff:c000:201", "192.0.2.1"],
    ["192.0.2.1", "192.0.2.1"],
  ])("normalizes %s", (ip, expected) => expect(normalizeIp(ip)).toBe(expected));
  it.each([
    "",
    " 192.0.2.1",
    "192.0.2.1:443",
    "192.0.2.1, 203.0.113.1",
    "001.2.3.4",
    "fe80::1%eth0",
    "[::1]",
    "invalid",
  ])("rejects ambiguous IP %s", (ip) =>
    expect(() => normalizeIp(ip)).toThrow("rate_limit_unavailable"),
  );
  it("ignores forged XFF, body, query, and claimed Vercel headers when source is unavailable", async () => {
    const execute = vi.fn();
    const service = createQuotaService(config(), { execute });
    const req = new Request("https://example.invalid/analyze?ip=192.0.2.1", {
      method: "POST",
      headers: {
        "x-forwarded-for": "192.0.2.1",
        "x-real-ip": "192.0.2.1",
        vercel: "1",
      },
      body: '{"ip":"192.0.2.1"}',
    });
    await expect(
      service.preflight(req, randomUUID(), signal()),
    ).rejects.toMatchObject({ code: "rate_limit_unavailable" });
    expect(execute).not.toHaveBeenCalled();
    await expect(
      createQuotaService(config({ trustedProxy: "none" }), {
        execute,
      }).preflight(request(), randomUUID(), signal()),
    ).rejects.toThrow();
  });
  it("environment namespace isolates keys and keys never contain the original IP", async () => {
    const execute = vi.fn<RedisExecutor>().mockResolvedValue(["ok", 0]);
    for (const environment of ["preview", "production"] as const)
      await createQuotaService(config({ environment }), { execute }).preflight(
        request(),
        randomUUID(),
        signal(),
      );
    const first = execute.mock.calls[0][1],
      second = execute.mock.calls[1][1];
    expect(first[1]).not.toBe(second[1]);
    expect(JSON.stringify(execute.mock.calls)).not.toContain("192.0.2.1");
    expect(first.every((key) => key.startsWith(quotaPrefix(config())))).toBe(
      true,
    );
    expect(quotaControlKey(config())).toBe(
      "{scamshield:preview:unit-test}:control:analysis-enabled",
    );
  });
  it("canonical addresses use the same HMAC counter, and different IPv6 addresses remain distinct", async () => {
    const execute = vi.fn<RedisExecutor>().mockResolvedValue(["ok", 0]);
    const service = createQuotaService(config(), { execute });
    for (const ip of [
      "192.0.2.1",
      "::ffff:c000:201",
      "2001:db8::1",
      "2001:db8::2",
    ])
      await service.preflight(request(ip), randomUUID(), signal());
    expect(execute.mock.calls[0][1]).toEqual(execute.mock.calls[1][1]);
    expect(execute.mock.calls[2][1]).not.toEqual(execute.mock.calls[3][1]);
  });
  it("rejects malformed device IDs before Redis and never puts a UUID in keys", async () => {
    const execute = vi.fn<RedisExecutor>().mockResolvedValue(["ok", 0]);
    const service = createQuotaService(config(), { execute });
    await expect(
      service.preflight(
        request("192.0.2.1", "not-a-uuid"),
        randomUUID(),
        signal(),
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(execute).not.toHaveBeenCalled();
    const id = "11111111-1111-4111-8111-111111111111";
    await service.preflight(request("192.0.2.1", id), randomUUID(), signal());
    expect(JSON.stringify(execute.mock.calls)).not.toContain(id);
  });
});

describe("application quota behavior using a test double", () => {
  it("enforces a sliding minute and accurate retry boundary", async () => {
    const { preflight, model } = setup();
    for (let i = 0; i < 5; i++) await preflight();
    await expect(preflight()).rejects.toMatchObject({
      code: "client_rate_limited",
      retryAfter: "60",
    });
    model.now += 59999;
    await expect(preflight()).rejects.toMatchObject({ retryAfter: "1" });
    model.now += 1;
    await preflight();
  });
  it("IP daily quota is independent from another IP and resets at Taipei midnight", async () => {
    const { acquire, model } = setup({ ipDailyLimit: 1 });
    const lease = await acquire();
    await lease.release();
    await expect(acquire()).rejects.toMatchObject({
      code: "ip_safety_limit_exceeded",
      retryAfter: "60",
    });
    const other = await acquire("192.0.2.2");
    await other.release();
    model.now += 59999;
    await expect(acquire("192.0.2.2")).rejects.toMatchObject({
      retryAfter: "1",
    });
    model.now += 1;
    await acquire();
  });
  it("global quota rejects another IP without a partial IP debit", async () => {
    const { acquire, model } = setup({ globalDailyLimit: 1 });
    await (await acquire()).finalize("success");
    const before = [...model.daily.entries()];
    await expect(acquire("192.0.2.2")).rejects.toMatchObject({
      code: "global_quota_exceeded",
      retryAfter: "60",
    });
    expect([...model.daily.entries()]).toEqual(before);
  });
  it("commits device success quota, isolates devices, and rolls back failures", async () => {
    const { acquire } = setup({ deviceDailyLimit: 1, ipDailyLimit: 20 });
    const firstDevice = "11111111-1111-4111-8111-111111111111";
    const secondDevice = "22222222-2222-4222-8222-222222222222";
    await (
      await acquire("192.0.2.1", firstDevice)
    ).finalize("provider_failure");
    await (await acquire("192.0.2.1", firstDevice)).finalize("success");
    await expect(acquire("192.0.2.1", firstDevice)).rejects.toMatchObject({
      code: "device_quota_exceeded",
    });
    await expect(acquire("192.0.2.1", secondDevice)).resolves.toBeDefined();
  });
  it("valid concurrency leases block admission without debiting; ownership release is idempotent", async () => {
    const { acquire, model } = setup({ concurrencyLimit: 2 });
    const first = await acquire(),
      second = await acquire("192.0.2.2");
    const before = [...model.daily.entries()];
    await expect(acquire("192.0.2.3")).rejects.toMatchObject({
      code: "service_busy",
      retryAfter: "60",
    });
    expect([...model.daily.entries()]).toEqual(before);
    await first.release();
    await first.release();
    expect(model.leases.size).toBe(1);
    await acquire("192.0.2.3");
    expect(model.leases.size).toBe(2);
    await second.release();
  });
  it("a crashed instance's lease and success reservation expire without a debit", async () => {
    const { acquire, model } = setup({ concurrencyLimit: 1 });
    model.now = Date.parse("2026-09-29T10:00:00Z");
    await acquire();
    model.now += 60000;
    await acquire();
    expect(model.leases.size).toBe(1);
    expect([...model.daily.values()].every((value) => value.count === 0)).toBe(
      true,
    );
  });
  it("preflight/image validation failure reserves no daily quota", async () => {
    const { preflight, model } = setup();
    await preflight();
    expect(model.daily.size).toBe(0);
    expect(model.leases.size).toBe(0);
  });
  it("duplicate acquisition and start never authorize another attempt", async () => {
    const { preflight, model } = setup();
    const attempt = await preflight();
    const lease = await attempt.acquire(signal());
    await expect(attempt.acquire(signal())).rejects.toThrow(
      "rate_limit_unavailable",
    );
    await attempt.assertEnabled(lease, signal());
    await expect(attempt.assertEnabled(lease, signal())).rejects.toThrow(
      "rate_limit_unavailable",
    );
    expect([...model.daily.values()].every((x) => x.count === 0)).toBe(true);
  });
  it("runtime stop is checked again before Provider and rolls back reservations", async () => {
    const { preflight, model } = setup();
    const attempt = await preflight(),
      lease = await attempt.acquire(signal());
    model.enabled = false;
    await expect(attempt.assertEnabled(lease, signal())).rejects.toMatchObject({
      code: "analysis_disabled",
    });
    await lease.release();
    expect([...model.daily.values()].every((x) => x.count === 0)).toBe(true);
    await expect(preflight()).rejects.toMatchObject({
      code: "analysis_disabled",
    });
  });
  it("an expired or foreign lease cannot start Provider", async () => {
    const { preflight, model } = setup();
    const attempt = await preflight(),
      lease = await attempt.acquire(signal());
    await expect(
      attempt.assertEnabled(
        {
          circuitState: "closed",
          finalize: async () => "none",
          release: async () => {},
        },
        signal(),
      ),
    ).rejects.toThrow("rate_limit_unavailable");
    model.now += 60001;
    await expect(attempt.assertEnabled(lease, signal())).rejects.toThrow(
      "rate_limit_unavailable",
    );
  });
  it("a stalled instance cannot start when its lease has less than 25 seconds remaining", async () => {
    const { preflight, model } = setup();
    const attempt = await preflight(),
      lease = await attempt.acquire(signal());
    model.now += 35000;
    await expect(attempt.assertEnabled(lease, signal())).rejects.toThrow(
      "rate_limit_unavailable",
    );
    expect(model.leases.size).toBe(1);
  });
  it("lowered concurrency calculates Retry-After when enough existing leases expire", async () => {
    const { model, service } = setup({ concurrencyLimit: 1 });
    model.leases.set("first", model.now + 10000);
    model.leases.set("second", model.now + 40000);
    model.leases.set("third", model.now + 60000);
    const attempt = await service.preflight(request(), randomUUID(), signal());
    await expect(attempt.acquire(signal())).rejects.toMatchObject({
      code: "service_busy",
      retryAfter: "10",
    });
    expect(model.daily.size).toBe(0);
  });
  it("runs CLOSED → OPEN → HALF_OPEN → CLOSED and reopens on a failed probe", async () => {
    const { acquire, model } = setup({
      windowLimit: 100,
      ipDailyLimit: 100,
      deviceDailyLimit: 100,
      globalDailyLimit: 100,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerOpenSeconds: 30,
      circuitBreakerHalfOpenMaxProbes: 1,
    });
    expect(
      await (await acquire("198.18.0.1")).finalize("provider_failure"),
    ).toBe("none");
    expect(
      await (await acquire("198.18.0.2")).finalize("provider_failure"),
    ).toBe("provider_cb_opened");
    await expect(acquire("198.18.0.3")).rejects.toMatchObject({
      code: "provider_temporarily_unavailable",
      retryAfter: "30",
    });
    model.now += 30000;
    const probe = await acquire("198.18.0.4");
    expect(probe.circuitState).toBe("half_open");
    await expect(acquire("198.18.0.5")).rejects.toMatchObject({
      code: "provider_temporarily_unavailable",
    });
    expect(await probe.finalize("success")).toBe("provider_cb_closed");
    expect((await acquire("198.18.0.6")).circuitState).toBe("closed");

    const reopened = setup({
      windowLimit: 100,
      ipDailyLimit: 100,
      deviceDailyLimit: 100,
      globalDailyLimit: 100,
      circuitBreakerFailureThreshold: 1,
      circuitBreakerOpenSeconds: 30,
    });
    await (await reopened.acquire("198.18.1.1")).finalize("neutral_failure");
    expect(reopened.model.failures).toHaveLength(0);
    expect(
      await (await reopened.acquire("198.18.1.2")).finalize("provider_failure"),
    ).toBe("provider_cb_opened");
    reopened.model.now += 30000;
    const failedProbe = await reopened.acquire("198.18.1.3");
    expect(failedProbe.circuitState).toBe("half_open");
    expect(await failedProbe.finalize("provider_failure")).toBe(
      "provider_cb_opened",
    );
  });
  it.each([
    null,
    undefined,
    { success: true, reason: "timeout" },
    ["ok", 1],
    ["ok"],
    ["ok", 0, "secret"],
    ["daily_quota_exceeded", -1],
  ])(
    "does not treat malformed or SDK fail-open reply as admission %#",
    async (reply) => {
      const service = createQuotaService(config(), {
        execute: async () => reply,
      });
      await expect(
        service.preflight(request(), randomUUID(), signal()),
      ).rejects.toThrow("rate_limit_unavailable");
    },
  );
  it("unknown acquisition outcome is a safe failure", async () => {
    const execute = vi
      .fn<RedisExecutor>()
      .mockResolvedValueOnce(["ok", 0])
      .mockRejectedValueOnce(new Error("secret redis error"));
    const attempt = await createQuotaService(config(), { execute }).preflight(
      request(),
      randomUUID(),
      signal(),
    );
    await expect(attempt.acquire(signal())).rejects.toMatchObject({
      code: "rate_limit_unavailable",
      message: "rate_limit_unavailable",
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("single-attempt Redis REST transport", () => {
  it("uses one explicit EVAL POST with no-store and no redirect", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ result: ["ok", 0] })));
    const result = await createRedisExecutor(config(), transport)(
      PREFLIGHT_SCRIPT,
      ["test-key"],
      ["test-arg"],
      signal(),
    );
    expect(result).toEqual(["ok", 0]);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
    });
    expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toEqual([
      "EVAL",
      PREFLIGHT_SCRIPT,
      1,
      "test-key",
      "test-arg",
    ]);
  });
  it.each([401, 403, 429, 500, 503])(
    "HTTP %s fails closed without retry",
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private infrastructure detail", { status }),
        );
      await expect(
        createRedisExecutor(config(), transport)("script", [], []),
      ).rejects.toThrow("rate_limit_unavailable");
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it.each([
    "not json",
    '{"error":"secret"}',
    '{"result":["ok",0],"error":"failure"}',
    '{"success":true,"reason":"timeout"}',
  ])("unexpected transport envelope fails closed %#", async (body) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body));
    await expect(
      createRedisExecutor(config(), transport)("script", [], []),
    ).rejects.toThrow("rate_limit_unavailable");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("network failure is sanitized and never retried", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("token=SECRET"));
    await expect(
      createRedisExecutor(config(), transport)("script", [], []),
    ).rejects.toMatchObject({
      code: "rate_limit_unavailable",
      kind: "network",
      message: "rate_limit_unavailable",
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("bounds an uncooperative transport timeout", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Promise<Response>(() => {}));
    await expect(
      createRedisExecutor(config({ redisTimeoutMs: 5 }), transport)(
        "script",
        [],
        [],
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("a response arriving after timeout never becomes an admission", async () => {
    let resolve!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const service = createQuotaService(config({ redisTimeoutMs: 5 }), {
      fetch: transport,
    });
    const permission = service.preflight(request(), randomUUID(), signal());
    await expect(permission).rejects.toMatchObject({ kind: "timeout" });
    resolve(new Response(JSON.stringify({ result: ["ok", 0] })));
    await Promise.resolve();
    await expect(permission).rejects.toThrow("rate_limit_unavailable");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("a stalled JSON response reader is bounded by the same timeout", async () => {
    const response = new Response("{}");
    vi.spyOn(response, "json").mockImplementation(() => new Promise(() => {}));
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createRedisExecutor(config({ redisTimeoutMs: 5 }), transport)(
        "script",
        [],
        [],
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("pre-aborted request sends no Redis command", async () => {
    const transport = vi.fn<typeof fetch>(),
      controller = new AbortController();
    controller.abort();
    await expect(
      createRedisExecutor(config(), transport)(
        "script",
        [],
        [],
        controller.signal,
      ),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(transport).not.toHaveBeenCalled();
  });
});
