import "server-only";
import {
  analysisSchema,
  riskLevelForScore,
  type AnalysisResult,
} from "../../contracts/analysis";
import { providerOutcomeSchema } from "./provider";
import { AppError } from "../errors";

// Structured Outputs can still place JSON-looking delimiter debris inside a
// syntactically valid string. Do not repair or expose such Provider text.
const structuralTail = /(?:\}\s*\]|\]\s*\}|\}\s*,|\]\s*,)\s*$/u;
function normalizeProviderText(value: string): string {
  const normalized = value.trim();
  if (structuralTail.test(normalized))
    throw new AppError("analysis_failed", "schema");
  return normalized;
}

export function normalizeOutcome(raw: unknown): AnalysisResult {
  const parsed = providerOutcomeSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("analysis_failed", "schema");
  const value = parsed.data;
  if (value.status === "insufficient_evidence")
    throw new AppError("insufficient_evidence", "refusal");
  const result = analysisSchema.safeParse({
    riskScore: value.riskScore,
    riskLevel: riskLevelForScore(value.riskScore),
    category: value.category,
    summary: normalizeProviderText(value.summary),
    signals: value.signals.map((s) => ({
      type: s.type,
      severity: s.severity,
      reason: normalizeProviderText(s.reason),
    })),
    recommendations: value.recommendations.map(normalizeProviderText),
  });
  if (!result.success) throw new AppError("analysis_failed", "schema");
  return result.data;
}
