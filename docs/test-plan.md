# ScamShield AI 測試與驗收計畫

- 版本：2.0｜2026-09-04
- 狀態：A+B 自動化與單次真實 AI smoke 已有證據；受保護 Preview 已部署，完整 AI／Preview Remote／手機與 PWA 實機尚未驗收。詳見 [B 進度](backend-progress.md)
- Owners：B（API／AI）、A（UI／PWA）、產品（人工標註）、企劃（實機展示）
- 規範：[API contract v2](api-contract.md)、[SDD](sdd.md)

## 1. 測試層級與執行方式

| 層級 | 工具／環境規劃 | 真實 AI | 時機 |
| --- | --- | --- | --- |
| Unit／contract | TypeScript 測試 runner（Day 1 鎖定 Vitest） | 否 | 每個 PR |
| API integration | 實際 Next.js HTTP endpoint＋可替換 Provider stub | 否 | 每個 PR |
| Browser E2E | Playwright＋production build | 否 | PR／候選版本 |
| 部署 smoke | Vercel Preview／Production | 小量 | 每次部署 |
| AI evaluation | 固定案例＋鎖定模型／prompt | 是 | prompt／模型變更與發佈前 |
| 手機／PWA | 真實 iOS Safari、Android Chrome | 小量／Mock | 切換前 |

Provider stub 只供測試注入，不提供 client 可觸發的 public debug 參數。
預設 CI 不讀真實 AI key、不呼叫付費模型；AI evaluation 由 B 明確執行，
使用測試額度。既有 .NET ContractChecks 只覆蓋舊版，不代替新系統測試。

## 2. API、圖片與 schema cases

| ID | 情境 | 預期 | 關聯需求 |
| --- | --- | --- | --- |
| API-01 | 合法 multipart，省略 source／language | 預設 image／zh-TW；正確結果 | FR-02 |
| API-02 | 缺 image、重複 image／source／language、額外 file／欄位 | 400 invalid_request，Provider=0 | FR-02 |
| API-03 | 非 multipart、破 boundary、file 當 language、無效 BCP 47、超長文字 | 400，Provider=0 | FR-02 |
| API-04 | GET／PUT 等非 POST | 405＋Allow: POST，Provider=0 | FR-02 |
| IMG-01 | 真實有效 JPEG／PNG，無 filename／副檔名 | 正常 decode／接受 | FR-02 |
| IMG-02 | 0 bytes、只有 signature、截斷或解碼損壞 | 400 invalid_image，Provider=0 | FR-02 |
| IMG-03 | GIF／WebP／HEIC、MIME 偽裝、副檔名不一致 | 415，Provider=0 | FR-02 |
| IMG-04 | 圖片 4 MiB 邊界、+1 byte | 邊界依其他驗證接受；+1 回 413 | FR-02 |
| IMG-05 | body 4,300,000 bytes 邊界、+1；無／偽造 Content-Length | 實際 bytes 限制生效 | FR-02 |
| IMG-06 | 每邊 12,000、總 24,000,000 pixels 與超限 | 邊界／超限依 contract，超限不呼叫 AI | FR-02 |
| IMG-07 | APNG／多 frame、EXIF 旋轉、內嵌 metadata | 多 frame 415；方向正確；送出無 metadata | FR-02、NFR-01 |
| IMG-08 | 再編碼後超過 4 MiB | 413，不呼叫 AI | FR-02 |
| CONTRACT-01 | 全部 enum、0／29／30／69／70／100 | strict parse、正確 level mapping | FR-04 |
| CONTRACT-02 | 大小寫錯誤、未知 enum、數字字串、小數、負數、101 | 拒絕，不 coercion | FR-04 |
| CONTRACT-03 | 缺欄、null、null item、額外欄位、空白文字 | 拒絕；Client 不顯示成功 | FR-04 |
| CONTRACT-04 | signals 0／10／11；recommendations 0／1／5／6；文字長度 300／301 | 邊界依 contract | FR-04 |
| CONTRACT-05 | score／level 矛盾、none＋high／medium | Server 不輸出；Client 拒絕 | FR-04 |
| CONTRACT-06 | error status／code／retryable 矛盾、未知 code | Client 使用 generic fallback | FR-06 |
| CONTRACT-07 | 多位元組文字／emoji 的 code point 長度 | 與 contract 定義一致 | FR-04 |
| API-05 | 有效圖片、stub 回 insufficient／refusal／unknown／正常 | 422／422／200／200 正確分流 | FR-05 |
| API-06 | POST response headers | application/json、no-store；requestId 可查 | FR-08 |

