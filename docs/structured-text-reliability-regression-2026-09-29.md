# Structured text output reliability regression — 2026-09-29

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

**結果：未能執行付費輸出回歸；Public Beta 維持 PAUSED。** 固定第 1 例的唯一 HTTP POST 在進入 Provider 前被目前來源 IP 的 `daily_quota_exceeded` 拒絕。沒有更換 IP、清除額度、重送或執行第 2 例。`STRUCTURED_TEXT_RELIABILITY_REGRESSION=NOT_RUN`，`PUBLIC_BETA_REOPEN_READINESS=BLOCKED`。這不能作為新 prompt 已改善可靠性的證據。

## 問題與修補

- 前一版 Production `b39768fb322f6516af8097c9871a4fe0656a1fd3` 的單次診斷：固定 `high-risk-delivery-fee`，HTTP 500 `analysis_failed`，Request ID `2a15acfa-e928-4da2-8c56-62512fee3953`，安全遙測 `schemaFailureStage=structural_debris`、`schemaFailureField=signal_reason`、`providerEntered=true`。舊 Launch 500 無 stage，不能推定為相同原因。
- 從該 SHA 建立 `codex/harden-structured-text-output`，修補 commit `a7223400846d4e30b964c58545e5e921566280d4` 已推送功能分支並以 fast-forward 推送 main。只修改 prompt、OpenAI `summary`／`signals[].reason`／`recommendations[]` 的欄位說明及直接相關測試。prompt SHA-256：`e9e9c7b477310fb70b4f0746e104dc1cb55624b9d0a07e22c77ac557e6b22652`。
- 明確要求文字欄位只含自然語言，不把外層 JSON 序列化符號附在字串尾；允許合法句中單一 `}` 或 `]`。三種欄位各有特定 JSON Schema description。沒有加入 `pattern`、silent repair 或自動重試。
- `hasStructuralDebris()`、模型 `gpt-4.1-mini-2025-04-14`、temperature 0、max output 2400、`store:false`、`tools:[]`、公開成功契約、風險分數與分類、Redis／額度、圖片流程與 Provider `maxRetries:0` 均未變更。

## 本機驗證

Node 24.19.0、Corepack 執行 npm 12.0.2；`npm ci` 安裝 391 packages，稽核 0 vulnerabilities。`npm run typecheck`、`npm run lint -- --ignore-pattern 'deliverables/**'`、`npm test`（369 passed）、`npm run test:integration`（24 passed）、`npm run build`、`npm run verify:bundle`（37 browser files，0 server-only markers）與 `npm run test:e2e`（20 passed）均通過。`git diff --check` 與本次新增差異的秘密樣式掃描通過。

整合測試覆蓋正常 200，以及 signal reason、summary、recommendation 各自的結構殘留安全 500：每例只進入本機 Provider 替身一次，公開回應與安全遙測不含殘留原文。既有 `output_json_parse`、`provider_outcome` 等診斷測試仍通過。一次格式化後誤將 `npm test` 與 `test:integration` 同時執行，兩個 runner 爭用同一 Next.js 開發目錄而失敗；改為依序重跑後分別為 369／24 passed。此衝突不作為功能通過證據。

## Production 部署與隔離

