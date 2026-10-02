# Public Beta 正式開放嘗試與緊急暫停（2026-09-29）

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

> **最終狀態：PUBLIC_BETA = PAUSED。** Public Beta 曾於台北時間 19:37:57 短暫開啟；唯一真實 AI launch smoke 回 HTTP 500，因此依事先核准的停止條件，立即停用 Redis runtime、關閉部署 gate，並部署相同 SHA 的安全版本。本文是本機未提交的驗收證據，不能作為目前仍開放 AI 的宣告。恢復須新的人工判斷或明確授權。

## Baseline 與範圍

- Repository：`csfishy/scamshield-ai`；`git fetch origin` 後 `origin/main` 與 local `main` 均為 `f1eb9a3150d3418b895a3cf31c2033dbbe90085a`。既有 Production 安全部署 `dpl_AySd7hwC4HLx6zUUK936GbsGkfL1` 為 READY，canonical `https://scamshield-ai-fawn.vercel.app` 指向它；`ANALYSIS_ENABLED=false`，Redis runtime=`disabled`／TTL `-1`。本輪開始的 Provider 呼叫數為 0；先前各輪的呼叫不計入本輪。
- 工作區原有 6 份 tracked 文件修改及既有未追蹤文件；逐檔雜湊未改。`deliverables/` 未讀取、修改、加入、stash、clean 或刪除。local env 未被追蹤；掃描追蹤檔，未發現本機 Redis token、HMAC secret 或 Provider key 形式的秘密。
- Production 專用 Redis `scamshield-production`／`production-beta`：與 Preview 憑證及 HMAC 分離、`noeviction`、開放前全站今日 8／200、有效租約 0。正式 Vercel 配置為 remote／OpenAI、已驗收的 `gpt-4.1-mini-2025-04-14` 與 `scam-analysis-v1`；Provider credential metadata 未變。額度 3／60 秒、每 IP 10／日、全站 200／日、並行 3；Provider SDK 與單請求 `maxRetries:0`。本輪未修改程式、模型、prompt、額度、Redis scripts 或憑證。
- 開放前匿名首頁、Demo、Privacy 均 HTTP 200；Privacy 顯示 90 天回饋政策、公開聯絡與刪除申請。Google 表單匿名 GET 為 200；Request ID、完整 build SHA、回饋類型三項預填正常，URL 不含圖片、IP 或秘密。本輪未提交表單回覆；既有外部回饋人工驗收另有歷史證據。

## 開啟時間線（Asia/Taipei，UTC+08:00）

| 時間 | 動作與證據 |
|---|---|
| 19:34 前 | 部署 gate 改為 `true`，Redis 保持 `disabled`／TTL `-1`。未送付費 AI 請求。 |
| 19:36:45 | 相同程式 SHA 的受控部署 `dpl_6JFQWLgZfH4FVsntZSJYBAgbdBiE` READY，canonical alias 正確。 |
| 19:37:04 | runtime OFF 的安全 POST：503 `analysis_disabled`、no-store、Request ID `bdeae67b-c03e-402d-bfd1-dbb5152262f0`；遙測 `providerEntered=false`。真實瀏覽器 Demo 顯示本機結果，觀察到 0 個 POST。 |
| **19:37:57** | Redis control 讀回 `enabled`／TTL `-1`；此刻 **Public Beta 開始**。開放前全站日額度 8／200、有效租約 0。 |
| 19:38:11 | 開放後匿名首頁、Demo、Privacy、Google 表單 GET 與三項預填再次通過。沒有新增表單回覆。 |
| 19:38:38 | 唯一固定自製去識別化 `high-risk-delivery-fee` 圖片已送出，一次 POST；圖片 SHA-256 `cae73040153fc77e976edec09475b3003ec439cac31eb96e5bfee9cd3c8b318f`。 |
| 19:38:43 | 收到 **HTTP 500／`analysis_failed`**；Request ID `2d1641b7-a87d-4556-816c-36d8a2fe78f5`，no-store。應用程式沒有回傳未驗證的分析結果。 |
| **19:38:44** | 執行 Level 1 急停：Redis control 讀回 `disabled`／TTL `-1`，**PUBLIC_BETA = PAUSED**；停止全部 AI smoke，沒有重送。 |
| 19:38:59 | 執行 Level 2：`ANALYSIS_ENABLED=false` 已讀回確認。 |
| 19:40:59 | 相同 SHA 的安全部署 `dpl_ERKT8z3P74CpRSgcCsrTTHzcYD3B` READY，canonical alias 指向它。 |
| 19:41:17 | 最終安全 POST：503 `analysis_disabled`、no-store、Request ID `1d61e950-3322-4df1-887a-d410897b7ac0`；遙測 `providerEntered=false`。 |
| 19:42 | 暫停後首頁、Demo、Privacy、Google 表單匿名 GET 與預填再次 PASS。 |

## 唯一真實 AI smoke 與失敗界線

