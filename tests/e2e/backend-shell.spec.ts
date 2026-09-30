import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("production UI shell and actual /analyze boundary", async ({
  page,
  request,
}) => {
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
  await expect(page.locator("#site-feedback summary")).toBeVisible();
  const method = await request.get("/analyze");
  expect(method.status()).toBe(405);
  expect(method.headers()["allow"]).toBe("POST");
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const response = await request.post("/analyze", {
    multipart: {
      image: { name: "safe.png", mimeType: "image/png", buffer: image },
      source: "screenshot",
      language: "zh-TW",
    },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toMatchObject({
    error: { code: "provider_unavailable", retryable: true },
  });
  expect(await page.content()).not.toMatch(
    /AI_API_KEY|scam-analysis-v1|api.openai.com/,
  );
});
