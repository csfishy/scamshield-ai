import "server-only";
import { z } from "zod";
import { errorCodeSchema } from "../contracts/analysis";
import {
  PROVIDER_INCOMPLETE_REASONS,
  PROVIDER_RESPONSE_STATUSES,
  SCHEMA_FAILURE_FIELDS,
  SCHEMA_FAILURE_STAGES,
} from "./errors";
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
    providerResponseStatus: z.enum(PROVIDER_RESPONSE_STATUSES).optional(),
    providerIncompleteReason: z.enum(PROVIDER_INCOMPLETE_REASONS).optional(),
    providerOutputTextPresent: z.boolean().optional(),
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
    const responseDiagnostics = [
      event.providerResponseStatus,
      event.providerIncompleteReason,
      event.providerOutputTextPresent,
    ];
    if (
      responseDiagnostics.some((value) => value !== undefined) &&
      (event.failureKind !== "schema" ||
        event.schemaFailureStage !== "response_incomplete")
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid Provider response diagnostics",
      });
    if (
      event.schemaFailureStage === "response_incomplete" &&
      responseDiagnostics.some((value) => value === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Incomplete Provider response diagnostics",
      });
    if (
      event.providerIncompleteReason !== undefined &&
      event.providerIncompleteReason !== "none" &&
      event.providerResponseStatus !== "incomplete"
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid Provider incomplete reason",
      });
    if (
      event.providerResponseStatus === "completed" &&
      event.providerOutputTextPresent !== false
    )
      ctx.addIssue({
        code: "custom",
        message: "Completed response must be missing output text",
      });
    const tokenFields = [event.inputTokens, event.outputTokens];
    if (
      (event.usageKnown === true &&
        tokenFields.some((value) => value === undefined)) ||
      (tokenFields.some((value) => value !== undefined) &&
        event.usageKnown !== true)
    )
      ctx.addIssue({ code: "custom", message: "Invalid usage diagnostics" });
  });
export type AnalysisEvent = z.infer<typeof eventSchema>;
// Runtime allowlist strips even accidental caller additions. Never log exceptions.
export function emitTelemetry(event: AnalysisEvent): void {
  const result = eventSchema.safeParse(event);
  if (result.success) console.info(JSON.stringify(result.data));
}
