import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { fakeDelivery } from "../../fixtures/demo";
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
  const unexpected = browserErrors.filter(
    (message) =>
      !message.includes("status of 503") &&
      !message.includes("status of 422") &&
      !message.includes("status of 429"),
  );
  expect(unexpected).toEqual([]);
});

async function testImage() {
  return sharp({
    create: { width: 320, height: 220, channels: 3, background: "#edf8f6" },
  })
    .png()
    .toBuffer();
}

async function selectImage(page: import("@playwright/test").Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "remote-test.png",
    mimeType: "image/png",
    buffer: await testImage(),
  });
}

for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932],
] as const) {
  test(`homepage keeps both primary actions above the fold at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");

    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const screenshotCta = page.getByText("選擇截圖", { exact: true });
    const analyzeCta = page.getByRole("button", { name: "開始 AI 分析" });
    await expect(screenshotCta).toBeVisible();
    await expect(analyzeCta).toBeVisible();
    await expect(analyzeCta).toBeDisabled();

    const [screenshotBox, analyzeBox] = await Promise.all([
      screenshotCta.boundingBox(),
      analyzeCta.boundingBox(),
    ]);
    expect(screenshotBox).not.toBeNull();
    expect(analyzeBox).not.toBeNull();
    expect(screenshotBox!.y).toBeGreaterThanOrEqual(0);
    expect(screenshotBox!.y + screenshotBox!.height).toBeLessThanOrEqual(
      height,
    );
    expect(analyzeBox!.y).toBeGreaterThanOrEqual(0);
    expect(analyzeBox!.y + analyzeBox!.height).toBeLessThanOrEqual(height);

    if (width === 390 || width === 393) {
      const resultBox = await page.locator(".result-panel").boundingBox();
      expect(resultBox).not.toBeNull();
      expect(resultBox!.y).toBeGreaterThanOrEqual(height);

      const primaryLine = page.locator(".hero-title-primary-line");
      const accentLine = page.locator(".hero-title-accent-line");
      const subheadline = page.locator(".hero-title-secondary");
      const [primaryBox, accentBox, primaryColor, accentColor, subheadColor] =
        await Promise.all([
          primaryLine.boundingBox(),
          accentLine.boundingBox(),
          primaryLine.evaluate((element) => getComputedStyle(element).color),
          accentLine.evaluate((element) => getComputedStyle(element).color),
          subheadline.evaluate((element) => getComputedStyle(element).color),
        ]);
      expect(primaryBox).not.toBeNull();
      expect(accentBox).not.toBeNull();
      expect(accentBox!.y).toBeGreaterThanOrEqual(
        primaryBox!.y + primaryBox!.height,
      );
      expect(accentColor).not.toBe(primaryColor);
      expect(subheadColor).toBe(primaryColor);

      const copyLines = page.locator(".hero-copy-line");
      await expect(copyLines).toHaveCount(2);
      const [firstCopyBox, secondCopyBox] = await Promise.all([
        copyLines.nth(0).boundingBox(),
        copyLines.nth(1).boundingBox(),
      ]);
      expect(firstCopyBox).not.toBeNull();
      expect(secondCopyBox).not.toBeNull();
      expect(secondCopyBox!.y).toBeGreaterThanOrEqual(
        firstCopyBox!.y + firstCopyBox!.height,
      );
    }

    expect(
      await page.evaluate(() => ({
        scrollY: window.scrollY,
        noHorizontalOverflow:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      })),
    ).toEqual({ scrollY: 0, noHorizontalOverflow: true });
  });
}

test("homepage navigation is relocated below feedback without Demo or Feedback links", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator(".page-frame > .site-nav:not(.homepage-bottom-nav)"),
  ).toHaveCount(0);
  const footerNavigation = page.locator(".homepage-bottom-nav");
  await expect(footerNavigation).toContainText("公開測試版 Beta");
  await expect(
    footerNavigation.getByRole("link", { name: "隱私說明", exact: true }),
  ).toBeVisible();
  await expect(
    footerNavigation.getByRole("link", { name: "本機 Demo", exact: true }),
  ).toHaveCount(0);
  await expect(
    footerNavigation.getByRole("link", { name: "意見回饋", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const feedback = document.querySelector("#site-feedback");
      const navigation = document.querySelector(".homepage-bottom-nav");
      return Boolean(
        feedback &&
        navigation &&
        feedback.compareDocumentPosition(navigation) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
});

test("tablet homepage stacks the workspace without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  const [uploadBox, resultBox] = await Promise.all([
    page.locator(".upload-panel").boundingBox(),
    page.locator(".result-panel").boundingBox(),
  ]);
  expect(uploadBox).not.toBeNull();
  expect(resultBox).not.toBeNull();
  expect(resultBox!.y).toBeGreaterThan(uploadBox!.y + uploadBox!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const width of [1280, 1440]) {
  test(`desktop homepage retains the two-column workspace at ${width}x900`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const uploadPanel = page.locator(".upload-panel");
    const resultPanel = page.locator(".result-panel");
    const [uploadBox, resultBox] = await Promise.all([
      uploadPanel.boundingBox(),
      resultPanel.boundingBox(),
    ]);
    expect(uploadBox).not.toBeNull();
    expect(resultBox).not.toBeNull();
    expect(resultBox!.x).toBeGreaterThan(uploadBox!.x + uploadBox!.width);
    await expect(
      page.getByRole("button", { name: "開始 AI 分析" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("platform HTML failure stays an error until the user manually retries", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/analyze", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    if (requests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "<html>platform unavailable</html>",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fakeDelivery),
    });
  });

  await page.goto("/");
  await expect(
    page.getByText("即時 AI 分析", { exact: true }).first(),
  ).toBeVisible();
  await selectImage(page);
  await page.getByRole("button", { name: "開始 AI 分析" }).click();

  await expect(page.locator(".analysis-error")).toContainText(
    "即時分析目前未啟用或服務暫時不可用",
  );
  await expect(page.getByText("高風險", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("未取得問題編號；仍可描述操作問題。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "手動重試" }).click();
  await expect(page.getByText("高風險", { exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test("422 asks for a clearer image and does not offer same-image retry", async ({
  page,
}) => {
  await page.route("**/analyze", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: {
          code: "insufficient_evidence",
          message: "目前圖片資訊不足，請提供文字清楚且包含完整上下文的截圖。",
          retryable: false,
        },
      }),
    });
  });

  await page.goto("/");
  await selectImage(page);
  await page.getByRole("button", { name: "開始 AI 分析" }).click();
  await expect(page.locator(".analysis-error")).toContainText("圖片資訊不足");
  await expect(page.getByRole("button", { name: "手動重試" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "選擇其他圖片" }),
  ).toBeVisible();
});

test("cancel prevents a delayed response from replacing the ready state", async ({
  page,
}) => {
  await page.route("**/analyze", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fakeDelivery),
    });
  });

  await page.goto("/");
  await selectImage(page);
  await page.getByRole("button", { name: "開始 AI 分析" }).click();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(
    page.getByRole("button", { name: "開始 AI 分析" }),
  ).toBeEnabled();
  await page.waitForTimeout(1050);
  await expect(page.getByText("高風險", { exact: true })).toHaveCount(0);
});

const feedbackRequestId = "dbbbdbbb-1234-4321-8123-dbbbbbbbbbbb";

for (const [width, height] of [
  [390, 844],
  [393, 852],
] as const) {
  test(`mobile result hides inline feedback while preserving follow-up actions at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-request-id": feedbackRequestId },
        body: JSON.stringify(fakeDelivery),
      });
    });
    await page.goto("/");
    await selectImage(page);
    await page.getByRole("button", { name: "開始 AI 分析" }).click();
    await expect(page.getByText("高風險", { exact: true })).toBeVisible();
    await expect(page.locator(".result-feedback")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "分析另一張圖片" }),
    ).toBeVisible();
    await expect(page.locator("#site-feedback")).toHaveCount(1);
    await expect(
      page.locator("#site-feedback summary", { hasText: "意見回饋" }),
    ).toHaveCount(1);
  });
}

