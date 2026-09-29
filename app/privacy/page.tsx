import Link from "next/link";
import { FeedbackLinks } from "@/components/feedback/FeedbackLinks";
import { getPublicSiteConfig } from "@/lib/server/public-config";

export const dynamic = "force-dynamic";

export default function Privacy() {
  const feedbackConfig = getPublicSiteConfig();
  return (
    <main className="page-frame privacy-page">
      <Link className="brand" href="/">
        ScamShield AI 首頁
      </Link>
      <article className="panel">
        <p className="eyebrow">公開測試版 Beta · 資料處理說明</p>
        <h1>隱私與使用限制</h1>
        <p>
          本工具提供詐騙風險提示，可能誤判。低風險不代表安全，請勿僅依本結果付款或提供個人資料。分數是風險指標，不是經校準的詐騙機率；本工具不會查證網址、銀行或官方身分。
        </p>
        <h2>圖片何時傳送</h2>
        <p>
          選圖與預覽在你的裝置中進行。只有按下「開始 AI
          分析」後，圖片才會傳送至本服務的 Vercel 部署，再由 OpenAI
          處理。請先遮蔽不必要的姓名、電話、帳號、OTP 與其他敏感資訊。Demo
          僅使用本機示範資料，不會上傳圖片。
        </p>
        <h2>本應用程式與額度服務</h2>
        <p>
          本應用程式不將原圖或完整分析內容持久保存。圖片會經格式、大小、像素與重新編碼驗證。必要技術日誌包括問題編號、狀態與安全錯誤碼、耗時、圖片尺寸、模型及提示版本，以及取得時的
          Provider 使用量；不記錄原始 IP、圖片、完整提示或分析文字。
        </p>
        <p>
          來源 IP 用於短期防濫用及分析嘗試額度控制，會以伺服器秘密進行 HMAC
          轉換，將代碼與限額計數、租約存於 Upstash
          Redis。這是降低辨識風險，不等於完全匿名。計數與租約有到期時間，日額度於台北時間
          00:00 重置。
        </p>
        <p>
          短期防濫用紀錄在最後一次獲准的 POST 後 60
          秒到期；日計數在台北時間下一次 00:00 後 1
          小時到期，若持續使用會更新計數及到期日。單次分析的防重複扣次紀錄 48
          小時到期，並行租約預設 60 秒。這些是本應用設定的 Redis
          邏輯到期時間，平台備份、日誌及其他留存仍須依實際服務設定確認。
        </p>
        <p>
          同一家庭、公司或公共網路可能共用額度。已獲准進入 AI
          呼叫流程的分析嘗試，即使資訊不足、取消、逾時或失敗仍可能計次，並非每天保證成功次數。未送出分析前不會因預覽扣取分析嘗試額度。
        </p>
        <h2>OpenAI 與部署／日誌平台</h2>
        <p>
          OpenAI 與 Vercel
          可能依各自的資料處理政策、帳號設定及服務需要保留資料。本應用程式不存圖，或
          API 使用
          store:false，均不代表所有平台零留存。實際部署的保留期間、平台日誌設定及刪除程序尚待管理者確認，確認完成前不應視為已完成公開
          Beta 隱私驗收。
        </p>
        <h2>Google 回饋表單及備用 Email</h2>
        <p>
          回饋入口會在你選擇開啟後前往外部 Google
          表單，可能只預填問題編號、網站版本及回饋類型；不自動傳送圖片、完整分析內容、IP
          或其代碼。Email 僅為選填的聯絡方式。請自行檢查內容後再送出。
        </p>
        <p>
          回饋僅用於排查問題及改善服務，誤判回報須先人工覆核。Google
          回饋資料的保存期間、管理者身分及刪除聯絡程序尚待管理者確認；正式收集前須於表單與本說明補齊。請勿在回饋中提供他人個資或敏感截圖。
        </p>
        {feedbackConfig.contactEmail ? (
          <p>
            已設定的聯絡 Email：
            <span className="break-anywhere">
              {feedbackConfig.contactEmail}
            </span>
            。刪除申請處理期限尚待確認。
          </p>
        ) : (
          <p>
            管理者聯絡 Email 尚未提供；公開 Beta
            前須補齊可用的聯絡與刪除申請管道。
          </p>
        )}
        <FeedbackLinks config={feedbackConfig} />
        <p>
          <Link href="/demo">開啟不會呼叫 AI 的 Demo</Link> ·{" "}
          <Link href="/">回到分析首頁</Link>
        </p>
      </article>
    </main>
  );
}
