import { describe, expect, it, vi } from "vitest";
import { createAnalyzeHandler } from "../../lib/server/analyze";
import {
  MODEL,
  PROMPT_VERSION,
  type ServerConfig,
} from "../../lib/server/config";
import { AppError } from "../../lib/server/errors";
import {
  parseAnalysisResponse,
  type ErrorCode,
} from "../../lib/contracts/analysis";
import type { QuotaService } from "../../lib/server/quota";
import type { AnalysisEvent } from "../../lib/server/telemetry";
import { normal } from "../../fixtures/demo";
import { png, request } from "../helpers/images";

const config: ServerConfig = {
  mode: "remote",
  provider: "openai",
  model: MODEL,
  apiKey: "test-only",
  apiTimeoutMs: 20000,
  providerTimeoutMs: 15000,
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

function gate() {
  const release = vi.fn(async () => {});
  const acquire = vi.fn(async () => ({ release }));
  const assertEnabled = vi.fn(async () => {});
  const preflight = vi.fn(async () => ({ acquire, assertEnabled }));
  const service: QuotaService = { preflight };
  return { release, acquire, assertEnabled, preflight, service };
}

describe("quota integration into the application pipeline (test doubles, no Redis/AI)", () => {
  it.each([
    ["client_rate_limited", 429, "60"],
    ["daily_quota_exceeded", 429, "28799"],
    ["global_quota_exceeded", 429, "28799"],
    ["analysis_busy", 429, "59"],
    ["analysis_disabled", 503, undefined],
    ["rate_limit_unavailable", 503, undefined],
  ] as const)(
    "%s rejects before decoding and Provider with safe headers",
    async (code, status, retryAfter) => {
      const q = gate();
      q.preflight.mockRejectedValue(
        new AppError(code, "rate_limit", retryAfter),
      );
      const analyze = vi.fn();
      const response = await createAnalyzeHandler({
        config: () => config,
        quota: () => q.service,
        provider: () => ({ analyze }),
        telemetry: () => {},
      })(request(Buffer.from("invalid")));
      expect(response.status).toBe(status);
      expect(
        parseAnalysisResponse(status, await response.json()),
      ).toMatchObject({ error: { code, retryable: true } });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.headers.get("retry-after")).toBe(retryAfter ?? null);
      expect(analyze).not.toHaveBeenCalled();
      expect(q.acquire).not.toHaveBeenCalled();
    },
  );

  it("invalid uploads consume only preflight, never daily quota", async () => {
    const q = gate();
    const analyze = vi.fn();
    const handler = createAnalyzeHandler({
      config: () => config,
      quota: () => q.service,
      provider: () => ({ analyze }),
      telemetry: () => {},
    });
    for (const bytes of [Buffer.alloc(0), Buffer.from("not an image")]) {
      expect((await handler(request(bytes))).status).toBe(400);
    }
    expect(q.preflight).toHaveBeenCalledTimes(2);
    expect(q.acquire).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each([
    "daily_quota_exceeded",
    "global_quota_exceeded",
    "analysis_busy",
    "rate_limit_unavailable",
  ] as ErrorCode[])(
    "failed or uncertain admission %s never calls Provider",
    async (code) => {
      const q = gate();
      q.acquire.mockRejectedValue(new AppError(code, "timeout"));
      const analyze = vi.fn();
      const response = await createAnalyzeHandler({
        config: () => config,
        quota: () => q.service,
        provider: () => ({ analyze }),
        telemetry: () => {},
      })(request(await png()));
      expect((await response.json()).error.code).toBe(code);
      expect(analyze).not.toHaveBeenCalled();
      expect(q.assertEnabled).not.toHaveBeenCalled();
      expect(q.release).not.toHaveBeenCalled();
    },
  );

  it("runtime stop between reservation and Provider prevents new work", async () => {
    const q = gate();
    q.assertEnabled.mockRejectedValue(new AppError("analysis_disabled"));
    const analyze = vi.fn();
    const response = await createAnalyzeHandler({
      config: () => config,
      quota: () => q.service,
      provider: () => ({ analyze }),
      telemetry: () => {},
    })(request(await png()));
    expect(response.status).toBe(503);
    expect(q.acquire).toHaveBeenCalledOnce();
    expect(q.release).toHaveBeenCalledOnce();
    expect(analyze).not.toHaveBeenCalled();
    // There is deliberately no refund operation in the service interface.
  });

  it.each([
    ["provider_rate_limit", "rate_limit", true],
    ["provider_unavailable", "configuration", true],
    ["analysis_failed", "schema", true],
    ["provider_unavailable", "network", false],
    ["provider_unavailable", "timeout", false],
    ["provider_unavailable", "cancelled", false],
    ["analysis_failed", "unknown", false],
  ] as const)(
    "admitted %s/%s is counted once; release=%s",
    async (code, kind, released) => {
      const q = gate();
      const analyze = vi.fn(async () => {
        throw new AppError(code, kind);
      });
      const telemetry = vi.fn();
      await createAnalyzeHandler({
        config: () => config,
        quota: () => q.service,
        provider: () => ({ analyze }),
        telemetry,
      })(request(await png()));
      expect(q.acquire).toHaveBeenCalledOnce();
      expect(analyze).toHaveBeenCalledOnce();
      expect(q.release).toHaveBeenCalledTimes(released ? 1 : 0);
      expect(telemetry.mock.calls[0][0]).toMatchObject({
        providerEntered: true,
        usageKnown: false,
        leaseDisposition: released ? "released" : "held_until_expiry",
      });
    },
  );

  it("insufficient evidence still consumes admission and records received usage", async () => {
    const q = gate();
    const telemetry = vi.fn();
    const analyze = vi.fn(async () => ({
      outcome: { status: "insufficient_evidence", reason: "unreadable" },
      usage: { inputTokens: 100, outputTokens: 20 },
    }));
    const response = await createAnalyzeHandler({
      config: () => config,
      quota: () => q.service,
      provider: () => ({ analyze }),
      telemetry,
    })(request(await png()));
    expect(response.status).toBe(422);
    expect(q.acquire).toHaveBeenCalledOnce();
    expect(q.release).toHaveBeenCalledOnce();
    expect(telemetry.mock.calls[0][0]).toMatchObject({
      usageKnown: true,
      inputTokens: 100,
      outputTokens: 20,
    });
  });

  it("cancellation after admission retains lease and never retries or refunds", async () => {
    const q = gate();
    const controller = new AbortController();
    let started!: () => void;
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const analyze = vi.fn(async () => {
      started();
      return new Promise<never>(() => {});
    });
    const handler = createAnalyzeHandler({
      config: () => config,
      quota: () => q.service,
      provider: () => ({ analyze }),
      telemetry: () => {},
    });
    const response = handler(
      request(await png(), [], { signal: controller.signal }),
    );
    await begun;
    controller.abort();
    expect((await response).status).toBe(503);
    expect(q.acquire).toHaveBeenCalledOnce();
    expect(q.release).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledOnce();
    await handler(request(await png(), [], { signal: controller.signal }));
    expect(q.preflight).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("Provider timeout retains lease until its expiry", async () => {
    const q = gate();
    const analyze = vi.fn(async () => new Promise<never>(() => {}));
    const response = await createAnalyzeHandler({
      config: () => ({ ...config, providerTimeoutMs: 5 }),
      quota: () => q.service,
      provider: () => ({ analyze }),
      telemetry: () => {},
    })(request(await png()));
    expect(response.status).toBe(503);
    expect(q.release).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("cleanup and logging failures never alter successful HTTP or repeat Provider", async () => {
    const q = gate();
    q.release.mockRejectedValue(new Error("private-redis-exception"));
    const analyze = vi.fn(async () => ({ outcome }));
    let logged: AnalysisEvent | undefined;
    const response = await createAnalyzeHandler({
      config: () => config,
      quota: () => q.service,
      provider: () => ({ analyze }),
      telemetry: (event) => {
        logged = event;
        throw new Error("logging");
      },
    })(request(await png()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(normal);
    expect(analyze).toHaveBeenCalledOnce();
    expect(logged).toMatchObject({
      usageKnown: false,
      leaseDisposition: "release_failed",
    });
    expect(logged).not.toHaveProperty("inputTokens");
  });

  it("Provider construction configuration failure does not consume daily admission", async () => {
    const q = gate();
    const response = await createAnalyzeHandler({
      config: () => config,
      quota: () => q.service,
      provider: () => {
        throw new AppError("provider_unavailable", "configuration");
      },
      telemetry: () => {},
    })(request(await png()));
    expect(response.status).toBe(503);
    expect(q.acquire).not.toHaveBeenCalled();
  });
});
