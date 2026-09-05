import { describe, expect, it } from "vitest";
import {
  analysisSchema,
  errorSchema,
  ERROR_RULES,
  parseAnalysisResponse,
  riskLevelForScore,
  CATEGORIES,
  SIGNAL_TYPES,
  RISK_LEVELS,
  validRetryAfter,
} from "../../lib/contracts/analysis";
import { demoFixtures, normal } from "../../fixtures/demo";
describe("CONTRACT-01–07 strict v2", () => {
  it("all demo fixtures and boundaries", () => {
    Object.values(demoFixtures).forEach((v) =>
      expect(analysisSchema.parse(v)).toEqual(v),
    );
    [0, 29, 30, 69, 70, 100].forEach((score, i) =>
      expect(riskLevelForScore(score)).toBe(
        ["low", "low", "medium", "medium", "high", "high"][i],
      ),
    );
    for (const category of CATEGORIES)
      expect(analysisSchema.safeParse({ ...normal, category }).success).toBe(
        true,
      );
    for (const type of SIGNAL_TYPES)
      for (const severity of RISK_LEVELS)
        expect(
          analysisSchema.safeParse({
            ...normal,
            signals: [{ type, severity, reason: "依據" }],
          }).success,
        ).toBe(true);
  });
  it.each(["8", 1.5, -1, 101, NaN, Infinity, null])(
    "rejects invalid score %s",
    (score) =>
      expect(
        analysisSchema.safeParse({ ...normal, riskScore: score }).success,
      ).toBe(false),
  );
  it("rejects every missing/null field, nested extras, enum changes and contradictions", () => {
    for (const key of Object.keys(normal)) {
      const value = { ...normal } as Record<string, unknown>;
      delete value[key];
      expect(analysisSchema.safeParse(value).success).toBe(false);
      expect(analysisSchema.safeParse({ ...normal, [key]: null }).success).toBe(
        false,
      );
    }
    for (const changes of [
      { extra: 1 },
      { riskLevel: "LOW" },
      { category: "mystery" },
      { riskLevel: "high" },
      { riskScore: 70, riskLevel: "high" },
      { summary: "  " },
      { signals: [null] },
      { recommendations: [null] },
      { signals: [{ type: "other", severity: "low", reason: "x", extra: 1 }] },
    ])
      expect(analysisSchema.safeParse({ ...normal, ...changes }).success).toBe(
        false,
      );
  });
  it("array and Unicode code point limits", () => {
    const s = { type: "other", severity: "low", reason: "理由" };
    for (const n of [0, 10, 11])
      expect(
        analysisSchema.safeParse({ ...normal, signals: Array(n).fill(s) })
          .success,
      ).toBe(n <= 10);
    for (const n of [0, 1, 5, 6])
      expect(
        analysisSchema.safeParse({
          ...normal,
          recommendations: Array(n).fill("建議"),
        }).success,
      ).toBe(n >= 1 && n <= 5);
    for (const n of [300, 301])
      for (const text of ["字", "😀"]) {
        const value = " " + text.repeat(n) + " ";
        for (const changes of [
          { summary: value },
          { signals: [{ ...s, reason: value }] },
          { recommendations: [value] },
        ])
          expect(
            analysisSchema.safeParse({ ...normal, ...changes }).success,
          ).toBe(n === 300);
      }
  });
  it("exact error shape and status/retryable mapping", () => {
    for (const [code, rule] of Object.entries(ERROR_RULES)) {
      const body = {
        error: { code, message: "錯誤", retryable: rule.retryable },
      };
      rule.statuses.forEach((status) =>
        expect(parseAnalysisResponse(status, body)).toEqual(body),
      );
      expect(() => parseAnalysisResponse(200, body)).toThrow();
      expect(() => parseAnalysisResponse(502, body)).toThrow();
      expect(
        errorSchema.safeParse({
          error: { ...body.error, retryable: !rule.retryable },
        }).success,
      ).toBe(false);
      expect(errorSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
      expect(
        errorSchema.safeParse({ error: { ...body.error, extra: 1 } }).success,
      ).toBe(false);
    }
    expect(
      errorSchema.safeParse({
        error: { code: "unknown", message: "x", retryable: false },
      }).success,
    ).toBe(false);
  });
  it("Retry-After allows seconds and HTTP date only", () => {
    expect(validRetryAfter("30")).toBe("30");
    expect(validRetryAfter("Fri, 04 Sep 2026 12:00:00 GMT")).toBeDefined();
    for (const value of [null, "-1", "0.5", "tomorrow", "secret", "Sep 4 2026"])
      expect(validRetryAfter(value)).toBeUndefined();
  });
});
