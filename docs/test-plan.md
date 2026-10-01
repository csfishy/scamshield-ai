# ScamShield AI 測試與驗收計畫

- 版本：2.3｜2026-09-29
- 狀態：新增90天回饋／公開Privacy聯絡回歸及真iPhone人工清單；本輪數量與實跑結果見[Privacy／Final Gates](privacy-final-gates-2026-09-29.md)。第一階段231 tests／19 E2E、第二階段及Production非AI證據各自保留，不追溯改寫
- Owners：B（API／AI）、A（UI／PWA）、產品（人工標註）、企劃（實機展示）
- 規範：[API contract v2](api-contract.md)、[SDD](sdd.md)

## 1. 測試層級與執行方式

| 層級 | 工具／環境規劃 | 真實 AI | 時機 |
| --- | --- | --- | --- |
| Unit／contract | TypeScript 測試 runner（Day 1 鎖定 Vitest） | 否 | 每個 PR |
| API integration | 實際 Next.js HTTP endpoint＋可替換 Provider stub | 否 | 每個 PR |
| Browser E2E | Playwright＋production build | 否 | PR／候選版本 |
| 部署 smoke | Vercel Preview／Production 分別記錄；AI OFF 可先驗 HTTP 邊界 | AI OFF 否；合法圖片另需小量付費授權 | 每次部署 |
| AI evaluation | 固定案例＋鎖定模型／prompt | 是 | prompt／模型變更與發佈前 |
| 手機／PWA | 真實 iOS Safari、Android Chrome | 小量／Mock | 切換前 |

Provider stub 只供測試注入，不提供 client 可觸發的 public debug 參數。
預設 CI 不讀真實 AI key、不呼叫付費模型；AI evaluation 由 B 明確執行，
使用測試額度。既有 .NET ContractChecks 只覆蓋舊版，不代替新系統測試。

Provider failure diagnostics 以 SDK transport stub 驗證 `incomplete` 的
`max_output_tokens`、`content_filter`、未知 reason、completed 但缺少 output
text，以及 failed／未知 status。測試同時確認 response failure 的既有 usage
能進入 server telemetry，缺少 usage 時維持 unknown；JSON parse、provider
outcome 與 structural-debris 路徑不得遺失已取得的 token。HTTP body 必須維持
既有三欄錯誤契約，telemetry allowlist 不得輸出 raw output、incomplete object、
summary、signal reason、recommendation、prompt、圖片或 secret。

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

timeout unit test 使用可控 clock／stub，不讓每次 CI 等待 20／25 秒；
另在部署 smoke 實測真實 timeout 與平台 non-JSON 行為。

`tests/unit/timeout.test.ts` 覆蓋 20s／25s 的 default、explicit、18s／25s、20s／22s 邊界，拒絕超上限、少於2s餘裕、零／負數／小數／非整數字串及極大值。fake timers 驗證 19,999ms 完成可正常回應並收尾、20s timeout 不重試且忽略晚到結果、前置處理耗時會縮短 Provider budget、API 25s 可中止尚未進 Provider 的工作。timeout 遙測必須 `usageKnown=false` 且無虛構 token；已進 Provider 但遠端是否停止未知時維持 `held_until_expiry`。既有 schema pattern、diagnostic 與 debris regression 必須持續通過。

真實回歸每次獨立核准 calls／USD，離線測試不替代正式 latency／品質證據。只有兩個固定案例均無 timeout、HTTP200 且人工品質 PASS，才可將 timeout robustness 與文字可靠性 gate 記為 PASS；單例 timeout 不等於 pattern／prompt／debris FAIL。route maxDuration 維持30s。

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

逐步真iPhone Safari／PWA安裝、AI OFF圖片、外部表單返回、舊worker更新、離線／多分頁與結果模板見[iPhone／PWA acceptance](iphone-pwa-acceptance.md)。當前gate仍NOT_RUN；本輪只準備人工流程。

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

## 9. Beta 回饋、額度與費用保護回歸

本節是覆蓋清單，**不是 PASS 報告**。實際執行命令、数量、失敗及 NOT_RUN 分別寫入 [第一階段快照](public-beta-readiness.md) 與 [第二階段驗收](preview-acceptance-2026-09-29.md)，不能把新增工具測試追溯算入原 231 項。Mock／替身只驗應用程式邏輯；真實 Redis Lua 與競態需要隔離 Redis 測試，不能以 Promise.all 加假計數器冒充分散式原子性。