test("desktop result offers safe feedback, copyable Request ID and no preview upload", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let requests = 0;
  await page.route("**/analyze", async (route) => {
    requests++;
    expect(route.request().postData()).not.toContain(
      PUBLIC_PRIVACY_CONTACT_EMAIL,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "x-request-id": feedbackRequestId },
      body: JSON.stringify(fakeDelivery),
    });
  });
  await page.goto("/");
  await selectImage(page);
  expect(requests).toBe(0);
  const button = page.getByRole("button", { name: "開始 AI 分析" });
  await button.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByText("高風險", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "有幫助", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "沒有幫助", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await expect(
    page.getByText(feedbackRequestId, { exact: true }),
  ).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "複製問題編號" }).click();
  await expect(page.getByText("已複製問題編號", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    feedbackRequestId,
  );
  await page.getByRole("button", { name: "沒有幫助", exact: true }).click();
  const summary = page.locator("summary", { hasText: "回報判斷問題" });
  await expect(summary).toBeVisible();
  const form = page.getByRole("link", { name: "開啟 Google 表單（新分頁）" });
  await expect(form).toBeVisible();
  const url = new URL((await form.getAttribute("href"))!);
  expect(url.searchParams.get("entry.101")).toBe(feedbackRequestId);
  expect(url.searchParams.get("entry.102")).toBe("test-beta+09/29");
  expect(url.searchParams.get("entry.103")).toBe("判斷可能有誤");
  expect(url.href).not.toMatch(/base64|remote-test\.png|screenshot|riskScore/);
  expect(url.href).not.toContain(PUBLIC_PRIVACY_CONTACT_EMAIL);
  await expect(
    page.getByRole("link", { name: "隱私聯絡與刪除申請" }).first(),
  ).toHaveAttribute("href", "/privacy#contact");
  await expect(
    page.getByRole("link", { name: PUBLIC_PRIVACY_CONTACT_EMAIL }).first(),
  ).toHaveAttribute("href", PRIVACY_CONTACT_MAILTO);
  await expect(form).toHaveAttribute("rel", "noopener noreferrer");
  await expect(form).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(
    page.getByText(/本工具提供詐騙風險提示，可能誤判/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "使用 Email 聯絡" }),
  ).toHaveAttribute("href", /mailto:beta%40example.com\?subject=/);
  await page.getByRole("button", { name: "複製Email" }).click();
  await expect(page.getByText("已複製Email", { exact: true })).toBeVisible();
  // Prove the explicit link opens, while fulfilling locally instead of contacting Google.
  await context.route("https://docs.google.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Offline feedback fixture</title><p>Local interception only</p>",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await form.focus();
  await page.keyboard.press("Enter");
  const popup = await popupPromise;
  await expect(popup).toHaveTitle("Offline feedback fixture");
  await popup.close();
});

