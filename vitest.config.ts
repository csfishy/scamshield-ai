import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: { "server-only": path.resolve("tests/helpers/server-only.ts") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
