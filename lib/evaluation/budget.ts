export const EVALUATION_PRICING = Object.freeze({
  checkedAt: "2026-09-05",
  model: "gpt-4.1-mini-2025-04-14",
  inputPerMillionUsd: 0.4,
  outputPerMillionUsd: 1.6,
});

// OpenAI documents a 6,144-patch budget and a 1.62 multiplier for
// gpt-4.1-mini-2025-04-14 at high detail. The server accepts one image only.
export const IMAGE_PATCH_BUDGET = 6_144;
export const IMAGE_TOKEN_MULTIPLIER = 1.62;
export const IMAGE_INPUT_TOKEN_RESERVATION = Math.ceil(
  IMAGE_PATCH_BUDGET * IMAGE_TOKEN_MULTIPLIER,
);

// A UTF-8 byte is a conservative ceiling for application-controlled text
// tokens. Keep a separate allowance for API/SDK framing that is not present in
// our prompt, input_text, or JSON schema strings. Paid tools fail closed if the
// checked application text grows beyond this reviewed bound.
export const APPLICATION_TEXT_BYTE_LIMIT = 16_384;
export const PROVIDER_FRAMING_TOKEN_ALLOWANCE = 4_096;

export interface EvaluationReservation {
  applicationTextBytes: number;
  applicationTextByteLimit: number;
  providerFramingTokenAllowance: number;
  imageInputTokens: number;
  inputTokensPerCall: number;
  outputTokensPerCall: number;
  perCallUsd: number;
  requiredBudgetUsd: number;
}

export function applicationTextBytes(parts: readonly string[]): number {
  return Buffer.byteLength(parts.join("\n"), "utf8");
}

export function createEvaluationReservation(options: {
  model: string;
  applicationTextBytes: number;
  outputTokensPerCall: number;
  calls: number;
}): EvaluationReservation {
  if (options.model !== EVALUATION_PRICING.model)
    throw new Error("Evaluation budget model must be reviewed for this model");
  if (
    !Number.isInteger(options.applicationTextBytes) ||
    options.applicationTextBytes < 0 ||
    options.applicationTextBytes > APPLICATION_TEXT_BYTE_LIMIT
  )
    throw new Error("Evaluation application text exceeds reviewed byte limit");
  if (
    !Number.isInteger(options.outputTokensPerCall) ||
    options.outputTokensPerCall <= 0 ||
    !Number.isInteger(options.calls) ||
    options.calls <= 0
  )
    throw new Error("Evaluation reservation inputs must be positive integers");

  const inputTokensPerCall =
      APPLICATION_TEXT_BYTE_LIMIT +
      PROVIDER_FRAMING_TOKEN_ALLOWANCE +
      IMAGE_INPUT_TOKEN_RESERVATION,
    perCallUsd =
      (inputTokensPerCall * EVALUATION_PRICING.inputPerMillionUsd +
        options.outputTokensPerCall * EVALUATION_PRICING.outputPerMillionUsd) /
      1e6;

  return {
    applicationTextBytes: options.applicationTextBytes,
    applicationTextByteLimit: APPLICATION_TEXT_BYTE_LIMIT,
    providerFramingTokenAllowance: PROVIDER_FRAMING_TOKEN_ALLOWANCE,
    imageInputTokens: IMAGE_INPUT_TOKEN_RESERVATION,
    inputTokensPerCall,
    outputTokensPerCall: options.outputTokensPerCall,
    perCallUsd,
    requiredBudgetUsd: Math.ceil(options.calls * perCallUsd * 100) / 100,
  };
}
