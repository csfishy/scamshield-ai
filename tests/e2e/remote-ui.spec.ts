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

test("real result offers safe feedback, copyable Request ID and no preview upload", async ({
  page,
  context,
}) => {
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
  const summary = page.locator("summary", { hasText: "回報判斷問題" });
  await summary.focus();
  await page.keyboard.press("Enter");
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
    await page.getByRole("link", { name: "本機 Demo", exact: true }).click();
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
