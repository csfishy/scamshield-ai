import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/integration"],
  { stdio: "inherit", windowsHide: true },
);
process.exit(result.status ?? 1);
