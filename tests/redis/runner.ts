import { quotaPrefix } from "../../lib/server/quota-config";
import {
  ACQUIRE_SCRIPT,
  PREFLIGHT_SCRIPT,
  RELEASE_SCRIPT,
  START_SCRIPT,
} from "../../lib/server/quota-scripts";
import { runRedisSuite } from "./suite";
import {
  createGuardedCommands,
  createTestConfig,
  revisionEvidence,
  safeFailureCode,
  type RedisCommand,
} from "./support";

export async function runIntegration(
  profile: "local_tcp" | "upstash_rest",
  transport: RedisCommand,
  targetFingerprint?: string,
): Promise<{ status: "PASS" | "FAIL" | "NOT_RUN" }> {
  const config = createTestConfig(
    profile === "local_tcp" ? "development" : "preview",
  );
  const otherConfig = {
    ...config,
    namespace: createTestConfig(
      config.environment === "preview" ? "preview" : "development",
    ).namespace,
  };
  const guard = createGuardedCommands(transport, [
    quotaPrefix(config),
    quotaPrefix(otherConfig),
  ]);
  const passed: string[] = [];
  let status: "PASS" | "FAIL" | "NOT_RUN" = "FAIL",
    failure: string | undefined,
    activeCheck: string | undefined;
  let cleanup: "confirmed" | "not_needed" | "failed" = "not_needed",
    serverVersion: string | undefined;
  try {
    try {
      await guard.command(["PING"]);
    } catch (error) {
      if (profile === "local_tcp") status = "NOT_RUN";
      throw error;
    }
    const info = String(await guard.command(["INFO", "server"]));
    serverVersion = /^redis_version:([0-9.]{1,16})\r?$/m.exec(info)?.[1];
    if (
      profile === "local_tcp" &&
      (!serverVersion || Number(serverVersion.split(".")[0]) < 7)
    )
      throw new Error("Unsupported local Redis version");
    await runRedisSuite(
      config,
      guard.command,
      (name, state) => {
        activeCheck = name;
        if (state === "passed") {
          passed.push(name);
          console.log(`PASS ${name}`);
        }
      },
      otherConfig,
    );
    status = "PASS";
  } catch (error) {
    failure = safeFailureCode(error);
  } finally {
    try {
      cleanup = await guard.cleanup();
    } catch {
      cleanup = "failed";
      status = "FAIL";
      failure ??= "cleanup";
    }
  }
  const result = {
    status,
    profile,
    targetFingerprint,
    namespace: config.namespace,
    secondaryNamespace: otherConfig.namespace,
    serverVersion,
    checksPassed: passed.length,
    checks: passed,
    failedCheck: status === "FAIL" ? activeCheck : undefined,
    failure,
    commandCount: guard.commandCount,
    cleanup,
    realProviderCalls: 0,
    faultCoverage:
      "Real Redis execution followed by explicit loopback HTTP socket reset/response timeout and response-loss injection; not an actual Upstash outage.",
    ...revisionEvidence({
      preflight: PREFLIGHT_SCRIPT,
      acquire: ACQUIRE_SCRIPT,
      start: START_SCRIPT,
      release: RELEASE_SCRIPT,
    }),
  };
  console.log(JSON.stringify(result));
  return result;
}
