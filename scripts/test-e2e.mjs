import { spawn } from "node:child_process";
import { createServer } from "node:net";
const socket = createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["scripts/production-test-server.mjs", String(port)],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      ANALYSIS_MODE: "mock",
      AI_API_KEY: "",
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-4.1-mini-2025-04-14",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  },
);
let log = "";
server.stdout.on("data", (b) => {
  log = (log + b).slice(-5000);
});
server.stderr.on("data", (b) => {
  log = (log + b).slice(-5000);
});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Server failed: ${log}`);
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Production server did not start");
  const runner = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    {
      env: { ...process.env, E2E_BASE_URL: base },
      windowsHide: true,
      stdio: "inherit",
    },
  );
  process.exitCode = await new Promise((r) => {
    runner.once("exit", (c) => r(c ?? 1));
    runner.once("error", () => r(1));
  });
} finally {
  if (server.exitCode === null && server.connected) {
    server.send("shutdown");
    await Promise.race([
      new Promise((r) => server.once("exit", r)),
      new Promise((r) => setTimeout(r, 5000).unref()),
    ]);
    if (server.exitCode === null) server.kill();
  }
}
