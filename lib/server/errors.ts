import "server-only";
import {
  ERROR_RULES,
  type ErrorCode,
  validRetryAfter,
} from "../contracts/analysis";
const messages: Record<ErrorCode, string> = {
  invalid_request: "請提交一張圖片與有效欄位。",
  invalid_image: "圖片無效或已損壞，請重新選圖。",
  image_too_large: "圖片或請求超出大小限制，請選擇較小的圖片。",
  unsupported_image_format: "僅接受單張非動畫 JPEG 或 PNG，請確認圖片格式。",
  insufficient_evidence:
    "目前圖片資訊不足，請提供文字清楚且包含完整上下文的截圖。",
  provider_rate_limit: "AI 供應商目前請求較多，請稍後再試。",
  client_rate_limited: "操作較頻繁，請稍後再試。",
  daily_quota_exceeded:
    "目前網路的今日分析額度已用完，將於台北時間 00:00 重置。同一家庭、公司或公共網路可能共用額度。",
  global_quota_exceeded:
    "今日測試額度已用完，將於台北時間 00:00 重置，請明天再來。",
  analysis_busy: "目前分析人數較多，請稍後再試。",
  analysis_disabled: "分析功能暫時停止，其他功能與意見回饋仍可使用。",
  rate_limit_unavailable: "目前無法確認分析額度，分析暫時停止，請稍後再試。",
  analysis_failed: "目前無法產生有效分析，請換圖或稍後再試。",
  provider_unavailable: "分析服務暫時無法使用，請稍後再試。",
};
export type FailureKind =
  | "input"
  | "configuration"
  | "network"
  | "timeout"
  | "cancelled"
  | "rate_limit"
  | "schema"
  | "refusal"
  | "unknown";
export const SCHEMA_FAILURE_STAGES = [
  "response_incomplete",
  "output_json_parse",
  "envelope",
  "provider_outcome",
  "structural_debris",
  "public_contract",
  "provider_adapter",
] as const;
export type SchemaFailureStage = (typeof SCHEMA_FAILURE_STAGES)[number];
export const SCHEMA_FAILURE_FIELDS = [
  "summary",
  "signal_reason",
  "recommendation",
] as const;
export type SchemaFailureField = (typeof SCHEMA_FAILURE_FIELDS)[number];
export const PROVIDER_RESPONSE_STATUSES = [
  "completed",
  "incomplete",
  "failed",
  "cancelled",
  "queued",
  "in_progress",
  "other",
] as const;
export type ProviderResponseStatus =
  (typeof PROVIDER_RESPONSE_STATUSES)[number];
export const PROVIDER_INCOMPLETE_REASONS = [
  "max_output_tokens",
  "max_messages",
  "content_filter",
  "steered",
  "other",
  "none",
] as const;
export type ProviderIncompleteReason =
  (typeof PROVIDER_INCOMPLETE_REASONS)[number];
export interface ProviderFailureDiagnostics {
  providerResponseStatus?: ProviderResponseStatus;
  providerIncompleteReason?: ProviderIncompleteReason;
  providerOutputTextPresent?: boolean;
  providerInputTokens?: number;
  providerOutputTokens?: number;
}
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly kind: FailureKind = "input",
    public readonly retryAfter?: string,
    public readonly schemaFailureStage?: SchemaFailureStage,
    public readonly schemaFailureField?: SchemaFailureField,
    public readonly providerDiagnostics?: Readonly<ProviderFailureDiagnostics>,
  ) {
    super(code);
  }
}
export function schemaFailure(
  stage: SchemaFailureStage,
  field?: SchemaFailureField,
  providerDiagnostics?: Readonly<ProviderFailureDiagnostics>,
): AppError {
  return new AppError(
    "analysis_failed",
    "schema",
    undefined,
    stage,
    field,
    providerDiagnostics,
  );
}
export function errorResponse(
  error: AppError,
  requestId: string,
  status?: number,
  head = false,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  });
  if (status === 405) headers.set("Allow", "POST");
  const retryAfter = validRetryAfter(error.retryAfter ?? null);
  if (ERROR_RULES[error.code].statuses[0] === 429 && retryAfter)
    headers.set("Retry-After", retryAfter);
  return new Response(
    head
      ? null
      : JSON.stringify({
          error: {
            code: error.code,
            message: messages[error.code],
            retryable: ERROR_RULES[error.code].retryable,
          },
        }),
    { status: status ?? ERROR_RULES[error.code].statuses[0], headers },
  );
}
