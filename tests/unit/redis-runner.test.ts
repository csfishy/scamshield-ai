import { describe, expect, it, vi } from "vitest";
import {
  ACQUIRE_SCRIPT,
  PREFLIGHT_SCRIPT,
} from "../../lib/server/quota-scripts";
import { quotaPrefix } from "../../lib/server/quota-config";
import {
  createGuardedCommands,
  createRestCommand,
  createTestConfig,
  RedisTestError,
  safeFailureCode,
  settleAll,
  TEMPORARY_KEY_TTL_MS,
  validateRestTarget,
  type RedisCommand,
} from "../redis/support";
import { createLocalCommand } from "../redis/tcp";
import { startFaultProxy } from "../redis/network-faults";
import { createRedisExecutor } from "../../lib/server/quota";

const targetEnv = {
  TEST_UPSTASH_REDIS_REST_URL: "https://isolated-test.upstash.io",
  TEST_UPSTASH_REDIS_REST_TOKEN: "test-token-not-a-real-secret",
};
const options = { expectedHost: "isolated-test.upstash.io", allowWrite: true };
const prefix = "{scamshield:preview:integration-unit-test}";
const key = `${prefix}:control:analysis-enabled`;
const seeded = ["SET", key, "enabled", "PX", String(TEMPORARY_KEY_TTL_MS)];

