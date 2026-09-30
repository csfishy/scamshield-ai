"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { analysisSchema, type AnalysisResult } from "@/lib/contracts/analysis";
import {
  DEMO_NOTICE,
  demoFixtures,
  insufficientEvidence,
} from "@/fixtures/demo";
import {
  AnalysisClientError,
  analyzeRemoteImage,
} from "@/lib/client/analysis-service";
import {
  formatFileSize,
  ImageSelectionError,
  validateImageFile,
  type ClientImageInfo,
} from "@/lib/client/image-file";
import { AnalysisResultView } from "./AnalysisResult";
import {
  FeedbackLinks,
  RequestReference,
} from "@/components/feedback/FeedbackLinks";
import type { FeedbackConfig } from "@/lib/feedback";

export type AnalysisMode = "mock" | "remote";
type DemoKey = keyof typeof demoFixtures | "insufficientEvidence";
type Phase = "idle" | "reading" | "ready" | "analyzing" | "success" | "error";
type ViewError = {
  area: "selection" | "analysis";
  title: string;
  message: string;
  retryable: boolean;
  retryAfter?: string;
  code?: string;
  requestId?: string;
};

const demoOptions: { key: DemoKey; label: string; detail: string }[] = [
  { key: "fakeDelivery", label: "假物流", detail: "高風險示範" },
  {
    key: "fakeCustomerService",
    label: "假客服",
    detail: "OTP 與轉移聯絡示範",
  },
  { key: "normal", label: "一般內容", detail: "低風險示範" },
  {
    key: "insufficientEvidence",
    label: "資訊不足",
    detail: "無法分析示範",
  },
];

function waitForDemo(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, 700);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function retryAfterLabel(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return `建議至少等待 ${Number(value)} 秒後再試。`;
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return `建議在 ${date.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    })} 後再試。`;
  }
  return undefined;
}

function IconImage() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="7" y="9" width="34" height="30" rx="7" />
      <circle cx="18" cy="20" r="4" />
      <path d="m11 34 9-9 6 6 4-4 7 7" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M15 24V15h9M40 15h9v9M49 40v9h-9M24 49h-9v-9" />
      <rect x="22" y="22" width="20" height="20" rx="5" />
      <circle cx="44" cy="44" r="8" />
      <path d="m50 50 6 6" />
    </svg>
  );
}

function IconShield({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? "icon-shield is-compact" : "icon-shield"}
      viewBox="0 0 48 52"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24 3 42 10v13c0 12.2-7.2 21.4-18 26C13.2 44.4 6 35.2 6 23V10L24 3Z" />
      <path d="m16.5 25 5 5 10.5-12" />
    </svg>
  );
}

function IconValue({ kind }: { kind: "shield" | "people" | "leaf" }) {
  if (kind === "people") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="12" cy="11" r="4" />
        <circle cx="22.5" cy="13" r="3" />
        <path d="M4.5 26c.5-5.2 3-7.5 7.5-7.5s7 2.3 7.5 7.5M19 20c4.5-.3 7 1.7 7.8 6" />
      </svg>
    );
  }
  if (kind === "leaf") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M26.5 5.5C15.3 5.2 7.2 10.2 8 19.1c.4 4.6 4.8 7.6 9 5.8 7-2.9 8.6-10.8 9.5-19.4Z" />
        <path d="M5.5 27c4.2-5.1 8.7-9.1 14.4-12.3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="m16 3.5 10 4v7.2c0 6.8-4 11.9-10 14.4-6-2.5-10-7.6-10-14.4V7.5l10-4Z" />
      <path d="m11.5 16 3 3 6.5-7" />
    </svg>
  );
}