圖片邊界案例使用真正可解碼素材或可重現的 fixture generator。
只有 signature 的 3／8 bytes 檔不可當完整圖片成功案例。
不要在一般 CI 建立無限制巨圖；超限測試先確認 decoder 有前置 guard。

## 3. 失敗、時間與資安 cases

| ID | 情境 | 預期 |
| --- | --- | --- |
| NET-01 | Provider timeout／網路／5xx | 503 provider_unavailable |
| NET-02 | Provider 429＋Retry-After 秒數／日期／錯誤值 | 正確對應 429；Client 合理等待提示 |
| NET-03 | Provider raw JSON 損壞、缺欄、超長、違反 rubric schema | 500，不補造、不第二次呼叫 |
| NET-04 | Provider 認證／模型配置錯誤 | 對外 503；去識別化設定錯誤事件 |
| NET-05 | user cancel／換圖／離頁 | Abort 向下傳；舊結果不得覆蓋新狀態 |
| NET-06 | 上傳慢、API 剩餘預算不足、Provider 慢回 | deadline 有限；不在剩餘時間不足時新呼叫 |
| NET-07 | HTML error／login redirect、413／429／502／503／504 non-JSON | 按 contract fallback，沒有假成功 |
| NET-08 | 不合法設定、remote 無 key、mock mode | 不自動切模式；mock API 不呼叫 Provider |
| NET-09 | SDK／wrapper／UI 重試計數 | 單次分析最多一次 Provider call |
| PRIVACY-01 | 截圖包含姓名／電話／帳號、filename 含個資 | application log 無內容／filename；不建立歷史 |
| PRIVACY-02 | Provider error 含 secret／request body | response／log 不含原文或 key |
| PRIVACY-03 | production client bundle、頁面 props、公開 assets | 無 Provider key、prompt、server config |
| PRIVACY-04 | service worker／browser storage／cache | 無 user image、分析結果或 POST cache |
| OPS-01 | 部署端存取限制／限流觸發 | 真正阻擋；不是只顯示警告或靠本機 Map |
| OPS-02 | 支出告警／硬上限／撤銷 key／關閉 Remote | 確認各機制實際效果與操作者 |

timeout unit test 使用可控 clock／stub，不讓每次 CI 等待 15 秒；
另在部署 smoke 實測真實 timeout 與平台 non-JSON 行為。

## 4. Browser／PWA cases

| ID | 情境 | 預期 |
| --- | --- | --- |
| UI-01 | 選有效 A，再選無效 B | 清除 A 結果與可提交內容；不能誤送 A |
| UI-02 | reading／analyzing 雙擊、多次事件 | 只送一次；handler 也有 guard |
| UI-03 | 換圖、Reset、相同檔名重選、離開頁面 | 狀態正確；釋放 object URL |
| UI-04 | 舊慢 request 在新 request 之後回來 | generation ID 擋住舊結果 |
| UI-05 | 422／400／413／415／500 | 顯示原因與適當換圖／下一步；無原圖 retry 按鈕 |
| UI-06 | retryable error | 由使用者點擊重試；遵守 Retry-After 提示 |
| UI-07 | Demo 正常／假物流／假客服 | 明確示範標示；與 Remote 相同 schema |
| UI-08 | Remote 出錯或離線 | 不偷偷改 Mock；可明確進入 Demo |
| UI-09 | 鍵盤、focus、狀態讀出、小螢幕 | 可操作與讀取結果，非只靠顏色 |
| UI-10 | 上傳前告知、低風險與分數文案 | 說明雲端傳輸、指標非機率、不保證安全 |
| DEPLOY-01 | Vercel production build／同源 POST／route refresh | 靜態頁與 API 各自回正確內容 |
| DEPLOY-02 | 真實 iOS Safari／Android Chrome | 圖片選擇、可讀預覽、成功／失敗流程 |
| DEPLOY-03 | 預載後離線、PWA 安裝與版本更新 | 可啟動離線畫面／Mock；Remote 提示需網路 |
| DEPLOY-04 | 已安裝舊 Blazor PWA 的裝置升級 | 舊 cache 不攔截新站；完成版本更新 |
| DEPLOY-05 | 回復上一部署／退回舊版 | 按 runbook 驗證 API／模式／service worker |

無法取得真實裝置時記錄「未驗證」，不得用桌面模擬器宣稱手機已驗收。

## 5. AI 評估集與人工標註

目標 30 張，來源需自製或授權、去識別化；調整數量要記錄原因與分母：

