import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { fakeDelivery } from "../../fixtures/demo";
import { collectBrowserErrors } from "../helpers/browser";

let browserErrors: string[];
test.beforeEach(async ({ page }) => {
  browserErrors = collectBrowserErrors(page);
});
test.afterEach(async () => {
  const unexpected = browserErrors.filter(
    (message) =>
      !message.includes("status of 503") && !message.includes("status of 422"),
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
