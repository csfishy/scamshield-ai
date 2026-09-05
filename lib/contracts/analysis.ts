import { z } from "zod";

export const CONTRACT_VERSION = "v2";
export const LIMITS = Object.freeze({
  imageBytes: 4_194_304,
  bodyBytes: 4_300_000,
  dimension: 12_000,
  pixels: 24_000_000,
  frames: 1,
  sourceBytes: 10,
  languageBytes: 64,
  filenameBytes: 255,
  textCodePoints: 300,
  signals: 10,
  recommendations: 5,
});
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export const CATEGORIES = [
  "none",
  "phishing",
  "fake_customer_service",
  "investment_scam",
  "impersonation",
  "account_theft",
  "other",
  "unknown",
] as const;
export const SIGNAL_TYPES = [
  "suspicious_link",
  "off_platform_contact",
  "credential_request",
  "payment_request",
  "urgency_or_threat",
  "guaranteed_return",
  "impersonation_claim",
  "inconsistent_identity",
  "other",
] as const;
export const riskLevelSchema = z.enum(RISK_LEVELS);
export const categorySchema = z.enum(CATEGORIES);
export const signalTypeSchema = z.enum(SIGNAL_TYPES);
export const riskScoreSchema = z.number().int().min(0).max(100);
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export function riskLevelForScore(score: number): RiskLevel {
  riskScoreSchema.parse(score);
  return score < 30 ? "low" : score < 70 ? "medium" : "high";
}
// Validate length after trim but do not silently repair data received by clients.
export const publicTextSchema = z
  .string()
  .refine(
    (s) =>
      [...s.trim()].length >= 1 &&
      [...s.trim()].length <= LIMITS.textCodePoints,
    "Expected 1–300 Unicode code points",
  );
export const signalSchema = z.strictObject({
  type: signalTypeSchema,
  severity: riskLevelSchema,
  reason: publicTextSchema,
});
export const analysisFields = {
  riskScore: riskScoreSchema,
  category: categorySchema,
  summary: publicTextSchema,
  signals: z.array(signalSchema).max(LIMITS.signals),
  recommendations: z.array(publicTextSchema).min(1).max(LIMITS.recommendations),
};
export const analysisSchema = z
  .strictObject({ ...analysisFields, riskLevel: riskLevelSchema })
  .superRefine((value, ctx) => {
    if (!riskScoreSchema.safeParse(value.riskScore).success) return;
    if (
      riskLevelForScore(value.riskScore) !== value.riskLevel ||
      (value.category === "none" && value.riskLevel !== "low")
    ) {
      ctx.addIssue({ code: "custom", message: "Inconsistent risk semantics" });
    }
  });
export type AnalysisResult = z.infer<typeof analysisSchema>;
export type ScamSignal = z.infer<typeof signalSchema>;
export type ScamCategory = z.infer<typeof categorySchema>;
export const ERROR_RULES = {
  invalid_request: { statuses: [400, 405], retryable: false },
  invalid_image: { statuses: [400], retryable: false },
  image_too_large: { statuses: [413], retryable: false },
  unsupported_image_format: { statuses: [415], retryable: false },
  insufficient_evidence: { statuses: [422], retryable: false },
  provider_rate_limit: { statuses: [429], retryable: true },
  analysis_failed: { statuses: [500], retryable: false },
  provider_unavailable: { statuses: [503], retryable: true },
} as const;
export type ErrorCode = keyof typeof ERROR_RULES;
export const errorCodeSchema = z.enum(
  Object.keys(ERROR_RULES) as [ErrorCode, ...ErrorCode[]],
);
export const errorSchema = z
  .strictObject({
    error: z.strictObject({
      code: errorCodeSchema,
      message: publicTextSchema,
      retryable: z.boolean(),
    }),
  })
  .refine(
    (v) => ERROR_RULES[v.error.code].retryable === v.error.retryable,
    "Inconsistent retryable",
  );
export type AnalysisError = z.infer<typeof errorSchema>;
export function parseAnalysisResponse(
  status: number,
  body: unknown,
): AnalysisResult | AnalysisError {
  if (status === 200) return analysisSchema.parse(body);
  const parsed = errorSchema.parse(body);
  if (
    !(ERROR_RULES[parsed.error.code].statuses as readonly number[]).includes(
      status,
    )
  )
    throw new Error("Invalid response status");
  return parsed;
}
export function validRetryAfter(value: string | null): string | undefined {
  if (!value) return undefined;
  if (/^\d{1,10}$/.test(value)) return value;
  if (
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  )
    return value;
  return undefined;
}
