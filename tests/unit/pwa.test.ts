import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const icons = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512 },
] as const;

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
    expect(manifest.icons).toEqual([
      {
        src: "/icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ]);
  });

  it("ships opaque sRGB PNG icons at the declared sizes", async () => {
    for (const icon of icons) {
      const image = sharp(`public/${icon.file}`);
      const [metadata, stats] = await Promise.all([
        image.metadata(),
        image.stats(),
      ]);

      expect(metadata).toMatchObject({
        format: "png",
        width: icon.size,
        height: icon.size,
        space: "srgb",
        hasAlpha: false,
      });
      expect(stats.isOpaque).toBe(true);
    }
  });

  it("declares the dedicated 180px Apple touch icon", async () => {
    const layout = await readFile("app/layout.tsx", "utf8");
    expect(layout).toMatch(
      /apple:\s*\[\s*\{\s*url:\s*"\/apple-touch-icon\.png",\s*sizes:\s*"180x180",\s*type:\s*"image\/png"/s,
    );
  });

  it("migrates only known app caches and never handles POST /analyze", async () => {
    const worker = await readFile("public/service-worker.js", "utf8");
    expect(worker).toContain('"offline-cache-"');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('url.pathname === "/analyze"');
    expect(worker.match(/caches\.delete\(key\)/g)).toHaveLength(1);
    expect(worker).toContain("KNOWN_APP_CACHE_PREFIXES.some");
    expect(worker).toContain('const WORKER_VERSION = "next-v2"');
    for (const icon of icons) {
      expect(worker).toContain(`"/${icon.file}"`);
    }
  });
});
