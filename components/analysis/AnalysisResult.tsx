import type {
  AnalysisResult,
  RiskLevel,
  ScamCategory,
  ScamSignal,
} from "@/lib/contracts/analysis";

const riskLabels: Record<RiskLevel, string> = {
  low: "低風險",
  medium: "中度風險",
  high: "高風險",
};

const categoryLabels: Record<ScamCategory, string> = {
  none: "未觀察到明確詐騙類型",
  phishing: "網路釣魚",
  fake_customer_service: "假客服／假物流",
  investment_scam: "投資詐騙",
  impersonation: "冒充身分",
  account_theft: "帳號竊取",
  other: "其他詐騙風險",
  unknown: "類型尚不明確",
};

const signalLabels: Record<ScamSignal["type"], string> = {
  suspicious_link: "可疑連結",
  off_platform_contact: "轉移聯絡管道",
  credential_request: "索取敏感憑證",
  payment_request: "要求付款",
  urgency_or_threat: "催促或威脅",
  guaranteed_return: "保證獲利",
  impersonation_claim: "冒充身分",
  inconsistent_identity: "身分資訊矛盾",
  other: "其他訊號",
};

const severityLabels: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

function ResultIcon({ kind }: { kind: "risk" | "reasons" | "actions" }) {
  if (kind === "reasons") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M9 3.5h10l5 5V28H9a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z" />
        <path d="M19 3.5v6h5M11 15h8M11 20h8" />
      </svg>
    );
  }
  if (kind === "actions") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M23.5 18.5c1.7-1.8 2.7-4 2.7-6.4a10.2 10.2 0 0 0-20.4 0c0 3.7 2.1 6.4 4.5 8.7 1.1 1 1.6 2.1 1.7 3.2h8c.1-1.2.6-2.2 1.6-3.1l1.9-2.4Z" />
        <path d="M12 27.5h8M13 24h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="12" />
      <path d="M16 9v8M16 22.5v.5" />
    </svg>
  );
}

export function AnalysisResultView({
  result,
  isDemo,
}: {
  result: AnalysisResult;
  isDemo: boolean;
}) {
  return (
    <div className="result-content">
      {isDemo && (
        <div className="demo-result-notice" role="note">
          <span aria-hidden="true">i</span>
          <strong>本結果為示範資料，並未分析你選擇的圖片。</strong>
        </div>
      )}

      <div
        className={`risk-card risk-${result.riskLevel}`}
        role="status"
        aria-label={`分析結果：${riskLabels[result.riskLevel]}，風險分數 ${result.riskScore} 分`}
      >
        <span className="result-card-icon">
          <ResultIcon kind="risk" />
        </span>
        <div className="risk-main">
          <span className="risk-kicker">風險評估</span>
          <div className="risk-level-row">
            <strong>{riskLabels[result.riskLevel]}</strong>
            <span className="risk-score" aria-hidden="true">
              {result.riskScore} / 100
            </span>
          </div>
          <p>{result.summary}</p>
          <span className="risk-explainer">風險指標，非詐騙機率</span>
        </div>
      </div>

      <div className="summary-card">
        <span className="result-label">風險類型</span>
        <strong className="category">{categoryLabels[result.category]}</strong>
      </div>

      <section
        className="result-section signal-section"
        aria-labelledby="signals-title"
      >
        <div className="result-section-heading">
          <span className="result-card-icon">
            <ResultIcon kind="reasons" />
          </span>
          <h3 id="signals-title">可疑原因</h3>
        </div>
        {result.signals.length === 0 ? (
          <p className="muted">目前未觀察到明確可疑訊號。</p>
        ) : (
          <ul className="signal-list">
            {result.signals.map((signal, index) => (
              <li key={`${signal.type}-${index}`}>
                <span
                  className={`severity severity-${signal.severity}`}
                  aria-label={`${severityLabels[signal.severity]}程度`}
                >
                  {severityLabels[signal.severity]}
                </span>
                <span>
                  <strong>{signalLabels[signal.type]}</strong>
                  <span>{signal.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="result-section recommendations"
        aria-labelledby="recommendations-title"
      >
        <div className="result-section-heading">
          <span className="result-card-icon">
            <ResultIcon kind="actions" />
          </span>
          <h3 id="recommendations-title">建議行動</h3>
        </div>
        <ol>
          {result.recommendations.map((recommendation, index) => (
            <li key={`${recommendation}-${index}`}>{recommendation}</li>
          ))}
        </ol>
      </section>

      <p className="low-risk-reminder">
        本工具提供詐騙風險提示，可能誤判。低風險不代表安全，請勿僅依本結果付款或提供個人資料。本工具不會查證網址、銀行或官方身分。
      </p>
    </div>
  );
}
