// Loopback-only runner. Remote Upstash tests have a separate explicit opt-in entry.
import { runIntegration } from "./runner";
import { createLocalCommand } from "./tcp";
import { RedisTestError, safeFailureCode } from "./support";

try {
  const rawPort = process.env.REDIS_TEST_PORT ?? "16379";
  if (!/^\d+$/.test(rawPort)) throw new RedisTestError("configuration");
  const result = await runIntegration(
    "local_tcp",
    createLocalCommand(Number(rawPort)),
  );
  process.exitCode =
    result.status === "PASS" ? 0 : result.status === "NOT_RUN" ? 2 : 1;
} catch (error) {
  console.log(
    JSON.stringify({
      status: "NOT_RUN",
      profile: "local_tcp",
      failure: safeFailureCode(error),
      realProviderCalls: 0,
    }),
  );
  process.exitCode = 2;
}
