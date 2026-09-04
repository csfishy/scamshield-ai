import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("production minimal shell and actual /analyze boundary", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ScamShield AI" }),
  ).toBeVisible();
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