| ID | 情境 | 必要斷言／層級 |
| --- | --- | --- |
| FB-01 | Google 表單有／無設定；非法 protocol、host、路徑、credentials | 非預期 URL 拒絕；無設定無假成功／占位連結；unit |
| FB-02 | Request ID／build／類型預填，既有 query、特殊字元、缺 entry、forms.gle | 正確編碼；短址／缺 entry 退回一般連結；unit |
| FB-03 | Email 有／無設定；CRLF／query 注入 | 有效 mailto 與複製；無設定不顯示無效按鈕；拒絕標頭注入；unit／E2E |
| FB-04 | 成功、失敗、限額及首頁回饋 | 使用者主動操作、告知 Google 外部服務；Request ID 可複製；不含圖片／結果／IP／secret；E2E |
| RATE-01 | 第 1–3 次／第 4 次；滑動 60 秒邊界 | 拒絕發生在圖片 decode／Provider 前；Retry-After 反映視窗；unit／Redis |
| RATE-02 | 個別 IP／全站每日上限、不同 IP、台北跨日及前後 1ms | 配額／重置與 Retry-After 正確；unit／Redis |
| RATE-03 | IPv4／IPv6 等價表示、mapped IPv4、錯誤 IP | 正規化後同一來源不能多領；不自行合併 IPv6 網段；unit |
| RATE-04 | body/query/不可信 X-Forwarded-For／自稱代理欄位 | 不能覆寫部署決定的信任來源；無可信 IP 則 Provider=0；unit／HTTP |
| RATE-05 | Production／Preview namespace | 不得混用；預覽不扣正式額度；unit；實際憑證隔離人工驗收 |
| RATE-06 | 壞圖片、超額、配置錯誤、mock | 壞圖片不扣日額度，所有拒絕 Provider=0；unit／HTTP |
| ATOM-01 | 同時搶最後 IP／全站日額度與第 3 個租約 | 原子腳本最多允許可用數；失敗不部分扣次；真 Redis |
| ATOM-02 | 相同 operation token 重放、SDK重送／回應遺失 | 不重複扣次；未知結果不啟動 Provider；unit＋真 Redis |
| ATOM-03 | ownership、重複釋放、過期、模擬執行個體中斷 | 不釋放他人名額、不產生負值，期限後可回收；真 Redis |
| ATOM-04 | 取消、逾時、資訊不足、Provider失敗 | 日額度不退款；不確定停止時租約保守保留；unit／HTTP |
| FAIL-01 | Redis缺設定、連線、認證、timeout、非法／非預期結果 | fail closed，Provider=0；不fallback memory、不接受 SDK fail-open；unit／HTTP |
| STOP-01 | 部署停用；runtime key缺少、無效、停用／讀取失敗 | 新請求 Provider=0；有效設定允許；急停與恢復真 Redis／人工 |
| STOP-02 | 停用時首頁、Demo、回饋 | 都能使用，真分析不被誤標成功；E2E |
| BAPI-01 | 六個新錯誤＋Provider429＋平台non-JSON429 | strict schema/status/retryable mapping、清楚 UI；unit／HTTP／E2E |
| BAPI-02 | 全部应用可控錯誤 | no-store、X-Request-Id、安全訊息；未知恢復時間不造假 Retry-After；unit／HTTP |
| BUI-01 | 快速連點／手動再試／離線／取消 | 無自動 POST重送；同一互動只有一次提交；E2E |
| BUI-02 | 小螢幕／鍵盤／狀態可讀／隱私入口 | 可操作；iPhone Safari/PWA 另做真機驗收，桌面不代替；E2E＋人工 |
| BPRIV-01 | 上傳前選圖／預覽與惡意敏感輸入 | 明確送出前無上傳；日誌、回饋 URL、public bundle無敏感值；unit／E2E／bundle |
| BOPS-01 | 遙測故障與usage缺失 | 不改HTTP、不重呼叫Provider；未知usage不變0；unit |

