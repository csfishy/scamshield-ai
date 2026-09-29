import "server-only";
import {
  analysisSchema,
  riskLevelForScore,
  type AnalysisResult,
} from "../../contracts/analysis";
import { providerOutcomeSchema } from "./provider";
import { AppError, schemaFailure, type SchemaFailureField } from "../errors";

function hasStructuralDebris(value: string): boolean {
  // Two or more closing JSON delimiters at the end are output debris, even
  // when a comma separates them. A single bracket or brace can be prose.
  return /[}\]](?:,?[}\]])+,?$/u.test(value);
}

function normalizeProviderText(
  value: string,
  field: SchemaFailureField,
): string {
  const text = value.trim();
  if (hasStructuralDebris(text))
    throw schemaFailure("structural_debris", field);
  return text;
}

export function normalizeOutcome(raw: unknown): AnalysisResult {
  const parsed = providerOutcomeSchema.safeParse(raw);
  if (!parsed.success) throw schemaFailure("provider_outcome");
  const value = parsed.data;
  if (value.status === "insufficient_evidence")
    throw new AppError("insufficient_evidence", "refusal");
  const result = analysisSchema.safeParse({
    riskScore: value.riskScore,
    riskLevel: riskLevelForScore(value.riskScore),
    category: value.category,
    summary: normalizeProviderText(value.summary, "summary"),
    signals: value.signals.map((s) => ({
      type: s.type,
      severity: s.severity,
      reason: normalizeProviderText(s.reason, "signal_reason"),
    })),
    recommendations: value.recommendations.map((text) =>
      normalizeProviderText(text, "recommendation"),
    ),
  });
  if (!result.success) throw schemaFailure("public_contract");
  return result.data;
}
