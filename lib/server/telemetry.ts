import "server-only";
import { z } from "zod";
import { errorCodeSchema } from "../contracts/analysis";
const eventSchema = z.object({
  requestId: z.uuid(),
  mode: z.enum(["mock", "remote"]).optional(),
  status: z.number().int(),
  errorCode: errorCodeSchema.optional(),
  failureKind: z
    .enum([
      "input",
      "configuration",
      "network",
      "timeout",
      "cancelled",
      "rate_limit",
      "schema",
      "refusal",
      "unknown",
    ])
    .optional(),
  durationMs: z.number().nonnegative(),
  imageByteCount: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  promptVersion: z.literal("scam-analysis-v1").optional(),
  model: z.literal("gpt-4.1-mini-2025-04-14").optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});
export type AnalysisEvent = z.infer<typeof eventSchema>;
// Runtime allowlist strips even accidental caller additions. Never log exceptions.
export function emitTelemetry(event: AnalysisEvent): void {
  const result = eventSchema.safeParse(event);
  if (result.success) console.info(JSON.stringify(result.data));
}
