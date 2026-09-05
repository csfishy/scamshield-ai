import { expect, it } from "vitest";
import {
  manifestSchema,
  summarize,
  type EvaluationCase,
} from "../../lib/evaluation/schema";
import { normal } from "../../fixtures/demo";
import {
  APPLICATION_TEXT_BYTE_LIMIT,
  applicationTextBytes,
  createEvaluationReservation,
  IMAGE_INPUT_TOKEN_RESERVATION,
} from "../../lib/evaluation/budget";
const sample: EvaluationCase = {
  caseId: "normal-test",
  image: "images/a.png",
  family: "family",
  source: "authored",
  license: "authored",
  deidentified: true,
  language: "zh-TW",
  group: "normal",
  split: "development",
  demo: false,
  analyzable: true,
  acceptableLevels: ["low"],
  scoreRange: [0, 29],
  acceptableCategories: ["none"],
  visibleEvidence: ["hello"],
  forbiddenInferences: ["unverified claim"],
  safeRecommendations: ["verify independently"],
  annotator: null,
  reviewer: null,
  reviewStatus: "pending",
};
it("does not invent labels or allow split family leakage", () => {
  expect(
    manifestSchema.safeParse({ revision: "1", cases: [sample] }).success,
  ).toBe(true);
  expect(
    manifestSchema.safeParse({
      revision: "1",
      cases: [{ ...sample, reviewStatus: "approved" }],
    }).success,
  ).toBe(false);
  expect(
    manifestSchema.safeParse({
      revision: "1",
      cases: [sample, { ...sample, caseId: "other", split: "holdout" }],
    }).success,
  ).toBe(false);
});
it("reports denominators, failures, unknown costs and human gates honestly", () => {
  const cases = [
    sample,
    {
      ...sample,
      caseId: "high-test",
      group: "high_risk" as const,
      acceptableLevels: ["high"] as ["high"],
      scoreRange: [70, 100] as [number, number],
    },
  ];
  const summary = summarize(cases, [
    {
      caseId: "normal-test",
      status: 503,
      durationMs: 20000,
      humanReview: "pending",
    },
    {
      caseId: "high-test",
      status: 200,
      result: normal,
      durationMs: 100,
      humanReview: "pending",
    },
  ]);
  expect(summary.analyzableSuccess).toEqual({
    numerator: 1,
    denominator: 2,
    rate: 0.5,
  });
  expect(summary.highUnderestimates).toEqual(["high-test"]);
  expect(summary.estimatedCostUsd).toBeNull();
  expect(summary.latencyMs.all).toHaveLength(2);
  expect(summary.releaseGate).toBe("NOT_PASSED");
});

it("reserves a bounded vision request and rounds the authorized total up", () => {
  expect(IMAGE_INPUT_TOKEN_RESERVATION).toBe(9954);
  expect(applicationTextBytes(["繁體中文", "schema"])).toBe(19);
  const reservation = createEvaluationReservation({
    model: "gpt-4.1-mini-2025-04-14",
    applicationTextBytes: 8_000,
    outputTokensPerCall: 2_400,
    calls: 40,
  });
  expect(reservation.inputTokensPerCall).toBe(30_434);
  expect(reservation.perCallUsd).toBeCloseTo(0.0160136, 10);
  expect(reservation.requiredBudgetUsd).toBe(0.65);
});

it("fails closed when the model or application text exceeds reviewed bounds", () => {
  expect(() =>
    createEvaluationReservation({
      model: "different-model",
      applicationTextBytes: 1,
      outputTokensPerCall: 2_400,
      calls: 1,
    }),
  ).toThrow(/model must be reviewed/);
  expect(() =>
    createEvaluationReservation({
      model: "gpt-4.1-mini-2025-04-14",
      applicationTextBytes: APPLICATION_TEXT_BYTE_LIMIT + 1,
      outputTokensPerCall: 2_400,
      calls: 1,
    }),
  ).toThrow(/text exceeds reviewed byte limit/);
});
