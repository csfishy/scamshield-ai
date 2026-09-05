import { describe, expect, it, vi } from "vitest";
import {
  createOpenAIProvider,
  outputJsonSchema,
} from "../../lib/server/ai/providers/openai";
import {
  MODEL,
  PROMPT_VERSION,
  MAX_OUTPUT_TOKENS,
  type ServerConfig,
} from "../../lib/server/config";
import { normal } from "../../fixtures/demo";
const providerAnalysis = {
  riskScore: normal.riskScore,
  category: normal.category,
  summary: normal.summary,
  signals: normal.signals,
  recommendations: normal.recommendations,
};
const config: ServerConfig = {
  mode: "remote",
  provider: "openai",
  model: MODEL,
  apiKey: "unit-test-key",
  apiTimeoutMs: 20000,
  providerTimeoutMs: 15000,
  promptVersion: PROMPT_VERSION,
};
const context = () => ({
  requestId: crypto.randomUUID(),
  source: "image" as const,
  language: "zh-TW",
  deadline: Date.now() + 20000,
  signal: new AbortController().signal,
  promptVersion: PROMPT_VERSION,
});
const image = {
  bytes: Buffer.from("already-validated-test-image"),
  mimeType: "image/png" as const,
  width: 10,
  height: 10,
  sizeBytes: 28,
};
function result(text: string, status = "completed", refusal = false) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    status,
    model: MODEL,
    output: [
      {
        id: "msg_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          refusal
            ? { type: "refusal", refusal: "PRIVATE" }
            : { type: "output_text", text, annotations: [] },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}
describe("real SDK adapter via fake HTTP transport (no paid requests)", () => {
  it("extracts a valid analyzed outcome from the SDK response wrapper", async () => {
    let body: Record<string, unknown> = {};
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json(
        result(
          JSON.stringify({
            outcome: { status: "analyzed", ...providerAnalysis },
          }),
        ),
      );
    });
    const response = await createOpenAIProvider(config, transport).analyze(
      image,
      context(),
    );
    expect(response.outcome).toMatchObject({
      status: "analyzed",
      riskScore: 8,
    });
    expect(body).toMatchObject({
      model: MODEL,
      store: false,
      tools: [],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "scam_analysis_v1",
          strict: true,
          schema: outputJsonSchema,
        },
      },
    });
    expect(JSON.stringify(body)).toContain("data:image/png;base64,");
    expect(JSON.stringify(body)).toContain("untrusted evidence");
    expect(transport).toHaveBeenCalledOnce();
    expect(String(transport.mock.calls[0][0])).toBe(
      "https://api.openai.com/v1/responses",
    );
  });
  it("extracts a valid insufficient-evidence outcome", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        result(
          JSON.stringify({
            outcome: {
              status: "insufficient_evidence",
              reason: "missing_context",
            },
          }),
        ),
      ),
    );
    await expect(
      createOpenAIProvider(config, transport).analyze(image, context()),
    ).resolves.toMatchObject({
      outcome: {
        status: "insufficient_evidence",
        reason: "missing_context",
      },
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each([429, 500, 503, 401, 403, 404, 400])(
    "status %s mapped and never retried",
    async (status) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { message: "SECRET", type: "server_error" } },
          { status, headers: { "retry-after": "20" } },
        ),
      );
      await expect(
        createOpenAIProvider(config, transport).analyze(image, context()),
      ).rejects.toMatchObject({
        code: status === 429 ? "provider_rate_limit" : "provider_unavailable",
      });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("network errors not retried", async () => {
    const transport = vi.fn<typeof fetch>(async () => {
      throw new TypeError("SECRET network");
    });
    await expect(
      createOpenAIProvider(config, transport).analyze(image, context()),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("explicit refusal goes to insufficient evidence", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(result("", "completed", true)),
    );
    expect(
      (await createOpenAIProvider(config, transport).analyze(image, context()))
        .outcome,
    ).toEqual({ status: "insufficient_evidence", reason: "refusal" });
  });
  it.each(["not json", "{}", '{"outcome":{},"secret":1}'])(
    "rejects malformed output %s",
    async (text) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(result(text)),
      );
      await expect(
        createOpenAIProvider(config, transport).analyze(image, context()),
      ).rejects.toMatchObject({ code: "analysis_failed" });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("incomplete output fails, pre-cancelled request costs zero calls", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(result("{}", "incomplete")),
    );
    await expect(
      createOpenAIProvider(config, transport).analyze(image, context()),
    ).rejects.toMatchObject({ code: "analysis_failed" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      createOpenAIProvider(config, transport).analyze(image, {
        ...context(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(transport).toHaveBeenCalledOnce();
  });
});
