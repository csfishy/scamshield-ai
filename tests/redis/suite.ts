import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import {
  quotaControlKey,
  quotaPrefix,
  type QuotaConfig,
} from "../../lib/server/quota-config";
import { createQuotaService, type RedisExecutor } from "../../lib/server/quota";
import { createAnalyzeHandler } from "../../lib/server/analyze";
import {
  MODEL,
  PROMPT_VERSION,
  type ServerConfig,
} from "../../lib/server/config";
import {
  parseAnalysisResponse,
  type ErrorCode,
} from "../../lib/contracts/analysis";
import { png, request as imageRequest } from "../helpers/images";
import { verifyNetworkFault } from "./network-faults";
import {
  ACQUIRE_SCRIPT,
  PREFLIGHT_SCRIPT,
  RELEASE_SCRIPT,
  START_SCRIPT,
} from "../../lib/server/quota-scripts";
import {
  TEMPORARY_KEY_TTL_MS,
  DAY_TEST_SCRIPT,
  SEED_HASH_SCRIPT,
  SEED_ZSET_SCRIPT,
  RedisTestError,
  settleAll,
  type RedisCommand,
} from "./support";

export async function runRedisSuite(
  config: QuotaConfig,
  command: RedisCommand,
  report: (name: string, state: "running" | "passed") => void,
  otherConfig: QuotaConfig,
) {
  const prefix = quotaPrefix(config),
    control = quotaControlKey(config);
  const execute: RedisExecutor = (script, keys, args) => {
    return command(["EVAL", script, String(keys.length), ...keys, ...args]);
  };
  const mutate = (verb: string, key: string, ...args: string[]) => {
    if (verb === "HSET") return execute(SEED_HASH_SCRIPT, [key], args);
    if (verb === "ZADD") return execute(SEED_ZSET_SCRIPT, [key], args);
    return command([
      verb,
      key,
      ...args,
      ...(verb === "SET" ? ["PX", String(TEMPORARY_KEY_TTL_MS)] : []),
    ]);
  };
  let checks = 0;
  const check = async (name: string, run: () => Promise<void>) => {
    report(name, "running");
    await run();
    checks++;
    report(name, "passed");
  };
  const allowed = (value: unknown) => Array.isArray(value) && value[0] === "ok";
  const nowMs = async () => {
    const time = (await command(["TIME"])) as string[];
    return Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  };
  const keys = (label: string, ip = "ip") => [
    control,
    `${prefix}:${label}:ip:${ip}`,
    `${prefix}:${label}:global`,
    `${prefix}:${label}:leases`,
    `${prefix}:${label}:receipt:${randomUUID()}`,
  ];
  const acquire = (
    entry: string[],
    token = randomUUID(),
    ipLimit = 10,
    globalLimit = 200,
    concurrency = 3,
    leaseMs = 60000,
  ) =>
    execute(ACQUIRE_SCRIPT, entry, [
      token,
      String(ipLimit),
      String(globalLimit),
      String(concurrency),
      String(leaseMs),
    ]);

  await mutate("SET", control, "enabled");
  await check(
    "exact Lua enforces a sliding minute and preserves a bounded TTL",
    async () => {
      const window = `${prefix}:window-test`;
      for (let i = 0; i < 3; i++)
        assert(
          allowed(
            await execute(
              PREFLIGHT_SCRIPT,
              [control, window],
              [randomUUID(), "3"],
            ),
          ),
        );
      assert.equal(
        (
          (await execute(
            PREFLIGHT_SCRIPT,
            [control, window],
            [randomUUID(), "3"],
          )) as unknown[]
        )[0],
        "client_rate_limited",
      );
      const ttl = Number(await command(["PTTL", window]));
      assert(ttl > 0 && ttl <= 60000);
      await mutate(
        "ZADD",
        window,
        String((await nowMs()) - 60001),
        "expired-request",
      );
      await execute(PREFLIGHT_SCRIPT, [control, window], [randomUUID(), "3"]);
      assert.equal(await command(["ZSCORE", window, "expired-request"]), null);
      const active = (await command(["ZRANGE", window, "0", "-1"])) as string[];
      const expired = String((await nowMs()) - 60001);
      for (const id of active) await mutate("ZADD", window, expired, id);
      assert(
        allowed(
          await execute(
            PREFLIGHT_SCRIPT,
            [control, window],
            [randomUUID(), "3"],
          ),
        ),
      );
    },
  );
  await check(
    "real Redis race admits only the last IP daily slot",
    async () => {
      const base = keys("race-ip");
      const results = await settleAll(
        Array.from({ length: 16 }, () =>
          acquire(
            [...base.slice(0, 4), `${prefix}:race-ip:receipt:${randomUUID()}`],
            randomUUID(),
            1,
            200,
            100,
          ),
        ),
      );
      assert.equal(results.filter(allowed).length, 1);
      assert.equal(await command(["HGET", base[1], "count"]), "1");
      assert.equal(await command(["HGET", base[2], "count"]), "1");
    },
  );
  await check(
    "real Redis race admits only the last global slot without partial IP debits",
    async () => {
      const all = Array.from({ length: 16 }, (_, index) =>
        keys("race-global", String(index)),
      );
      const results = await settleAll(
        all.map((entry) => acquire(entry, randomUUID(), 10, 1, 100)),
      );
      assert.equal(results.filter(allowed).length, 1);
      const counts = await settleAll(
        all.map((entry) => command(["HGET", entry[1], "count"])),
      );
      assert.equal(counts.filter((count) => count !== null).length, 1);
    },
  );
  await check(
    "real Redis race cannot exceed effective concurrent lease count",
    async () => {
      const all = Array.from({ length: 16 }, (_, index) =>
        keys("race-leases", String(index)),
      );
      const results = await settleAll(all.map((entry) => acquire(entry)));
      assert.equal(results.filter(allowed).length, 3);
      assert.equal(await command(["ZCARD", all[0][3]]), 3);
      assert.equal(await command(["HGET", all[0][2], "count"]), "3");
      const tokens = (await command([
        "ZRANGE",
        all[0][3],
        "0",
        "-1",
      ])) as string[];
      const now = await nowMs();
      for (const [index, token] of tokens.entries())
        await mutate(
          "ZADD",
          all[0][3],
          String(now + [10000, 40000, 60000][index]),
          token,
        );
      const lowered = (await acquire(
        keys("race-leases", "new-ip"),
        randomUUID(),
        10,
        200,
        1,
      )) as unknown[];
      assert.equal(lowered[0], "analysis_busy");
      assert(Number(lowered[1]) >= 59 && Number(lowered[1]) <= 60);
    },
  );
  await check(
    "duplicate acquire and start cannot debit or permit twice; release owns one token",
    async () => {
      const entry = keys("idempotency"),
        token = randomUUID();
      assert(allowed(await acquire(entry, token)));
      assert(!allowed(await acquire(entry, token)));
      const startKeys = [control, entry[3], entry[4]];
      assert(allowed(await execute(START_SCRIPT, startKeys, [token])));
      assert(!allowed(await execute(START_SCRIPT, startKeys, [token])));
      assert.equal(await command(["HGET", entry[1], "count"]), "1");
      const other = randomUUID(),
        second = [
          ...entry.slice(0, 4),
          `${prefix}:idempotency:receipt:${randomUUID()}`,
        ];
      assert(allowed(await acquire(second, other)));
      assert.equal(await execute(RELEASE_SCRIPT, [entry[3]], [token]), 1);
      assert.equal(await execute(RELEASE_SCRIPT, [entry[3]], [token]), 0);
      assert.notEqual(await command(["ZSCORE", entry[3], other]), null);
      const ttl = Number(await command(["PTTL", entry[4]]));
      assert(ttl > 172790000 && ttl <= 172800000);
    },
  );
  await check(
    "expired crashed lease is reclaimed; a shorter new config cannot expire a longer lease",
    async () => {
      const entry = keys("expiry"),
        token = randomUUID();
      assert(allowed(await acquire(entry, token, 10, 200, 3, 120000)));
      const second = [
        ...entry.slice(0, 4),
        `${prefix}:expiry:receipt:${randomUUID()}`,
      ];
      assert(allowed(await acquire(second, randomUUID(), 10, 200, 3, 45000)));
      assert(Number(await command(["PTTL", entry[3]])) > 110000);
      await mutate("ZADD", entry[3], String((await nowMs()) + 24000), token);
      assert(
        !allowed(
          await execute(START_SCRIPT, [control, entry[3], entry[4]], [token]),
        ),
      );
      await mutate("ZADD", entry[3], String((await nowMs()) - 1), token);
      const third = [
        ...entry.slice(0, 4),
        `${prefix}:expiry:receipt:${randomUUID()}`,
      ];
      assert(allowed(await acquire(third)));
      assert.equal(await command(["ZSCORE", entry[3], token]), null);
      assert(
        !allowed(
          await execute(START_SCRIPT, [control, entry[3], entry[4]], [token]),
        ),
      );
      assert.equal(await command(["HGET", entry[1], "count"]), "3");
    },
  );
  await check(
    "Taipei Lua day helper crosses midnight exactly and daily state renews",
    async () => {
      const before = Date.parse("2026-09-29T15:59:59.999Z"),
        after = before + 1;
      const script = DAY_TEST_SCRIPT;
      const left = (await execute(script, [], [String(before)])) as number[],
        right = (await execute(script, [], [String(after)])) as number[];
      assert.equal(left[1], after);
      assert.equal(right[0], left[0] + 1);
      assert.equal(right[1] - left[1], 86400000);
      const entry = keys("new-day"),
        day = Math.floor(((await nowMs()) + 28800000) / 86400000);
      for (const key of [entry[1], entry[2]])
        await mutate("HSET", key, "day", String(day - 1), "count", "200");
      assert(allowed(await acquire(entry, randomUUID(), 1, 1)));
      assert.equal(await command(["HGET", entry[1], "count"]), "1");
      const ttl = Number(await command(["PTTL", entry[1]]));
      assert(ttl > 3600000 && ttl <= 90000000);
      const result = (await acquire(
        [...entry.slice(0, 4), `${prefix}:new-day:receipt:${randomUUID()}`],
        randomUUID(),
        1,
        1,
      )) as unknown[];
      assert.equal(result[0], "daily_quota_exceeded");
      assert(Number(result[1]) >= 1 && Number(result[1]) <= 86400);
    },
  );
  await check(
    "invalid state and emergency stop fail closed with no quota debit",
    async () => {
      const entry = keys("bad-state");
      await mutate("SET", entry[1], "wrong-type");
      assert(!allowed(await acquire(entry)));
      assert.equal(await command(["EXISTS", entry[2]]), 0);
      await mutate("SET", control, "disabled");
      assert.equal(
        ((await acquire(keys("stop"))) as unknown[])[0],
        "analysis_disabled",
      );
      await mutate("DEL", control);
      assert.equal(
        ((await acquire(keys("missing-control"))) as unknown[])[0],
        "analysis_disabled",
      );
      await mutate("SET", control, "enabled");
    },
  );
  await check(
    "application quota service runs the same scripts against real Redis",
    async () => {
      const service = createQuotaService(config, { execute }),
        signal = new AbortController().signal;
      const attempt = await service.preflight(
        new Request("http://localhost/analyze", {
          method: "POST",
          headers: { "x-vercel-forwarded-for": "192.0.2.1" },
        }),
        randomUUID(),
        signal,
      );
      const lease = await attempt.acquire(signal);
      await attempt.assertEnabled(lease, signal);
      await lease.release();
    },
  );
  await check(
    "two isolated Preview/development namespaces do not share daily quota",
    async () => {
      const secondaryPrefix = quotaPrefix(otherConfig),
        secondaryControl = quotaControlKey(otherConfig);
      assert.notEqual(secondaryPrefix, prefix);
      assert.equal(otherConfig.environment, config.environment);
      await mutate("SET", secondaryControl, "enabled");
      const first = keys("namespace-isolation");
      assert(allowed(await acquire(first, randomUUID(), 1, 1)));
      const denied = [
        ...first.slice(0, 4),
        `${prefix}:namespace-isolation:receipt:${randomUUID()}`,
      ];
      assert(!allowed(await acquire(denied, randomUUID(), 1, 1)));
      const secondary = first.map((key) =>
        key.replace(prefix, secondaryPrefix),
      );
      assert(allowed(await acquire(secondary, randomUUID(), 1, 1)));
    },
  );
  await check(
    "canonical IP forms share real Redis sliding counters",
    async () => {
      const service = createQuotaService(config, { execute }),
        signal = new AbortController().signal;
      for (const ip of [
        "198.51.100.5",
        "::ffff:c633:6405",
        "0:0:0:0:0:ffff:c633:6405",
      ]) {
        await service.preflight(
          new Request("http://localhost/analyze", {
            method: "POST",
            headers: { "x-vercel-forwarded-for": ip },
          }),
          randomUUID(),
          signal,
        );
      }
      await assert.rejects(
        service.preflight(
          new Request("http://localhost/analyze", {
            method: "POST",
            headers: {
              "x-vercel-forwarded-for": "198.51.100.5",
              "x-forwarded-for": "198.51.100.6",
            },
          }),
          randomUUID(),
          signal,
        ),
        { code: "client_rate_limited" },
      );
      await service.preflight(
        new Request("http://localhost/analyze", {
          method: "POST",
          headers: { "x-vercel-forwarded-for": "198.51.100.6" },
        }),
        randomUUID(),
        signal,
      );
    },
  );
  await check(
    "injected lost response after real Redis acquire fails closed without a second debit",
    async () => {
      let reservedKeys: string[] = [];
      const lossy: RedisExecutor = async (script, entry, args) => {
        const result = await execute(script, entry, args);
        if (script === ACQUIRE_SCRIPT) {
          reservedKeys = entry;
          throw new RedisTestError("timeout");
        }
        return result;
      };
      const service = createQuotaService(config, { execute: lossy }),
        signal = new AbortController().signal;
      const attempt = await service.preflight(
        new Request("http://localhost/analyze", {
          method: "POST",
          headers: { "x-vercel-forwarded-for": "203.0.113.9" },
        }),
        randomUUID(),
        signal,
      );
      await assert.rejects(attempt.acquire(signal), {
        code: "rate_limit_unavailable",
      });
      assert.equal(await command(["HGET", reservedKeys[1], "count"]), "1");
      await assert.rejects(attempt.acquire(signal), {
        code: "rate_limit_unavailable",
      });
      assert.equal(await command(["HGET", reservedKeys[1], "count"]), "1");
      assert.equal(
        await command(["HGET", reservedKeys[4], "state"]),
        "acquired",
      );
    },
  );
  await check(
    "API handler with real Redis rejects invalid uploads and a fourth POST with zero Provider entries",
    async () => {
      let providerEntries = 0;
      const handlerConfig: ServerConfig = {
        mode: "remote",
        provider: "openai",
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        apiTimeoutMs: 20000,
        providerTimeoutMs: 15000,
      };
      const handler = createAnalyzeHandler({
        config: () => handlerConfig,
        quota: () => createQuotaService(config, { execute }),
        provider: () => ({
          analyze: async () => {
            providerEntries++;
            throw new Error("Provider tripwire");
          },
        }),
        telemetry: () => {},
      });
      for (let i = 0; i < 4; i++) {
        const req = imageRequest(Buffer.from("deliberately invalid image"));
        req.headers.set("x-vercel-forwarded-for", "203.0.113.20");
        const response = await handler(req);
        assert.equal(response.status, i < 3 ? 400 : 429);
        const output = parseAnalysisResponse(
          response.status,
          await response.json(),
        );
        if (i === 3)
          assert.equal(
            "error" in output && output.error.code,
            "client_rate_limited",
          );
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.match(
          response.headers.get("x-request-id") ?? "",
          /^[a-f0-9-]{36}$/,
        );
      }
      const code = createHmac("sha256", config.hmacSecret)
        .update("203.0.113.20")
        .digest("hex");
      assert.equal(await command(["EXISTS", `${prefix}:daily:${code}`]), 0);
      assert.equal(providerEntries, 0);
    },
  );
  await check(
    "API handler daily/global/busy/stop gates use real Redis and never enter Provider",
    async () => {
      let providerEntries = 0;
      const handlerConfig: ServerConfig = {
        mode: "remote",
        provider: "openai",
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        apiTimeoutMs: 20000,
        providerTimeoutMs: 15000,
      };
      const service = createQuotaService(config, { execute });
      const handler = createAnalyzeHandler({
        config: () => handlerConfig,
        quota: () => service,
        provider: () => ({
          analyze: async () => {
            providerEntries++;
            throw new Error("Provider tripwire");
          },
        }),
        telemetry: () => {},
      });
      const image = await png();
      const expectError = async (
        ip: string,
        code: ErrorCode,
        status: number,
      ) => {
        const req = imageRequest(image);
        req.headers.set("x-vercel-forwarded-for", ip);
        const response = await handler(req),
          output = parseAnalysisResponse(
            response.status,
            await response.json(),
          );
        assert.equal(response.status, status);
        assert.equal("error" in output && output.error.code, code);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.match(
          response.headers.get("x-request-id") ?? "",
          /^[a-f0-9-]{36}$/,
        );
        if (status === 429)
          assert(Number(response.headers.get("retry-after")) > 0);
      };
      const day = Math.floor(((await nowMs()) + 28800000) / 86400000);
      const ipCode = createHmac("sha256", config.hmacSecret)
        .update("203.0.113.30")
        .digest("hex");
      await mutate(
        "HSET",
        `${prefix}:daily:${ipCode}`,
        "day",
        String(day),
        "count",
        "10",
      );
      await expectError("203.0.113.30", "daily_quota_exceeded", 429);
      await mutate(
        "HSET",
        `${prefix}:daily:global`,
        "day",
        String(day),
        "count",
        "200",
      );
      await expectError("203.0.113.31", "global_quota_exceeded", 429);
      await mutate(
        "HSET",
        `${prefix}:daily:global`,
        "day",
        String(day),
        "count",
        "0",
      );
      // Remove only this run's leases before setting up the busy scenario.
      await mutate("DEL", `${prefix}:leases`);
      const signal = new AbortController().signal,
        leases = [];
      for (const ip of ["203.0.113.32", "203.0.113.33", "203.0.113.34"]) {
        const attempt = await service.preflight(
          new Request("http://localhost/analyze", {
            method: "POST",
            headers: { "x-vercel-forwarded-for": ip },
          }),
          randomUUID(),
          signal,
        );
        leases.push(await attempt.acquire(signal));
      }
      await expectError("203.0.113.35", "analysis_busy", 429);
      for (const lease of leases) await lease.release();
      await mutate("SET", control, "disabled");
      await expectError("203.0.113.36", "analysis_disabled", 503);
      await mutate("SET", control, "enabled");
      const reserved = await service.preflight(
        new Request("http://localhost/analyze", {
          method: "POST",
          headers: { "x-vercel-forwarded-for": "203.0.113.37" },
        }),
        randomUUID(),
        signal,
      );
      const reservedLease = await reserved.acquire(signal);
      await mutate("SET", control, "disabled");
      await assert.rejects(reserved.assertEnabled(reservedLease, signal), {
        code: "analysis_disabled",
      });
      await reservedLease.release();
      const reservedIp = createHmac("sha256", config.hmacSecret)
        .update("203.0.113.37")
        .digest("hex");
      assert.equal(
        await command(["HGET", `${prefix}:daily:${reservedIp}`, "count"]),
        "1",
      );
      await mutate("SET", control, "enabled");
      assert.equal(providerEntries, 0);
    },
  );
  await check(
    "real Redis acquire followed by an injected HTTP connection reset fails closed with zero Provider entries",
    () => verifyNetworkFault(config, command, "connection_reset"),
  );
  await check(
    "real Redis acquire followed by an injected HTTP response timeout fails closed with zero Provider entries",
    () => verifyNetworkFault(config, command, "response_timeout"),
  );
  return checks;
}
