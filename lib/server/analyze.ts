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
import { normalizeOutcomeWithMetadata } from "./ai/normalize";
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
function isCircuitFailure(error: AppError): boolean {
  return (
    error.code === "provider_rate_limit" ||
    (error.code === "provider_unavailable" &&
      ["network", "timeout"].includes(error.kind))
  );
}

function protectionEvent(error: AppError): AnalysisEvent["protectionEvents"] {
  const value = {
    client_rate_limited: "rate_limit_hit",
    device_quota_exceeded: "device_quota_hit",
    ip_safety_limit_exceeded: "ip_safety_limit_hit",
    global_quota_exceeded: "global_quota_hit",
    analysis_busy: "provider_concurrency_rejected",
    service_busy: "provider_concurrency_rejected",
    provider_temporarily_unavailable: "provider_cb_rejected",
  } as const;
  const event = value[error.code as keyof typeof value];
  return event ? [event] : undefined;
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
    let leaseFinalizationAttempted = false;
    let finalOutcome: "provider_failure" | "neutral_failure" =
      "neutral_failure";
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
      if (lease.circuitState === "half_open")
        event.protectionEvents = ["provider_cb_half_open"];
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
        checkAbort(providerBudget.signal);
        if (result.usage) {
          event.usageKnown = true;
          event.inputTokens = result.usage.inputTokens;
          event.outputTokens = result.usage.outputTokens;
        }
        const normalized = normalizeOutcomeWithMetadata(result.outcome);
        event.textNormalizationApplied = normalized.normalization.applied;
        event.textNormalizationCount = normalized.normalization.count;
        if (normalized.normalization.applied) {
          event.textNormalizationKind = normalized.normalization.kind;
          event.textNormalizationFields = normalized.normalization.fields;
        }
        const output = normalized.result;
        leaseFinalizationAttempted = true;
        try {
          const transition = await lease.finalize("success");
          event.quotaOutcome = "committed";
          event.leaseDisposition = "committed";
          if (transition === "provider_cb_closed")
            event.protectionEvents = [
              ...(event.protectionEvents ?? []),
              "provider_cb_closed",
            ];
        } catch (error) {
          event.leaseDisposition = "release_failed";
          throw error;
        }
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
      event.protectionEvents = [
        ...(event.protectionEvents ?? []),
        ...(protectionEvent(safe) ?? []),
      ];
      if (event.protectionEvents.length === 0)
        event.protectionEvents = undefined;
      if (event.providerEntered && isCircuitFailure(safe))
        finalOutcome = "provider_failure";
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
          "device_quota_exceeded",
          "ip_safety_limit_exceeded",
          "daily_quota_exceeded",
          "global_quota_exceeded",
          "analysis_busy",
          "service_busy",
          "provider_temporarily_unavailable",
          "analysis_disabled",
          "rate_limit_unavailable",
        ].includes(safe.code)
      ) {
        event.quotaOutcome = "denied";
      }
      return response;
    } finally {
      budget?.dispose();
      if (lease && !leaseFinalizationAttempted) {
        leaseFinalizationAttempted = true;
        try {
          const transition = await lease.finalize(finalOutcome);
          event.quotaOutcome = "rolled_back";
          event.leaseDisposition = "released";
          if (transition === "provider_cb_opened")
            event.protectionEvents = [
              ...(event.protectionEvents ?? []),
              "provider_cb_opened",
            ];
        } catch {
          event.leaseDisposition = "release_failed";
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
