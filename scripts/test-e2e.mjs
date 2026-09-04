import { spawn } from "node:child_process";
import { createServer } from "node:net";

async function availablePort() {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function runSuite(mode, specs) {
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    ["scripts/production-test-server.mjs", String(port)],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        ANALYSIS_MODE: mode,
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
  server.stdout.on("data", (buffer) => {
    log = (log + buffer).slice(-5000);
  });
  server.stderr.on("data", (buffer) => {
    log = (log + buffer).slice(-5000);
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(`Server failed: ${log}`);
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Production server did not start: ${log}`);

    const runner = spawn(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", ...specs],
      {
        env: { ...process.env, E2E_BASE_URL: base, E2E_MODE: mode },
        windowsHide: true,
        stdio: "inherit",
      },
    );
    return await new Promise((resolve) => {
      runner.once("exit", (code) => resolve(code ?? 1));
      runner.once("error", () => resolve(1));
    });
  } finally {
    if (server.exitCode === null && server.connected) {
      server.send("shutdown");
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000).unref()),
      ]);
      if (server.exitCode === null) server.kill();
    }
  }
}

let code = await runSuite("mock", [
  "tests/e2e/backend-shell.spec.ts",
  "tests/e2e/analysis-ui.spec.ts",
]);
if (code === 0) {
  code = await runSuite("remote", ["tests/e2e/remote-ui.spec.ts"]);
}
process.exitCode = code;
