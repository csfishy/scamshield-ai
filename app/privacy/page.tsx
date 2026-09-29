import Link from "next/link";
import { CopyValue, FeedbackLinks } from "@/components/feedback/FeedbackLinks";
import {
  FEEDBACK_RETENTION_POLICY,
  PRIVACY_CONTACT_MAILTO,
  PUBLIC_PRIVACY_CONTACT_EMAIL,
} from "@/lib/privacy";
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
        <h2>圖片用途與傳送時機</h2>
        <p>
          圖片用於辨識可疑訊息、整理風險原因與建議行動。選圖與預覽在你的裝置中進行；只有按下「開始
          AI 分析」後，圖片才會傳送至本服務的 Vercel
          部署，並在真實分析獲准時交由 OpenAI
          處理。請先遮蔽不必要的姓名、電話、帳號、信用卡、OTP
          與其他敏感資訊。Demo 僅使用本機示範資料，不會上傳圖片。
        </p>
        <h2>ScamShield 應用程式</h2>
        <p>
          本應用程式不持久保存使用者上傳截圖，也不保存完整 AI
          分析文字作為一般使用歷史。圖片不會寫入 Redis；Service Worker
          不會快取圖片或 /analyze 請求與回應。
        </p>
        <p>
          必要技術日誌可包含問題編號 Request
          ID、狀態與安全錯誤碼、耗時、圖片大小與尺寸、模型及提示版本，以及取得時的
          Provider 使用量。不記錄原始 IP、原圖、完整提示或完整分析文字。
        </p>
        <h2>Upstash Redis 與 IP 防濫用</h2>
        <p>
          Redis
          僅用於短期頻率限制、每日額度、並行租約、分析啟停控制及必要的防重複扣次與暫時狀態。
          IP 會在伺服器端以含秘密金鑰的 HMAC 轉換為代碼，不直接把原始 IP 當作
          Redis key。這是降低直接識別風險，不代表完全匿名。
        </p>
        <p>
          短期防濫用紀錄在最後一次獲准的 POST 後 60
          秒到期；日計數在台北時間下一次 00:00 後 1
          小時到期，若持續使用會更新計數及到期日。單次分析的防重複扣次紀錄 48
          小時到期，並行租約預設 60
          秒。啟停控制設定保留至管理者變更；它不包含上傳圖片或回饋內容。
          這些是應用程式設定的邏輯到期時間，並非對平台備份或安全日誌的零留存承諾。
        </p>
        <p>
          同一家庭、公司或公共網路可能共用額度。已獲准進入 AI
          呼叫流程的分析嘗試，即使資訊不足、取消、逾時或失敗仍可能計次，並非每天保證成功次數。未送出分析前不會因預覽扣取分析嘗試額度。
        </p>
        <h2>OpenAI 的資料處理</h2>
        <p>
          本服務呼叫 OpenAI Responses API 時設定 <code>store:false</code>
          ，要求不建立一般 Response
          儲存。這與供應商的防濫用及安全留存不同：OpenAI
          的防濫用日誌可能包含輸入與輸出，預設最長保留 30
          天；法律或安全需要等例外可能保留更久，圖片也可能適用安全審查例外。
        </p>
        <p>
          本應用程式不存圖，不代表所有平台零留存，也不表示本服務已取得 OpenAI
          零資料留存資格。詳見
          <a
            href="https://developers.openai.com/api/docs/guides/your-data"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            OpenAI API 資料處理政策（外部網站）
          </a>
          。
        </p>
        <h2>Vercel 部署與日誌平台</h2>
        <p>
          Vercel
          負責網站部署及請求處理。平台可能因日誌、維運與安全需求保存技術資料；保存與刪除受實際使用方案、帳號設定及平台政策影響。
          本頁的回饋保存期限不等於 Vercel、OpenAI 或其他平台所有資料的保存期限。
        </p>
        <h2>Google Forms 意見回饋</h2>
        <p>
          回饋入口會在你選擇開啟後前往外部 Google
          表單。你可以提供回饋類型、問題描述、分析是否有幫助、問題編號、網站版本，以及選填的聯絡
          Email。網址最多只預填問題編號、版本與回饋類型，不自動附上圖片、完整分析內容、IP
          或其代碼。本網站不另外保存 Google 表單回覆。
        </p>
        <p>{FEEDBACK_RETENTION_POLICY}</p>
        <p>
          此期限適用於管理者持有的表單回覆、連結試算表及匯出副本，由管理者依期限清理，不代表網站已提供自動刪除功能，或
          Google
          的平台備份與安全紀錄會在同一時間刪除。誤判回報先經人工覆核，不直接當作正確答案。
          請勿在回饋中填入原始截圖、完整分析內容、驗證碼或他人的個人資料。
        </p>
        <section id="contact" aria-labelledby="privacy-contact-title">
          <h2 id="privacy-contact-title">聯絡與回饋資料刪除申請</h2>
          <p>
            一般聯絡、隱私疑問、回饋資料刪除要求、Beta
            測試問題及其他資料使用問題，都可透過下列公開 Email
            聯絡本服務管理者。
          </p>
          <CopyValue
            value={PUBLIC_PRIVACY_CONTACT_EMAIL}
            label="公開聯絡 Email"
          />
          <p>
            <a
              className="button button-secondary"
              href={PRIVACY_CONTACT_MAILTO}
            >
              聯絡管理者／申請刪除
            </a>
          </p>
          <p>
            申請刪除時，可提供問題編號、約略提交日期與希望刪除的回饋範圍，協助管理者找到資料；如需確認，管理者會透過回信聯絡。
            不必附上原始截圖、完整分析結果、OTP
            或其他敏感資訊。信件連結僅預填主旨，不會代你寄出。
          </p>
        </section>
        <FeedbackLinks config={feedbackConfig} />
        <p>
          <Link href="/demo">開啟不會呼叫 AI 的 Demo</Link> ·{" "}
          <Link href="/">回到分析首頁</Link>
        </p>
      </article>
    </main>
  );
}
