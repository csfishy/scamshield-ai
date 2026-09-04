import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { collectBrowserErrors } from "../helpers/browser";

let browserErrors: string[];
test.beforeEach(async ({ page }) => {
  browserErrors = collectBrowserErrors(page);
});
test.afterEach(async () => {
  expect(browserErrors).toEqual([]);
});

async function png(background: string) {
  return sharp({
    create: { width: 320, height: 220, channels: 3, background },
  })
    .png()
    .toBuffer();
}

test("local Demo supports selection, loading, result, and scenario changes", async ({
  page,
}) => {
  await page.goto("/");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "synthetic-delivery.png",
    mimeType: "image/png",
    buffer: await png("#edf8f6"),
  });

  await expect(page.getByAltText("所選可疑截圖的預覽")).toBeVisible();
  await expect(
    page.getByText("synthetic-delivery.png", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "顯示 Demo 結果" }).click();
  await expect(page.getByRole("button", { name: "取消" })).toBeVisible();
  await expect(page.getByText("正在載入示範資料…")).toBeVisible();
  await expect(page.getByText("高風險", { exact: true })).toBeVisible();
  await expect(
    page.getByText("本結果為示範資料，並未分析你選擇的圖片。"),
  ).toBeVisible();
  await expect(page.getByText("風險指標，非詐騙機率")).toBeVisible();

  await page.getByRole("button", { name: "分析另一張圖片" }).click();
  await expect(
    page.getByRole("button", { name: "顯示 Demo 結果" }),
  ).toBeDisabled();
});

test("changing image cancels pending work and stale Demo cannot overwrite", async ({
  page,
}) => {
  await page.goto("/");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "first.png",
    mimeType: "image/png",
    buffer: await png("#fff3e0"),
  });
  await page.getByRole("button", { name: "顯示 Demo 結果" }).click();
  await expect(page.getByRole("button", { name: "取消" })).toBeVisible();

  await fileInput.setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: await png("#e6f4ff"),
  });
  await expect(
    page.getByText("replacement.png", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "取消" })).toHaveCount(0);
  await page.waitForTimeout(850);
  await expect(page.getByText("高風險", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "顯示 Demo 結果" }),
  ).toBeEnabled();
});

test("invalid selection clears the previous file and supports recovery", async ({
  page,
}) => {
  await page.goto("/");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "valid.png",
    mimeType: "image/png",
    buffer: await png("#ffffff"),
  });
  await expect(page.getByText("valid.png", { exact: true })).toBeVisible();

  await fileInput.setInputFiles({
    name: "not-an-image.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("GIF89a"),
  });
  await expect(page.locator(".error-card")).toContainText(
    "僅支援單張 JPEG 或 PNG",
  );
  await expect(page.getByText("valid.png", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "顯示 Demo 結果" }),
  ).toBeDisabled();

  await fileInput.setInputFiles({
    name: "recovered.png",
    mimeType: "image/png",
    buffer: await png("#eaf7f5"),
  });
  await expect(page.getByText("recovered.png", { exact: true })).toBeVisible();
  await expect(page.locator(".error-card")).toHaveCount(0);
});

test("small viewport has no horizontal overflow and keeps controls usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "可疑截圖，先交給 AI 看看" }),
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeAttached();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mobile result is reachable, focused, and remains within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "mobile.png",
    mimeType: "image/png",
    buffer: await png("#edf8f6"),
  });
  await page.getByRole("button", { name: "顯示 Demo 結果" }).click();
  await expect(page.getByRole("heading", { name: "分析結果" })).toBeFocused();
  await expect(page.getByText("高風險", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("PWA assets are served and the worker keeps /analyze outside its cache", async ({
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(await manifestResponse.json()).toMatchObject({
    start_url: "/",
    scope: "/",
    display: "standalone",
  });

  for (const path of [
    "/service-worker.js",
    "/offline.html",
    "/icon-192.png",
    "/icon-512.png",
  ]) {
    expect((await request.get(path)).ok()).toBe(true);
  }
  const worker = await (await request.get("/service-worker.js")).text();
  expect(worker).toContain('request.method !== "GET"');
  expect(worker).toContain('url.pathname === "/analyze"');
});
