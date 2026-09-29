import "server-only";
import { randomUUID } from "node:crypto";
import { getConfig, type ServerConfig } from "./config";
import { AppError, errorResponse } from "./errors";
import { deadline, abortable, checkAbort } from "./deadline";
import {
  multipartBoundary,
  parseMultipart,
  readBoundedBody,
} from "./multipart";
import { validateImage } from "./image-validation";
import { createOpenAIProvider, loadPrompt } from "./ai/providers/openai";
import { normalizeOutcome } from "./ai/normalize";
import type { ScamAIProvider } from "./ai/provider";
import { emitTelemetry, type AnalysisEvent } from "./telemetry";
import {
  createQuotaService,
  type QuotaService,
  type QuotaAttempt,
  type QuotaLease,
} from "./quota";
interface Dependencies {
  config?: () => ServerConfig;
  provider?: (config: ServerConfig) => ScamAIProvider;
  telemetry?: (event: AnalysisEvent) => void;
  now?: () => number;
  quota?: () => QuotaService;
}
// Test injection is module-local, never a public debug parameter or runtime stub mode.
export function createAnalyzeHandler(deps: Dependencies = {}) {
  return async function analyze(request: Request): Promise<Response> {
    const now = deps.now ?? Date.now;
    const start = now(),
      requestId = randomUUID();
    const event: AnalysisEvent = {
      requestId,
      status: 500,
      durationMs: 0,
      providerEntered: false,
      usageKnown: false,
      quotaOutcome: "not_checked",
    };
    let budget: ReturnType<typeof deadline> | undefined;
    let attempt: QuotaAttempt | undefined;
    let lease: QuotaLease | undefined;
    let providerSettled = false;
    try {
      if (request.method !== "POST") {
        event.status = 405;
        event.errorCode = "invalid_request";
        return errorResponse(
          new AppError("invalid_request"),
          requestId,
          405,
          request.method === "HEAD",
        );
      }
      const config = (deps.config ?? getConfig)();
      event.mode = config.mode;
      event.promptVersion = config.promptVersion;
      event.model = config.model;
      budget = deadline(
        request.signal,
        Math.max(1, config.apiTimeoutMs - (now() - start)),
      );
      checkAbort(budget.signal);
      // Remote protection precedes reading/decoding an uploaded image. Mock has
      // no paid path and continues to exercise the existing input contract.
      if (config.mode === "remote") {
        attempt = await (deps.quota ?? createQuotaService)().preflight(
          request,
          requestId,
          budget.signal,
        );
        event.quotaOutcome = "preflight_allowed";
      }
      const boundary = multipartBoundary(request.headers.get("content-type"));
      const body = await readBoundedBody(request, budget.signal);
      const upload = parseMultipart(body, boundary);
      const image = await validateImage(upload, budget.signal);
      event.imageByteCount = image.sizeBytes;
      event.width = image.width;
      event.height = image.height;
      if (config.mode === "mock")
        throw new AppError("provider_unavailable", "configuration");
      const provider = (deps.provider ?? createOpenAIProvider)(config);
      // Check local prompt availability before consuming daily quota.
      if (!deps.provider) await abortable(loadPrompt(), budget.signal);
      checkAbort(budget.signal);
      if (config.apiTimeoutMs - (now() - start) - 2000 <= 0)
        throw new AppError("provider_unavailable", "timeout");
      if (!attempt)
        throw new AppError("rate_limit_unavailable", "configuration");
      lease = await attempt.acquire(budget.signal);
      event.quotaOutcome = "reserved";
      await attempt.assertEnabled(lease, budget.signal);
      event.quotaOutcome = "started";
      const remaining = config.apiTimeoutMs - (now() - start) - 2000;
      if (remaining <= 0) throw new AppError("provider_unavailable", "timeout");
      checkAbort(budget.signal);
      const providerBudget = deadline(
        budget.signal,
        Math.min(config.providerTimeoutMs, remaining),
      );
      try {
        checkAbort(providerBudget.signal);
        event.providerEntered = true;
        const result = await abortable(
          provider.analyze(image, {
            requestId,
            source: upload.source,
            language: upload.language,
            deadline: start + config.apiTimeoutMs,
            signal: providerBudget.signal,
            promptVersion: config.promptVersion,
          }),
          providerBudget.signal,
        );
        providerSettled = true;
        checkAbort(providerBudget.signal);
        if (result.usage) {
          event.usageKnown = true;
          event.inputTokens = result.usage.inputTokens;
          event.outputTokens = result.usage.outputTokens;
        }
        const output = normalizeOutcome(result.outcome);
        event.status = 200;
        return new Response(JSON.stringify(output), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Request-Id": requestId,
          },
        });
      } finally {
        providerBudget.dispose();
      }
    } catch (error) {
      const safe =
        error instanceof AppError
          ? error
          : new AppError("analysis_failed", "unknown");
      const response = errorResponse(safe, requestId);
      event.status = response.status;
      event.errorCode = safe.code;
      event.failureKind = safe.kind;
      if (safe.kind === "schema") {
        event.schemaFailureStage = safe.schemaFailureStage;
        event.schemaFailureField = safe.schemaFailureField;
        const diagnostics = safe.providerDiagnostics;
        if (diagnostics) {
          if (diagnostics.providerResponseStatus !== undefined)
            event.providerResponseStatus = diagnostics.providerResponseStatus;
          if (diagnostics.providerIncompleteReason !== undefined)
            event.providerIncompleteReason =
              diagnostics.providerIncompleteReason;
          if (diagnostics.providerOutputTextPresent !== undefined)
            event.providerOutputTextPresent =
              diagnostics.providerOutputTextPresent;
          if (
            diagnostics.providerInputTokens !== undefined &&
            diagnostics.providerOutputTokens !== undefined
          ) {
            event.inputTokens = diagnostics.providerInputTokens;
            event.outputTokens = diagnostics.providerOutputTokens;
            event.usageKnown = true;
          }
        }
      }
      if (
        [
          "client_rate_limited",
          "daily_quota_exceeded",
          "global_quota_exceeded",
          "analysis_busy",
          "analysis_disabled",
          "rate_limit_unavailable",
        ].includes(safe.code)
      ) {
        event.quotaOutcome = "denied";
      }
      // A received, definite Provider response can free a lease. A transport
      // failure/abort cannot prove remote computation stopped: retain its TTL.
      if (
        event.providerEntered &&
        ["rate_limit", "configuration", "schema", "refusal"].includes(safe.kind)
      )
        providerSettled = true;
      return response;
    } finally {
      budget?.dispose();
      if (lease) {
        if (!event.providerEntered || providerSettled) {
          try {
            await lease.release();
            event.leaseDisposition = "released";
          } catch {
            event.leaseDisposition = "release_failed";
          }
        } else {
          event.leaseDisposition = "held_until_expiry";
        }
      }
      event.durationMs = Math.max(0, now() - start);
      try {
        (deps.telemetry ?? emitTelemetry)(event);
      } catch {
        /* Logging must never change HTTP behavior. */
      }
    }
  };
}
