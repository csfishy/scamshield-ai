import "server-only";
import { z } from "zod";
import { errorCodeSchema } from "../contracts/analysis";
import { SCHEMA_FAILURE_FIELDS, SCHEMA_FAILURE_STAGES } from "./errors";
const eventSchema = z
  .object({
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
    schemaFailureStage: z.enum(SCHEMA_FAILURE_STAGES).optional(),
    schemaFailureField: z.enum(SCHEMA_FAILURE_FIELDS).optional(),
    durationMs: z.number().nonnegative(),
    imageByteCount: z.number().int().nonnegative().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    promptVersion: z.literal("scam-analysis-v1").optional(),
    model: z.literal("gpt-4.1-mini-2025-04-14").optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    providerEntered: z.boolean().optional(),
    usageKnown: z.boolean().optional(),
    quotaOutcome: z
      .enum([
        "not_checked",
        "preflight_allowed",
        "reserved",
        "started",
        "denied",
      ])
      .optional(),
    leaseDisposition: z
      .enum(["released", "held_until_expiry", "release_failed"])
      .optional(),
  })
  .superRefine((event, ctx) => {
    if (event.schemaFailureStage && event.failureKind !== "schema")
      ctx.addIssue({ code: "custom", message: "Invalid schema failure stage" });
    if (
      event.schemaFailureField &&
      (event.failureKind !== "schema" ||
        event.schemaFailureStage !== "structural_debris")
    )
      ctx.addIssue({ code: "custom", message: "Invalid schema failure field" });
  });
export type AnalysisEvent = z.infer<typeof eventSchema>;
// Runtime allowlist strips even accidental caller additions. Never log exceptions.
export function emitTelemetry(event: AnalysisEvent): void {
  const result = eventSchema.safeParse(event);
  if (result.success) console.info(JSON.stringify(result.data));
}
