import { describe, expect, it } from "vitest";
import {
  KNOWN_SERIALIZATION_TAILS,
  detectKnownSerializationTail,
  normalizeOutcome,
  normalizeOutcomeWithMetadata,
  normalizeProviderText,
  validateNormalizedProviderText,
} from "../../lib/server/ai/normalize";
import { AppError } from "../../lib/server/errors";
import { normal } from "../../fixtures/demo";

const outcome = {
  status: "analyzed" as const,
  riskScore: normal.riskScore,
  category: normal.category,
  summary: normal.summary,
  signals: normal.signals,
  recommendations: normal.recommendations,
};

function expectStructuralFailure(run: () => unknown, field = "summary") {
  try {
    run();
    throw new Error("Expected structural debris failure");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "analysis_failed",
      kind: "schema",
      schemaFailureStage: "structural_debris",
      schemaFailureField: field,
    });
  }
}

describe("deterministic structured text normalization", () => {
  it.each([
    ["可疑內容。}],", "可疑內容。"],
    ["請勿提供驗證碼。]},", "請勿提供驗證碼。"],
    ["請改由官方管道確認！},]", "請改由官方管道確認！"],
    ["請先停止付款？}},", "請先停止付款？"],
    ["不要點擊連結。]],", "不要點擊連結。"],
  ])("removes one allowlisted serialization tail: %s", (input, expected) => {
    expect(normalizeProviderText(input, "summary")).toEqual({
      text: expected,
      applied: true,
    });
  });

  it.each(["   ", "\t", "\n", "\r\n", "　"])(
    "trims outer %j after a known tail",
    (whitespace) => {
      expect(
        normalizeProviderText(`可疑內容。}],${whitespace}`, "summary"),
      ).toEqual({
        text: "可疑內容。",
        applied: true,
      });
    },
  );

  it("records every normalization without exposing text or signal indexes", () => {
    const normalized = normalizeOutcomeWithMetadata({
      ...outcome,
      summary: "可疑內容。}],",
      signals: [
        { type: "other", severity: "low", reason: "請勿提供驗證碼。]}," },
      ],
      recommendations: ["請改由官方管道確認！},]"],
    });
    expect(normalized.result).toMatchObject({
      summary: "可疑內容。",
      signals: [{ reason: "請勿提供驗證碼。" }],
      recommendations: ["請改由官方管道確認！"],
    });
    expect(normalized.normalization).toEqual({
      applied: true,
      kind: "serialization_tail",
      count: 3,
      fields: ["summary", "signal_reason", "recommendation"],
    });
  });

  it("reports a clean outcome without changing text", () => {
    const normalized = normalizeOutcomeWithMetadata(outcome);
    expect(normalized.result).toEqual(normal);
    expect(normalized.normalization).toEqual({
      applied: false,
      count: 0,
      fields: [],
    });
  });

  it.each(["foobar}],", '{"a":[{"b":1}]},', "可疑內容。}],}],", "}],"])(
    "fails closed for ambiguous or recursive debris: %s",
    (text) => {
      expectStructuralFailure(() => normalizeProviderText(text, "summary"));
    },
  );

  it.each([
    '{"ok":true}',
    '{"a":[1,2]}',
    'JSON 範例為 {"ok":true}',
    "值為 [1,2]",
    '對方貼出 {"a":[1,2]}',
    "網址中包含 ] 符號",
    "訊息中包含 }",
    "}",
    "]",
    "普通逗號結尾文字,",
    "全形逗號結尾文字，",
  ])("does not rewrite a legitimate or unknown ending: %s", (text) => {
    expect(detectKnownSerializationTail(text)).toBeUndefined();
    expect(normalizeProviderText(text, "summary")).toEqual({
      text,
      applied: false,
    });
  });

  it("uses only the five evidenced serialization tails", () => {
    expect(KNOWN_SERIALIZATION_TAILS).toEqual([
      "}],",
      "]},",
      "},]",
      "}},",
      "]],",
    ]);
    expect(detectKnownSerializationTail("文字。},")).toBeUndefined();
    expect(detectKnownSerializationTail("文字。],")).toBeUndefined();
  });

  it("revalidates Unicode code-point boundaries after cleanup", () => {
    expect(normalizeProviderText("。}],", "summary").text).toBe("。");
    const max = `${"字".repeat(299)}。`;
    expect([
      ...normalizeProviderText(`${max}}],`, "summary").text,
    ]).toHaveLength(300);
    expectStructuralFailure(() =>
      normalizeProviderText(`${"字".repeat(300)}。}],`, "summary"),
    );
    const emojiMax = `${"😀".repeat(299)}。`;
    expect(validateNormalizedProviderText(emojiMax, "summary")).toBe(emojiMax);
    expectStructuralFailure(() =>
      validateNormalizedProviderText(`${"😀".repeat(300)}。`, "summary"),
    );
  });

  it("retains legitimate JSON endings through the full outcome contract", () => {
    for (const summary of [
      '{"ok":true}',
      '{"a":[1,2]}',
      'JSON 範例為 {"ok":true}',
      "值為 [1,2]",
      '對方貼出 {"a":[1,2]}',
    ])
      expect(normalizeOutcome({ ...outcome, summary }).summary).toBe(summary);
  });
});
