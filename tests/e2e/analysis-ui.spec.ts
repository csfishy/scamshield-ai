import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { collectBrowserErrors } from "../helpers/browser";
import {
  PRIVACY_CONTACT_MAILTO,
  PUBLIC_PRIVACY_CONTACT_EMAIL,
} from "../../lib/privacy";

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
  await expect(
    page.getByRole("link", { name: "本機 Demo", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".mode-notice")).toHaveCount(0);
  await expect(
    page.locator(".homepage-bottom-nav").getByRole("link", {
      name: "隱私說明",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "意見回饋", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".page-frame > .site-nav:not(.homepage-bottom-nav)"),
  ).toHaveCount(0);
  await expect(page.locator(".privacy-hint")).toContainText(
    "上傳前請先遮住不必要的姓名、電話、帳號、信用卡、OTP 驗證碼與其他敏感資訊",
  );
  await expect(page.locator('input[type="file"]')).toBeAttached();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Demo route keeps its navigation, notice, and local functionality", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("link", { name: "本機 Demo", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".mode-notice")).toContainText(
    "示範資料，未分析此圖片",
  );
  await expect(
    page.getByRole("button", { name: "顯示 Demo 結果" }),
  ).toBeVisible();
});

test("Beta privacy and unconfigured feedback remain available without uploading", async ({
  page,
}) => {
  let analysisRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/analyze")) analysisRequests++;
  });
  await page.goto("/");
  await expect(
    page.getByText("公開測試版 Beta", { exact: true }),
  ).toBeVisible();
  const summary = page.locator("#site-feedback summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Google 表單尚未開放；本頁不會代為送出回饋。"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /開啟 Google 表單/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "使用 Email 聯絡" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: PUBLIC_PRIVACY_CONTACT_EMAIL }),
  ).toHaveAttribute("href", PRIVACY_CONTACT_MAILTO);
  await expect(
    page.getByRole("link", { name: "隱私聯絡與刪除申請" }),
  ).toHaveAttribute("href", "/privacy#contact");
  await page
    .getByRole("link", { name: "隱私說明", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "隱私與使用限制" }),
  ).toBeVisible();
  await expect(page.getByText(/不代表所有平台零留存/)).toBeVisible();
  await page.getByRole("link", { name: "開啟不會呼叫 AI 的 Demo" }).click();
  await expect(
    page.getByRole("button", { name: "顯示 Demo 結果" }),
  ).toBeVisible();
  expect(analysisRequests).toBe(0);
});

test("privacy presents the public policy and copyable contact on mobile without upload", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let analysisRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/analyze") analysisRequests++;
  });
  await page.goto("/");
  await expect(page.locator(".privacy-hint")).toContainText("信用卡");
  await expect(page.locator(".data-notice")).toContainText(
    "本工具為 Beta，可能誤判；低風險不代表安全。",
  );
  await page
    .getByRole("link", { name: "隱私說明", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "隱私與使用限制" }),
  ).toBeVisible();
  await expect(page.getByText(/原則上自提交日起最長保存 90 天/)).toBeVisible();
  await expect(page.getByText(/另行取得適當同意/)).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/TBD|待確認|待填|尚待管理者|聯絡 Email 尚未提供/);
  expect(text).toContain("不代表所有平台零留存");
  expect(text).toContain("不代表完全匿名");
  expect(text).toContain("防濫用日誌可能包含輸入與輸出");
  expect(text).toContain("法律或安全需要等例外可能保留更久");
  expect(text).toContain("不代表網站已提供自動刪除功能");
  await expect(
    page.getByRole("link", { name: "聯絡管理者／申請刪除" }),
  ).toHaveAttribute("href", PRIVACY_CONTACT_MAILTO);
  await expect(page.locator("#contact")).toContainText(
    PUBLIC_PRIVACY_CONTACT_EMAIL,
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = page.getByRole("button", { name: "複製公開聯絡 Email" });
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("已複製公開聯絡 Email", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    PUBLIC_PRIVACY_CONTACT_EMAIL,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(analysisRequests).toBe(0);
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
    background_color: "#f5f2ea",
    theme_color: "#315a48",
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
