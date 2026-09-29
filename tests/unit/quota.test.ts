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
const request = (ip = "192.0.2.1") =>
  new Request("http://localhost/analyze", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": ip },
  });

// This is an application-logic test double, NOT evidence of Redis/Lua atomicity.
class QuotaModel {
  now = Date.parse("2026-09-29T15:59:00Z");
  enabled = true;
  windows = new Map<string, { id: string; time: number }[]>();
  daily = new Map<string, { day: number; count: number }>();
  leases = new Map<string, number>();
  receipts = new Map<string, { token: string; state: string }>();
  execute: RedisExecutor = async (script, keys, args) => {
    if (script === RELEASE_SCRIPT) return this.leases.delete(args[0]) ? 1 : 0;
    if (!this.enabled) return ["analysis_disabled", 0];
    if (script === PREFLIGHT_SCRIPT) {
      const window = (this.windows.get(keys[1]) ?? []).filter(
        (x) => x.time > this.now - 60000,
      );
      if (window.some((x) => x.id === args[0])) return ["unavailable", 0];
      if (window.length >= Number(args[1]))
        return [
          "client_rate_limited",
          Math.max(1, Math.ceil((window[0].time + 60000 - this.now) / 1000)),
        ];
      window.push({ id: args[0], time: this.now });
      this.windows.set(keys[1], window);
      return ["ok", 0];
    }
    if (script === ACQUIRE_SCRIPT) {
      if (this.receipts.has(keys[4])) return ["unavailable", 0];
      const day = Math.floor((this.now + 28800000) / 86400000);
      const reset = (day + 1) * 86400000 - 28800000;
      const count = (key: string) =>
        this.daily.get(key)?.day === day ? this.daily.get(key)!.count : 0;
      if (count(keys[1]) >= Number(args[1]))
        return ["daily_quota_exceeded", Math.ceil((reset - this.now) / 1000)];
      if (count(keys[2]) >= Number(args[2]))
        return ["global_quota_exceeded", Math.ceil((reset - this.now) / 1000)];
      for (const [token, until] of this.leases)
        if (until <= this.now) this.leases.delete(token);
      if (this.leases.size >= Number(args[3]))
        return [
          "analysis_busy",
          Math.ceil(
            ([...this.leases.values()].sort((a, b) => a - b)[
              this.leases.size - Number(args[3])
            ] -
              this.now) /
              1000,
          ),
        ];
      this.daily.set(keys[1], { day, count: count(keys[1]) + 1 });
      this.daily.set(keys[2], { day, count: count(keys[2]) + 1 });
      this.leases.set(args[0], this.now + Number(args[4]));
      this.receipts.set(keys[4], { token: args[0], state: "acquired" });
      return ["ok", 0];
    }
    if (script === START_SCRIPT) {
      const receipt = this.receipts.get(keys[2]);
      if (
        (this.leases.get(args[0]) ?? 0) <= this.now + 25000 ||
        receipt?.token !== args[0] ||
        receipt.state !== "acquired"
      )
        return ["unavailable", 0];
      receipt.state = "started";
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
  const preflight = (ip?: string) =>
    service.preflight(request(ip), randomUUID(), signal());
  const acquire = async (ip?: string) =>
    (await preflight(ip)).acquire(signal());
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
  ])("rejects unsafe configuration %#", (changes) => {
    expect(() => getQuotaConfig({ ...env, ...changes })).toThrow(
      "rate_limit_unavailable",
    );
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
});

describe("application quota behavior using a test double", () => {
  it("enforces a sliding minute and accurate retry boundary", async () => {
    const { preflight, model } = setup();
    for (let i = 0; i < 3; i++) await preflight();
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
      code: "daily_quota_exceeded",
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
    await (await acquire()).release();
    const before = [...model.daily.entries()];
    await expect(acquire("192.0.2.2")).rejects.toMatchObject({
      code: "global_quota_exceeded",
      retryAfter: "60",
    });
    expect([...model.daily.entries()]).toEqual(before);
  });
  it("valid concurrency leases block admission without debiting; ownership release is idempotent", async () => {
    const { acquire, model } = setup({ concurrencyLimit: 2 });
    const first = await acquire(),
      second = await acquire("192.0.2.2");
    const before = [...model.daily.entries()];
    await expect(acquire("192.0.2.3")).rejects.toMatchObject({
      code: "analysis_busy",
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
  it("a crashed instance's lease expires while its daily debit remains", async () => {
    const { acquire, model } = setup({ concurrencyLimit: 1 });
    model.now = Date.parse("2026-09-29T10:00:00Z");
    await acquire();
    model.now += 60000;
    await acquire();
    expect(model.leases.size).toBe(1);
    expect([...model.daily.values()].every((value) => value.count === 2)).toBe(
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
    expect([...model.daily.values()].every((x) => x.count === 1)).toBe(true);
  });
  it("runtime stop is checked again before Provider; it never refunds daily admission", async () => {
    const { preflight, model } = setup();
    const attempt = await preflight(),
      lease = await attempt.acquire(signal());
    model.enabled = false;
    await expect(attempt.assertEnabled(lease, signal())).rejects.toMatchObject({
      code: "analysis_disabled",
    });
    await lease.release();
    expect([...model.daily.values()].every((x) => x.count === 1)).toBe(true);
    await expect(preflight()).rejects.toMatchObject({
      code: "analysis_disabled",
    });
  });
  it("an expired or foreign lease cannot start Provider", async () => {
    const { preflight, model } = setup();
    const attempt = await preflight(),
      lease = await attempt.acquire(signal());
    await expect(
      attempt.assertEnabled({ release: async () => {} }, signal()),
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
      code: "analysis_busy",
      retryAfter: "60",
    });
    expect(model.daily.size).toBe(0);
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