離線 HTTP 使用 SDK loopback Provider 與 quota 依賴注入替身，E2E 使用瀏覽器 route 替身；正式程式不提供公用 debug query 或遠端 mock fallback。`test:redis` 僅允許 `127.0.0.1`，不讀取遠端憑證；獨立 `test:redis:rest` 只在明確授權後對指定測試 Upstash 資源執行，使用專用 `TEST_UPSTASH_*` 憑證、host 比對、隨機 namespace、命令上限與 exact-key cleanup。兩者都不清空共享資料庫，不修改主 Preview 控制鍵，詳見 [Runbook §12](deployment-runbook.md#12-preview-驗收工具與版本核對)。

### 部署驗收（第一階段 NOT_RUN；第二階段另記進度）

為 Preview 與 Production **分別**記錄 deploy SHA、URL、模式、操作者、時間、Provider 呼叫數及 usage；未測項目保留 NOT_RUN。公開訪客可使用預定入口且不必登入 Vercel、真分析不是 Demo／Mock、iPhone Safari／PWA、Google 表單無登入實際送出且無回覆摘要、獨立 Redis故障／原子競態、直接HTTP不可繞過限額、急停／恢復、舊PWA更新與新錯誤契約、安全去識別化素材有限AI smoke、bundle／依賴／公開設定檢查全部需有證據。

真實 Provider smoke／品質評估需要新的明確總預算與最多呼叫數授權；既有 smoke 授權已使用，不沿用。成本／留存／公開分享另經人工核准，完整順序見 Beta 檢核。

## 10. 第二階段驗收工具回歸

第二階段授權涵蓋 Preview、免費隔離 Redis 與 Google 表單；真實 AI 呼叫仍為 0。以下工具的離線測試與其後外部執行必須分開記錄，新增測試不追溯改写第一階段 231／19 的數量。

| ID | 工具／情境 | 必要斷言與證據 |
| --- | --- | --- |
| OFF-01 | `smoke:preview --ai-off` 參數 | 必須明確指定 `analysis_disabled` 或 `provider_unavailable`；未指定／未知 code／混入 image 或付費參數時，在任何網路請求前拒絕 |
| OFF-02 | shell 存在 Vercel bypass secret | 仍不帶 bypass header、Cookie、有效圖片；redirect 不跟隨，且不重試 |
| OFF-03 | 405 方法與 503 POST | status、Allow、no-store、有效 Request ID、strict error body 與指定 code 全部通過才 PASS；另一個合法 503 code 也不能替代 |
| OFF-04 | Protection 302／401／403、HTML 或壞 headers | 匿名驗收 FAIL／BLOCKED，不能藉 bypass 改為 PASS；平台攔截可能沒有應用 Request ID，記錄限制 |
| OFF-05 | 既有 explicit paid guard | 缺授權參數、budget 不足均在網路前拒絕；單張 image 路徑僅以 fetch 替身驗證，不能真的執行付費測試 |
| REST-01 | REST 目標與憑證驗證 | 必須用專用 `TEST_UPSTASH_*`、精確 `--expected-host`、`--allow-isolated-redis-write`；不 fallback app credentials |
| REST-02 | REST timeout、認證／非預期回應、redirect | 單次呼叫、不自動 retry；安全錯誤碼不洩露 token／URL／原始回應；offline transport tests |
| REST-03 | namespace／命令與清理 | 只允許隨機 test prefix 與白名單命令；250 次上限；不碰主 Preview／Production key，不 SCAN／KEYS／FLUSH；exact-key cleanup＋EXISTS |
| REST-04 | 真實 Upstash Lua／競態／TTL／未知結果 | 已授權的隔離資源實跑，記錄實际 checks、script hashes、target fingerprint、cleanup、Provider=0；離線 harness PASS 不代替它 |
| STAGE-01 | Node 24／npm 12 clean install | 以確切 Node 啟動 Corepack，保存真實版本／npm ci／lockfile 差異；既有安裝樹的 PASS 不冒充 clean install |
| STAGE-02 | Vercel build／GitHub workflow | 保存確切 SHA、build log 版本；feature branch push 不觸發 Backend workflow 就列 NOT_RUN |

命令與安全邊界見 [Runbook §12](deployment-runbook.md#12-preview-驗收工具與版本核對)，實際結果見 [第二階段 Preview 驗收](preview-acceptance-2026-09-29.md)。AI OFF 的 `provider_unavailable` 不證明 Redis 控制鍵，也不以簽入帳號填表成功代替匿名表單驗收。

## 11. Privacy與最終gates分支回歸

本節是驗收要求，不預報測試數量或PASS。公開政策以[Privacy operations](privacy-operations.md)及`lib/privacy.ts`為準；本輪在功能分支完成程式與本機測試，不部署Production、調整AI gates或呼叫真Provider。

本輪已實跑：Node24.19.0／npm12.0.2；typecheck、lint（排除不屬本輪的`deliverables/**`）、14files／338tests（含17HTTP）、build、bundle37files／0markers、20E2E（9 Mock/backend＋11 Remote UI）通過。E2E首次有1項`ERR_NO_BUFFER_SPACE`失敗，未改程式、相同命令重跑20項通過；原始失敗與重跑都保留於[本輪紀錄](privacy-final-gates-2026-09-29.md)，不將它改寫為從未失敗。Google描述對齊另經真匿名GET200確認，沒有本輪新表單送出；不由本機stub推定外部PASS。

| ID | 情境 | 必要斷言／層級 |
| --- | --- | --- |
| PRIV-90-01 | Privacy頁政策 | 明確最長90天、到期刪除或去識別、較長期案例另取適當同意；render／E2E |
| PRIV-90-02 | 公開聯絡 | 精確`csfishy@gmail.com`，Privacy問題、資料刪除／Beta問題用途可見；render／E2E |
| PRIV-90-03 | mailto／複製 | 正確地址及編碼主旨`ScamShield Privacy / Data Request`，不帶正文／附件／IP；可複製、可鍵盤操作；unit／E2E |
| PRIV-90-04 | 舊占位文字 | 新公開頁沒有舊保存／聯絡TBD或待確認占位；歷史驗收文件可保留原始缺項，不由snapshot測試抹除；render／E2E |
| PRIV-90-05 | 各服務保留區分 | 應用／Redis／OpenAI／部署日誌／Google分層，不宣稱所有平台零留存；render |
| PRIV-90-06 | Redis敘述 | HMAC降低直接識別但不是完全匿名，不稱原始IP入key／一般log；render＋來源檢查 |
| PRIV-90-07 | Provider敘述 | `store:false`僅相應Response儲存行為；防濫用／安全保留另述、不稱已ZDR；render＋adapter不變核對 |
| PRIV-90-08 | 回饋UI政策一致 | 首頁／成功／錯誤可達Privacy聯絡，90天文案與集中常量一致；unit／E2E |
| PRIV-90-09 | 首頁告知與連結 | Privacy link可達；姓名／電話／帳號／信用卡／OTP遮蔽與雲端AI、Beta誤判／低風險限制清楚；E2E |
| PRIV-90-10 | 錯誤回饋可操作 | AI OFF／quota錯誤仍能找Privacy聯絡、複製Request ID、回饋不需成功分析；E2E |
| PRIV-90-11 | 公開Email非secret | Email來自公開常量，不依server-only秘密env；允許出現在public bundle，秘密仍不得；unit／bundle |
| PRIV-90-12 | Email不流入分析 | 公開聯絡Email不加入Redis命令／AI payload／分析API契約；本機Provider替身及payload檢查，不呼叫真AI |
| PRIV-90-13 | 外部政策對齊 | 真Google說明的90天／Email／刪除政策由獨立外部紀錄確認；本機route stub不代替；人工 |
| PRIV-90-14 | 90天人工操作 | Forms、linked Sheets、exports均有期限／刪除流程；無自動刪除引擎，不以文件PASS冒充清理已執行；文件覆核 |
| PRIV-90-15 | 部署gate區分 | 本機實作／測試PASS仍需另授權部署與匿名Privacy頁確認；Production `PRIVACY_COMPLETENESS`不提前PASS |

執行`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`npm run verify:bundle`及相關`npm run test:e2e`，另作diff check與secrets scan。Email為本輪明確授權的公開產品資訊，不把它當秘密誤報；Redis／HMAC／Provider憑證仍嚴格檢查。unit／integration／E2E數量以實際runner輸出記錄，不把同一批測試重複相加。

Production保持`ANALYSIS_ENABLED=false`及runtime `disabled`。本輪不因手機流程準備或品質計畫新增真實AI呼叫，`AI_QUALITY_GATE`／`IPHONE_PWA_ACCEPTANCE`維持NOT_RUN；有限AI計畫只能作下一輪明確calls／美元預算核准的輸入，不降低第6節品質門檻。
