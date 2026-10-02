# Natural daily reset and structured text reliability regression — 2026-09-30

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

**結論：`DAILY_QUOTA_NATURAL_RESET=PASS`；`STRUCTURED_TEXT_RELIABILITY_REGRESSION=FAIL`；`PUBLIC_BETA_REOPEN_READINESS=BLOCKED`；`PUBLIC_BETA=PAUSED`。** 同一來源 IP 的每日額度在台北時間跨日後自然恢復，第 1 例成功進入 Provider；但 Provider 結果再次因 `signals[].reason` 結構殘留而回 HTTP 500。依停止條件，第 2 例未執行，沒有重送或更換案例。

## Baseline 與自然跨日證據

- Repository `csfishy/scamshield-ai`；`origin/main`、本機 main 與 Production 均為 `a7223400846d4e30b964c58545e5e921566280d4`。起始安全部署 `dpl_7CPuGKa2LvBYT2rZbcDi5g2fMUTD` READY，canonical alias `https://scamshield-ai-fawn.vercel.app` 正確。起始 `ANALYSIS_ENABLED=false`、Redis runtime=`disabled`、control TTL=`-1`、WAF inactive／0 rules／無 draft；Public Beta PAUSED。
- Redis 伺服器時間 `2026-09-29T16:11:19Z`，為 **Asia/Taipei 2026-09-30 00:11:19**。Lua 計算日為 `20726`。全站鍵仍存前一日 `day=20725,count=10`，TTL 約 48 分鐘，但新日有效計數為 0，有效租約 0。
- 使用與前一輪相同的本機測試來源，僅在記憶體內取得對外 IP、以 Production 專用 HMAC 計算 Redis key；不輸出 IP、HMAC 或秘密。該鍵仍存 `day=20725,count=10`，TTL 約 47 分鐘，與 9/29 被拒絕時的來源一致；新日有效計數為 0。沒有 DEL、FLUSH、修改 TTL／計數／receipt／namespace、切換網路、代理或提高限制。
- 第 1 例獲准後讀回同一來源 `day=20726,count=1`，全站 `day=20726,count=1`，receipt=`started`，有效租約 0。因此同一來源隔日確實自然取得新的每日分析額度。這是自然重置的實際 Production 證據，不是以 429 或 mock 推論。

## 隔離與費用前置

