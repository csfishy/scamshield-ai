import { describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_RETENTION_DAYS,
  FEEDBACK_RETENTION_POLICY,
  PRIVACY_CONTACT_MAILTO,
  PRIVACY_EMAIL_SUBJECT,
  PUBLIC_PRIVACY_CONTACT_EMAIL,
} from "../../lib/privacy";
import { getPublicSiteConfig } from "../../lib/server/public-config";
import { createOpenAIProvider } from "../../lib/server/ai/providers/openai";
import { MODEL, PROMPT_VERSION } from "../../lib/server/config";
import { getQuotaConfig } from "../../lib/server/quota-config";
import { createQuotaService } from "../../lib/server/quota";
import { RELEASE_SCRIPT } from "../../lib/server/quota-scripts";

describe("public privacy policy and transport isolation", () => {
  it("uses the approved 90-day feedback policy with consent for longer use", () => {
    expect(FEEDBACK_RETENTION_DAYS).toBe(90);
    expect(FEEDBACK_RETENTION_POLICY).toContain("最長保存 90 天");
    expect(FEEDBACK_RETENTION_POLICY).toContain("刪除或去識別化");
    expect(FEEDBACK_RETENTION_POLICY).toContain("另行取得適當同意");
    expect(FEEDBACK_RETENTION_POLICY).not.toMatch(/TBD|待確認|待填/);
  });

  it("provides a public, fixed contact independently of optional feedback configuration", () => {
    expect(PUBLIC_PRIVACY_CONTACT_EMAIL).toBe("cs.sakana@gmail.com");
    expect(getPublicSiteConfig({}).contactEmail).toBeUndefined();
    expect(
      getPublicSiteConfig({ FEEDBACK_CONTACT_EMAIL: "optional@example.com" })
        .contactEmail,
    ).toBe("optional@example.com");
    // Importing the public policy needs neither an environment value nor server-only.
    expect(PRIVACY_CONTACT_MAILTO).toBeTruthy();
  });

  it("encodes one mailto subject without a body, headers or private metadata", () => {
    const url = new URL(PRIVACY_CONTACT_MAILTO);
    expect(url.protocol).toBe("mailto:");
    expect(decodeURIComponent(url.pathname)).toBe(PUBLIC_PRIVACY_CONTACT_EMAIL);
    expect(PRIVACY_EMAIL_SUBJECT).toBe("ScamShield Privacy / Data Request");
    expect(url.searchParams.get("subject")).toBe(PRIVACY_EMAIL_SUBJECT);
    expect([...url.searchParams.keys()]).toEqual(["subject"]);
    expect(decodeURIComponent(PRIVACY_CONTACT_MAILTO)).not.toMatch(
      /[\r\n]|bcc=|cc=|body=|base64|requestId|token|ip=/i,
    );
  });

  it("does not add the public contact to an actual SDK payload (fake HTTP only)", async () => {
    let body: Record<string, unknown> = {};
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        id: "resp_privacy_unit",
        object: "response",
        created_at: 0,
        model: MODEL,
        status: "completed",
        output: [
          {
            id: "msg_privacy_unit",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                annotations: [],
                text: JSON.stringify({
                  outcome: {
                    status: "insufficient_evidence",
                    reason: "missing_context",
                  },
                }),
              },
            ],
          },
        ],
      });
    });
    await createOpenAIProvider(
      {
        mode: "remote",
        provider: "openai",
        model: MODEL,
        apiKey: "unit-test-key-not-real",
        apiTimeoutMs: 20000,
        providerTimeoutMs: 15000,
        promptVersion: PROMPT_VERSION,
      },
      transport,
    ).analyze(
      {
        bytes: Buffer.from("synthetic-validated-test-image"),
        mimeType: "image/png",
        width: 10,
        height: 10,
        sizeBytes: 30,
      },
      {
        requestId: crypto.randomUUID(),
        source: "image",
        language: "zh-TW",
        deadline: Date.now() + 20000,
        signal: new AbortController().signal,
        promptVersion: PROMPT_VERSION,
      },
    );
    expect(transport).toHaveBeenCalledOnce();
    expect(body.store).toBe(false);
    expect(JSON.stringify(body)).not.toContain(PUBLIC_PRIVACY_CONTACT_EMAIL);
    expect(JSON.stringify(body)).not.toContain(PRIVACY_EMAIL_SUBJECT);
  });

  it("does not add contact Email or raw IP to Redis command payloads (fake HTTP only)", async () => {
    const commands: unknown[] = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const command = JSON.parse(String(init?.body));
      commands.push(command);
      return Response.json({
        result: command[1] === RELEASE_SCRIPT ? 1 : ["ok", 0],
      });
    });
    const service = createQuotaService(
      getQuotaConfig({
        ANALYSIS_ENABLED: "true",
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        QUOTA_ENVIRONMENT: "preview",
        QUOTA_NAMESPACE: "privacy-unit",
        QUOTA_TRUST_PROXY: "vercel",
        UPSTASH_REDIS_REST_URL: "https://unit-test.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "unit-test-token-not-real",
        QUOTA_IP_HMAC_SECRET: "unit-test-only-hmac-key-with-32-bytes-minimum",
        FEEDBACK_CONTACT_EMAIL: PUBLIC_PRIVACY_CONTACT_EMAIL,
      }),
      { fetch: transport },
    );
    const signal = new AbortController().signal;
    const attempt = await service.preflight(
      new Request("http://localhost/analyze", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "192.0.2.7" },
      }),
      crypto.randomUUID(),
      signal,
    );
    const lease = await attempt.acquire(signal);
    await attempt.assertEnabled(lease, signal);
    await lease.release();
    expect(commands).toHaveLength(4);
    expect(JSON.stringify(commands)).not.toContain(
      PUBLIC_PRIVACY_CONTACT_EMAIL,
    );
    expect(JSON.stringify(commands)).not.toContain("192.0.2.7");
  });
});
