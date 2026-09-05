# ScamShield AI Software Design Document（SDD）

- 文件版本：2.0
- 日期：2026-09-04
- 狀態：A+B 實作與自動測試已整合；單次真實 AI smoke 已人工覆核，受保護 Preview 已部署；完整 AI／Preview Remote／實機 gate 未完成
- 主要 Owner：程式設計師 B（AI／Backend）；A 共同維護 Client 與共用介面
- 適用範圍：三日 Buildmode MVP

## 1. 文件使用方式與現況

本文件保留目標設計。2026-09-04 B 已建立根 Next.js／Backend／單一 OpenAI
adapter，vercel.json 已轉 Next.js；本機驗證見 [B 進度](backend-progress.md)。
完整 AI 評估、Preview Remote API 與 A 實機 UI/PWA 尚未通過。舊 `src/app/ScamShield.Web`
Blazor Mock 與 ContractChecks 保留，不能當 v2 驗收依據。

閱讀順序：[產品](product-plan.md) → [架構](architecture.md) →
[API contract](api-contract.md) → 本 SDD → [測試](test-plan.md) →
[部署與遷移](deployment-runbook.md)。排程見[三日計畫](buildmode-mvp-plan.md)。

規範權責：

| 主題 | 唯一規範來源 |
| --- | --- |
| HTTP 欄位、錯誤碼、大小與 enum | API contract v2 |
| 技術選擇與邊界 | architecture.md |
| 內部流程、模組、設定與評分設計 | 本文件 |
| 測試案例、門檻、證據格式 | test-plan.md |
| 部署、操作、遷移與回復 | deployment-runbook.md |

「必須」是開發驗收要求；「目標」需實測；「待決」不可視為已完成。
發現衝突時先修正文件，不由各實作者自行猜測。新增 API 欄位須先修訂 contract。

## 2. 需求與可追溯識別碼

| ID | 需求 | Owner | 驗證群組 |
| --- | --- | --- | --- |
| FR-01 | 單張 JPEG／PNG，選圖預覽後明確提交 | A | UI |
| FR-02 | multipart、大小、格式與實際解碼驗證；無效輸入不呼叫 AI | B | API、IMG |
| FR-03 | 一個真實圖片 AI Provider，輸出繁中風險與行動 | B | AI |
| FR-04 | 六欄 success schema，後端唯一推導 riskLevel | B／A | CONTRACT |
| FR-05 | 無法分析回 422；有可用證據但類型不明可回 unknown | B／A | AI、UI |
| FR-06 | 錯誤映射、取消、手動重試、禁止靜默 Mock fallback | B／A | NET、UI |
| FR-07 | 明確 Demo 模式、三組 fixtures，無網路可操作預載 Demo | A／B | UI、DEPLOY |
| FR-08 | Next.js 同源網站與 API，Vercel 部署 | B／A | DEPLOY |
| NFR-01 | 圖片與完整輸出不進 application log／持久儲存 | B／A | PRIVACY |
| NFR-02 | 有限時間、有限呼叫次數、成本與濫用控制 | B | NET、OPS |
| NFR-03 | 案例集、保留驗收集與可重現版本紀錄 | B／產品 | AI |
| NFR-04 | 手機操作、鍵盤操作、結果通知與 PWA 更新 | A | UI、DEPLOY |

## 3. 技術與目錄設計

