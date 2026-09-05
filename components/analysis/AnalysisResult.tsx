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
        <div>
          <span className="risk-kicker">風險等級</span>
          <strong>{riskLabels[result.riskLevel]}</strong>
          <span className="risk-explainer">風險指標，非詐騙機率</span>
        </div>
        <div className="risk-score" aria-hidden="true">
          <strong>{result.riskScore}</strong>
          <span>/ 100</span>
        </div>
      </div>

      <div className="summary-card">
        <span className="result-label">風險類型</span>
        <strong className="category">{categoryLabels[result.category]}</strong>
        <span className="result-label">分析摘要</span>
        <p>{result.summary}</p>
      </div>

      <section className="result-section" aria-labelledby="signals-title">
        <h3 id="signals-title">可疑訊號</h3>
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
        <h3 id="recommendations-title">建議行動</h3>
        <ol>
          {result.recommendations.map((recommendation, index) => (
            <li key={`${recommendation}-${index}`}>{recommendation}</li>
          ))}
        </ol>
      </section>

      {result.riskLevel === "low" && (
        <p className="low-risk-reminder">
          低風險不等於安全保證；涉及金錢、帳號或驗證碼時，仍請透過官方管道查證。
        </p>
      )}
    </div>
  );
}