| 項目 | 實測 |
|---|---|
| 案例與來源 | `high-risk-delivery-fee`，既有鎖定的自製、去識別化 `900×650` PNG；沒有使用真實使用者圖片 |
| HTTP | **500**、`analysis_failed`、no-store；Request ID `2d1641b7-a87d-4556-816c-36d8a2fe78f5` |
| Provider | `providerEntered=true`；本輪只送一次 HTTP POST；SDK／單請求 retry 設為 0 |
| 遙測 | `failureKind=schema`，model `gpt-4.1-mini-2025-04-14`，prompt `scam-analysis-v1`，duration 4,228 ms |
| Usage | `usageKnown=true`；input 1,760、output 267 tokens；按本輪先前查核的較高 Fast 費率估算 US$0.0019796，實際 service tier／帳單未知 |
| Redis | `quotaOutcome=started`；receipt state=`started`；全站今日額度 8→9；`leaseDisposition=released`；暫停後有效租約 0 |
| 結果與文字 | 沒有 200 分析結果，也沒有將 Provider 分析文字交給使用者。原始 Provider 輸出未記錄；`failureKind=schema` 可能來自嚴格 JSON／schema 或新結構殘留驗證，**不能據此推定確切原因**。 |
| 人工品質覆核 | 無可覆核的成功分析內容；本次 launch AI smoke **FAIL**，不沿用先前兩例 PASS 當作本輪成功。 |

本輪 AI smoke 已使用唯一授權的真實呼叫機會，無自動／手動重試，Provider 呼叫估計 1 次。若需找出 schema 的確切分支，須另行核准隔離診斷、保護資料的觀察方式與新的有限次測試；本輪不改程式，也不再開啟 AI。

## 緊急關閉程序與目前安全狀態

1. **Level 1：先停新分析。** 明確核對 Production 專用 Redis、namespace `production-beta` 及 `{scamshield:production:production-beta}:control:analysis-enabled` 後，將 control 設為 `disabled`，讀回 GET=`disabled`、TTL=`-1`。最小 POST 應回 503 `analysis_disabled` 且 `providerEntered=false`。本次已實際執行與驗證；已送出的 Provider 工作不能保證撤回。
2. **Level 2：關閉部署 gate。** 若需持續停用或 Redis 不可靠，設 `ANALYSIS_ENABLED=false`；以相同已知 Git SHA 重新部署，等待 READY 與 canonical alias 指向，驗證安全 POST。本次已實際執行與驗證。
3. **Level 3：憑證或平台事故。** 先完成前兩層停用，再由管理者依平台程序輪替相關憑證；不可讓服務在輪替期間保持 enabled。本次沒有憑證事故或輪替。

最終 Production 程式 SHA 與 `origin/main` 都是 `f1eb9a3150d3418b895a3cf31c2033dbbe90085a`；安全部署 `dpl_ERKT8z3P74CpRSgcCsrTTHzcYD3B` READY、canonical `https://scamshield-ai-fawn.vercel.app` 指向它；`ANALYSIS_ENABLED=false`、Redis control=`disabled`／TTL `-1`、臨時自訂 WAF 未啟用。首頁、Demo、Privacy 與 Feedback 仍可用。**不設自動恢復；恢復 Public Beta 需要新的人工判斷或明確授權。**

## 最終 Gate

| Gate | 狀態與界線 |
|---|---|
| LOCAL_IMPLEMENTATION／LOCAL_AUTOMATED_TESTS／CLEAN_INSTALL_REPRODUCIBILITY | 既有 PASS；本輪沒有程式變更或重新執行完整測試 |
| REDIS_INTEGRATION | 既有 PASS；本輪真實 Redis 讀回、額度 +1、receipt、租約釋放與急停實證 PASS |
| PRODUCTION_HTTP_REDIS_RUNTIME_GATE | PASS；runtime OFF 前後兩次安全 503 與同 ID 遙測確認 |
| FEEDBACK_EXTERNAL_ACCEPTANCE | 既有 PASS；本輪匿名 GET／預填 PASS，未再次提交表單 |
| PRIVACY_COMPLETENESS | 既有 PASS；本輪 Production Privacy 90 天／聯絡／刪除入口 HTTP 驗證 PASS |
| IPHONE_PWA_ACCEPTANCE | 既有 USER-MANUAL PASS；本輪未重測實機 |
| AI_QUALITY_GATE／PROVIDER_TEXT_DEBRIS_REGRESSION | 前次修正 SHA 的驗收 PASS；本輪唯一 launch smoke 回 500 `analysis_failed`／`schema`，沒有足夠證據宣稱服務已通過本輪真實分析 smoke |
| PRODUCTION_DEPLOYMENT | 安全部署 PASS；相同 SHA，READY，alias 正確 |
| PRODUCTION_ACCEPTANCE（本次 Launch） | **FAIL**：真實 AI smoke 回 HTTP 500 |
| PUBLIC_BETA_READINESS（本次 Launch） | **BLOCKED**：需先診斷 schema failure 並重新核准驗收 |
| PUBLIC_BETA | **PAUSED**；19:37:57 短暫 OPEN，19:38:44 急停，現為雙重 AI OFF |

本文件僅保留在本機，尚未 commit／push，以免文件提交觸發未驗收的 Production redeploy。Running Production SHA 是上列 `f1eb9a3`；本文沒有 evidence documentation commit SHA。沒有列入 API key、Redis token、HMAC secret、私人 header 或使用者資料。
