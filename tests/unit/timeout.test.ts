import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig, MODEL } from "../../lib/server/config";
import { createAnalyzeHandler } from "../../lib/server/analyze";
import { abortable } from "../../lib/server/deadline";
import type {
  AnalysisContext,
  ProviderResult,
} from "../../lib/server/ai/provider";
import type { QuotaService } from "../../lib/server/quota";
import type { AnalysisEvent } from "../../lib/server/telemetry";
import { normal } from "../../fixtures/demo";
import { png, request } from "../helpers/images";

const remote = () =>
  getConfig({
    ANALYSIS_MODE: "remote",
    AI_PROVIDER: "openai",
    AI_MODEL: MODEL,
    AI_API_KEY: "test-only",
  });
const result: ProviderResult = {
  outcome: {
    status: "analyzed",
    riskScore: normal.riskScore,
    category: normal.category,
    summary: normal.summary,
    signals: normal.signals,
    recommendations: normal.recommendations,
  },
  usage: { inputTokens: 100, outputTokens: 20 },
};

describe("bounded timeout configuration", () => {
  it("defaults to 20s Provider and 25s application", () => {
    expect(getConfig({})).toMatchObject({
      providerTimeoutMs: 20000,
      apiTimeoutMs: 25000,
    });
  });
  it.each([
    ["20000", "25000"],
    ["18000", "25000"],
    ["20000", "22000"],
  ])(
    "accepts Provider %s / application %s with at least 2s margin",
    (provider, api) => {
      expect(
        getConfig({ AI_TIMEOUT_MS: provider, ANALYSIS_TIMEOUT_MS: api }),
      ).toMatchObject({
        providerTimeoutMs: Number(provider),
        apiTimeoutMs: Number(api),
      });
    },
  );
  it.each([
    ["AI_TIMEOUT_MS", "20001"],
    ["ANALYSIS_TIMEOUT_MS", "25001"],
    ...[
      "0",
      "-1",
      "1.5",
      "NaN",
      "Infinity",
      "1e4",
      "20000ms",
      " 20000",
      "",
      "999999999999999999999",
    ].flatMap((value) => [
      ["AI_TIMEOUT_MS", value],
      ["ANALYSIS_TIMEOUT_MS", value],
    ]),
  ])("rejects %s=%s without exposing the value", (key, value) => {
    expect(() => getConfig({ [key]: value })).toThrow("provider_unavailable");
  });
  it("rejects a margin smaller than 2000ms", () => {
    expect(() =>
      getConfig({ AI_TIMEOUT_MS: "20000", ANALYSIS_TIMEOUT_MS: "21999" }),
    ).toThrow("provider_unavailable");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function controlled(preflightMs = 0, cleanupMs = 0) {
  const req = request(await png());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(0);
  const entered = deferred<AnalysisContext>();
  const completion = deferred<ProviderResult>();
  const admission = deferred<void>();
  const finalize = vi.fn(async () => {
    if (cleanupMs)
      await new Promise<void>((resolve) => setTimeout(resolve, cleanupMs));
    return "none" as const;
  });
  const release = vi.fn(async () => {});
  const acquire = vi.fn(async () => ({
    circuitState: "closed" as const,
    finalize,
    release,
  }));
  const service: QuotaService = {
    preflight: async (_request, _id, signal) => {
      await abortable(admission.promise, signal);
      return { acquire, assertEnabled: async () => {} };
    },
  };
  const analyze = vi.fn((_image, context: AnalysisContext) => {
    entered.resolve(context);
    return completion.promise;
  });
  const telemetry = vi.fn<(event: AnalysisEvent) => void>();
  const response = createAnalyzeHandler({
    config: remote,
    quota: () => service,
    provider: () => ({ analyze }),
    telemetry,
  })(req);
  await vi.advanceTimersByTimeAsync(preflightMs);
  admission.resolve();
  const context = await entered.promise;
  return {
    response,
    context,
    completion,
    analyze,
    telemetry,
    finalize,
    release,
    acquire,
  };
}

describe("20s / 25s deadlines with fake time and an offline Provider", () => {
  it("accepts completion at 19,999ms and leaves time for cleanup", async () => {
    const h = await controlled(0, 1000);
    await vi.advanceTimersByTimeAsync(19999);
    expect(h.context.signal.aborted).toBe(false);
    h.completion.resolve(result);
    await vi.advanceTimersByTimeAsync(1000);
    const response = await h.response;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(normal);
    expect(h.analyze).toHaveBeenCalledOnce();
    expect(h.finalize).toHaveBeenCalledOnce();
    expect(h.finalize).toHaveBeenCalledWith("success");
    expect(h.release).not.toHaveBeenCalled();
    expect(h.telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: 20999,
        providerEntered: true,
        usageKnown: true,
        inputTokens: 100,
        outputTokens: 20,
        quotaOutcome: "committed",
        leaseDisposition: "committed",
      }),
    );
  });
  it("times out at 20s, rolls back the lease, and ignores late success without retry", async () => {
    const h = await controlled();
    await vi.advanceTimersByTimeAsync(20000);
    const response = await h.response;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("provider_unavailable");
    expect(h.context.signal.aborted).toBe(true);
    expect(h.context.signal.reason).toMatchObject({ kind: "timeout" });
    expect(h.acquire).toHaveBeenCalledOnce();
    expect(h.finalize).toHaveBeenCalledOnce();
    expect(h.finalize).toHaveBeenCalledWith("provider_failure");
    expect(h.release).not.toHaveBeenCalled();
    expect(h.telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: 20000,
        failureKind: "timeout",
        providerEntered: true,
        usageKnown: false,
        quotaOutcome: "rolled_back",
        leaseDisposition: "released",
      }),
    );
    const event = h.telemetry.mock.calls[0][0];
    expect(event).not.toHaveProperty("inputTokens");
    expect(event).not.toHaveProperty("outputTokens");
    const snapshot = JSON.stringify(event);
    h.completion.resolve(result);
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.analyze).toHaveBeenCalledOnce();
    expect(h.telemetry).toHaveBeenCalledOnce();
    expect(JSON.stringify(event)).toBe(snapshot);
    expect(h.finalize).toHaveBeenCalledOnce();
    expect(h.release).not.toHaveBeenCalled();
  });
  it("shortens Provider time after 6s preflight to retain the 2s API margin", async () => {
    const h = await controlled(6000);
    await vi.advanceTimersByTimeAsync(16999);
    expect(h.context.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await h.response).status).toBe(503);
    expect(h.context.deadline).toBe(25000);
    expect(h.telemetry.mock.calls[0][0]).toMatchObject({
      durationMs: 23000,
      failureKind: "timeout",
    });
    expect(h.analyze).toHaveBeenCalledOnce();
  });
  it("bounds stalled preflight at the 25s API deadline without entering Provider", async () => {
    const req = request(await png());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(0);
    const analyze = vi.fn();
    const telemetry = vi.fn<(event: AnalysisEvent) => void>();
    const service: QuotaService = {
      preflight: (_request, _id, signal) =>
        abortable(new Promise<never>(() => {}), signal),
    };
    const response = createAnalyzeHandler({
      config: remote,
      quota: () => service,
      provider: () => ({ analyze }),
      telemetry,
    })(req);
    await vi.advanceTimersByTimeAsync(25000);
    expect((await response).status).toBe(503);
    expect(analyze).not.toHaveBeenCalled();
    expect(telemetry.mock.calls[0][0]).toMatchObject({
      durationMs: 25000,
      failureKind: "timeout",
      providerEntered: false,
      usageKnown: false,
    });
  });
});
