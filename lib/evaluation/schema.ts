import { z } from "zod";
import {
  categorySchema,
  riskLevelSchema,
  type AnalysisResult,
} from "../contracts/analysis";
export const evaluationCaseSchema = z.strictObject({
  caseId: z.string().regex(/^[a-z0-9-]+$/),
  image: z.string().min(1),
  family: z.string().min(1),
  source: z.string().min(1),
  license: z.string().min(1),
  deidentified: z.boolean(),
  language: z.string().min(1),
  group: z.enum(["normal", "high_risk", "insufficient", "adversarial"]),
  split: z.enum(["development", "holdout"]),
  demo: z.boolean(),
  analyzable: z.boolean(),
  acceptableLevels: z.array(riskLevelSchema),
  scoreRange: z
    .tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100)])
    .nullable(),
  acceptableCategories: z.array(categorySchema),
  visibleEvidence: z.array(z.string()),
  forbiddenInferences: z.array(z.string()),
  safeRecommendations: z.array(z.string()),
  annotator: z.string().nullable(),
  reviewer: z.string().nullable(),
  reviewStatus: z.enum(["pending", "approved"]),
});
export const manifestSchema = z
  .strictObject({
    revision: z.string().min(1),
    cases: z.array(evaluationCaseSchema).min(1),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>(),
      families = new Map<string, string>();
    for (const c of m.cases) {
      if (ids.has(c.caseId))
        ctx.addIssue({ code: "custom", message: "Duplicate caseId" });
      ids.add(c.caseId);
      if (families.has(c.family) && families.get(c.family) !== c.split)
        ctx.addIssue({ code: "custom", message: "Family leaks across splits" });
      families.set(c.family, c.split);
      if (
        c.analyzable &&
        (!c.scoreRange ||
          !c.acceptableLevels.length ||
          !c.acceptableCategories.length)
      )
        ctx.addIssue({
          code: "custom",
          message: "Missing analyzable expectations",
        });
      if (c.scoreRange && c.scoreRange[0] > c.scoreRange[1])
        ctx.addIssue({ code: "custom", message: "Invalid score range" });
      if (
        c.reviewStatus === "approved" &&
        (!c.annotator || !c.reviewer || !c.deidentified)
      )
        ctx.addIssue({
          code: "custom",
          message: "Approval requires humans and deidentification",
        });
    }
  });
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export interface EvalRow {
  caseId: string;
  status: number;
  durationMs: number;
  result?: AnalysisResult;
  estimatedCostUsd?: number;
  requestId?: string | null;
  errorCode?: string;
  usage?: { inputTokens: number; outputTokens: number };
  humanReview: "pending";
}
export function summarize(cases: EvaluationCase[], rows: EvalRow[]) {
  const pairs = rows.map((row) => ({
    row,
    c: cases.find((c) => c.caseId === row.caseId)!,
  }));
  const successful = rows.filter((r) => r.status === 200);
  const times = successful.map((r) => r.durationMs).sort((a, b) => a - b);
  const ratio = (numerator: number, denominator: number) => ({
    numerator,
    denominator,
    rate: denominator ? numerator / denominator : null,
  });
  const analyzable = pairs.filter((p) => p.c.analyzable),
    insufficient = pairs.filter((p) => !p.c.analyzable),
    high = pairs.filter(
      (p) =>
        p.c.acceptableLevels.length === 1 && p.c.acceptableLevels[0] === "high",
    ),
    normal = pairs.filter((p) => p.c.group === "normal");
  return {
    counts: {
      total: rows.length,
      success: successful.length,
      insufficient: rows.filter((r) => r.status === 422).length,
      error: rows.filter((r) => ![200, 422].includes(r.status)).length,
    },
    analyzableSuccess: ratio(
      analyzable.filter((p) => p.row.status === 200).length,
      analyzable.length,
    ),
    highUnderestimates: high
      .filter((p) => p.row.result && p.row.result.riskLevel !== "high")
      .map((p) => p.row.caseId),
    highIncomplete: high
      .filter((p) => p.row.status !== 200)
      .map((p) => p.row.caseId),
    normalHighFalsePositive: ratio(
      normal.filter((p) => p.row.result?.riskLevel === "high").length,
      normal.length,
    ),
    normalMedium: normal
      .filter((p) => p.row.result?.riskLevel === "medium")
      .map((p) => p.row.caseId),
    insufficientDetection: ratio(
      insufficient.filter((p) => p.row.status === 422).length,
      insufficient.length,
    ),
    insufficientFalseSuccess: insufficient
      .filter((p) => p.row.status === 200)
      .map((p) => p.row.caseId),
    expectationMismatches: pairs
      .filter(
        ({ row, c }) =>
          row.result &&
          (!c.analyzable ||
            !c.acceptableLevels.includes(row.result.riskLevel) ||
            !c.acceptableCategories.includes(row.result.category) ||
            !c.scoreRange ||
            row.result.riskScore < c.scoreRange[0] ||
            row.result.riskScore > c.scoreRange[1]),
      )
      .map((p) => p.row.caseId),
    latencyMs: {
      n: times.length,
      all: rows.map((r) => ({
        caseId: r.caseId,
        status: r.status,
        ms: r.durationMs,
      })),
      p50: times.length ? times[Math.ceil(times.length * 0.5) - 1] : null,
      p95: times.length ? times[Math.ceil(times.length * 0.95) - 1] : null,
    },
    estimatedCostUsd: rows.every((r) => r.estimatedCostUsd !== undefined)
      ? rows.reduce((sum, r) => sum + r.estimatedCostUsd!, 0)
      : null,
    humanReview:
      "pending: visible evidence, invented claims, safety advice, language and instruction-following require review",
    releaseGate: "NOT_PASSED",
  };
}
