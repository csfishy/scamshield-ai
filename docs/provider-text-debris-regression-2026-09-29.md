# Provider 文字結構殘留回歸驗收（2026-09-29）

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

> 本文件記錄已實際完成的驗證。Production 公開 Beta 已具備本輪要求的準備條件，但仍未正式開放。本文本身尚未 commit；已部署與測試的程式 SHA 應以部署紀錄為準。

## 問題與修正

- 基準 `origin/main` 與原 Production SHA：`2b6e65229153182456db23fd90a8724d833be915`。原 `normalizeProviderText()` 只執行 `trim()`，因此先前六例 Production 品質驗收中，前兩個高風險案例的 Provider 字尾 `}],` 曾作為成功結果文字顯示。該輪人工覆核仍判安全語意 PASS，文字品質問題留待本輪修復。
- 修正分支：`codex/fix-provider-text-debris`；功能 commit、新 `main` 與已測 Production 程式 SHA：`f1eb9a3150d3418b895a3cf31c2033dbbe90085a`。功能分支已 push，`main` 以 `--ff-only` 整合並非強制推送。
- `lib/server/ai/normalize.ts` 對 `trim()` 後字尾的連續結構結束符號作明確驗證；涵蓋 `}],`、`}]`、`]},`、`},]`、`]],`、`}},` 等同類型組合。命中時拋出 `AppError("analysis_failed", "schema")`，不刪除、不修補、不重試 Provider。中間包含括號的自然語句及合法 JSON 討論文字不因內文括號被拒。
- 成功回應的欄位與風險分數／分類算法未改；沒有改 prompt、模型、temperature、圖片處理、額度、Redis 政策或 Provider retry。

## 本機與 Production AI OFF 驗證

- Windows Node `24.19.0`，Corepack 啟動專案宣告的 npm `12.0.2`：`npm ci` PASS（391 packages、0 vulnerabilities）、`npm run typecheck` PASS、`npm run lint -- --ignore-pattern 'deliverables/**'` PASS、`npm test` PASS（14 files／348 tests）、`npm run build` PASS、`npm run verify:bundle` PASS（37 browser files）、`npm run test:e2e` PASS（20 tests）、`git diff --check` PASS、追蹤檔秘密掃描 PASS。測試不呼叫付費 AI。
- 新的 unit tests 涵蓋 summary／任一 signal reason／recommendation 尾碼、同類變體與合法文字；HTTP integration 以測試替身產生合法 envelope 加上 `signal.reason` 的 `}],`，驗證 500 `analysis_failed`、一次 Provider stub 呼叫、no-store、Request ID，且錯誤文字不外露。
- 新 Production 初始部署 `dpl_7b7QzfYSNjXbWBFZWZ3BkqK9w56D`，同 SHA、READY、canonical alias `https://scamshield-ai-fawn.vercel.app`；部署設定 `ANALYSIS_ENABLED=false`、Redis runtime=`disabled`／TTL `-1`。匿名首頁、`/privacy`、`/demo` 均 200；最小 `/analyze` POST 回 503 `analysis_disabled`、no-store、Request ID；相同 ID 遙測 `providerEntered=false`。
- 隔離 Production Redis 的唯讀預檢：namespace `production-beta`、`noeviction`、當時全站日計數 6／200、有效租約 0／3、控制鍵 `disabled`／TTL `-1`；Preview 資源、憑證與 HMAC 密鑰分離。該預檢沒有改動額度或憑證。

## 兩次 Production 回歸的控制

