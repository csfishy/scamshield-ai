# 隱私與回饋資料管理

政策更新日期：2026-10-01。使用者已正式指定回饋最長保存90天，以及公開聯絡／刪除申請Email **csfishy@gmail.com**。這個地址是可進Git與瀏覽器的公開產品資訊，與使用者在表單填寫的私人Email不同；後者不能進公開日誌、測試快照或issue。

2026-09-29的Production Privacy／Feedback正式非AI驗收PASS，證據見[原始報告](production-privacy-feedback-final-acceptance-2026-09-29.md)。2026-10-01的`ff64705`已將新信箱部署至Production，首頁／Privacy匿名HTTP200、信箱文字與mailto確認通過。Google表單的新信箱對齊仍待獨立確認；各階段與失敗紀錄見[歷史索引](release-evidence-index.md)。政策顯示通過不代表管理者已執行90天清理。

## 1. 對使用者公開的政策

回饋用於排查問題、改善產品與Beta驗收。由管理者持有的可識別表單回覆，原則上最長保存90天，期限內完成刪除或去識別化。要把特定回饋或案例用於更長期測試／品質改善，先另行取得適當同意，不因「可能有用」就自動永久保存。

一般聯絡、Privacy疑問、回饋刪除、Beta問題或其他資料使用問題，可寄至[csfishy@gmail.com](mailto:csfishy@gmail.com?subject=ScamShield%20Privacy%20%2F%20Data%20Request)。mailto只設定收件人及`ScamShield Privacy / Data Request`主旨，不預填圖片、IP、完整分析或其他敏感正文。網站提供可複製地址，沒有寄信API／SMTP；是否送信由使用者的郵件軟體決定。

公開政策放在`/privacy`，聯絡區為`/privacy#contact`；首頁、分析成功與錯誤回饋均應可找到。`lib/privacy.ts`集中公開Email與90天常量。`FEEDBACK_CONTACT_EMAIL`仍是可選的其他回饋備用設定，不是這個公開Privacy聯絡地址的secret或必要開關。

## 2. 各系統資料與期限不可混用

| 層次 | 實際行為／用途 | 期限或限制 |
| --- | --- | --- |
| ScamShield應用 | 使用者明確按分析後才傳圖；server驗證／重新編碼，不建立上傳原圖或完整分析文字的持久使用歷史；一般telemetry只含安全技術欄位，不記原始IP | 這是應用程式行為，不代表所有第三方平台零留存。不能為回饋新增原圖儲存 |
| 瀏覽器與PWA | 預覽使用本機檔案／object URL；worker只處理允許的GET靜態資產與不含使用者內容的首頁／離線fallback，排除`/analyze`；不快取使用者圖片或分析結果 | 瀏覽器目前頁面可暫時持有預覽；關閉／重設的記憶體行為不等同伺服器歷史功能 |
| Redis | HMAC轉換來源IP後的rate limit、daily quota、ownership lease、receipt與runtime control；沒有分析圖片或完整結果 | 短窗60秒、日key到台北下次00:00加1小時、receipt48小時、lease預設60秒；control無TTL。這是應用TTL，不是備份／複寫／平台日誌政策 |
| OpenAI | 目前adapter用`store:false`，不要求建立可再次取得的一般Response儲存 | 防濫用紀錄可能包含輸入／輸出，預設最多30天，法律／安全例外可能更久；圖片另有安全檢查例外。不能由`store:false`推定已核准ZDR或完全零保留 |
| Vercel及日誌服務 | 部署與網路平台可處理獨立request metadata／日誌；應用不記原始IP不代表平台不處理IP | 依實際方案、log／drain與服務政策；本輪沒有指定新期限、不把回饋90天套用於所有平台 |
| Google Forms與管理者持有副本 | 自願提交類型、描述、有幫助程度、Request ID、build及選填Email；網站不另存response | 管理者持有的回饋依最長90天政策；Google自身服務／安全／備份保留另依其政策，不能宣稱網站可即時刪除平台所有副本 |

