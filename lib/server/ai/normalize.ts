import "server-only";
import {
  analysisSchema,
  publicTextSchema,
  riskLevelForScore,
  type AnalysisResult,
} from "../../contracts/analysis";
import { providerOutcomeSchema } from "./provider";
import { AppError, schemaFailure, type SchemaFailureField } from "../errors";

export const KNOWN_SERIALIZATION_TAILS = [
  "}],",
  "]},",
  "},]",
  "}},",
  "]],",
] as const;
type KnownSerializationTail = (typeof KNOWN_SERIALIZATION_TAILS)[number];
const NATURAL_LANGUAGE_TERMINATOR = /[。.!！?？;；]$/u;

export interface TextNormalizationMetadata {
  applied: boolean;
  count: number;
  fields: SchemaFailureField[];
  kind?: "serialization_tail";
}

export function detectKnownSerializationTail(
  value: string,
): KnownSerializationTail | undefined {
  return KNOWN_SERIALIZATION_TAILS.find((tail) => value.endsWith(tail));
}

export function validateNormalizedProviderText(
  value: string,
  field: SchemaFailureField,
): string {
  if (
    detectKnownSerializationTail(value) ||
    !publicTextSchema.safeParse(value).success
  )
    throw schemaFailure("structural_debris", field);
  return value;
}

export function normalizeProviderText(
  value: string,
  field: SchemaFailureField,
): { text: string; applied: boolean } {
  const text = value.trim();
  const tail = detectKnownSerializationTail(text);
  if (!tail) return { text, applied: false };

  // Remove at most one exact, known tail. Ambiguous or layered tails remain
  // fail-closed instead of being recursively repaired into plausible prose.
  const candidate = text.slice(0, -tail.length).trim();
  if (
    !candidate ||
    detectKnownSerializationTail(candidate) ||
    !NATURAL_LANGUAGE_TERMINATOR.test(candidate)
  )
    throw schemaFailure("structural_debris", field);

  return {
    text: validateNormalizedProviderText(candidate, field),
    applied: true,
  };
}

export function normalizeOutcomeWithMetadata(raw: unknown): {
  result: AnalysisResult;
  normalization: TextNormalizationMetadata;
} {
  const parsed = providerOutcomeSchema.safeParse(raw);
  if (!parsed.success) throw schemaFailure("provider_outcome");
  const value = parsed.data;
  if (value.status === "insufficient_evidence")
    throw new AppError("insufficient_evidence", "refusal");
  const normalizedFields: SchemaFailureField[] = [];
  const normalize = (text: string, field: SchemaFailureField) => {
    const normalized = normalizeProviderText(text, field);
    if (normalized.applied) normalizedFields.push(field);
    return normalized.text;
  };
  const result = analysisSchema.safeParse({
    riskScore: value.riskScore,
    riskLevel: riskLevelForScore(value.riskScore),
    category: value.category,
    summary: normalize(value.summary, "summary"),
    signals: value.signals.map((s) => ({
      type: s.type,
      severity: s.severity,
      reason: normalize(s.reason, "signal_reason"),
    })),
    recommendations: value.recommendations.map((text) =>
      normalize(text, "recommendation"),
    ),
  });
  if (!result.success) throw schemaFailure("public_contract");
  const fields = [...new Set(normalizedFields)];
  return {
    result: result.data,
    normalization: {
      applied: normalizedFields.length > 0,
      count: normalizedFields.length,
      fields,
      ...(normalizedFields.length > 0
        ? { kind: "serialization_tail" as const }
        : {}),
    },
  };
}

export function normalizeOutcome(raw: unknown): AnalysisResult {
  return normalizeOutcomeWithMetadata(raw).result;
}
