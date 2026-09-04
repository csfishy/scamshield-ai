import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Next.js PWA migration assets", () => {
  it("uses a root-scoped installable manifest", async () => {
    const manifest = JSON.parse(
      await readFile("public/manifest.webmanifest", "utf8"),
    );
    expect(manifest).toMatchObject({
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(manifest.icons).toHaveLength(2);
  });

  it("migrates only known app caches and never handles POST /analyze", async () => {
    const worker = await readFile("public/service-worker.js", "utf8");
    expect(worker).toContain('"offline-cache-"');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('url.pathname === "/analyze"');
    expect(worker.match(/caches\.delete\(key\)/g)).toHaveLength(1);
    expect(worker).toContain("KNOWN_APP_CACHE_PREFIXES.some");
  });
});
