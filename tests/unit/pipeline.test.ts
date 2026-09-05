import { describe, expect, it, vi } from "vitest";
import { createAnalyzeHandler } from "../../lib/server/analyze";
import {
  getConfig,
  MODEL,
  PROMPT_VERSION,
  type ServerConfig,
} from "../../lib/server/config";
import { normalizeOutcome } from "../../lib/server/ai/normalize";
import { AppError } from "../../lib/server/errors";
import { emitTelemetry } from "../../lib/server/telemetry";
import { normal } from "../../fixtures/demo";
import { png, request } from "../helpers/images";
import type { AnalysisContext } from "../../lib/server/ai/provider";
export const config: ServerConfig = {
  mode: "remote",
  provider: "openai",
  model: MODEL,
  apiKey: "test-placeholder",
  providerTimeoutMs: 15000,
  apiTimeoutMs: 20000,
  promptVersion: PROMPT_VERSION,
};
const outcome = { status: "analyzed", ...normal };
describe("normalization and errors", () => {
  it("normal, unknown, insufficient/refusal and recomputed level", () => {
    expect(
      normalizeOutcome({ ...outcome, summary: "  清楚  ", riskLevel: "wrong" }),
    ).toMatchObject({ summary: "清楚", riskLevel: "low" });
    expect(normalizeOutcome({ ...outcome, category: "unknown" }).category).toBe(
      "unknown",
    );
    for (const reason of [
      "unreadable",
      "irrelevant",
      "missing_context",
      "refusal",
    ])
      expect(() =>
        normalizeOutcome({ status: "insufficient_evidence", reason }),
      ).toThrow("insufficient_evidence");
    for (const changes of [
      { riskScore: "50" },
      { riskScore: 3.4 },
      { category: "NONE" },
      { riskScore: 70 },
      { summary: "x".repeat(301) },
      { summary: "可疑內容。}]," },
      {
        signals: [
          { type: "other", severity: "low", reason: "可疑內容。}," },
        ],
      },
      { recommendations: ["請聯絡官方。],"] },
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
      ...{ filename: "PRIVATE", prompt: "SECRET", raw: "RAW" },
    });
    expect(log.mock.calls.flat().join()).not.toMatch(/PRIVATE|SECRET|RAW/);
    log.mockRestore();
    const response = await createAnalyzeHandler({
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
});