IP HMAC只降低直接辨識風險，並非完全匿名；不同NAT／VPN／IPv6情境限制見[runbook](deployment-runbook.md#11-beta-設定與操作2026-09-29)。OpenAI的application state與abuse monitoring是不同機制，本專案未宣稱取得Zero Data Retention資格。[OpenAI資料控制](https://developers.openai.com/api/docs/guides/your-data)。

## 3. 90天政策的人工執行

**本版本沒有Google回覆自動刪除工作、Google API權限或新的保存資料庫。** 90天是管理者必須執行的期限，不能將文件存在寫成已自動清理。管理者應設定自己的檢查提醒，提早處理即將屆期的回覆，避免到期後才排程；本輪不建立背景工作，也不自動刪除遠端資料。

1. 以原始提交時間計算最晚處理日：提交時間加90天。匯出、搬移或重新匯入不能重設期限；保留原時間與時區供核對。
2. 僅授權必要管理者存取Forms、連結Sheets及匯出檔；列出有無副本及儲存位置，避免把含正文或私人Email的清冊提交Git。
3. 在到期前逐筆決定刪除或去識別化。去識別化不能只刪Email：還要移除正文姓名／帳號／連結識別碼、可回查的Request ID與關聯表；无法可靠去識別時刪除。不要將未核實使用者回饋直接當ground truth。
4. 若需要較長期案例，先取得並記錄用途、範圍及保存安排的另行同意；沒有同意，按原90天處理。若採完全去識別的統計／摘要，確保不能回連原回覆，不把原始回饋複製到測試fixtures作替代。
5. 刪除特定Forms回覆時，管理者在Responses → Individual找到確切回覆再刪除；不要以「Delete all responses」處理單筆要求。Google說明此刪除不可復原，因此先核對目標，不額外匯出完整資料作永久備份。[Google回覆儲存與刪除](https://support.google.com/docs/answer/2917686?hl=en)。
6. 同步處理已存在的linked Sheets、CSV／下載副本或其他管理者持有的回饋副本。Forms與Sheet是分開資料；unlink不會清掉既有Sheet資料，權限也需分開管理。不要假設刪表單等於刪所有副本。[Google回覆管理](https://support.google.com/docs/answer/139706?hl=en)。
7. 清理紀錄只保留必要的執行日期、涵蓋日期範圍、數量、各副本是否處理、操作者與例外處理結論；不要為證明刪除而永久保存被刪正文、Email或完整截圖。這不新增另一套未核准保存政策。

管理者操作表（未填不等於已完成）：

| 執行日期／操作者 | 到期範圍／數量 | Forms | Sheets／匯出副本 | 刪除或去識別結果 | 未解項目 |
| --- | --- | --- | --- | --- | --- |
| 尚未執行 | 不填真實正文或私人Email | NOT_RUN | NOT_RUN／無副本經核對 | NOT_RUN | 需管理者確認 |

## 4. 刪除申請

使用者可寄信至 **csfishy@gmail.com**，提供足以定位回饋的最少資訊，例如大約提交日期、回饋類型與當時Request ID（若有）。不要要求重送截圖、OTP、密碼、身分證件或完整分析；也不要把信件轉貼到公開issue。若匿名回覆無法唯一定位，說明限制並請求最少補充資訊，不擅自刪除其他人的回覆。

管理者確認目標後，依第3節處理Forms與自己持有的副本，再告知處理結果與第三方獨立保留限制。本輪不捏造回覆SLA、公司／法人、DPO或法律承諾；聯絡信箱也沒有新增未經使用者決策的保存期限。

## 5. 發布前對齊與驗收

- [x] 分支`/privacy`、回饋說明與公開常量一致：90天、csfishy@gmail.com、長期用途另取得適當同意。
- [ ] Google描述聯絡資訊需另行重驗；2026-09-29 08:19 UTC匿名GET200的歷史紀錄是90天、cs.sakana@gmail.com、刪除及長期同意，不能當作新地址已對齊。
- [x] 2026-09-29的Production首頁／錯誤回饋、Google匿名開啟及預填重新驗收PASS；歷史RCA未知保留，摘要管理設定／送出時登入重驗NOT_RUN，沒有新回覆。原始範圍見正式非AI報告，不套用到新信箱或新UI。
- [ ] 管理者接手90天清理／刪除申請，核對有無Sheets／exports與期限提醒。不是網站自動執行。
- [x] 原始Privacy分支338tests／20E2E及首次失敗／重跑保留在[歷史紀錄](privacy-final-gates-2026-09-29.md)；正式發布前fresh重驗首次PASS見[正式報告](production-privacy-feedback-final-acceptance-2026-09-29.md)。2026-10-01信箱版另有474tests、typecheck、lint、build及Backend CI PASS。
- [x] 2026-10-01的Production首頁與`/privacy`實見`csfishy@gmail.com`、正確mailto，舊地址未出現；Google新地址對齊尚待獨立確認。
- [ ] 新信箱版的完整外部對齊與新版本實機重驗；較早Privacy PASS不延伸為AI品質或PUBLIC_BETA重新開放。

各階段結果由[目前Beta檢核](public-beta-readiness.md)與[歷史索引](release-evidence-index.md)集中記錄。
