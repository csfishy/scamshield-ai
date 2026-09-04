import "server-only";
import { z } from "zod";
import { analysisFields } from "../../contracts/analysis";
import type { ValidatedImage } from "../image-validation";
export const providerOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("analyzed"),
    ...analysisFields,
    riskLevel: z.string().optional(),
  }),
  z.strictObject({
    status: z.literal("insufficient_evidence"),
    reason: z.enum(["unreadable", "irrelevant", "missing_context", "refusal"]),
  }),
]);
export type ProviderOutcome = z.infer<typeof providerOutcomeSchema>;
export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}
export interface AnalysisContext {
  requestId: string;
  source: "image" | "screenshot";
  language: string;
  deadline: number;
  signal: AbortSignal;
  promptVersion: string;
}
export interface ProviderResult {
  outcome: unknown;
  usage?: ProviderUsage;
}
export interface ScamAIProvider {
  analyze(
    image: ValidatedImage,
    context: AnalysisContext,
  ): Promise<ProviderResult>;
}
