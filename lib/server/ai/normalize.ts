import "server-only";
import {
  analysisSchema,
  riskLevelForScore,
  type AnalysisResult,
} from "../../contracts/analysis";
import { providerOutcomeSchema } from "./provider";
import { AppError } from "../errors";
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
    summary: value.summary.trim(),
    signals: value.signals.map((s) => ({
      type: s.type,
      severity: s.severity,
      reason: s.reason.trim(),
    })),
    recommendations: value.recommendations.map((s) => s.trim()),
  });
  if (!result.success) throw new AppError("analysis_failed", "schema");
  return result.data;
}