describe("isolated REST runner configuration (offline)", () => {
  it("requires explicit permission and an exact independently specified hostname", () => {
    expect(() =>
      validateRestTarget(targetEnv, { ...options, allowWrite: false }),
    ).toThrow("REDIS_TEST_CONFIGURATION");
    expect(() =>
      validateRestTarget(targetEnv, {
        ...options,
        expectedHost: "different.upstash.io",
      }),
    ).toThrow("REDIS_TEST_CONFIGURATION");
    expect(() => validateRestTarget(targetEnv, { allowWrite: true })).toThrow(
      "REDIS_TEST_CONFIGURATION",
    );
    const target = validateRestTarget(targetEnv, options);
    expect(target.url).toBe("https://isolated-test.upstash.io");
    expect(target.fingerprint).toMatch(/^[a-f0-9]{16}$/);
  });
  it("never falls back to application or deployment credentials", () => {
    expect(() =>
      validateRestTarget(
        {
          UPSTASH_REDIS_REST_URL: targetEnv.TEST_UPSTASH_REDIS_REST_URL,
          UPSTASH_REDIS_REST_TOKEN: targetEnv.TEST_UPSTASH_REDIS_REST_TOKEN,
        },
        options,
      ),
    ).toThrow("REDIS_TEST_CONFIGURATION");
  });
  it.each([
    "http://isolated-test.upstash.io",
    "https://evil.invalid",
    "https://isolated-test.upstash.io.evil.invalid",
    "https://secret@isolated-test.upstash.io",
    "https://isolated-test.upstash.io:444",
    "https://isolated-test.upstash.io/path",
    "https://isolated-test.upstash.io/?token=secret",
    "https://isolated-test.upstash.io/#secret",
    "javascript:secret",
  ])("rejects unsafe target without exposing it %#", (url) => {
    expect(() =>
      validateRestTarget(
        { ...targetEnv, TEST_UPSTASH_REDIS_REST_URL: url },
        options,
      ),
    ).toThrow("REDIS_TEST_CONFIGURATION");
  });
  it.each(["", "secret\r\nheader", "secret token"])(
    "rejects unsafe token %#",
    (token) => {
      expect(() =>
        validateRestTarget(
          { ...targetEnv, TEST_UPSTASH_REDIS_REST_TOKEN: token },
          options,
        ),
      ).toThrow("REDIS_TEST_CONFIGURATION");
    },
  );
  it("creates fresh Preview namespaces and HMAC secrets for independent runs", () => {
    const first = createTestConfig("preview"),
      second = createTestConfig("preview");
    expect(first.environment).toBe("preview");
    expect(first.namespace).toMatch(/^integration-[a-f0-9-]{36}$/);
    expect(first.namespace).not.toBe(second.namespace);
    expect(first.hmacSecret).not.toBe(second.hmacSecret);
    expect(quotaPrefix(first)).toMatch(/^\{scamshield:preview:integration-/);
    expect(first.redisToken).toBe("");
  });
  it.each([0, 80, 65536, Number.NaN, 16379.5])(
    "local runner rejects invalid or privileged port %s",
    (port) => {
      expect(() => createLocalCommand(port)).toThrow(
        "REDIS_TEST_CONFIGURATION",
      );
    },
  );
});

describe("test command guard and cleanup (offline)", () => {
  it.each([
    ["FLUSHDB"],
    ["FLUSHALL"],
    ["KEYS", "*"],
    ["SCAN", "0"],
    ["CONFIG", "SET", "maxmemory-policy", "allkeys-lru"],
    [
      "SET",
      "{scamshield:production:scamshield}:control:analysis-enabled",
      "enabled",
      "PX",
      "600000",
    ],
    ["DEL", key, "{scamshield:production:scamshield}:daily:global"],
    ["HGET", "unowned", "count"],
    ["EVAL", "return redis.call('FLUSHDB')", "0"],
    ["EVAL", ACQUIRE_SCRIPT, "1", "{scamshield:production:scamshield}:leases"],
    ["EVAL", ACQUIRE_SCRIPT, "-1"],
    ["EVAL", ACQUIRE_SCRIPT, "2", key],
    ["SET", key, "enabled"],
    ["HSET", key, "field", "value"],
    ["ZADD", key, "123", "member"],
    ["SET", key, "enabled", "PX", "999999999"],
  ])("rejects unsafe commands before transport %#", async (...parts) => {
    const transport = vi.fn<RedisCommand>();
    const guard = createGuardedCommands(transport, [prefix]);
    await expect(guard.command(parts)).rejects.toThrow("REDIS_TEST_ISOLATION");
    expect(transport).not.toHaveBeenCalled();
    expect(guard.commandCount).toBe(0);
  });
  it("rejects a production or normal app prefix even before commands", () => {
    const transport = vi.fn<RedisCommand>();
    for (const bad of [
      "{scamshield:production:integration-test}",
      "{scamshield:preview:scamshield}",
      "*",
    ]) {
      expect(() => createGuardedCommands(transport, [bad])).toThrow(
        "REDIS_TEST_ISOLATION",
      );
    }
  });
  it("bounds commands while reserving exact cleanup and verification", async () => {
    const transport = vi
      .fn<RedisCommand>()
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const guard = createGuardedCommands(transport, [prefix], 3);
    await guard.command(seeded);
    await expect(guard.command(["PING"])).rejects.toThrow(
      "REDIS_TEST_COMMAND_LIMIT",
    );
    expect(await guard.cleanup()).toBe("confirmed");
    expect(await guard.cleanup()).toBe("confirmed");
    expect(transport.mock.calls.map(([parts]) => parts)).toEqual([
      seeded,
      ["DEL", key],
      ["EXISTS", key],
    ]);
    expect(guard.commandCount).toBe(3);
    await expect(guard.command(["PING"])).rejects.toThrow(
      "REDIS_TEST_ISOLATION",
    );
  });
  it("tracks all EVAL keys and cleans no other namespace", async () => {
    const second = `${prefix}:window:code`;
    const transport = vi
      .fn<RedisCommand>()
      .mockResolvedValueOnce(["ok", 0])
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    const guard = createGuardedCommands(transport, [prefix]);
    await guard.command([
      "EVAL",
      PREFLIGHT_SCRIPT,
      "2",
      key,
      second,
      "request",
      "3",
    ]);
    await guard.cleanup();
    expect(transport.mock.calls[1][0]).toEqual(["DEL", key, second]);
  });
  it("does not declare cleanup confirmed when any exact key remains", async () => {
    const transport = vi
      .fn<RedisCommand>()
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    const guard = createGuardedCommands(transport, [prefix]);
    await guard.command(seeded);
    await expect(guard.cleanup()).rejects.toThrow("REDIS_TEST_CLEANUP");
  });
  it("waits for outstanding test commands before deleting their keys", async () => {
    let finish!: (value: unknown) => void;
    const transport = vi
      .fn<RedisCommand>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const guard = createGuardedCommands(transport, [prefix]);
    const command = guard.command(seeded),
      cleanup = guard.cleanup();
    expect(transport).toHaveBeenCalledOnce();
    finish("OK");
    await command;
    expect(await cleanup).toBe("confirmed");
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("settles every concurrent operation before reporting a failed race", async () => {
    let finish!: (value: string) => void;
    let completed = false;
    const waiting = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const result = settleAll([
      Promise.reject(new Error("redacted")),
      waiting,
    ]).finally(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    finish("done");
    await expect(result).rejects.toThrow("redacted");
    expect(completed).toBe(true);
  });
});

describe("REST runner transport (offline injected fetch)", () => {
  const target = validateRestTarget(targetEnv, options);
  it("sends one JSON command in a POST with bearer header, no redirects, and no-store", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"result":"PONG"}'));
    expect(await createRestCommand(target, transport)(["PING"])).toBe("PONG");
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).not.toContain(target.token);
    expect(transport.mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
      body: '["PING"]',
    });
  });
  it.each([401, 403, 429, 500])(
    "HTTP %s is sanitized and never retried",
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("SECRET", { status }));
      await expect(
        createRestCommand(target, transport)(["PING"]),
      ).rejects.toThrow("REDIS_TEST_HTTP");
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it.each([
    '{"error":"SECRET"}',
    '{"result":"OK","error":"SECRET"}',
    '{"success":true,"reason":"timeout"}',
    "null",
  ])("rejects untrusted Redis envelopes %#", async (body) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body));
    await expect(
      createRestCommand(target, transport)(["PING"]),
    ).rejects.toThrow("REDIS_TEST_RESPONSE");
  });
  it("sanitizes raw network exceptions", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("SECRET token and URL"));
    await expect(
      createRestCommand(target, transport)(["PING"]),
    ).rejects.toThrow("REDIS_TEST_CONNECTION");
    expect(safeFailureCode(new Error("SECRET"))).toBe(
      "assertion_or_application_failure",
    );
    expect(safeFailureCode(new RedisTestError("timeout"))).toBe("timeout");
  });
  it("times out an uncooperative transport and never accepts its late reply", async () => {
    let finish!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = createRestCommand(target, transport, 5)(["PING"]);
    await expect(result).rejects.toThrow("REDIS_TEST_TIMEOUT");
    finish(new Response('{"result":"PONG"}'));
    await Promise.resolve();
    await expect(result).rejects.toThrow("REDIS_TEST_TIMEOUT");
    expect(transport).toHaveBeenCalledOnce();
  });
});

