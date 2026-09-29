import { describe, expect, it } from "vitest";
import {
  buildFeedbackMailto,
  buildFeedbackUrl,
  validContactEmail,
  validFormUrl,
  validRequestId,
} from "../../lib/feedback";
import { getPublicSiteConfig } from "../../lib/server/public-config";

const requestId = "dbbbdbbb-1234-4321-8123-dbbbbbbbbbbb";
const formUrl =
  "https://docs.google.com/forms/d/e/test-form/viewform?usp=sharing&existing=a%26b";
const config = {
  formUrl,
  requestIdEntry: "entry.101",
  buildEntry: "entry.102",
  typeEntry: "entry.103",
  buildId: "beta+09/29",
  contactEmail: "support+beta@example.com",
};

describe("feedback allowlist and configuration", () => {
  it("has no placeholder links when form and Email are absent", () => {
    const absent = getPublicSiteConfig({});
    expect(buildFeedbackUrl(absent)).toBeUndefined();
    expect(buildFeedbackMailto(absent.contactEmail)).toBeUndefined();
  });

  it("encodes only Request ID, build and type and preserves the existing query", () => {
    const href = buildFeedbackUrl(
      {
        ...config,
        image: "secret-image",
        analysis: "private-text",
        ip: "192.0.2.10",
        secret: "private-token",
      } as typeof config,
      requestId,
      "判斷可能有誤",
    )!;
    const url = new URL(href);
    expect(url.searchParams.get("entry.101")).toBe(requestId);
    expect(url.searchParams.get("entry.102")).toBe("beta+09/29");
    expect(url.searchParams.get("entry.103")).toBe("判斷可能有誤");
    expect(url.searchParams.get("existing")).toBe("a&b");
    expect(url.searchParams.get("usp")).toBe("sharing");
    expect(href).toContain("beta%2B09%2F29");
    expect(href).not.toMatch(
      /secret-image|private-text|192\.0\.2\.10|private-token/,
    );
  });

  it("opens the general form without missing or guessed entry IDs", () => {
    expect(buildFeedbackUrl({ formUrl }, requestId)).toBe(formUrl);
    expect(
      buildFeedbackUrl(
        {
          ...config,
          requestIdEntry: "123",
          buildEntry: undefined,
          typeEntry: undefined,
        },
        requestId,
      ),
    ).toBe(formUrl);
  });

  it("keeps a short Forms link intact without guessing its prefill structure", () => {
    expect(
      buildFeedbackUrl(
        { ...config, formUrl: "https://forms.gle/testshort?usp=sharing" },
        requestId,
      ),
    ).toBe("https://forms.gle/testshort?usp=sharing");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "http://docs.google.com/forms/d/test/viewform",
    "https://docs.google.com.evil.test/forms/d/test/viewform",
    "https://evil.test/forms/d/test/viewform",
    "https://docs.google.com@evil.test/forms/d/test/viewform",
    "https://user:password@docs.google.com/forms/d/test/viewform",
    "https://docs.google.com/forms/d/test/formResponse",
    "https://docs.google.com/forms/d/test/edit",
    "https://forms.gle/test/extra",
    "https://docs.google.com:8443/forms/d/test/viewform",
    "https://forms.gle/test#fragment",
    "https://forms.gle/test\n",
  ])("rejects an unexpected form destination %s", (value) => {
    expect(validFormUrl(value)).toBeUndefined();
  });

  it("supports Google responder paths including the account selector", () => {
    expect(
      validFormUrl("https://docs.google.com/forms/u/0/d/test/viewform"),
    ).toBeDefined();
  });

  it("clears stale mapped prefill values when no valid Request ID exists", () => {
    const result = buildFeedbackUrl(
      { ...config, formUrl: `${formUrl}&entry.101=old-id` },
      "192.0.2.1",
    )!;
    expect(new URL(result).searchParams.has("entry.101")).toBe(false);
    expect(validRequestId("token-value")).toBeUndefined();
  });

  it("builds a single Email subject without body or sensitive data", () => {
    const mailto = buildFeedbackMailto(config.contactEmail, requestId)!;
    expect(mailto).toContain("mailto:support%2Bbeta%40example.com?subject=");
    const url = new URL(mailto);
    expect(url.searchParams.get("subject")).toBe(
      `ScamShield AI 意見回饋 [${requestId}]`,
    );
    expect([...url.searchParams.keys()]).toEqual(["subject"]);
    expect(
      buildFeedbackMailto(config.contactEmail, "\r\nBcc:evil@example.com"),
    ).not.toContain("Bcc");
  });

  it.each([
    "a@example.com\r\nBcc:evil@example.com",
    "a%0d%0a@example.com",
    "a@example.com,b@example.com",
    "Name <a@example.com>",
    "a@example.com?subject=bad",
    "a..b@example.com",
    ".a@example.com",
    "a.@example.com",
  ])("rejects invalid Email configuration %s", (email) => {
    expect(validContactEmail(email)).toBeUndefined();
    expect(buildFeedbackMailto(email)).toBeUndefined();
  });

  it("exposes only public fields and safe development diagnostics", () => {
    const env = {
      NODE_ENV: "development",
      FEEDBACK_FORM_URL: "https://evil.test/token",
      FEEDBACK_CONTACT_EMAIL: config.contactEmail,
      APP_BUILD_ID: "beta+09/29",
      FEEDBACK_FORM_ENTRY_REQUEST_ID: "entry.101",
      AI_API_KEY: "secret-provider",
      IP_HMAC_SECRET: "secret-hmac",
      UPSTASH_REDIS_REST_TOKEN: "secret-redis",
    };
    const output = getPublicSiteConfig(env);
    expect(output.contactEmail).toBe(config.contactEmail);
    expect(output.formUrl).toBeUndefined();
    expect(output.configurationIssues).toEqual(["FEEDBACK_FORM_URL"]);
    expect(JSON.stringify(output)).not.toMatch(
      /secret-provider|secret-hmac|secret-redis|evil\.test/,
    );
    expect(
      getPublicSiteConfig({ ...env, NODE_ENV: "production" })
        .configurationIssues,
    ).toBeUndefined();
  });

  it("fails back to a general form for duplicate configured fields", () => {
    const output = getPublicSiteConfig({
      FEEDBACK_FORM_URL: formUrl,
      FEEDBACK_FORM_ENTRY_REQUEST_ID: "entry.1",
      FEEDBACK_FORM_ENTRY_BUILD: "entry.1",
    });
    expect(output.requestIdEntry).toBeUndefined();
    expect(output.buildEntry).toBeUndefined();
    expect(buildFeedbackUrl(output, requestId)).toBe(formUrl);
  });

  it("uses a safe deployment identifier fallback and omits unknown versions", () => {
    expect(
      getPublicSiteConfig({ VERCEL_GIT_COMMIT_SHA: "abc123" }).buildId,
    ).toBe("abc123");
    expect(
      getPublicSiteConfig({ APP_BUILD_ID: "line\nbreak" }).buildId,
    ).toBeUndefined();
    expect(getPublicSiteConfig({}).buildId).toBeUndefined();
  });
});
