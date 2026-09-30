import { describe, expect, it, vi } from "vitest";
import { createAnalyzeHandler } from "../../lib/server/analyze";
import {
  getConfig,
  MODEL,
  PROMPT_VERSION,
  type ServerConfig,
} from "../../lib/server/config";
import { normalizeOutcome } from "../../lib/server/ai/normalize";
import { providerOutcomeSchema } from "../../lib/server/ai/provider";
import { analysisSchema } from "../../lib/contracts/analysis";
import { AppError, schemaFailure } from "../../lib/server/errors";
import { emitTelemetry, type AnalysisEvent } from "../../lib/server/telemetry";
import { normal } from "../../fixtures/demo";
import { png, request } from "../helpers/images";
import type { AnalysisContext } from "../../lib/server/ai/provider";
import { allowedQuota } from "../helpers/quota";
export const config: ServerConfig = {
  mode: "remote",
  provider: "openai",
  model: MODEL,
  apiKey: "test-placeholder",
  providerTimeoutMs: 15000,
  apiTimeoutMs: 20000,
  promptVersion: PROMPT_VERSION,
};
const outcome = {
  status: "analyzed",
  riskScore: normal.riskScore,
  category: normal.category,
  summary: normal.summary,
  signals: normal.signals,
  recommendations: normal.recommendations,
};
function expectSchemaFailure(raw: unknown, stage?: string, field?: string) {
  try {
    normalizeOutcome(raw);
    throw new Error("Expected structural debris to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "analysis_failed", kind: "schema" });
    if (stage) expect(error).toMatchObject({ schemaFailureStage: stage });
    if (field) expect(error).toMatchObject({ schemaFailureField: field });
  }
}
describe("normalization and errors", () => {
  it("accepts analyzed output, trims text, and matches the shared contract", () => {
    expect(
      analysisSchema.parse(
        normalizeOutcome({ ...outcome, summary: "  清楚  " }),
      ),
    ).toMatchObject({ summary: "清楚", riskLevel: "low" });
    expect(normalizeOutcome({ ...outcome, category: "unknown" }).category).toBe(
      "unknown",
    );
  });
  it.each(["}],", "]},", "},]"])(
    "normalizes a high-confidence structural tail in a summary: %s",
    (tail) => {
      expect(
        normalizeOutcome({ ...outcome, summary: `這是一則可疑訊息。${tail}` })
          .summary,
      ).toBe("這是一則可疑訊息。");
    },
  );
  it.each(["]],", "}},", "}],  "])(
    "normalizes other allowlisted tails after trim: %s",
    (tail) => {
      expect(
        normalizeOutcome({ ...outcome, summary: `這是一則可疑訊息。${tail}` })
          .summary,
      ).toBe("這是一則可疑訊息。");
    },
  );
  it("normalizes structural debris in a signal reason", () => {
    expect(
      normalizeOutcome({
        ...outcome,
        signals: [
          { type: "other", severity: "low", reason: "前一項正常。" },
          { type: "other", severity: "low", reason: "要求提供驗證碼。}]," },
        ],
      }).signals[1].reason,
    ).toBe("要求提供驗證碼。");
  });
  it("normalizes structural debris in a recommendation", () => {
    expect(
      normalizeOutcome({
        ...outcome,
        recommendations: ["請先確認。", "請勿點擊連結。}],"],
      }).recommendations[1],
    ).toBe("請勿點擊連結。");
  });
  it.each([
    "請勿提供驗證碼。",
    "網址中出現符號 ]，請確認完整網址。",
    "訊息文字包含 } 字元，但這本身不代表風險。",
    'JSON 範例為 {"ok":true}。',
    "陣列例子：[1,2,3]。",
    '對方傳來字串 {"a":[1,2]}，請不要直接執行。',
    "請勿提供驗證碼。   ",
    "括號 { } 出現在句中，請核對。",
    '這段文字討論 JSON：{"a":1}',
  ])("accepts legitimate text ending and embedded delimiters: %s", (text) => {
    expect(normalizeOutcome({ ...outcome, summary: text }).summary).toBe(
      text.trim(),
    );
  });
  it("classifies provider outcome and public contract failures", () => {
    expectSchemaFailure({ ...outcome, riskScore: "85" }, "provider_outcome");
    expectSchemaFailure(
      { ...outcome, riskScore: 85, category: "none" },
      "public_contract",
    );
  });
  it("accepts natural language, embedded delimiters, and normal JSON discussion", () => {
    const text = normalizeOutcome({
      ...outcome,
      summary: "  請確認官方客服。  ",
      signals: [
        { type: "other", severity: "low", reason: "網址中包含 ] 符號" },
        { type: "other", severity: "low", reason: "可能涉及帳號安全。" },
      ],
      recommendations: [
        '這段文字討論 JSON：{"a":1}',
        "內文使用 } 作為程式符號，請核對語境。",
      ],
    });
    expect(text).toMatchObject({
      riskScore: normal.riskScore,
      riskLevel: normal.riskLevel,
      category: normal.category,
      summary: "請確認官方客服。",
      signals: [
        { reason: "網址中包含 ] 符號" },
        { reason: "可能涉及帳號安全。" },
      ],
      recommendations: [
        '這段文字討論 JSON：{"a":1}',
        "內文使用 } 作為程式符號，請核對語境。",
      ],
    });
  });
  it("accepts valid insufficient-evidence variants and maps them safely", () => {
    for (const reason of [
      "unreadable",
      "irrelevant",
      "missing_context",
      "refusal",
    ])
      expect(() =>
        normalizeOutcome({ status: "insufficient_evidence", reason }),
      ).toThrow("insufficient_evidence");
  });
  it("strictly rejects extra fields, missing fields, and invalid enums", () => {
    expect(
      providerOutcomeSchema.safeParse({ ...outcome, riskLevel: "low" }).success,
    ).toBe(false);
    for (const changes of [
      { riskScore: "50" },
      { riskScore: 3.4 },
      { category: "NONE" },
      { riskScore: 70 },
      { summary: "x".repeat(301) },
      { summary: undefined },
      { signals: [{ type: "invalid", severity: "low", reason: "合成理由" }] },
      { recommendations: [] },
      { extra: 1 },
    ])
      expect(() => normalizeOutcome({ ...outcome, ...changes })).toThrow(
        "analysis_failed",
      );
  });
  it("config fail-closed with defaults and illegal values", () => {
    expect(getConfig({}).mode).toBe("mock");
    for (const env of [
      { ANALYSIS_MODE: "remote" },
      { ANALYSIS_MODE: "MOCK" },
      { AI_TIMEOUT_MS: "NaN" },
      { ANALYSIS_TIMEOUT_MS: "40000" },
      { AI_PROVIDER: "other" },
      { AI_MODEL: "latest" },
      { PROMPT_VERSION: "wrong" },
      { ANALYSIS_TIMEOUT_MS: "15000" },
    ])
      expect(() => getConfig(env)).toThrow("provider_unavailable");
    expect(
      getConfig({
        ANALYSIS_MODE: "remote",
        AI_PROVIDER: "openai",
        AI_MODEL: MODEL,
        AI_API_KEY: "not-a-real-key",
      }).mode,
    ).toBe("remote");
  });
});
describe("API validation, deadline, cancellation and single call", () => {
  it("invalid inputs and mock API never call Provider", async () => {
    const analyze = vi.fn(async () => ({ outcome }));
    const handler = createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({ analyze }),
      telemetry: () => {},
    });
    for (const req of [
      request(Buffer.alloc(0)),
      request(Buffer.from("broken")),
      request(await png(), [{ name: "extra", data: "x" }]),
    ])
      expect((await handler(req)).status).toBe(400);
    const mock = createAnalyzeHandler({
      quota: allowedQuota,
      config: () => ({ ...config, mode: "mock" }),
      provider: () => ({ analyze }),
      telemetry: () => {},
    });
    expect((await mock(request(await png()))).status).toBe(503);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("valid request calls once, clean headers and metadata only", async () => {
    const analyze = vi.fn(async () => ({ outcome })),
      telemetry = vi.fn();
    const handler = createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({ analyze }),
      telemetry,
    });
    const response = await handler(
      request(await png(), [], { filename: "PRIVATE-NAME.png" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(normal);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(analyze).toHaveBeenCalledOnce();
    expect(telemetry).toHaveBeenCalledOnce();
    expect(telemetry.mock.calls[0][0]).toMatchObject({
      textNormalizationApplied: false,
      textNormalizationCount: 0,
    });
    expect(JSON.stringify(telemetry.mock.calls)).not.toMatch(
      /PRIVATE-NAME|目前可讀|test-placeholder/,
    );
  });
  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])(
    "method %s",
    async (method) => {
      const handler = createAnalyzeHandler({ telemetry: () => {} });
      const response = await handler(
        new Request("http://localhost/analyze", { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      if (method === "HEAD") expect(await response.text()).toBe("");
    },
  );
  it.each([
    ["provider_rate_limit", 429],
    ["provider_unavailable", 503],
    ["analysis_failed", 500],
    ["insufficient_evidence", 422],
  ] as const)("maps %s without retry", async (code, status) => {
    const analyze = vi.fn(async () => {
      throw new AppError(code, "network", "30");
    });
    const response = await createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({ analyze }),
      telemetry: () => {},
    })(request(await png()));
    expect(response.status).toBe(status);
    expect(analyze).toHaveBeenCalledOnce();
    expect((await response.json()).error.code).toBe(code);
  });
  it("Provider timeout aborts even a non-cooperating adapter without retry", async () => {
    let context: AnalysisContext | undefined;
    const analyze = vi.fn((_image, ctx: AnalysisContext) => {
      context = ctx;
      return new Promise<never>(() => {});
    });
    const response = await createAnalyzeHandler({
      quota: allowedQuota,
      config: () => ({ ...config, providerTimeoutMs: 20 }),
      provider: () => ({ analyze }),
      telemetry: () => {},
    })(request(await png()));
    expect(response.status).toBe(503);
    expect(context?.signal.aborted).toBe(true);
    expect(analyze).toHaveBeenCalledOnce();
  });
  it("client cancellation propagated, and pre-aborted request calls zero times", async () => {
    const controller = new AbortController();
    let context: AnalysisContext | undefined;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const analyze = vi.fn((_image, ctx: AnalysisContext) => {
      context = ctx;
      started();
      return new Promise<never>(() => {});
    });
    const handler = createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({ analyze }),
      telemetry: () => {},
    });
    const pending = handler(
      request(await png(), [], { signal: controller.signal }),
    );
    await startedPromise;
    controller.abort();
    expect((await pending).status).toBe(503);
    expect(context?.signal.aborted).toBe(true);
    expect(
      (await handler(request(await png(), [], { signal: controller.signal })))
        .status,
    ).toBe(503);
    expect(analyze).toHaveBeenCalledOnce();
  });
  it("insufficient remaining budget and stalled body do not start Provider", async () => {
    const analyze = vi.fn(async () => ({ outcome }));
    let n = 0;
    const handler = createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({ analyze }),
      telemetry: () => {},
      now: () => (n++ < 2 ? 0 : 19000),
    });
    expect((await handler(request(await png()))).status).toBe(503);
    expect(analyze).not.toHaveBeenCalled();
    let cancelled = false;
    const body = new ReadableStream({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        cancelled = true;
      },
    });
    const slow = new Request("http://localhost/analyze", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=test" },
      body,
      duplex: "half",
    } as RequestInit);
    const response = await createAnalyzeHandler({
      quota: allowedQuota,
      config: () => ({ ...config, apiTimeoutMs: 20 }),
      provider: () => ({ analyze }),
      telemetry: () => {},
    })(slow);
    expect(response.status).toBe(503);
    expect(cancelled).toBe(true);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("privacy allowlist and untrusted exceptions never reach logs/body", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    emitTelemetry({
      requestId: crypto.randomUUID(),
      status: 500,
      durationMs: 1,
      ...{
        filename: "PRIVATE",
        prompt: "SECRET",
        raw: "RAW",
        ip: "192.0.2.123",
        ipHash: "PRIVATE-HMAC",
        redisToken: "SECRET-REDIS",
        feedbackEmail: "private@example.test",
        feedbackText: "PRIVATE-FEEDBACK",
      },
    });
    expect(log.mock.calls.flat().join()).not.toMatch(
      /PRIVATE|SECRET|RAW|192\.0\.2\.123|private@example/,
    );
    log.mockRestore();
    const response = await createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({
        analyze: async () => {
          throw new Error("SECRET provider raw request");
        },
      }),
      telemetry: () => {},
    })(request(await png()));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/SECRET|raw request/);
  });
  it("schema diagnostics are server-only, allowlisted, and cannot alter HTTP on logging failure", async () => {
    const telemetry = vi.fn((_event: AnalysisEvent) => {
      expect(_event.requestId).toMatch(/^[0-9a-f-]{36}$/u);
      throw new Error("logger unavailable");
    });
    const analyze = vi.fn(async () => ({
      outcome: { ...outcome, summary: "PRIVATE SUMMARY }]," },
      usage: { inputTokens: 123, outputTokens: 45 },
    }));
    const response = await createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({ analyze }),
      telemetry,
    })(request(await png()));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toMatch(/schemaFailure|PRIVATE SUMMARY/u);
    expect(analyze).toHaveBeenCalledOnce();
    expect(telemetry.mock.calls[0][0]).toMatchObject({
      failureKind: "schema",
      schemaFailureStage: "structural_debris",
      schemaFailureField: "summary",
      usageKnown: true,
      inputTokens: 123,
      outputTokens: 45,
    });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    emitTelemetry({
      requestId: crypto.randomUUID(),
      status: 500,
      failureKind: "schema",
      schemaFailureStage: "structural_debris",
      schemaFailureField: "summary",
      durationMs: 1,
      ...{
        output_text: "PRIVATE OUTPUT",
        rawOutput: "PRIVATE RAW OUTPUT",
        outputText: "PRIVATE OUTPUT TEXT",
        summary: "PRIVATE SUMMARY",
        signalReason: "PRIVATE SIGNAL",
        recommendation: "PRIVATE RECOMMENDATION",
        image: "PRIVATE IMAGE",
        imageBase64: "PRIVATE BASE64",
        prompt: "PRIVATE PROMPT",
        apiKey: "PRIVATE KEY",
      },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toContain(
      '"schemaFailureStage":"structural_debris"',
    );
    expect(log.mock.calls[0][0]).not.toContain("PRIVATE");
    log.mockClear();
    emitTelemetry({
      requestId: crypto.randomUUID(),
      status: 200,
      durationMs: 1,
      schemaFailureStage: "envelope",
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it.each([
    [true, 100, 50],
    [false, undefined, undefined],
  ] as const)(
    "keeps incomplete-response diagnostics server-only when usage is %s",
    async (hasUsage, inputTokens, outputTokens) => {
      const telemetry = vi.fn();
      const response = await createAnalyzeHandler({
        quota: allowedQuota,
        config: () => config,
        provider: () => ({
          analyze: async () => {
            throw schemaFailure("response_incomplete", undefined, {
              providerResponseStatus: "incomplete",
              providerIncompleteReason: "max_output_tokens",
              providerOutputTextPresent: true,
              ...(hasUsage
                ? {
                    providerInputTokens: 100,
                    providerOutputTokens: 50,
                  }
                : {}),
            });
          },
        }),
        telemetry,
      })(request(await png()));
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({
        error: {
          code: "analysis_failed",
          message: "目前無法產生有效分析，請換圖或稍後再試。",
          retryable: false,
        },
      });
      expect(body).not.toMatch(
        /providerResponse|providerIncomplete|providerOutput|schemaFailure|usage|token/u,
      );
      expect(telemetry).toHaveBeenCalledOnce();
      expect(telemetry.mock.calls[0][0]).toMatchObject({
        failureKind: "schema",
        schemaFailureStage: "response_incomplete",
        providerResponseStatus: "incomplete",
        providerIncompleteReason: "max_output_tokens",
        providerOutputTextPresent: true,
        usageKnown: hasUsage,
        ...(hasUsage ? { inputTokens, outputTokens } : {}),
      });
    },
  );
  it("preserves usage on Provider JSON parse failure", async () => {
    const telemetry = vi.fn();
    const response = await createAnalyzeHandler({
      quota: allowedQuota,
      config: () => config,
      provider: () => ({
        analyze: async () => {
          throw schemaFailure("output_json_parse", undefined, {
            providerInputTokens: 321,
            providerOutputTokens: 54,
          });
        },
      }),
      telemetry,
    })(request(await png()));
    expect(response.status).toBe(500);
    expect(telemetry.mock.calls[0][0]).toMatchObject({
      schemaFailureStage: "output_json_parse",
      usageKnown: true,
      inputTokens: 321,
      outputTokens: 54,
    });
    expect(telemetry.mock.calls[0][0]).not.toHaveProperty(
      "providerResponseStatus",
    );
  });
  it("telemetry allowlist retains normalization metadata and strips raw Provider data", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    emitTelemetry({
      requestId: crypto.randomUUID(),
      status: 200,
      usageKnown: true,
      inputTokens: 100,
      outputTokens: 20,
      textNormalizationApplied: true,
      textNormalizationKind: "serialization_tail",
      textNormalizationCount: 2,
      textNormalizationFields: ["signal_reason", "recommendation"],
      durationMs: 1,
      ...{
        rawOutput: "PRIVATE RAW OUTPUT",
        outputText: "PRIVATE OUTPUT TEXT",
        incompleteDetails: { reason: "PRIVATE RAW REASON" },
        summary: "PRIVATE SUMMARY",
        signalReason: "PRIVATE SIGNAL",
        recommendation: "PRIVATE RECOMMENDATION",
        prompt: "PRIVATE PROMPT",
        apiKey: "PRIVATE KEY",
        imageBase64: "PRIVATE IMAGE",
      },
    });
    expect(log).toHaveBeenCalledOnce();
    const saved = String(log.mock.calls[0][0]);
    expect(saved).toContain('"textNormalizationApplied":true');
    expect(saved).toContain('"textNormalizationKind":"serialization_tail"');
    expect(saved).toContain('"textNormalizationCount":2');
    expect(saved).toContain(
      '"textNormalizationFields":["signal_reason","recommendation"]',
    );
    expect(saved).not.toContain("PRIVATE");
    log.mockRestore();
  });
});