採 Next.js App Router、React、TypeScript strict、Node.js runtime、Zod schema。
圖片解碼預定使用 sharp；其 constructor 可設定像素限制，但仍須實際解碼，
不能只讀 metadata 就認定檔案完整。[sharp 官方文件](https://sharp.pixelplumbing.com/api-constructor/)

Zod 同時提供執行時 schema 與型別推導；禁止以 TypeScript 型別斷言取代
對 HTTP／AI 資料的驗證。[Zod 官方文件](https://zod.dev/)

下列 B 路徑已建立，A UI/PWA 路徑仍待 A 完成；在 repo 根目錄建立 Next.js 專案，
保留既有 `src/app/ScamShield.Web*` 作為遷移參考：

| 規劃路徑 | 責任 | Owner |
| --- | --- | --- |
| app/layout.tsx、app/page.tsx | Shell、頁面與公開模式設定傳遞 | A |
| app/analyze/route.ts | POST /analyze、Node runtime、HTTP adapter | B |
| components/analysis/* | 選圖、loading、結果與錯誤元件 | A |
| lib/contracts/analysis.ts | 嚴格 success／error schema、enum、限制常數 | B，A review |
| lib/client/analysis-service.ts | 同源 fetch、AbortController、response validation | A |
| lib/server/analyze.ts | Request pipeline 與 deadline | B |
| lib/server/image-validation.ts | 有界讀取、解碼與正規化圖片 | B |
| lib/server/ai/provider.ts | Provider 中立內部介面 | B |
| lib/server/ai/providers/* | 單一實際 adapter | B |
| lib/server/ai/normalize.ts | Provider result → public result | B |
| lib/server/config.ts、errors.ts、telemetry.ts | 設定、錯誤、去識別化事件 | B |
| prompts/scam-analysis-v1.md | 版本化 prompt 來源，不放 public | B |
| fixtures/demo/* | 去識別化 Demo 輸入與 contract responses | B／企劃 |
| tests/unit、tests/integration、tests/e2e | 自動化驗收 | B／A |
| tests/evaluation/* | 案例 manifest 與評估紀錄；不預設公開圖片 | B |
| public/* | Icons、manifest、離線畫面與 service worker | A |

server 模組使用 server-only 邊界，client 只能引用 contract 與 client service。
初始化時須明確限制 TypeScript／測試掃描範圍，避免舊 .NET 資料夾被當成新 app。
Day 1 鎖定互相相容的 Next.js、React、Node LTS、TypeScript、Zod、sharp、
測試工具與 Provider SDK 版本，提交 lockfile；本文件不虛構已安裝版本。

## 4. 內部介面與資料

以下為設計描述，並非新增 public API：

| 物件 | 欄位與語意 |
| --- | --- |
| ValidatedImage | 經解碼與方向正規化的 bytes、mimeType、width、height、sizeBytes |
| AnalysisContext | requestId、source、language、deadline、AbortSignal、promptVersion |
| ProviderOutcome | discriminated union：analyzed 或 insufficient_evidence |
| analyzed payload | integer riskScore、category、summary、signals、recommendations；不信任 provider riskLevel |
| insufficient_evidence payload | 內部原因分類：unreadable、irrelevant、missing_context、refusal |
| ProviderUsage | 可取得的 token／image usage、latency；unknown 不記為 0 |
| Public result | 完全符合 API contract 六欄，無 Provider／版本／用量欄位 |

Provider adapter 概念簽章：
`analyze(ValidatedImage, AnalysisContext) → ProviderOutcome + optional usage`。
Provider-specific response 必須先轉成此中立格式。模型若輸出未知 union 狀態、
缺欄或無法驗證的值，視為 schema failure，不推測為成功。

不需要泛用 plugin registry、多 Provider routing、agent loop 或工具調用。
Provider 與模型由可信伺服器設定決定，不能由 multipart 欄位覆寫。

## 5. API request pipeline

1. 產生伺服器 requestId，讀取已驗證設定，建立 API deadline。
2. 套用部署端存取／限流控制；路由僅接受 contract 方法與媒體類型。
3. 以總 body 上限進行有界讀取。Content-Length 可供提早拒絕，但缺少或偽造時
   仍以實際收到的 bytes 計數；不可先無限制呼叫 formData 再檢查大小。
4. 解析 multipart，檢查欄位、重複值、filename 長度與檔案上限。
   有界 body 完成後可重新建立 Request 解析表單，或使用有界 multipart parser。
5. 驗證 signature、宣告 MIME、副檔名與實際格式；取得尺寸並限制像素。
6. 強制完整 decode；拒絕多 frame／動畫與破損檔。校正 EXIF 方向、
   移除 metadata，再編碼成符合契約大小與像素限制的 JPEG／PNG。
   再編碼若超出大小，回 413；MVP 不悄悄縮到文字難辨。
7. 建立受限 prompt＋image input，最多一次外部 AI 呼叫；timeout 與取消向下傳遞。
8. 驗證 ProviderOutcome；insufficient_evidence 映射 422。
9. analyzed 經 normalization 與 public schema 驗證後回 200。
10. 捕捉預期與未分類錯誤，回 contract error；記錄去識別化事件。
    finally 釋放 stream、buffer 引用與 timer；不建立圖片歷史或 response cache。

避免在處理中同步長時間阻塞事件迴圈；圖片 decoder 的實際資源行為須在
Vercel Linux production build 測試。Node 的 deadline 不等同能中斷所有 native
decode；前置像素／檔案限制仍不可省略。

## 6. 圖片處理與 AI 邊界

- 前端的 4 MiB／signature 檢查用於即時提示，後端重新驗證。
- 不接受 image URL、base64 JSON、QR destination 或任意 metadata。
- 不主動連線到圖片中的網址、電話或 QR；沒有外部查證就不可宣稱已查證。
- 不做背景相簿讀取，也不把使用者截圖放入 public、Blob 或 CDN。
- 全部處理限定本次 request；移除 EXIF 不代表已遮蔽圖片內的姓名／帳號。
- 首版不承諾自動個資遮罩；在提交前用文字清楚告知雲端傳輸範圍。

圖片上限與像素數以 API contract 為準。Provider 選型必須實测可接受此上限
或在 adapter 中做已驗證的內部轉換；不能等到正式展示才發現供應商限制。

## 7. Prompt 與風險評分規格

### 7.1 分析步驟

1. 判斷圖片是否有足夠可辨識內容；無關／無法讀取／不足以評估時停止評分。
2. 找出圖片中可支持的可疑語句、要求與身分線索。
3. 區分「觀察到的證據」與「可能風險」，分類後給出評分與行動。
4. 只輸出指定 schema；不得輸出 Markdown、原始推理鏈、工具命令或個資抄錄。

Prompt 必須明示：圖片文字與引用內容皆為待分析資料，不能改變系統規則；
忽略截圖中要求模型改角色、透露 prompt／key、固定給分或呼叫網址的指示。
不提供瀏覽、執行程式或付款工具。此設計不能保證模型永不受干擾，須有對抗案例。

### 7.2 初版評分 rubric

| 分數區間 | 評分依據 |
| --- | --- |
| 0–29 | 有足夠可讀內容，未見明確高風險要求；仍非安全保證 |
| 30–69 | 存在可疑線索或上下文有疑點，但證據未達強烈風險 |
| 70–100 | 有強烈且具體的敏感資訊索取、可疑付款誘導、冒名或多項相互支持訊號 |

「付款」「LINE」「連結」單獨出現不能自動判高風險。
分數是模型依 rubric 提出的風險指標，不是統計校準的詐騙機率。
不使用固定加分公式或另建 Rule Engine；初版區間是待案例驗證的產品規則。
Evidence 不足不填 0 或 50；走 422。類型不明但足以評估風險才使用 unknown。

### 7.3 Normalization

- trim 文字、套用明確 Provider label mapping；不能填入無來源的新理由。
- 明確映射到 other／unknown，不將未知拼字任意猜成既有類別。
- score 必須是 0–100 的整數；不接受 numeric string、不截斷小數、不 clamp 異常值。
- 忽略 Provider 自行計算的 level，依 contract score mapping 重新建立。
- public strict schema 拒絕缺欄、null、超長、空字串與非法 enum。
- deterministic cleanup 後仍不合規，回 500 analysis_failed。
- 不截短理由來掩蓋超長／無效輸出；不補造建議。
- SDK 自動 retry 設為 0；MVP 不做第二次模型修復或自動切 Provider。

Prompt 修改、模型修改與 mapping 修改都需要版本紀錄與 AI 回歸結果；
promptVersion 作為內部 telemetry，不加入 public response。

## 8. 時間、重試與錯誤設計

初始設定（屬待量測配置，不是已達成效能）：

| 設定 | 初值 | 起算點 |
| --- | --- | --- |
| Provider timeout | 15,000 ms | 開始 Provider HTTP 呼叫 |
| API budget | 20,000 ms | Route Handler 進入 |
| Client timeout | 25,000 ms | 使用者提交、fetch 開始 |
| Function maxDuration | 30 seconds | 平台 invocation |

Provider 實際 timeout = min(15 秒, API 剩餘預算減 2 秒回應保留時間)；
剩餘預算不足就回 503，不再開始付費呼叫。API deadline 20 秒到期時中止工作；
能回應則回 503。Client timeout 包含上傳時間，慢網路可能先取消，須實測。
請求取消不保證 Provider 已停止計費，不宣稱「取消即免費」。

已知輸入錯誤 → contract 對應 4xx；Provider 限流 → 429；
timeout／連線／暫時服務異常 → 503；無法修復的 schema 或未分類錯誤 → 500。
SDK 認證／模型設定錯誤對外回 503，對內記錄設定錯誤類別並通知 B，
不要鼓勵無限重試。HTTP body 不包含 exception detail。

Client 不自動重送 POST；提供明確手動重試。SDK、HTTP wrapper、UI 都須檢查
不存在隱含 retry。每次手動重試是新的分析，可能有新費用與不同結果。

## 9. Client 狀態與 A 的整合要求

狀態：idle → reading → ready → analyzing → success／error；
任何狀態可在適當清理後回 idle。

- 開始讀取新圖片前，取消舊 request、清除舊 result／error／選取資料；
  讀取失敗不能讓上一張圖仍可送出。
- reading／analyzing 時停用提交；handler 也檢查 busy，避免重複事件。
- 每次選圖與提交有 generation ID；舊 response 不得覆蓋新選取狀態。
- Reset／頁面卸載取消 request，撤銷 object URL；重選同檔案仍能觸發。
- 使用 object URL 預覽，避免同時保留多份 base64 字串與 bytes。
- result 在 schema 驗證成功前不顯示；驗證 score 與 level 一致，
  遇到矛盾拒絕結果，不在 Client 自行改 level。
- 422 顯示重拍／補完整截圖建議；non-retryable 不提供原圖直接重送按鈕。
- 413 non-JSON 平台回應仍顯示縮小圖片；429 提示稍後重試；
  502／503／504 non-JSON 顯示服務暫時不可用。
- loading 與完成結果以可存取 status／focus 通知；風險不只靠顏色區分。
- 分析分數旁標示「風險指標，非詐騙機率」；低風險仍提醒官方查證。

Mock 由 A 的 client service 選擇 fixtures，走同一 public schema；
B 提供正常、假物流、假客服樣本。不能根據任意圖片猜測 fixture 再冒充分析。
畫面顯示「示範資料，未分析此圖片」。Remote 模式不自動降級。

## 10. 環境設定與可觀測性

| 設定名稱（規劃） | 值／預設 | 可否提供瀏覽器 |
| --- | --- | --- |
| ANALYSIS_MODE | mock（預設）或 remote | 僅此 allowlisted 值可由 Server 傳給 Client |
| AI_PROVIDER | openai；remote 必填，採用確認／憑證待提供 | 否 |
| AI_MODEL | gpt-4.1-mini-2025-04-14；remote 必填，真實評估待完成 | 否 |
| AI_API_KEY | remote 必填 | 否 |
| AI_TIMEOUT_MS | 15000 | 否 |
| ANALYSIS_TIMEOUT_MS | 20000 | 否 |
| CLIENT_TIMEOUT_MS | 25000 | 是，僅數值 |
| maxDuration | route 設定 30 秒 | 非 secret，但不作業務 UI |
| PROMPT_VERSION | 與 repository prompt 一致的版本 | 否 |

大小與 enum 為 contract 常數，不能用環境變數任意改成另一套 API。
啟動／第一次請求驗證設定，無效模式或 remote 缺 key 不得自動退為 mock。
`ANALYSIS_MODE=mock` 時 /analyze 不呼叫 Provider，回 503；
頁面用本機 fixtures，避免 API 成功結果與假資料混淆。

Secrets 不使用 NEXT_PUBLIC 前綴、不放 next.config 的公開 env mapping、
不由 Server Component 序列化整份設定。NEXT_PUBLIC 變數會進 client bundle，
見 [Next.js 環境變數文件](https://nextjs.org/docs/app/guides/environment-variables)。

Application event allowlist：requestId、deployment revision、promptVersion、
內部 model ID、mode、status、errorCode、durationMs、imageByteCount、
width／height、可用的 usage／estimatedCost。以有限類別記錄錯誤，
禁止直接 log exception object、Provider response、prompt、filename、
圖片內容／base64、完整 reason／summary、完整 IP 或使用者識別資訊。

本系統不主動持久保存 upload；Provider 與平台可能有其日誌／保留政策，
上線前必須確認並記錄。不得宣稱整條供應鏈「零保存」。

## 11. 成本、存取與濫用控制

- 一次合法分析最多一次 Provider 呼叫；invalid input 不呼叫 Provider。
- B 設定 Provider 用量／支出控制與告警，驗證是否為硬上限，不能把告警當阻擋。
- Day 1 確认 Vercel 帳號可用的存取保護／部署端限流；Day 3 驗證規則實際生效。
- 不使用 Function 記憶體 Map 作跨 instance 全站限流；CORS 亦不是身份驗證。
- 無可靠限流或費用阻擋時，僅提供受控 Demo 存取，不作不限流公開 Remote 發布。
- 若需外部共享計數服務，先記錄架構變更；目前不預設 Redis／資料庫。
- 不能把同源視為防濫用；非瀏覽器 client 仍可直接呼叫。
- 模型輸出只作純文字顯示，不轉成任意 HTML 或自動可點擊的可疑 URL。

## 12. 開發決策紀錄

| ID | 決策 | 原因與代價 |
| --- | --- | --- |
| ADR-01 | Next.js＋TypeScript＋Vercel 取代目標 .NET 架構 | 同源部署與共用 schema；須移植前端 |
| ADR-02 | POST /analyze Route Handler、Node runtime | 保留 API，使用圖片 decoder；不採 static export |
| ADR-03 | 單張 4 MiB，總 body 4,300,000 bytes | 避開 4.5 MB 平台上限；10 MiB 原圖暫不支援 |
| ADR-04 | 單一 Provider、無 agent tools／自動重試 | 限制延遲、成本與外部行為 |
| ADR-05 | 422 insufficient_evidence | 將無法分析與低風險分開 |
| ADR-06 | 不存圖、不設會員／queue／DB | 三日可交付；無分析歷史 |
| ADR-07 | Client Mock fixtures、明確模式 | 離線備援；不冒充即時分析 |
| ADR-08 | 同源遷移仍需 service worker 切換驗證 | 舊 Blazor cache 可能阻止載入新 app |

## 13. 待決事項與完成時點

| ID | 待決 | Owner／期限 | 未完成時 |
| --- | --- | --- | --- |
| O-01 | Provider／模型、key 可用性、圖片規格與 structured output 支援 | B／Day 1 上午 | Remote 阻塞；Mock 可繼續但不算 AI 完成 |
| O-02 | 帳號方案、限流／受控存取、單日費用上限 | B＋產品／Day 1 | 不公開 Remote |
| O-03 | Prompt v1 與模型輸出上限設定 | B／Day 1 | 不做正式 AI 驗收 |
| O-04 | 套件／Node 版本、lockfile 與部署 build | B＋A／Day 1 | 不切換既有正式站 |
| O-05 | 案例授權、人工標註、holdout 與門檻確認 | 產品＋B／Day 1 | 不宣稱品質達標 |
| O-06 | Provider／平台保留政策、上傳告知文案 | B＋產品／Day 2 | 僅用去識別化測試素材 |
| O-07 | 實際 Preview／Production URL、展示裝置與 region | B＋企劃／Day 2 | 不標記部署完成 |

決策完成後將實際值、日期、負責人與驗證結果補入對應紀錄，不把 TBD 自動
當作可用預設。交付 Definition of Done 以測試計畫與部署手冊的 gate 為準。

### 2026-09-04 B 實作決策補記

- O-01：單一 adapter 固定 OpenAI `gpt-4.1-mini-2025-04-14`，採 Responses API＋strict JSON schema、store:false、maxRetries:0、temperature:0、max_output_tokens:2400。模型、帳號憑證與圖片輸入已完成一次本機真實 smoke；完整資料集與 Preview Remote 仍待驗證。[官方模型](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- O-03：`prompts/scam-analysis-v1.md` 已建立。Provider 內部 envelope 包含 outcome union，符合 structured outputs 的 root object 限制；不改 public 六欄 schema。[官方 Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- O-04：Node 24.19.0／Next 16.3.4／React 19.2.8／TypeScript 6.0.3／Zod 4.5.4／sharp 0.35.4／OpenAI SDK 7.10.0／npm 12.0.2，完整鎖定見 package-lock.json。本機 build 成功；Vercel 只可鎖 Node major，Linux native binary 仍需 Preview 驗證。
- O-05：30 張 synthetic candidates 與工具已建立，20/10 split；單次 `high-risk-delivery-fee` 輸出已獲專案負責人語意確認，其餘人工標註仍 pending，不算完整品質通過。
- O-02/O-07：Preview branch 已設 Remote config／secret，Vercel Authentication 已攔截未授權請求，最新 SHA Preview Ready；合法圖片、完整 contract headers、平台邊界與實際支出停止措施仍待驗證。O-06 保留政策仍待產品確認。
- 內部圖片 guard 另檢查 APNG chunks 與 JPEG MPF NumberOfImages，防止 decoder 只讀首 frame；禁用 sharp operation cache。不改 HTTP 限制。
- public contract 無修訂；BCP 47 使用完整 parser 接受 private-use／grandfathered，避免以 Intl 的子集靜默收窄 contract。
