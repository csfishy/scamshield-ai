// Intentionally separate from the loopback runner. Never uses application env credentials.
import { parseArgs } from "node:util";
import { runIntegration } from "./runner";
import {
  createRestCommand,
  safeFailureCode,
  validateRestTarget,
} from "./support";

try {
  const { values } = parseArgs({
    options: {
      "expected-host": { type: "string" },
      "allow-isolated-redis-write": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const target = validateRestTarget(
    {
      TEST_UPSTASH_REDIS_REST_URL: process.env.TEST_UPSTASH_REDIS_REST_URL,
      TEST_UPSTASH_REDIS_REST_TOKEN: process.env.TEST_UPSTASH_REDIS_REST_TOKEN,
    },
    {
      expectedHost: values["expected-host"],
      allowWrite: values["allow-isolated-redis-write"],
    },
  );
  const result = await runIntegration(
    "upstash_rest",
    createRestCommand(target),
    target.fingerprint,
  );
  process.exitCode = result.status === "PASS" ? 0 : 1;
} catch (error) {
  // No raw exception, URL, token, Redis response, or process environment in logs.
  console.log(
    JSON.stringify({
      status: "NOT_RUN",
      profile: "upstash_rest",
      failure: safeFailureCode(error),
      realProviderCalls: 0,
    }),
  );
  process.exitCode = 2;
}