describe("loopback HTTP fault proxy (real local HTTP, fake Redis upstream)", () => {
  it.each(["connection_reset", "response_timeout"] as const)(
    "injects %s only after its upstream operation resolves",
    async (fault) => {
      const upstream = vi.fn<RedisCommand>().mockResolvedValue(["ok", 0]);
      const proxy = await startFaultProxy(upstream, fault);
      try {
        const execute = createRedisExecutor({
          ...createTestConfig("preview"),
          redisUrl: proxy.url,
          redisToken: proxy.token,
          redisTimeoutMs: 150,
        });
        await expect(
          execute(ACQUIRE_SCRIPT, [key], ["token"]),
        ).rejects.toMatchObject({
          code: "rate_limit_unavailable",
          kind: fault === "connection_reset" ? "network" : "timeout",
        });
        expect(proxy.completedAcquisitions).toBe(1);
        expect(upstream).toHaveBeenCalledOnce();
        expect(proxy.acquisition).toEqual({ keys: [key], args: ["token"] });
      } finally {
        await proxy.close();
      }
    },
  );
  it("rejects unauthenticated local requests before forwarding any command", async () => {
    const upstream = vi.fn<RedisCommand>();
    const proxy = await startFaultProxy(upstream, "connection_reset");
    try {
      const response = await fetch(proxy.url, {
        method: "POST",
        body: '["EVAL","arbitrary",0]',
        headers: { Authorization: "Bearer wrong" },
      });
      expect(response.status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      await proxy.close();
    }
  });
});