- 使用新的一次性 256-bit 隨機私有 header 建立 Vercel 自訂 WAF，拒絕缺少或不符 header 的所有專案 POST。無 header／錯誤 header 的 `/analyze` POST 均由 WAF 回 403；正確 header 在 AI 雙重 OFF 時到達應用程式並得到 503 `analysis_disabled`、`providerEntered=false`。首頁、Demo、Privacy 匿名 GET 均為 200；首頁仍有意見回饋與 Google Forms 入口。本輪未重新提交表單。
- 暫設 `ANALYSIS_ENABLED=true`，Redis runtime 仍 `disabled`；同 SHA 暫時部署 `dpl_EtGAqW5xeVRVjGKTwZ2MrdEc2hpr` READY，canonical alias 正確。受控 POST 再次為 503 `analysis_disabled`，遙測 `providerEntered=false`，才開始固定案例。
- 固定兩張 900×650 fixture 的 SHA-256 與既有 fixture lock 一致；prompt SHA-256 仍為 `e9e9c7b477310fb70b4f0746e104dc1cb55624b9d0a07e22c77ac557e6b22652`，模型 `gpt-4.1-mini-2025-04-14`、output cap 2400、Provider retries 0 均未變。2026-09-30 查驗官方 [標準價格](https://developers.openai.com/api/docs/models/gpt-4.1-mini)為 input US$0.40／M、output US$1.60／M；[Fast 價格](https://openai.com/api-fast-mode/)為 US$0.70／M、US$2.80／M。以每例最多 8,988 input、2,400 output token 與 Fast 價格加 10% 餘裕，兩例預留估算 US$0.02862552，低於授權 US$0.03。這不是 Provider 帳單硬上限。

## 固定案例與品質結果

| 項目 | Call 1：`high-risk-delivery-fee` | Call 2：`high-risk-customer-otp` |
| --- | --- | --- |
| 受控提交 | 1 次，沒有重送 | NOT_RUN |
| HTTP／Request ID | 500 `analysis_failed`／`56dc7a54-2cac-48c8-8d94-f11158a554e2` | NOT_RUN |
| Provider／usage | `providerEntered=true`、`usageKnown=true`，input 1,939、output 332 tokens | 無呼叫、無 usage |
| 費用估算 | 以較高 Fast 價格估算 US$0.0022869；實際帳單層級待 Provider 確認 | 未產生本輪第 2 例 AI 費用 |
| 額度／租約 | `quotaOutcome=started`；全站 0→1，同一 IP 0→1；`leaseDisposition=released`、有效租約 0 | NOT_RUN |
| 錯誤診斷 | `failureKind=schema`、`schemaFailureStage=structural_debris`、`schemaFailureField=signal_reason` | 不適用 |
| riskScore／riskLevel／category | 無可交付分析結果 | NOT_RUN |
| 人工語意覆核 | 無成功結果可覆核；NOT_RUN | NOT_RUN |

Call 1 回應後 Redis runtime 立即設回 `disabled`／TTL=`-1`。結構殘留未透過成功契約交付：**structural-debris safety fail-safe=PASS，但輸出可靠性=FAIL**。沒有記錄 Provider 原始輸出或完整分析文字。執行紀錄已鎖定停止，第 2 例與所有重試均未執行。Provider calls **1／2**，自動重試 0、人工重試 0，已知 usage calls 1、unknown usage calls 0；保守累計估算 US$0.0022869／US$0.03。

## 最終安全復原

依序將 Redis runtime 設為 `disabled`，再恢復 `ANALYSIS_ENABLED=false`，以同 SHA 重新部署 `dpl_44nTNSXG2wmvR9QabvRfWjbsqEsm`。該部署 READY、canonical alias 正確；WAF 存在時安全 POST 為 503 `analysis_disabled`、`no-store`、有效 Request ID、`providerEntered=false`。完成雙重 AI OFF 後移除本輪 WAF：firewall inactive、custom rules=0、無 draft；本機私有 header 檔已刪除，平台可能保留設定／稽核歷史。移除 WAF 後匿名 `/analyze` POST 可進 application，但仍回 503 `analysis_disabled`、`no-store`，Request ID `e62425f9-97d1-4bf7-8676-dbcb3001d0c9`，遙測 `providerEntered=false`。最終 Redis control=`disabled`、TTL=`-1`，Public Beta PAUSED。

## Gates

| Gate | 本輪結論 |
| --- | --- |
| DAILY_QUOTA_NATURAL_RESET | **PASS**：同來源、無人工重置，新日 0→1 並進入 Provider |
| LOCAL_IMPLEMENTATION／LOCAL_AUTOMATED_TESTS | 前輪同 SHA PASS；本輪未改程式、未重跑 |
| REDIS_INTEGRATION | NOT_RUN（未重跑隔離 Redis 競態套件；本輪 Production 自然跨日與 receipt 實測另列） |
| PRODUCTION_HTTP_REDIS_RUNTIME_GATE | PASS（雙重 OFF、安全 HTTP、runtime／TTL、額度讀回） |
| FEEDBACK_EXTERNAL_ACCEPTANCE／PRIVACY_COMPLETENESS／IPHONE_PWA_ACCEPTANCE | 本輪 NOT_RUN；不把歷史驗收當成重測 |
| AI_QUALITY_GATE | FAIL（新 prompt 的固定高風險案例沒有可交付結果） |
| SCHEMA_FAILURE_DIAGNOSTICS | PASS（本次 500 有安全的固定 stage 與 field） |
| STRUCTURED_TEXT_RELIABILITY_REGRESSION | **FAIL**（Call 1 再現 `structural_debris / signal_reason`；Call 2 未執行） |
| PRODUCTION_DEPLOYMENT | PASS（同 SHA，最終 AI OFF 部署 READY） |
| PRODUCTION_ACCEPTANCE | FAIL（輸出可靠性 Gate 未過） |
| PUBLIC_BETA_REOPEN_READINESS | **BLOCKED** |
| PUBLIC_BETA | **PAUSED** |

本文件是本機新增的延續證據；不為更新驗收文件再次部署。後續需另行決策，不能在本輪放寬 validator、更換模型或 prompt、清額度、重送案例，亦不能自行重新開放 Public Beta。