for (const [code, status, message] of [
  ["client_rate_limited", 429, "操作較頻繁，請稍後再試。"],
  ["device_quota_exceeded", 429, "今日免費分析次數已使用完畢，請明日再試。"],
  ["ip_safety_limit_exceeded", 429, "目前網路的今日請求量已達安全上限。"],
  [
    "daily_quota_exceeded",
    429,
    "目前網路的今日分析額度已用完，將於台北時間 00:00 重置。",
  ],
  ["global_quota_exceeded", 429, "今日測試額度已用完，請明天再來。"],
  ["analysis_busy", 429, "目前分析人數較多，請稍後再試。"],
  ["service_busy", 503, "目前分析需求較多，請稍後再試。"],
  [
    "provider_temporarily_unavailable",
    503,
    "分析服務暫時無法使用，請稍後再試。",
  ],
  ["analysis_disabled", 503, "分析功能暫時停止，其他功能與意見回饋仍可使用。"],
  ["rate_limit_unavailable", 503, "額度服務暫時無法使用，請稍後再試。"],
  ["provider_rate_limit", 429, "AI 供應商目前請求較多，請稍後再試。"],
] as const) {
  test(`${code} keeps feedback and Demo available without automatic retry`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/analyze", async (route) => {
      requests++;
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: { "x-request-id": feedbackRequestId, "retry-after": "61" },
        body: JSON.stringify({ error: { code, message, retryable: true } }),
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await selectImage(page);
    await page.getByRole("button", { name: "開始 AI 分析" }).click();
    await expect(page.locator(".analysis-error")).toContainText(message);
    await expect(page.locator(".analysis-error")).toContainText(
      "建議至少等待 61 秒後再試。",
    );
    await expect(
      page.getByRole("button", { name: "複製問題編號" }),
    ).toBeVisible();
    await page.locator("summary", { hasText: "回報問題" }).click();
    const form = page.getByRole("link", { name: "開啟 Google 表單（新分頁）" });
    await expect(form).toBeVisible();
    const url = new URL((await form.getAttribute("href"))!);
    expect(url.searchParams.get("entry.101")).toBe(feedbackRequestId);
    expect(url.searchParams.get("entry.103")).toBe("操作問題");
    const contact = page
      .locator(".analysis-error")
      .getByRole("link", { name: "隱私聯絡與刪除申請" });
    await expect(contact).toHaveAttribute("href", "/privacy#contact");
    await expect(
      page
        .locator(".analysis-error")
        .getByRole("link", { name: PUBLIC_PRIVACY_CONTACT_EMAIL }),
    ).toHaveAttribute("href", PRIVACY_CONTACT_MAILTO);
    if (code === "daily_quota_exceeded") {
      await page.screenshot({
        path: "test-results/beta-mobile.png",
        fullPage: true,
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(requests).toBe(1);
    await page.goto("/demo");
    await expect(
      page.getByRole("button", { name: "顯示 Demo 結果" }),
    ).toBeVisible();
    await selectImage(page);
    await page.getByRole("button", { name: "顯示 Demo 結果" }).click();
    await expect(
      page.getByText("本結果為示範資料，並未分析你選擇的圖片。"),
    ).toBeVisible();
    expect(requests).toBe(1);
  });
}
