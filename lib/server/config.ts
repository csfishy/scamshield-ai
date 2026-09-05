import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
export const PROMPT_VERSION = "scam-analysis-v1";
export const MODEL = "gpt-4.1-mini-2025-04-14";
export const MAX_OUTPUT_TOKENS = 2400;
const ms = (fallback: number, max: number) =>
  z.preprocess(
    (v) =>
      v === undefined
        ? fallback
        : typeof v === "string" && /^\d+$/.test(v)
          ? Number(v)
          : v,
    z.number().int().min(1).max(max),
  );
const envSchema = z.object({
  ANALYSIS_MODE: z.enum(["mock", "remote"]).default("mock"),
  AI_PROVIDER: z.literal("openai").optional(),
  AI_MODEL: z.literal(MODEL).optional(),
  AI_API_KEY: z.string().trim().min(1).optional(),
  AI_TIMEOUT_MS: ms(15000, 15000),
  ANALYSIS_TIMEOUT_MS: ms(20000, 20000),
  PROMPT_VERSION: z.literal(PROMPT_VERSION).default(PROMPT_VERSION),
});
export type ServerConfig = {
  mode: "mock" | "remote";
  provider: "openai";
  model: typeof MODEL;
  apiKey?: string;
  providerTimeoutMs: number;
  apiTimeoutMs: number;
  promptVersion: typeof PROMPT_VERSION;
};
export function getConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const result = envSchema.safeParse({
    ...env,
    AI_PROVIDER: env.AI_PROVIDER || undefined,
    AI_MODEL: env.AI_MODEL || undefined,
    AI_API_KEY: env.AI_API_KEY || undefined,
    PROMPT_VERSION: env.PROMPT_VERSION || undefined,
  });
  if (!result.success)
    throw new AppError("provider_unavailable", "configuration");
  const v = result.data;
  if (
    v.ANALYSIS_MODE === "remote" &&
    (!v.AI_PROVIDER || !v.AI_MODEL || !v.AI_API_KEY)
  )
    throw new AppError("provider_unavailable", "configuration");
  if (v.AI_TIMEOUT_MS + 2000 > v.ANALYSIS_TIMEOUT_MS)
    throw new AppError("provider_unavailable", "configuration");
  return {
    mode: v.ANALYSIS_MODE,
    provider: "openai",
    model: MODEL,
    apiKey: v.AI_API_KEY,
    providerTimeoutMs: v.AI_TIMEOUT_MS,
    apiTimeoutMs: v.ANALYSIS_TIMEOUT_MS,
    promptVersion: v.PROMPT_VERSION,
  };
}
