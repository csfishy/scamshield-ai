import {
  parseAnalysisResponse,
  validRetryAfter,
  type AnalysisError,
  type AnalysisResult,
  type ErrorCode,
} from "../contracts/analysis";

export type ClientErrorKind =
  | "contract"
  | "access_denied"
  | "request_too_large"
  | "rate_limited"
  | "service_unavailable"
  | "invalid_response"
  | "network"
  | "timeout"
  | "cancelled";

export class AnalysisClientError extends Error {
  readonly kind: ClientErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly code?: ErrorCode;
  readonly retryAfter?: string;

  constructor(
    message: string,
    options: {
      kind: ClientErrorKind;
      retryable: boolean;
      status?: number;
      code?: ErrorCode;
      retryAfter?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "AnalysisClientError";
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.status = options.status;
    this.code = options.code;
    this.retryAfter = options.retryAfter;
  }
}

type AnalyzeOptions = {
  signal?: AbortSignal;
  timeoutMs: number;
  fetcher?: typeof fetch;
};

function platformError(response: Response): AnalysisClientError {
  const retryAfter = validRetryAfter(response.headers.get("retry-after"));

  if (response.status === 413) {
    return new AnalysisClientError(
      "圖片或請求大小超過平台限制，請選擇較小的截圖。",
      {
        kind: "request_too_large",
        retryable: false,
        status: response.status,
      },
    );
  }

  if (response.status === 429) {
    return new AnalysisClientError("目前分析請求較多，請稍後再手動重試。", {
      kind: "rate_limited",
      retryable: true,
      status: response.status,
      retryAfter,
    });
  }

  if ([502, 503, 504].includes(response.status)) {
    return new AnalysisClientError(
      "即時分析目前未啟用或服務暫時不可用，請稍後再手動重試。",
      {
        kind: "service_unavailable",
        retryable: true,
        status: response.status,
      },
    );
  }

  if ([401, 403].includes(response.status)) {
    return new AnalysisClientError(
      "目前無權存取這個分析環境，請向部署管理者確認存取設定。",
      {
        kind: "access_denied",
        retryable: false,
        status: response.status,
      },
    );
  }

  return new AnalysisClientError(
    response.ok
      ? "分析服務回傳的資料格式無法驗證，結果未顯示。"
      : "分析服務回傳非預期內容，請稍後再試或聯絡維護人員。",
    {
      kind: "invalid_response",
      retryable: false,
      status: response.status,
    },
  );
}

function contractError(
  response: Response,
  value: AnalysisError,
): AnalysisClientError {
  const retryAfter =
    value.error.code === "provider_rate_limit"
      ? validRetryAfter(response.headers.get("retry-after"))
      : undefined;

  return new AnalysisClientError(value.error.message, {
    kind: "contract",
    retryable: value.error.retryable,
    status: response.status,
    code: value.error.code,
    retryAfter,
  });
}

async function parseRemoteResponse(
  response: Response,
): Promise<AnalysisResult> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw platformError(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new AnalysisClientError(
      "分析服務回傳的資料格式無法驗證，結果未顯示。",
      {
        kind: "invalid_response",
        retryable: false,
        status: response.status,
        cause: error,
      },
    );
  }

  let parsed: AnalysisResult | AnalysisError;
  try {
    parsed = parseAnalysisResponse(response.status, body);
  } catch (error) {
    throw new AnalysisClientError(
      "分析服務回傳的資料格式無法驗證，結果未顯示。",
      {
        kind: "invalid_response",
        retryable: false,
        status: response.status,
        cause: error,
      },
    );
  }

  if ("error" in parsed) throw contractError(response, parsed);
  return parsed;
}

export async function analyzeRemoteImage(
  file: File,
  { signal, timeoutMs, fetcher = fetch }: AnalyzeOptions,
): Promise<AnalysisResult> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const form = new FormData();
  form.set("image", file);
  form.set("source", "screenshot");
  form.set("language", "zh-TW");

  try {
    let response: Response;
    try {
      response = await fetcher("/analyze", {
        method: "POST",
        body: form,
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        if (timedOut) {
          throw new AnalysisClientError(
            "分析等待時間超過 25 秒，請確認網路後再手動重試。",
            { kind: "timeout", retryable: true, cause: error },
          );
        }
        throw new AnalysisClientError("分析已取消。", {
          kind: "cancelled",
          retryable: true,
          cause: error,
        });
      }
      throw new AnalysisClientError(
        "目前無法連線到分析服務，請確認網路後再手動重試。",
        { kind: "network", retryable: true, cause: error },
      );
    }
    return await parseRemoteResponse(response);
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new AnalysisClientError(
          "分析等待時間超過 25 秒，請確認網路後再手動重試。",
          { kind: "timeout", retryable: true, cause: error },
        );
      }
      throw new AnalysisClientError("分析已取消。", {
        kind: "cancelled",
        retryable: true,
        cause: error,
      });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
