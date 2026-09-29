"use client";

import { useState } from "react";
import {
  buildFeedbackMailto,
  buildFeedbackUrl,
  validRequestId,
  type FeedbackConfig,
  type FeedbackType,
} from "@/lib/feedback";

export function CopyValue({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  return (
    <div className="copy-value">
      <span>
        {label}：<code>{value}</code>
      </span>
      <button
        className="text-button"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus(`已複製${label}`);
          } catch {
            setStatus(`無法自動複製，請長按或選取上方${label}複製。`);
          }
        }}
      >
        複製{label}
      </button>
      <span role="status" className="copy-status">
        {status}
      </span>
    </div>
  );
}

export function RequestReference({ requestId }: { requestId?: string }) {
  const id = validRequestId(requestId);
  return id ? (
    <CopyValue value={id} label="問題編號" />
  ) : (
    <p className="muted request-reference">
      未取得問題編號；仍可描述操作問題。
    </p>
  );
}

export function FeedbackLinks({
  config,
  requestId,
  label = "意見回饋",
  type = "其他",
}: {
  config: FeedbackConfig;
  requestId?: string;
  label?: string;
  type?: FeedbackType;
}) {
  const formUrl = buildFeedbackUrl(config, requestId, type);
  const mailto = buildFeedbackMailto(config.contactEmail, requestId);
  return (
    <details className="feedback-panel">
      <summary>{label}</summary>
      <div className="feedback-content">
        <p>
          回饋用於排查問題與改善服務，誤判回報將先由管理者人工覆核。請勿填入原始截圖、完整分析內容、驗證碼或他人的個人資料。
        </p>
        {formUrl ? (
          <>
            <p>
              下一步將前往外部 Google
              表單。僅可能預填問題編號、網站版本與回饋類型；是否送出由你決定。
            </p>
            <a
              className="button button-secondary"
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              開啟 Google 表單（新分頁）
            </a>
            <p className="muted">
              iPhone Safari 或主畫面 App 可能另開瀏覽器；完成後可回到原頁面。
            </p>
          </>
        ) : (
          <p>Google 表單尚未開放；本頁不會代為送出回饋。</p>
        )}
        {mailto && config.contactEmail && (
          <>
            <a className="button button-ghost" href={mailto}>
              使用 Email 聯絡
            </a>
            <CopyValue value={config.contactEmail} label="Email" />
          </>
        )}
        {!formUrl && !mailto && (
          <p>回饋聯絡管道尚待管理者設定，目前無法提交回饋。</p>
        )}
        <p className="muted">
          網站版本：{config.buildId ?? "尚未提供"}。回饋保存與刪除方式請先閱讀
          <a href="/privacy">隱私說明</a>。
        </p>
        {!!config.configurationIssues?.length && (
          <p role="status">
            開發設定無效：{config.configurationIssues.join("、")}
            。已停用對應連結。
          </p>
        )}
      </div>
    </details>
  );
}
