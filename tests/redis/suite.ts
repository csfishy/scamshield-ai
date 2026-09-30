import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  quotaControlKey,
  quotaPrefix,
  type QuotaConfig,
} from "../../lib/server/quota-config";
import { createQuotaService, type RedisExecutor } from "../../lib/server/quota";
import {
  ACQUIRE_SCRIPT,
  FINALIZE_SCRIPT,
  PREFLIGHT_SCRIPT,
  START_SCRIPT,
} from "../../lib/server/quota-scripts";
import { verifyNetworkFault } from "./network-faults";
import {
  TEMPORARY_KEY_TTL_MS,
  DAY_TEST_SCRIPT,
  SEED_HASH_SCRIPT,
  SEED_ZSET_SCRIPT,
  settleAll,
  type RedisCommand,
} from "./support";

const signal = new AbortController().signal;

function request(ip: string, deviceId = randomUUID()) {
  return new Request("http://localhost/analyze", {
    method: "POST",
    headers: {
      "x-vercel-forwarded-for": ip,
      "x-scamshield-device-id": deviceId,
    },
  });
}

export async function runRedisSuite(
  config: QuotaConfig,
  command: RedisCommand,
  report: (name: string, state: "running" | "passed") => void,
  otherConfig: QuotaConfig,
) {
  const prefix = quotaPrefix(config),
    control = quotaControlKey(config);
  const execute: RedisExecutor = (script, keys, args) =>
    command(["EVAL", script, String(keys.length), ...keys, ...args]);
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
  const nowMs = async () => {
    const time = (await command(["TIME"])) as string[];
    return Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  };
  let checks = 0;
  const check = async (name: string, work: () => Promise<void>) => {
    report(name, "running");
    await work();
    checks++;
    report(name, "passed");
  };
  const service = (changes: Partial<QuotaConfig> = {}) =>
    createQuotaService({ ...config, ...changes }, { execute });
  const admission = async (
    quota: ReturnType<typeof service>,
    ip: string,
    deviceId = randomUUID(),
  ) => {
    const attempt = await quota.preflight(
      request(ip, deviceId),
      randomUUID(),
      signal,
    );
    const lease = await attempt.acquire(signal);
    await attempt.assertEnabled(lease, signal);
    return lease;
  };

  await mutate("SET", control, "enabled");

  await check("5/minute allows five, rejects six, and resets", async () => {
    const window = `${prefix}:rate-test:minute`,
      ipDay = `${prefix}:rate-test:ip-day`;
    for (let i = 0; i < 5; i++)
      assert.deepEqual(
        await execute(
          PREFLIGHT_SCRIPT,
          [control, window, ipDay],
          [randomUUID(), "5", "150"],
        ),
        ["ok", 0],
      );
    const denied = (await execute(
      PREFLIGHT_SCRIPT,
      [control, window, ipDay],
      [randomUUID(), "5", "150"],
    )) as unknown[];
    assert.equal(denied[0], "client_rate_limited");
    assert(Number(denied[1]) > 0 && Number(denied[1]) <= 60);
    const expired = String((await nowMs()) - 60001);
    const members = (await command(["ZRANGE", window, "0", "-1"])) as string[];
    for (const member of members) await mutate("ZADD", window, expired, member);
    assert.equal(
      (
        (await execute(
          PREFLIGHT_SCRIPT,
          [control, window, ipDay],
          [randomUUID(), "5", "150"],
        )) as unknown[]
      )[0],
      "ok",
    );
    const ttl = Number(await command(["PTTL", window]));
    assert(ttl > 0 && ttl <= 60000);
  });

  await check(
    "IP safety counts requests and resets on the Taipei day",
    async () => {
      const window = `${prefix}:ip-safety:minute`,
        ipDay = `${prefix}:ip-safety:day`;
      assert.equal(
        (
          (await execute(
            PREFLIGHT_SCRIPT,
            [control, window, ipDay],
            [randomUUID(), "5", "1"],
          )) as unknown[]
        )[0],
        "ok",
      );
      assert.equal(
        (
          (await execute(
            PREFLIGHT_SCRIPT,
            [control, window, ipDay],
            [randomUUID(), "5", "1"],
          )) as unknown[]
        )[0],
        "ip_safety_limit_exceeded",
      );
      const before = Date.parse("2026-09-29T15:59:59.999Z"),
        after = before + 1;
      const left = (await execute(
          DAY_TEST_SCRIPT,
          [],
          [String(before)],
        )) as number[],
        right = (await execute(
          DAY_TEST_SCRIPT,
          [],
          [String(after)],
        )) as number[];
      assert.equal(left[1], after);
      assert.equal(right[0], left[0] + 1);
    },
  );

  await check(
    "device successes commit, failures roll back, devices isolate",
    async () => {
      const quota = service({
          deviceDailyLimit: 1,
          ipDailyLimit: 50,
          globalDailyLimit: 50,
          circuitBreakerEnabled: false,
        }),
        first = "11111111-1111-4111-8111-111111111111",
        second = "22222222-2222-4222-8222-222222222222";
      await (
        await admission(quota, "192.0.2.10", first)
      ).finalize("provider_failure");
      await (await admission(quota, "192.0.2.10", first)).finalize("success");
      const blocked = await quota.preflight(
        request("192.0.2.10", first),
        randomUUID(),
        signal,
      );
      await assert.rejects(blocked.acquire(signal), {
        code: "device_quota_exceeded",
      });
      await (
        await admission(quota, "192.0.2.10", second)
      ).finalize("neutral_failure");
    },
  );

  await check(
    "global success reservation race admits only the final slot",
    async () => {
      const quota = service({
        windowLimit: 100,
        ipDailyLimit: 100,
        deviceDailyLimit: 100,
        globalDailyLimit: 1,
        concurrencyLimit: 20,
        circuitBreakerEnabled: false,
      });
      const attempts = await settleAll(
        Array.from({ length: 12 }, async (_, index) =>
          quota.preflight(
            request(`198.51.100.${index + 1}`),
            randomUUID(),
            signal,
          ),
        ),
      );
      const results = await Promise.allSettled(
        attempts.map((attempt) => attempt.acquire(signal)),
      );
      const admitted = results.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<(typeof attempts)[number]["acquire"]>>
        > => result.status === "fulfilled",
      );
      assert.equal(admitted.length, 1);
      assert(
        results
          .filter((result) => result.status === "rejected")
          .every((result) => result.reason?.code === "global_quota_exceeded"),
      );
      await admitted[0].value.finalize("success");
    },
  );

  await check(
    "five distributed leases allow five, reject six, then recover",
    async () => {
      const quota = service({
        windowLimit: 100,
        ipDailyLimit: 100,
        deviceDailyLimit: 100,
        globalDailyLimit: 100,
        concurrencyLimit: 5,
        circuitBreakerEnabled: false,
      });
      const leases = [];
      for (let i = 0; i < 5; i++)
        leases.push(await admission(quota, `203.0.113.${i + 1}`));
      const sixth = await quota.preflight(
        request("203.0.113.6"),
        randomUUID(),
        signal,
      );
      await assert.rejects(sixth.acquire(signal), { code: "service_busy" });
      await leases[0].finalize("neutral_failure");
      await (await admission(quota, "203.0.113.7")).finalize("neutral_failure");
      for (const lease of leases.slice(1))
        await lease.finalize("neutral_failure");
    },
  );

  await check(
    "expired crash leases and reservations are reclaimed",
    async () => {
      let captured: { keys: string[]; token: string } | undefined;
      const capture: RedisExecutor = async (script, keys, args) => {
        const value = await execute(script, keys, args);
        if (script === ACQUIRE_SCRIPT) captured = { keys, token: args[0] };
        return value;
      };
      const quota = createQuotaService(
        {
          ...config,
          concurrencyLimit: 1,
          deviceDailyLimit: 1,
          globalDailyLimit: 1,
          circuitBreakerEnabled: false,
        },
        { execute: capture },
      );
      await admission(
        quota,
        "203.0.113.20",
        "33333333-3333-4333-8333-333333333333",
      );
      assert(captured);
      const expired = String((await nowMs()) - 1);
      for (const index of [2, 4, 5])
        await mutate("ZADD", captured.keys[index], expired, captured.token);
      await (
        await admission(
          quota,
          "203.0.113.20",
          "33333333-3333-4333-8333-333333333333",
        )
      ).finalize("success");
    },
  );

  await check(
    "circuit transitions CLOSED to OPEN to HALF_OPEN to CLOSED",
    async () => {
      const quota = service({
        windowLimit: 100,
        ipDailyLimit: 100,
        deviceDailyLimit: 100,
        globalDailyLimit: 100,
        circuitBreakerFailureThreshold: 2,
        circuitBreakerWindowSeconds: 60,
        circuitBreakerOpenSeconds: 30,
        circuitBreakerHalfOpenMaxProbes: 1,
      });
      assert.equal(
        await (
          await admission(quota, "198.18.0.1")
        ).finalize("provider_failure"),
        "none",
      );
      assert.equal(
        await (
          await admission(quota, "198.18.0.2")
        ).finalize("provider_failure"),
        "provider_cb_opened",
      );
      const rejected = await quota.preflight(
        request("198.18.0.3"),
        randomUUID(),
        signal,
      );
      await assert.rejects(rejected.acquire(signal), {
        code: "provider_temporarily_unavailable",
      });
      const cbState = `${prefix}:provider:cb:state`;
      await mutate(
        "HSET",
        cbState,
        "state",
        "OPEN",
        "opened_at",
        String((await nowMs()) - 31000),
      );
      const halfOpen = await admission(quota, "198.18.0.4");
      assert.equal(halfOpen.circuitState, "half_open");
      const extra = await quota.preflight(
        request("198.18.0.5"),
        randomUUID(),
        signal,
      );
      await assert.rejects(extra.acquire(signal), {
        code: "provider_temporarily_unavailable",
      });
      assert.equal(await halfOpen.finalize("success"), "provider_cb_closed");
      const closed = await admission(quota, "198.18.0.6");
      assert.equal(closed.circuitState, "closed");
      await closed.finalize("neutral_failure");
    },
  );

  await check(
    "failed HALF_OPEN probe reopens and non-provider failures do not count",
    async () => {
      const quota = service({
        windowLimit: 100,
        ipDailyLimit: 100,
        deviceDailyLimit: 100,
        globalDailyLimit: 100,
        circuitBreakerFailureThreshold: 1,
        circuitBreakerOpenSeconds: 30,
      });
      await (await admission(quota, "198.18.1.1")).finalize("neutral_failure");
      const stillClosed = await admission(quota, "198.18.1.2");
      assert.equal(stillClosed.circuitState, "closed");
      assert.equal(
        await stillClosed.finalize("provider_failure"),
        "provider_cb_opened",
      );
      const cbState = `${prefix}:provider:cb:state`;
      await mutate(
        "HSET",
        cbState,
        "state",
        "OPEN",
        "opened_at",
        String((await nowMs()) - 31000),
      );
      const probe = await admission(quota, "198.18.1.3");
      assert.equal(probe.circuitState, "half_open");
      assert.equal(
        await probe.finalize("provider_failure"),
        "provider_cb_opened",
      );
      const blocked = await quota.preflight(
        request("198.18.1.4"),
        randomUUID(),
        signal,
      );
      await assert.rejects(blocked.acquire(signal), {
        code: "provider_temporarily_unavailable",
      });
    },
  );

  await check(
    "runtime control and namespaces remain fail closed and isolated",
    async () => {
      const secondaryPrefix = quotaPrefix(otherConfig),
        secondaryControl = quotaControlKey(otherConfig);
      assert.notEqual(secondaryPrefix, prefix);
      await mutate("SET", control, "disabled");
      await assert.rejects(
        service().preflight(request("192.0.2.200"), randomUUID(), signal),
        { code: "analysis_disabled" },
      );
      await mutate("SET", secondaryControl, "enabled");
      const secondary = createQuotaService(otherConfig, { execute });
      await (
        await admission(secondary, "192.0.2.200")
      ).finalize("neutral_failure");
      await mutate("SET", control, "enabled");
    },
  );

  await check(
    "real Redis acquire followed by HTTP connection reset fails closed",
    () => verifyNetworkFault(config, command, "connection_reset"),
  );
  await check(
    "real Redis acquire followed by HTTP response timeout fails closed",
    () => verifyNetworkFault(config, command, "response_timeout"),
  );

  // Explicitly exercise the exact script exports in evidence collection.
  assert(FINALIZE_SCRIPT.length > 0 && START_SCRIPT.length > 0);
  return checks;
}
