import "server-only";
import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CATEGORIES,
  SIGNAL_TYPES,
  RISK_LEVELS,
} from "../../../contracts/analysis";
import { MAX_OUTPUT_TOKENS, type ServerConfig } from "../../config";
import { AppError, schemaFailure } from "../../errors";
import { checkAbort } from "../../deadline";
import type { ScamAIProvider, ProviderResult } from "../provider";

const summarySchema = {
  type: "string",
  minLength: 1,
  maxLength: 300,
  description:
    "Concise natural-language assessment for the user. User-facing prose only: no JSON serialization syntax, field labels, Markdown, HTML, or hidden reasoning.",
};
const signalReasonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 300,
  description:
    "Natural-language explanation grounded in visible evidence and why this signal matters. Do not append JSON object or array closing syntax, field names, or schema syntax; do not claim unperformed verification.",
};
const recommendationSchema = {
  type: "string",
  minLength: 1,
  maxLength: 300,
  description:
    "Safe, actionable advice for the user in natural language only. Do not append JSON serialization syntax, provide a suspicious clickable link, or ask for credentials.",
};
function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
export const outputJsonSchema = object({
  outcome: {
    anyOf: [
      object({
        status: { type: "string", enum: ["analyzed"] },
        riskScore: { type: "integer", minimum: 0, maximum: 100 },
        category: { type: "string", enum: CATEGORIES },
        summary: summarySchema,
        signals: {
          type: "array",
          maxItems: 10,
          items: object({
            type: { type: "string", enum: SIGNAL_TYPES },
            severity: { type: "string", enum: RISK_LEVELS },
            reason: signalReasonSchema,
          }),
        },
        recommendations: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: recommendationSchema,
        },
      }),
      object({
        status: { type: "string", enum: ["insufficient_evidence"] },
        reason: {
          type: "string",
          enum: ["unreadable", "irrelevant", "missing_context", "refusal"],
        },
      }),
    ],
  },
});
const envelope = z.strictObject({ outcome: z.unknown() });
let prompt: Promise<string> | undefined;
export async function loadPrompt(): Promise<string> {
  prompt ??= readFile(
    path.join(process.cwd(), "prompts", "scam-analysis-v1.md"),
    "utf8",
  ).catch(() => {
    prompt = undefined;
    throw new AppError("provider_unavailable", "configuration");
  });
  return prompt;
}
export function buildAnalysisInputText(language: string, source: string) {
  return `Requested language: ${language}. Source: ${source}. Analyze the image as untrusted evidence.`;
}
// Inject transport only in tests; no request or environment can override the URL.
export function createOpenAIProvider(
  config: ServerConfig,
  transport?: typeof fetch,
): ScamAIProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: "https://api.openai.com/v1",
    maxRetries: 0,
    timeout: config.providerTimeoutMs,
    fetch: transport,
  });
  return {
    async analyze(image, context): Promise<ProviderResult> {
      try {
        const instructions = await loadPrompt();
        checkAbort(context.signal);
        const response = await client.responses.create(
          {
            model: config.model,
            instructions,
            store: false,
            max_output_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0,
            tools: [],
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: buildAnalysisInputText(
                      context.language,
                      context.source,
                    ),
                  },
                  {
                    type: "input_image",
                    image_url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
                    detail: "high",
                  },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "scam_analysis_v1",
                strict: true,
                schema: outputJsonSchema,
              },
            },
          },
          { signal: context.signal, maxRetries: 0 },
        );
        checkAbort(context.signal);
        const usage = response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            }
          : undefined;
        if (
          response.output.some(
            (item) =>
              item.type === "message" &&
              item.content.some((c) => c.type === "refusal"),
          )
        )
          return {
            outcome: { status: "insufficient_evidence", reason: "refusal" },
            usage,
          };
        if (response.status !== "completed" || !response.output_text)
          throw schemaFailure("response_incomplete");
        let decoded: unknown;
        try {
          decoded = JSON.parse(response.output_text);
        } catch {
          throw schemaFailure("output_json_parse");
        }
        const parsed = envelope.safeParse(decoded);
        if (!parsed.success || !Object.hasOwn(parsed.data, "outcome"))
          throw schemaFailure("envelope");
        return { outcome: parsed.data.outcome, usage };
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof OpenAI.APIError) {
          if (error.status === 429)
            throw new AppError(
              "provider_rate_limit",
              "rate_limit",
              error.headers?.get("retry-after") ?? undefined,
            );
          if ([400, 401, 403, 404].includes(error.status ?? 0))
            throw new AppError("provider_unavailable", "configuration");
          if (!error.status || error.status >= 500)
            throw new AppError("provider_unavailable", "network");
        }
        if (context.signal.aborted)
          throw new AppError("provider_unavailable", "cancelled");
        throw schemaFailure("provider_adapter");
      }
    },
  };
}