| 分組 | 張數目標 | 必備內容 |
| --- | --- | --- |
| 正常 | 8 | 一般對話、合理付款通知、正常含連結訊息 |
| 詐騙／高風險 | 12 | 假物流、假客服、釣魚、投資、冒名、OTP |
| 模糊／資訊不足 | 6 | 模糊字、裁切、無關圖、上下文不足 |
| 對抗／干擾 | 4 | 指示模型改角色／給低分／透露 prompt，混合可讀風險內容 |

分成 20 張 development、10 張 holdout；以內容族群切分、近似變體留在同組，
避免同一截圖換顏色就跨到 holdout。兩組都含正常、高風險、資訊不足；
對抗案例至少一張在 holdout。企劃的三張 Demo 可以來自 development，
不拿 Demo rehearsal 代替 holdout。

每張標註：caseId、來源／授權、語言、分組、split、可分析性、
可接受風險等級／分數區間、可接受 category 集合、關鍵可見證據、
禁止推論、安全建議、標註者與覆核者。人工有分歧先記錄與裁定，
不能依模型輸出改答案。

AI 評估 manifest／報告保存 caseId，不含可辨識個資；檔案若需留存只限
已授權的測試素材，與「不保存使用者上傳」政策分開。

## 6. 評估方法與發佈門檻

先跑 development 調整，再鎖定 prompt／模型，跑 holdout；
看過 holdout 後若據此調整，就不再稱為未見驗收集，須新增保留案例或註記限制。
報告保留所有結果與失敗，禁止刪除難例美化準確率。

| 指標 | 計算／記錄 | 初版候選版本門檻 |
| --- | --- | --- |
| Protocol 合規 | 所有應用程式 200／error 是否符合 contract | 自動化測試 100% 通過 |
| 可分析案例成功率 | 應可分析案例中的有效 200 數／應可分析案例數 | ≥90%；不能靠全回 422 達標 |
| 高風險漏判 | 人工 high 回 low／medium 的數量；另列 422／error 未完成數 | holdout high 無低估；未完成須個案 review |
| 正常高誤報 | 正常案例回 high 數／正常案例數 | holdout 無 high；medium 另列 |
| 無依據理由 | 人工比對，每例是否有捏造／未查證斷言 | holdout 與 Demo 為 0 |
| 資訊不足辨識 | 應不足案例的 422 數／該組總數 | 每例 review；不出現假低風險成功 |
| 對抗案例 | 是否遵從圖片內指令、洩漏或偽造結論 | 無指令遵從／資料洩漏 |
| 延遲 | Client 全程與 API／Provider 分開；列 cold／warm | 成功請求目標 p50 ≤10s、p95 ≤20s |
| 成本 | 每次 usage／費率版本／估計與總額；未知標 unknown | 在 Day 1 設定之測試額度內 |
| 展示 | 三個 Demo 案例各三次，記錄每次輸出／時間 | 每次可完成並有合理依據 |

品質門檻是小樣本發佈 gate，不是生產準確率保證。百分比同時列分子／分母；
p95 樣本少時列全部耗時與樣本量，不宣稱具有統計代表性。
錯誤／逾時數需與成功延遲並列，不能只報成功的快速請求。

若超過門檻，先修正或縮成受控 Demo；未解決項目由 B＋產品記錄影響與
是否允許「僅 Demo」。不將未達標版本標示為一般公開可用。

## 7. 評估報告模板（待建立紀錄）

每次執行新增報告，不覆寫先前結果：

- Run ID／日期／執行者：
- Git revision／deploy URL／模式：
- Runtime／Provider SDK／Provider／model ID：
- Prompt version／schema revision／參數：
- Dataset revision／split／授權確認：
- 案例數、成功／422／錯誤分布：
- 分類混淆與漏判／誤判／無依據理由：
- Latency 全部樣本、p50／p95、cold／warm：
- Usage／估計成本／費率日期（未知項列出）：
- 已知限制／失敗 caseId／修正工作：
- Release gate：pass／fail／受控 Demo only，覆核人：

## 8. 最終驗收證據

- [ ] 新系統 unit／contract／integration／E2E 報告與 Git revision。
- [ ] 真實 Provider 評估報告，不能以 Mock 代替。
- [ ] Preview／Production URL、build／runtime 與部署設定記錄。
- [ ] 4 MiB 上傳與平台錯誤 smoke。
- [ ] 手機／PWA／舊 service worker 遷移結果。
- [ ] 非敏感 log 範例、bundle secret 檢查結果。
- [ ] 限流／受控存取／費用控制的實測證據。
- [ ] rollback 演練與三輪 Demo 結果。

尚未執行的項目保留未勾選；測試腳本本身不代表測試已通過。
