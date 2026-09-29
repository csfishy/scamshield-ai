import { readFile } from "node:fs/promises";
import path from "node:path";
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
import {
  CATEGORIES,
  RISK_LEVELS,
  SIGNAL_TYPES,
} from "../../lib/contracts/analysis";
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
const expectedTextTailPattern = "^[\\s\\S]*[^,，}\\]]$";
function result(
  text: string,
  status = "completed",
  refusal = false,
  options: { reason?: unknown; usage?: boolean } = {},
) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    status,
    incomplete_details:
      options.reason === undefined ? null : { reason: options.reason },
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
    ...(options.usage === false
      ? {}
      : {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        }),
  };
}
describe("real SDK adapter via fake HTTP transport (no paid requests)", () => {
  it("keeps the strict public outcome shape and gives each text field specific guidance", () => {
    const envelope = outputJsonSchema.properties.outcome as {
      anyOf: Array<{
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
      }>;
    };
    const analyzed = envelope.anyOf[0];
    const fields = analyzed.properties;
    const summary = fields.summary as Record<string, unknown>;
    const signals = fields.signals as {
      items: { properties: Record<string, unknown> };
    };
    const reason = signals.items.properties.reason as Record<string, unknown>;
    const recommendations = fields.recommendations as {
      items: Record<string, unknown>;
    };
    const recommendation = recommendations.items;
    for (const field of [summary, reason, recommendation]) {
      expect(field).toMatchObject({
        type: "string",
        minLength: 1,
        maxLength: 300,
        pattern: expectedTextTailPattern,
      });
      expect(field.description).toEqual(expect.any(String));
    }
    expect(summary.description).toMatch(
      /natural-language.*JSON serialization/u,
    );
    expect(reason.description).toMatch(
      /visible evidence.*JSON object or array/u,
    );
    expect(recommendation.description).toMatch(
      /Safe, actionable.*JSON serialization/u,
    );
    expect(
      new Set([
        summary.description,
        reason.description,
        recommendation.description,
      ]).size,
    ).toBe(3);
    expect(analyzed.required).toEqual(Object.keys(fields));
    expect(analyzed.additionalProperties).toBe(false);
    expect((fields.category as { enum: unknown }).enum).toEqual(CATEGORIES);
    expect((signals.items.properties.type as { enum: unknown }).enum).toEqual(
      SIGNAL_TYPES,
    );
    expect(
      (signals.items.properties.severity as { enum: unknown }).enum,
    ).toEqual(RISK_LEVELS);
    expect(JSON.stringify(outputJsonSchema)).not.toMatch(
      /debug|internal prompt|api.?key/iu,
    );
  });
  it("rejects known serialization tails while allowing natural-language punctuation", () => {
    const pattern = new RegExp(expectedTextTailPattern, "u");
    for (const text of [
      "可疑要求。}],",
      "可疑要求。]},",
      "可疑要求。},]",
      "可疑要求。}},",
      "可疑要求。]],",
      "可疑要求，",
      '{"ok":true}',
    ]) {
      expect(pattern.test(text), text).toBe(false);
    }
    for (const text of [
      "這是一則可疑訊息。",
      "請勿提供驗證碼。",
      "網址中包含 ] 符號，但仍需進一步確認。",
      "訊息中出現 } 符號，但不能單憑此判斷。",
      'JSON 範例是 {"ok":true}。',
      "陣列內容為 [1,2,3]。",
      '對方貼出 {"a":[1,2]}，請不要直接執行。',
    ]) {
      expect(pattern.test(text), text).toBe(true);
    }
  });
  it("instructs natural-language text without surrounding serialization debris", async () => {
    const prompt = await readFile(
      path.join(process.cwd(), "prompts", "scam-analysis-v1.md"),
      "utf8",
    );
    expect(prompt).toMatch(
      /summary, each signals\[\]\.reason, and each recommendations\[\] item/u,
    );
    expect(prompt).toMatch(/human-readable natural language/u);
    expect(prompt).toMatch(
      /never append surrounding JSON object or array delimiters, serialization commas/u,
    );
    expect(prompt).toMatch(/A single \} or \] can still appear/u);
  });
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
    const sentFormat = (body.text as { format: Record<string, unknown> })
      .format;
    expect(sentFormat.strict).toBe(true);
    const sentEnvelope = (
      (sentFormat.schema as typeof outputJsonSchema).properties.outcome as {
        anyOf: Array<{ properties: Record<string, unknown> }>;
      }
    ).anyOf[0];
    const sentFields = sentEnvelope.properties;
    const sentSignal = sentFields.signals as {
      items: { properties: Record<string, unknown> };
    };
    const sentRecommendations = sentFields.recommendations as {
      items: Record<string, unknown>;
    };
    expect((sentFields.summary as { pattern: string }).pattern).toBe(
      expectedTextTailPattern,
    );
    expect(
      (sentSignal.items.properties.reason as { pattern: string }).pattern,
    ).toBe(expectedTextTailPattern);
    expect(sentRecommendations.items.pattern).toBe(expectedTextTailPattern);
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
  it("classifies a non-completed refusal by response status", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        result("", "incomplete", true, { reason: "content_filter" }),
      ),
    );
    await expect(
      createOpenAIProvider(config, transport).analyze(image, context()),
    ).rejects.toMatchObject({
      schemaFailureStage: "response_incomplete",
      providerDiagnostics: {
        providerResponseStatus: "incomplete",
        providerIncompleteReason: "content_filter",
        providerOutputTextPresent: false,
        providerInputTokens: 100,
        providerOutputTokens: 50,
      },
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each([
    ["not json", "output_json_parse"],
    ["{}", "envelope"],
    ['{"outcome":{},"secret":1}', "envelope"],
    ["[]", "envelope"],
    ["", "response_incomplete"],
  ] as const)(
    "classifies schema output %s as %s without retry",
    async (text, stage) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(result(text)),
      );
      await expect(
        createOpenAIProvider(config, transport).analyze(image, context()),
      ).rejects.toMatchObject({
        code: "analysis_failed",
        kind: "schema",
        schemaFailureStage: stage,
        ...(stage === "response_incomplete"
          ? {
              providerDiagnostics: {
                providerResponseStatus: "completed",
                providerIncompleteReason: "none",
                providerOutputTextPresent: false,
                providerInputTokens: 100,
                providerOutputTokens: 50,
              },
            }
          : {
              providerDiagnostics: {
                providerInputTokens: 100,
                providerOutputTokens: 50,
              },
            }),
      });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("incomplete output fails, pre-cancelled request costs zero calls", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(result("{}", "incomplete")),
    );
    await expect(
      createOpenAIProvider(config, transport).analyze(image, context()),
    ).rejects.toMatchObject({
      code: "analysis_failed",
      kind: "schema",
      schemaFailureStage: "response_incomplete",
      providerDiagnostics: {
        providerResponseStatus: "incomplete",
        providerIncompleteReason: "none",
        providerOutputTextPresent: true,
        providerInputTokens: 100,
        providerOutputTokens: 50,
      },
    });
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
  it.each([
    ["max_output_tokens", "max_output_tokens"],
    ["content_filter", "content_filter"],
    ["max_messages", "max_messages"],
    ["steered", "steered"],
    ["PRIVATE_FUTURE_REASON", "other"],
  ] as const)(
    "allowlists incomplete reason %s as %s without retaining raw output",
    async (reason, expected) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(
          result("PRIVATE PARTIAL OUTPUT", "incomplete", false, { reason }),
        ),
      );
      let caught: unknown;
      try {
        await createOpenAIProvider(config, transport).analyze(image, context());
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code: "analysis_failed",
        kind: "schema",
        schemaFailureStage: "response_incomplete",
        providerDiagnostics: {
          providerResponseStatus: "incomplete",
          providerIncompleteReason: expected,
          providerOutputTextPresent: true,
          providerInputTokens: 100,
          providerOutputTokens: 50,
        },
      });
      expect(JSON.stringify(caught)).not.toMatch(
        /PRIVATE PARTIAL OUTPUT|PRIVATE_FUTURE_REASON/u,
      );
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("distinguishes completed-without-text and failed status", async () => {
    for (const [status, text, expected] of [
      ["completed", "", { status: "completed", present: false }],
      ["failed", "PRIVATE PARTIAL", { status: "failed", present: true }],
      ["future_status", "", { status: "other", present: false }],
    ] as const) {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(result(text, status)),
      );
      await expect(
        createOpenAIProvider(config, transport).analyze(image, context()),
      ).rejects.toMatchObject({
        schemaFailureStage: "response_incomplete",
        providerDiagnostics: {
          providerResponseStatus: expected.status,
          providerIncompleteReason: "none",
          providerOutputTextPresent: expected.present,
        },
      });
      expect(transport).toHaveBeenCalledOnce();
    }
  });
  it("leaves usage unknown when an incomplete response has no usage", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        result("", "incomplete", false, {
          reason: "max_output_tokens",
          usage: false,
        }),
      ),
    );
    let caught: unknown;
    try {
      await createOpenAIProvider(config, transport).analyze(image, context());
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      providerDiagnostics: {
        providerResponseStatus: "incomplete",
        providerIncompleteReason: "max_output_tokens",
        providerOutputTextPresent: false,
      },
    });
    expect(JSON.stringify(caught)).not.toMatch(
      /providerInputTokens|providerOutputTokens/u,
    );
  });
});