- main push 觸發 AI OFF 部署 `dpl_2jafP7EStbPy3akqd2vwXsY5i5PX`，SHA `a722340…`、READY、canonical alias `https://scamshield-ai-fawn.vercel.app` 正確。首頁／Demo／Privacy HTTP 200；首頁有意見回饋與 Google Forms 連結。安全 POST HTTP 503 `analysis_disabled`、`Cache-Control: no-store`、Request ID 有效、遙測 `providerEntered=false`。這輪未重新送出 Google 表單。
- 一次性 Vercel 自訂 WAF 使用只存在已忽略本機檔案的 256-bit 隨機私有 header，規則拒絕缺少或不符 header 的所有專案 POST；因此 `/analyze` 無 header／錯誤 header 都是平台 403，GET 首頁／Demo／Privacy 都是 200。正確 header 在 AI 雙重 OFF 時到達應用程式並得到安全 503，遙測 `providerEntered=false`。沒有將 header 值寫入 Git、URL 或本文件。
- 暫時把部署 gate 設為 `ANALYSIS_ENABLED=true`，Redis runtime 保持 `disabled`；同 SHA 部署 `dpl_HkMNWFqpUHYXDWVfCM7yUHQyUXGB` READY、alias 正確。受控安全 POST 仍為 503 `analysis_disabled`、`providerEntered=false`。
- 付費窗口前 Redis 時間與額度可讀，當日全站已用 10／200，有效租約 0，runtime `disabled`／TTL `-1`。兩張固定 900×650 素材的 SHA-256 均符合既有 fixture lock。官方 [GPT-4.1 mini 標準價](https://developers.openai.com/api/docs/models/gpt-4.1-mini)為 input US$0.40／M、output US$1.60／M；[Fast 價格](https://openai.com/api-fast-mode/)為 US$0.70／M、US$2.80／M。以每例最多 8,988 input、2,400 output token 的保守預留及 10% 餘裕，兩例估計上限 US$0.02862552，低於授權 US$0.03。實際服務層級與帳單需以 Provider 為準；這是估算，不是金額硬上限。

## 固定案例執行紀錄

| 欄位 | 第 1 例 `high-risk-delivery-fee` | 第 2 例 `high-risk-customer-otp` |
| --- | --- | --- |
| 提交 | 1 次受控 HTTP POST，未重送 | NOT_RUN |
| HTTP／Request ID | 429 `daily_quota_exceeded`／`d4df9106-4c92-4a27-9cef-75ebccf477e3` | NOT_RUN |
| `providerEntered`／Provider calls | `false`／0 | 0 |
| usage／估算 AI 費用 | `usageKnown=false`，沒有 Provider 使用量；已確認 Provider 未進入，估算 US$0 | US$0 |
| `quotaOutcome`／lease | `denied`；全站計數 10→10、有效租約 0→0、無 receipt | NOT_RUN |
| `schemaFailureStage`／field | 不適用；Provider 沒有輸出 | 不適用 |
| risk／category／人工品質覆核 | 無分析結果，NOT_RUN | NOT_RUN |

被拒絕的原因是**此次來源 IP** 的每日額度已用完；這不能改寫成 Provider／schema 失敗。操作腳本在回應後立即把 Redis runtime 設回 `disabled`；安全遙測 `providerEntered=false`，Provider 自動與人工重試均為 0。第 1 例沒有可覆核的模型內容，依固定順序與不重送要求，第 2 例未執行。

## 最終安全狀態與 Gates

先關 Redis runtime，再把部署設定恢復 `ANALYSIS_ENABLED=false`，以同 SHA 重新部署 `dpl_7CPuGKa2LvBYT2rZbcDi5g2fMUTD`。該部署 READY、canonical alias 正確；WAF 啟用時安全 POST 503 且 `providerEntered=false`。之後移除本輪 WAF，自訂規則 0、WAF disabled，並刪除本機私有 header 檔。移除後未帶 header 的公開 POST 可到應用程式，但仍是 503 `analysis_disabled`、`no-store`、有效 Request ID `04561d23-4d97-48ce-8d4a-e35b3669c374`、`providerEntered=false`。最終 Redis=`disabled`、TTL=`-1`，`ANALYSIS_ENABLED=false`，`PUBLIC_BETA=PAUSED`。

| Gate | 本輪狀態 |
| --- | --- |
| LOCAL_IMPLEMENTATION／LOCAL_AUTOMATED_TESTS | PASS／PASS |
| REDIS_INTEGRATION | NOT_RUN（本輪未重跑真 Redis 競態套件；Production Redis 健康與 runtime／額度只做安全讀取） |
| PRODUCTION_HTTP_REDIS_RUNTIME_GATE | PASS（安全 503、Redis runtime 與 TTL 實測） |
| FEEDBACK_EXTERNAL_ACCEPTANCE／PRIVACY_COMPLETENESS／IPHONE_PWA_ACCEPTANCE | 本輪 NOT_RUN；既有其他 SHA 的驗收不可冒充本輪重測 |
| AI_QUALITY_GATE | NOT_RUN（新 prompt 無 Provider 輸出） |
| PROVIDER_TEXT_DEBRIS_REGRESSION | NOT_RUN（本輪無 Provider 輸出；歷史通過不代表新 SHA） |
| SCHEMA_FAILURE_DIAGNOSTICS | 歷史診斷 PASS（`b39768f…`）；本輪不適用 |
| STRUCTURED_TEXT_RELIABILITY_REGRESSION | NOT_RUN，受 IP 日額度阻擋 |
| PRODUCTION_DEPLOYMENT | PASS（AI OFF，新 SHA） |
| PRODUCTION_ACCEPTANCE／PUBLIC_BETA_REOPEN_READINESS | BLOCKED／BLOCKED |
| PUBLIC_BETA | PAUSED |

後續若要完成可靠性驗收，需另行安排重置後的新受控窗口與明確授權；本輪不自行重送、不換來源 IP、不清額度，也不開放 Beta。
