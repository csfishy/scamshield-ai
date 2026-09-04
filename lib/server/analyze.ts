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
import { createOpenAIProvider } from "./ai/providers/openai";
import { normalizeOutcome } from "./ai/normalize";
import type { ScamAIProvider } from "./ai/provider";
import { emitTelemetry, type AnalysisEvent } from "./telemetry";
interface Dependencies {
  config?: () => ServerConfig;
  provider?: (config: ServerConfig) => ScamAIProvider;
  telemetry?: (event: AnalysisEvent) => void;
  now?: () => number;
}
// Test injection is module-local, never a public debug parameter or runtime stub mode.
export function createAnalyzeHandler(deps: Dependencies = {}) {
  return async function analyze(request: Request): Promise<Response> {
    const now = deps.now ?? Date.now;
    const start = now(),
      requestId = randomUUID();
    const event: AnalysisEvent = { requestId, status: 500, durationMs: 0 };
    let budget: ReturnType<typeof deadline> | undefined;
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
      const boundary = multipartBoundary(request.headers.get("content-type"));
      const body = await readBoundedBody(request, budget.signal);
      const upload = parseMultipart(body, boundary);
      const image = await validateImage(upload, budget.signal);
      event.imageByteCount = image.sizeBytes;
      event.width = image.width;
      event.height = image.height;
      if (config.mode === "mock")
        throw new AppError("provider_unavailable", "configuration");
      const remaining = config.apiTimeoutMs - (now() - start) - 2000;
      if (remaining <= 0) throw new AppError("provider_unavailable", "timeout");
      checkAbort(budget.signal);
      const providerBudget = deadline(
        budget.signal,
        Math.min(config.providerTimeoutMs, remaining),
      );
      try {
        const provider = (deps.provider ?? createOpenAIProvider)(config);
        checkAbort(providerBudget.signal);
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
      return response;
    } finally {
      budget?.dispose();
      event.durationMs = Math.max(0, now() - start);
      try {
        (deps.telemetry ?? emitTelemetry)(event);
      } catch {
        /* Logging must never change HTTP behavior. */
      }
    }
  };
}