- 使用原六例驗收已鎖定的去識別化 `900×650` PNG；素材 lock SHA-256 為 `2cec9c2f057ee1569db9d79adb4d67888a1f3237471fcaf48b70925f662dc1b0`。案例固定為 `high-risk-delivery-fee`、`high-risk-customer-otp`；不換圖、不增加第 3 例。
- 官方 [gpt-4.1-mini 模型價格](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[圖片 token 計算](https://developers.openai.com/api/docs/guides/images-vision) 及 [Fast 模式價格](https://openai.com/api-fast-mode/) 已於本輪重新查核。以較高的 Fast 價格、每次保守預留 8,988 input + 2,400 output tokens、再加 10% 緩衝，兩次估算 `US$0.02862552`，低於本輪 `US$0.03` 限額。這是事前估算，並非 Provider 的金額硬上限；實際 service tier／帳單未由應用程式揭露。
- 使用者明確核准本輪臨時免費 WAF；對所有專案網址，缺少或帶錯私有 header 的 POST 曾被拒絕。WAF 開啟後實測匿名 GET `/`、`/privacy`、`/demo` 均 200；缺少／錯誤 header 的 POST 均 403；正確 header 但 Redis runtime OFF 的 POST 為 503，遙測 `providerEntered=false`。私有 header 不記入本文件；WAF 已於恢復雙重 AI OFF 並驗證後移除，平台保留設定與稽核歷史。
- 只在 WAF 隔離後，將 `ANALYSIS_ENABLED=true` 並以相同程式 SHA 重新部署；受控部署 `dpl_DwParko9EM5odduAU5fg86DHqHo6` 已 READY 且 canonical alias 指向它。在 Redis runtime=`disabled` 時，驗證 POST 仍為 503、no-store，Request ID `d5320971-dcb9-454c-a361-5d45975de2e6`，遙測 `providerEntered=false`。
- 操作程式先持久記錄每個嘗試，再短暫啟用 Redis runtime；只送一次固定素材 POST，在處理結果與人工覆核前立即停用 runtime。未知或中斷的嘗試不重送。每次都核對同一 Request ID、Provider 進入、Redis 額度加一、租約釋放、已知 usage 與費用估算。

## 案例結果

| 項目 | Call 1：包裹補費 | Call 2：客服 OTP |
|---|---|---|
| HTTP／Request ID | 200；`0e09cda1-8583-4154-b1d4-22eb4ae87168` | 200；`0a0a5e38-83c1-49ea-8a16-ebcefb7c419a` |
| Provider／重試 | 已進入 Provider 流程 1 次；無重試 | 已進入 Provider 流程 1 次；無重試 |
| 模型用量 | input 1,760；output 263；usageKnown=true | input 1,760；output 185；usageKnown=true |
| 費用估算 | 按 Fast 上界估 `US$0.0019684` | 按 Fast 上界估 `US$0.00175` |
| 額度與租約 | 全站 6→7；結束時有效租約 0 | 全站 7→8；結束時有效租約 0 |
| 文字驗證 | HTTP 200，summary、signals 與 recommendations 均無結構性尾碼 | HTTP 200，summary、signals 與 recommendations 均無結構性尾碼 |
| 安全語意 | high／85／phishing；指出補費、可疑連結、信用卡與驗證碼；提醒勿點連結或提供資料，改由官方管道確認。另有泛用防護軟體建議。 | high／85／account_theft；指出私人 LINE 與索取銀行 OTP；提醒勿交付 OTP 或個資，改由官方客服確認。 |
| 人工判定 | 使用者 PASS；無 CRITICAL／MAJOR，泛用防護軟體建議可改善 | 使用者 PASS；無 CRITICAL／MAJOR |

兩次皆在人工／規則 gate 之間維持 Redis runtime `disabled`／TTL `-1`；第 2 例只在第 1 例使用者人工 PASS、短時間窗口結束、額度及估算預算仍允許後執行。合計 input 3,520、output 448，Fast 上界估算 `US$0.0037184`，少於本輪 `US$0.03` 預算；這不是實際帳單金額。

## 最終結案與發布狀態

- Call 1 與 Call 2 均由使用者逐例人工判定 PASS。兩次 Provider 流程各一次，沒有自動或手動重試；已知用量與 Redis 計數均對上。兩例在修正後都產生合法、乾淨的 200 結果；沒有在真實 Provider 回應中觀察到再次出現 debris。因此真實回歸證明兩個原案例現在不會將殘留字尾送給使用者；已知 malformed tail 被拒絕的分支則由本機 unit／HTTP integration 測試證明，不把未觀察的 Provider 原始輸出說成已發生。
- 最終安全部署 `dpl_AySd7hwC4HLx6zUUK936GbsGkfL1`（同 SHA）READY、canonical alias 正確；`ANALYSIS_ENABLED=false`，Redis runtime=`disabled`／TTL `-1`。最終帶 WAF 私有 header 的 POST 回 503 `analysis_disabled`、no-store、Request ID `2f49a74f-d281-484a-90b4-a6660fc7e53b`，遙測 `providerEntered=false`：PASS。
- 臨時 WAF 已移除，`firewallEnabled=false`、0 條自訂規則、平台保留稽核歷史；本機私有 header 檔已刪除。無 header 的公開 POST 恢復到應用程式，仍因 AI 雙重 OFF 回 503 `analysis_disabled`、no-store、Request ID `6807ee7d-12d2-4a7a-a44b-a2250dbd5d9c`，遙測 `providerEntered=false`：PASS。
- 最終再次唯讀核對部署設定、Redis 控制鍵、canonical deployment SHA／READY、WAF 規則及兩例本機驗收紀錄：PASS。

| Gate | 狀態 | 證據範圍 |
|---|---|---|
| LOCAL_IMPLEMENTATION／LOCAL_AUTOMATED_TESTS | PASS／PASS | 本輪修正及本機完整測試 |
| REDIS_INTEGRATION | 既有 PASS；本輪額度／租約核對 PASS | 本輪未重跑完整 `test:redis`；兩次真實 Redis 計數 6→7→8，租約正常釋放 |
| PRODUCTION_HTTP_REDIS_RUNTIME_GATE | PASS | AI OFF 時 503／no-store／Request ID／`providerEntered=false`，runtime 開關與額度實測 |
| FEEDBACK_EXTERNAL_ACCEPTANCE／PRIVACY_COMPLETENESS | 既有 PASS | 本輪未重新做外部表單與隱私人工驗收 |
| IPHONE_PWA_ACCEPTANCE | 既有 USER-MANUAL PASS | 本輪未重測 iPhone／PWA |
| AI_QUALITY_GATE | PASS | 先前六例驗收及本輪兩例逐例人工 PASS；不可把不同 SHA 的證據混為同一次測試 |
| PROVIDER_TEXT_DEBRIS_REGRESSION | PASS | 本輪兩例乾淨 200、使用者人工 PASS；malformed tail 拒絕由本機測試驗證 |
| PRODUCTION_DEPLOYMENT／PRODUCTION_ACCEPTANCE | PASS／PASS | 相同修正 SHA 的受控部署、兩例回歸、最終雙重 OFF 與安全 smoke |
| PUBLIC_BETA_READINESS | READY | 本輪已知輸出品質問題完成修正與回歸驗收 |
| PUBLIC_BETA | NOT_OPEN | 尚待另一次明確公開授權 |

此文件與既有未提交文件變更分開保存；未讀取、修改、加入或清除 `deliverables/scamshield-video/`。
