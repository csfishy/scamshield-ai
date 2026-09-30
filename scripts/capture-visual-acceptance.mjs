import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3199";
const output = resolve("test-results/visual-acceptance");
const inputImage = resolve(
  "tests/evaluation/candidates/images/high-risk-delivery-fee.png",
);
const result = {
  riskScore: 88,
  riskLevel: "high",
  category: "fake_customer_service",
  summary: "疑似假物流通知，要求透過可疑連結補繳費用",
  signals: [
    {
      type: "payment_request",
      severity: "high",
      reason: "訊息以包裹滯留為由要求立即補繳費用",
    },
    {
      type: "suspicious_link",
      severity: "high",
      reason: "訊息要求在非原購物平台連結輸入付款資料",
    },
  ],
  recommendations: [
    "不要在訊息連結中提供金融資訊",
    "自行從物流官方網站或原購物平台確認配送狀態",
  ],
};

await mkdir(output, { recursive: true });
let browser = await chromium.launch();
const aboveFold = [];
const platformChecks = [];
const feedbackChecks = [];

async function newPage(width, height) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  await page.route(/\/analyze(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers: { "x-request-id": "dbbbdbbb-1234-4321-8123-dbbbbbbbbbbb" },
      body: JSON.stringify(result),
    }),
  );
  await page.goto(baseURL, { waitUntil: "networkidle" });
  return page;
}

async function capture(name, width, height, state = "idle") {
  const page = await newPage(width, height);
  if (state !== "idle") {
    await page.locator('input[type="file"]').setInputFiles(inputImage);
    await page.locator(".analyze-button:not([disabled])").waitFor();
  }
  if (state === "result") {
    await page.getByRole("button", { name: "開始 AI 分析" }).click();
    await page.locator(".risk-card, .analysis-error").first().waitFor();
    if (await page.locator(".analysis-error").isVisible()) {
      throw new Error(
        `Visual result failed: ${await page.locator(".analysis-error").innerText()}`,
      );
    }
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: resolve(output, name), fullPage: false });
  await page.close();
}

async function measureAboveFold(width, height, engine = "chromium") {
  const page = await newPage(width, height);
  const [heroBox, selectBox, analyzeBox, uploadBox, resultBox] =
    await Promise.all([
      page.locator(".intro").boundingBox(),
      page.getByText("選擇截圖", { exact: true }).boundingBox(),
      page.getByRole("button", { name: "開始 AI 分析" }).boundingBox(),
      page.locator(".upload-panel").boundingBox(),
      page.locator(".result-panel").boundingBox(),
    ]);
  aboveFold.push({
    engine,
    viewport: `${width}x${height}`,
    heroBottom: Math.round((heroBox?.y ?? 0) + (heroBox?.height ?? 0)),
    selectBottom: Math.round((selectBox?.y ?? 0) + (selectBox?.height ?? 0)),
    analyzeBottom: Math.round((analyzeBox?.y ?? 0) + (analyzeBox?.height ?? 0)),
    uploadCardBottom: Math.round(
      (uploadBox?.y ?? 0) + (uploadBox?.height ?? 0),
    ),
    resultCardTop: Math.round(resultBox?.y ?? 0),
    viewportHeight: height,
    scrollY: await page.evaluate(() => window.scrollY),
    noHorizontalOverflow: await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  });
  await page.close();
}

async function measureFeedback(width, height, engine = "chromium") {
  const page = await newPage(width, height);
  await page.locator('input[type="file"]').setInputFiles(inputImage);
  await page.getByRole("button", { name: "開始 AI 分析" }).click();
  await page.locator(".risk-card").waitFor();
  await page.waitForTimeout(700);
  feedbackChecks.push({
    engine,
    viewport: `${width}x${height}`,
    inlineFeedbackVisible: await page.locator(".result-feedback").isVisible(),
    analyzeAnotherVisible: await page
      .getByRole("button", { name: "分析另一張圖片" })
      .isVisible(),
    homepageFeedbackPresent:
      (await page.locator("#site-feedback").count()) === 1,
  });
  await page.close();
}

try {
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [393, 852],
    [430, 932],
  ]) {
    await measureAboveFold(width, height);
  }
  await measureFeedback(390, 844);
  await measureFeedback(393, 852);
  await measureFeedback(1440, 900);
  await capture("desktop-idle-1440x900.png", 1440, 900);
  await capture("desktop-result-1440x900.png", 1440, 900, "result");
  await capture("mobile-idle-375x667.png", 375, 667);
  await capture("mobile-idle-390x844.png", 390, 844);
  await capture("mobile-selected-390x844.png", 390, 844, "selected");
  await capture("mobile-idle-393x852.png", 393, 852);
  await capture("mobile-idle-430x932.png", 430, 932);
  await capture("mobile-result-393x852.png", 393, 852, "result");

  const standaloneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const standalonePage = await standaloneContext.newPage();
  await standalonePage.goto(baseURL, { waitUntil: "networkidle" });
  const manifest = await standalonePage.evaluate(async () =>
    fetch("/manifest.webmanifest").then((response) => response.json()),
  );
  platformChecks.push({
    mode: "pwa-contract",
    manifestDisplay: manifest.display,
    viewportFitCover: await standalonePage.evaluate(() =>
      document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute("content")
        ?.includes("viewport-fit=cover"),
    ),
    safeAreaCssSupported: await standalonePage.evaluate(() =>
      CSS.supports("padding-top: env(safe-area-inset-top)"),
    ),
    selectVisible: await standalonePage
      .getByText("選擇截圖", { exact: true })
      .isVisible(),
    analyzeVisible: await standalonePage
      .getByRole("button", { name: "開始 AI 分析" })
      .isVisible(),
    noHorizontalOverflow: await standalonePage.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  });
  await standalonePage.screenshot({
    path: resolve(output, "mobile-pwa-contract-390x844.png"),
    fullPage: false,
  });
  await standaloneContext.close();
} finally {
  await browser.close();
}

browser = await webkit.launch();
try {
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [393, 852],
    [430, 932],
  ]) {
    await measureAboveFold(width, height, "webkit");
  }
  await measureFeedback(390, 844, "webkit");
  await measureFeedback(393, 852, "webkit");
  await capture("mobile-webkit-idle-390x844.png", 390, 844);
  await capture("mobile-webkit-result-393x852.png", 393, 852, "result");
  platformChecks.push({ mode: "webkit", loaded: true });
} finally {
  await browser.close();
}

console.log(JSON.stringify(aboveFold, null, 2));
console.log(JSON.stringify(feedbackChecks, null, 2));
console.log(JSON.stringify(platformChecks, null, 2));
console.log(output);