export function AnalysisWorkspace({
  initialMode,
  timeoutMs,
  feedbackConfig,
  showDemoLink = true,
  showModeNotice = true,
  isHomepage = false,
}: {
  initialMode: AnalysisMode;
  timeoutMs: number;
  feedbackConfig: FeedbackConfig;
  showDemoLink?: boolean;
  showModeNotice?: boolean;
  isHomepage?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageInfo, setImageInfo] = useState<ClientImageInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [demoKey, setDemoKey] = useState<DemoKey>("fakeDelivery");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [error, setError] = useState<ViewError | null>(null);
  const [liveMessage, setLiveMessage] = useState("尚未選擇圖片");

  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const selectionErrorRef = useRef<HTMLDivElement | null>(null);

  const replacePreviewUrl = useCallback((next: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }, []);

  useEffect(
    () => () => {
      generation.current += 1;
      activeController.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (
      phase !== "success" &&
      !(phase === "error" && error?.area === "analysis")
    ) {
      return;
    }
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    if (!mobile) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.requestAnimationFrame(() => {
      resultHeadingRef.current?.focus({ preventScroll: true });
      resultHeadingRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }, [error?.area, phase]);

  const clearOutcome = () => {
    setResult(null);
    setError(null);
    setRequestId(undefined);
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const currentGeneration = ++generation.current;
    activeController.current?.abort();
    activeController.current = null;
    busy.current = false;
    replacePreviewUrl(null);
    setSelectedFile(null);
    setImageInfo(null);
    clearOutcome();
    setPhase("reading");
    setLiveMessage("正在讀取所選圖片…");

    const objectUrl = URL.createObjectURL(file);
    try {
      const info = await validateImageFile(file, objectUrl);
      if (currentGeneration !== generation.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      replacePreviewUrl(objectUrl);
      setSelectedFile(file);
      setImageInfo(info);
      setPhase("ready");
      setLiveMessage(`已選擇 ${file.name}，可以開始分析。`);
    } catch (caught) {
      URL.revokeObjectURL(objectUrl);
      if (currentGeneration !== generation.current) return;
      const message =
        caught instanceof ImageSelectionError
          ? caught.message
          : "無法讀取這張圖片，請改選有效的 JPEG 或 PNG。";
      setError({
        area: "selection",
        title: "無法使用這張圖片",
        message,
        retryable: false,
      });
      setPhase("error");
      setLiveMessage(message);
      window.requestAnimationFrame(() => selectionErrorRef.current?.focus());
    }
  };

  const reset = () => {
    generation.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    busy.current = false;
    replacePreviewUrl(null);
    setSelectedFile(null);
    setImageInfo(null);
    clearOutcome();
    setPhase("idle");
    setLiveMessage("已清除圖片與分析結果。請選擇另一張截圖。");
    fileInputRef.current?.focus();
  };

  const cancelAnalysis = () => {
    generation.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    busy.current = false;
    clearOutcome();
    setPhase(selectedFile ? "ready" : "idle");
    setLiveMessage(
      initialMode === "remote"
        ? "已取消等待；未完成的分析不會計入成功分析額度。你可以重新開始或選擇另一張圖片。"
        : "已取消分析。你可以重新開始或選擇另一張圖片。",
    );
  };

  const analyze = async () => {
    if (!selectedFile || busy.current) return;
    busy.current = true;
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    activeController.current?.abort();
    activeController.current = controller;
    clearOutcome();
    setPhase("analyzing");
    setLiveMessage(
      initialMode === "mock"
        ? "正在載入本機示範資料…"
        : "正在安全上傳並分析圖片…",
    );

    try {
      let nextResult: AnalysisResult;
      if (initialMode === "mock") {
        await waitForDemo(controller.signal);
        if (demoKey === "insufficientEvidence") {
          throw new AnalysisClientError(insufficientEvidence.error.message, {
            kind: "contract",
            retryable: false,
            status: 422,
            code: insufficientEvidence.error.code,
          });
        }
        nextResult = analysisSchema.parse(demoFixtures[demoKey]);
      } else {
        nextResult = await analyzeRemoteImage(selectedFile, {
          signal: controller.signal,
          timeoutMs,
          onResponseMetadata: (metadata) => {
            if (currentGeneration === generation.current)
              setRequestId(metadata.requestId);
          },
        });
      }

      if (currentGeneration !== generation.current) return;
      setResult(nextResult);
      setPhase("success");
      setLiveMessage(
        initialMode === "mock"
          ? `示範結果已載入：${DEMO_NOTICE}。`
          : "圖片分析完成，結果已顯示。",
      );
    } catch (caught) {
      if (currentGeneration !== generation.current) return;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setPhase("ready");
        setLiveMessage("已取消分析。你可以重新開始或選擇另一張圖片。");
        return;
      }
      const clientError =
        caught instanceof AnalysisClientError
          ? caught
          : new AnalysisClientError(
              "目前無法完成分析，且未顯示任何未驗證結果。",
              { kind: "invalid_response", retryable: false, cause: caught },
            );
      setError({
        area: "analysis",
        title:
          clientError.code === "insufficient_evidence"
            ? "圖片資訊不足"
            : "未能完成分析",
        message: clientError.message,
        retryable: clientError.retryable,
        retryAfter: retryAfterLabel(clientError.retryAfter),
        code: clientError.code,
        requestId: clientError.requestId,
      });
      setPhase("error");
      setLiveMessage(clientError.message);
    } finally {
      if (currentGeneration === generation.current) {
        busy.current = false;
        activeController.current = null;
      }
    }
  };

  const changeDemo = (key: DemoKey) => {
    if (busy.current) return;
    setDemoKey(key);
    clearOutcome();
    setPhase(selectedFile ? "ready" : "idle");
    setLiveMessage("已切換本機示範情境，尚未開始分析。");
  };

  const isAnalyzing = phase === "analyzing";
  const selectionError = error?.area === "selection" ? error : null;
  const analysisError = error?.area === "analysis" ? error : null;

  const actionControls = (
    <div className="action-row">
      <button
        className="button button-primary analyze-button"
        type="button"
        onClick={analyze}
        disabled={!selectedFile || phase === "reading" || isAnalyzing}
        aria-busy={isAnalyzing}
      >
        {isAnalyzing && <span className="spinner" aria-hidden="true" />}
        {!isAnalyzing && initialMode === "remote" && (
          <span className="button-sparkle" aria-hidden="true">
            ✦
          </span>
        )}
        {isAnalyzing
          ? initialMode === "mock"
            ? "正在載入示範…"
            : "正在分析…"
          : initialMode === "mock"
            ? "顯示 Demo 結果"
            : "開始 AI 分析"}
      </button>
      {isAnalyzing && (
        <button
          className="button button-ghost"
          type="button"
          onClick={cancelAnalysis}
        >
          取消
        </button>
      )}
    </div>
  );

  return (
    <div className={`page-frame ${isHomepage ? "homepage-frame" : ""}`}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="ScamShield AI 首頁">
          <span className="brand-mark" aria-hidden="true">
            <IconShield />
          </span>
          <span className="brand-copy">
            <strong>ScamShield AI</strong>
            <span>截圖防詐分析</span>
          </span>
        </Link>
        <span
          className={`mode-pill mode-${initialMode}`}
          aria-label={`目前模式：${initialMode === "mock" ? "本機 Demo" : "即時 AI 分析"}`}
        >
          <span className="mode-dot" aria-hidden="true" />
          {initialMode === "mock" ? "本機 Demo" : "即時 AI 分析"}
        </span>
      </header>

      {!isHomepage && (
        <nav className="site-nav" aria-label="網站導覽">
          <span className="beta-label">公開測試版 Beta</span>
          {showDemoLink && <Link href="/demo">本機 Demo</Link>}
          <Link href="/privacy">隱私說明</Link>
          <a href="#site-feedback">意見回饋</a>
        </nav>
      )}

      <main
        className={`analysis-main ${isHomepage ? "homepage-analysis-main" : ""}`}
        aria-label="ScamShield 分析工作區"
      >
        <div className="mobile-primary-stage">
          <section className="intro" aria-labelledby="page-title">
            {isHomepage && <div className="hero-scene" aria-hidden="true" />}
            <div className="intro-content">
              <p className="eyebrow">
                {isHomepage ? "A SAFER DIGITAL DAY" : "停一下，再確認"}
              </p>
              <h1
                id="page-title"
                aria-label={isHomepage ? "可疑截圖，先交給 AI 看看" : undefined}
              >
                {isHomepage && (
                  <span className="hero-title-primary" aria-hidden="true">
                    多一分確認，少一分風險
                  </span>
                )}
                <span
                  className={isHomepage ? "hero-title-secondary" : undefined}
                >
                  可疑截圖，先交給 AI 看看
                </span>
              </h1>
              <p className="intro-copy">
                在點擊連結、付款或提供驗證碼前，先整理圖片中的風險訊號與下一步行動。
              </p>
              {showModeNotice && (
                <div
                  className={`mode-notice mode-notice-${initialMode}`}
                  role="note"
                >
                  <span aria-hidden="true">i</span>
                  <p>
                    {initialMode === "mock" ? (
                      <>
                        <strong>本機 Demo：</strong> {DEMO_NOTICE}，不會呼叫{" "}
                        <code>/analyze</code>。
                      </>
                    ) : (
                      <>
                        <strong>即時模式：</strong>
                        按下「開始 AI 分析」後，圖片才會傳送至本服務的 Vercel
                        部署與 OpenAI；選圖預覽留在本機。
                      </>
                    )}
                  </p>
                </div>
              )}
              {isHomepage && (
                <ul className="value-props" aria-label="服務特色">
                  <li>
                    <span className="value-icon">
                      <IconValue kind="shield" />
                    </span>
                    <span>
                      <strong>快速辨識風險</strong>
                      <small>AI 即時分析</small>
                    </span>
                  </li>
                  <li>
                    <span className="value-icon">
                      <IconValue kind="people" />
                    </span>
                    <span>
                      <strong>保護你我家人</strong>
                      <small>少一個受害者</small>
                    </span>
                  </li>
                  <li>
                    <span className="value-icon">
                      <IconValue kind="leaf" />
                    </span>
                    <span>
                      <strong>更安心的數位生活</strong>
                      <small>從多一次確認開始</small>
                    </span>
                  </li>
                </ul>
              )}
            </div>
          </section>

          <div className="workspace-grid">
            <section
              className="panel upload-panel"
              aria-labelledby="upload-title"
            >
              <div className="section-heading">
                <span className="step-number" aria-hidden="true">
                  1
                </span>
                <div>
                  <h2 id="upload-title">選擇可疑截圖</h2>
                  <p>
                    {isHomepage
                      ? "上傳你覺得可疑的對話、簡訊、社群貼文或網頁截圖"
                      : "單張 JPEG 或 PNG，最大 4 MiB"}
                  </p>
                </div>
              </div>

              <div
                className={`upload-control ${previewUrl ? "has-preview" : "is-empty"}`}
              >
                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  aria-label={previewUrl ? "重新選擇可疑截圖" : "選擇可疑截圖"}
                  onChange={handleFileSelected}
                />
                {previewUrl ? (
                  <>
                    {/* Blob URLs remain local to this page and are revoked on replace/reset. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="image-preview"
                      src={previewUrl}
                      alt="所選可疑截圖的預覽"
                    />
                    <span className="replace-hint" aria-hidden="true">
                      點選或按 Enter 重新選圖
                    </span>
                  </>
                ) : (
                  <div className="upload-prompt" aria-hidden="true">
                    <span className="upload-icon">
                      <IconImage />
                    </span>
                    <strong>選擇一張可疑截圖</strong>
                    <span>支援 JPEG、PNG，最大 4 MiB</span>
                    <span className="button button-secondary">選擇截圖</span>
                  </div>
                )}
              </div>

              {selectedFile && imageInfo && (
                <div className="file-summary">
                  <span className="file-check" aria-hidden="true">
                    ✓
                  </span>
                  <span className="file-meta">
                    <strong title={selectedFile.name}>
                      {selectedFile.name}
                    </strong>
                    <small>
                      {formatFileSize(selectedFile.size)} ·{" "}
                      {imageInfo.mimeType === "image/png" ? "PNG" : "JPEG"} ·{" "}
                      {imageInfo.width}×{imageInfo.height}
                    </small>
                  </span>
                  <button
                    className="text-button"
                    type="button"
                    onClick={reset}
                    disabled={isAnalyzing}
                  >
                    移除
                  </button>
                </div>
              )}

              {selectionError && (
                <div
                  ref={selectionErrorRef}
                  className="status-card error-card"
                  role="alert"
                  tabIndex={-1}
                >
                  <span className="status-icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <strong>{selectionError.title}</strong>
                    <span>{selectionError.message}</span>
                  </div>
                </div>
              )}

              {isHomepage && actionControls}

              <p className="privacy-hint">
                <span aria-hidden="true">!</span>
                上傳前請先遮住不必要的姓名、電話、帳號、信用卡、OTP
                驗證碼與其他敏感資訊。
              </p>
              <div className="data-notice" role="note">
                <p>本工具為 Beta，可能誤判；低風險不代表安全。</p>
                <p>
                  服務記錄必要技術資料（問題編號、狀態、耗時及取得時的使用量）；IP
                  會轉換為代碼，供 Upstash Redis
                  進行短期防濫用與額度控制。外部回饋使用 Google 表單。
                  <Link href="/privacy">閱讀資料處理與隱私說明</Link>。
                </p>
                <p>
                  每個匿名裝置每日可完成 30
                  次分析；只計成功結果。另設共用網路與全站安全上限， 於台北時間
                  00:00 重置。
                </p>
              </div>

              {initialMode === "mock" && (
                <fieldset className="demo-picker">
                  <legend>選擇本機示範情境</legend>
                  <div className="demo-options">
                    {demoOptions.map((option) => (
                      <label
                        key={option.key}
                        className={demoKey === option.key ? "is-selected" : ""}
                      >
                        <input
                          type="radio"
                          name="demo-scenario"
                          value={option.key}
                          checked={demoKey === option.key}
                          onChange={() => changeDemo(option.key)}
                          disabled={isAnalyzing}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.detail}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {!isHomepage && actionControls}

              <p
                className="sr-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {liveMessage}
              </p>
            </section>
          </div>
        </div>

        <section
          className="panel result-panel"
          aria-labelledby="result-title"
          aria-busy={isAnalyzing}
        >
          <div className="section-heading">
            <span className="step-number" aria-hidden="true">
              2
            </span>
            <div>
              <h2 id="result-title" ref={resultHeadingRef} tabIndex={-1}>
                分析結果
              </h2>
              <p>風險、可疑原因與建議行動一次看懂</p>
            </div>
          </div>

          {isAnalyzing ? (
            <div className="result-loading" role="status" aria-live="polite">
              <span className="scan-animation" aria-hidden="true">
                <IconScan />
              </span>
              <strong>
                {initialMode === "mock"
                  ? "正在載入示範資料…"
                  : "正在分析可疑訊號…"}
              </strong>
              <span>請保留此頁面開啟；你仍可取消或直接換圖。</span>
            </div>
          ) : result ? (
            <>
              <AnalysisResultView
                result={result}
                isDemo={initialMode === "mock"}
              />
              {initialMode === "remote" && (
                <>
                  <RequestReference requestId={requestId} />
                  <FeedbackLinks
                    config={feedbackConfig}
                    requestId={requestId}
                    label="回報判斷問題"
                    type="判斷可能有誤"
                    variant="result"
                  />
                </>
              )}
              <button
                className="button button-secondary full-width"
                type="button"
                onClick={reset}
              >
                分析另一張圖片
              </button>
            </>
          ) : analysisError ? (
            <div className="analysis-error" role="alert">
              <span className="error-symbol" aria-hidden="true">
                !
              </span>
              <strong>{analysisError.title}</strong>
              <p>{analysisError.message}</p>
              {analysisError.code === "insufficient_evidence" && (
                <p className="error-guidance">
                  請改選文字清楚、範圍完整且包含前後文的截圖。
                </p>
              )}
              {analysisError.retryAfter && (
                <p className="error-guidance">{analysisError.retryAfter}</p>
              )}
              {initialMode === "remote" && (
                <RequestReference
                  requestId={analysisError.requestId ?? requestId}
                />
              )}
              <FeedbackLinks
                config={feedbackConfig}
                requestId={analysisError.requestId ?? requestId}
                label="回報問題"
                type="操作問題"
              />
              <div className="error-actions">
                {analysisError.retryable && (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={analyze}
                  >
                    手動重試
                  </button>
                )}
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  選擇其他圖片
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-result">
              <span className="scan-icon" aria-hidden="true">
                <IconScan />
              </span>
              <strong>分析結果將顯示在這裡</strong>
              <span>選擇截圖後，我們會整理風險、可疑原因與建議行動。</span>
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <span aria-hidden="true">!</span>
        <p>
          <strong>重要提醒：</strong>
          ScamShield
          僅提供風險輔助判斷。涉及金錢、帳號或個人資料時，請改用官方網站或電話再次查證。
        </p>
      </footer>
      <section id="site-feedback" aria-label="意見回饋管道">
        <FeedbackLinks config={feedbackConfig} />
      </section>
      {isHomepage && (
        <nav className="site-nav homepage-bottom-nav" aria-label="頁尾導覽">
          <span className="footer-brand">
            <IconShield compact />
            <span>
              <strong>ScamShield AI</strong>
              <small>截圖防詐分析</small>
            </span>
          </span>
          <span className="footer-links">
            <span className="beta-label">公開測試版 Beta</span>
            <Link href="/privacy">隱私說明</Link>
          </span>
        </nav>
      )}
    </div>
  );
}
