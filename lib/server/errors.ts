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
  provider_rate_limit: "分析服務忙碌，請稍後再試。",
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
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly kind: FailureKind = "input",
    public readonly retryAfter?: string,
  ) {
    super(code);
  }
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
  if (error.code === "provider_rate_limit" && retryAfter)
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
