# ScamShield AI

以可疑截圖提供詐騙風險、原因與安全行動建議的 Web／PWA 專案。

> **目前：Next.js＋TypeScript 的正式 React UI、Node Backend 與 PWA shell 已整合，舊 Blazor Mock 保留作參考。**
> shared contract v2、圖片驗證、POST /analyze、OpenAI adapter 與本機自動測試已實作。
> **Production已發布新版Privacy／Feedback、手機版UI與公開聯絡信箱 `csfishy@gmail.com`。Public Beta的最新驗收紀錄為PAUSED；重新開放的AI可靠性gate仍未通過。**
> 2026-10-02文件整理以已發布的`ff64705d9315b65f0b38b7b435997ec46030feb1`為程式基準。[目前狀態](docs/public-beta-readiness.md)與[驗收／事故歷史索引](docs/release-evidence-index.md)區分各版本的結果；後續main提交的部署SHA以平台紀錄為準。最新AI測試記錄的最終狀態為`ANALYSIS_ENABLED=false`、runtime=`disabled`；這次整理不啟用AI。歷史PASS只適用於各報告指定的revision。

## 產品目標

使用者在點擊可疑網址、付款或提供 OTP 前，選擇一張截圖並主動提交，
取得風險指標、可疑原因與下一步。結果屬輔助判斷，不保證能確定是否詐騙。

目標流程：選圖 → 預覽／傳輸告知 → 真實 AI → 風險／原因／行動；
證據不足顯示無法判斷，失敗提供適當換圖或手動重試。

## 現況與目標技術

| 面向 | 目前 Repository | 尚待驗收 |
| --- | --- | --- |
| 前端 | Mobile-first React UI；選圖、預覽、Demo／Remote、取消、手動重試與結果呈現；iPhone使用者整體確認PASS | 新版UI的實機重驗；原iPhone逐case／版本明細及Android驗收 |
| API | Node Route Handler `POST /analyze`；multipart 單圖、strict schema、錯誤映射與 `no-store` | Preview Remote 圖片與平台邊界驗收 |
| AI | OpenAI Responses adapter＋版本化 prompt；已有一次本機真實圖片 smoke | 完整 development／holdout 品質 gate |
| PWA | Next.js manifest、icons、Apple metadata、版本化service worker與離線備援頁；歷史iPhone整體PASS（USER-MANUAL） | 受測SHA／逐case明細；新版更新與舊版遷移重驗 |
| 部署 | `ff64705` Production部署及GitHub CI成功；首頁／Privacy HTTP200、信箱與mailto驗證通過 | AI重新開放的可靠性gate；正式HTTP限流按revision驗證 |
| 上傳 | Client／Server 共用 v2 限制：單張 JPEG／PNG，最大 4 MiB | 維持 contract 同步 |
| 測試 | `ff64705`的typecheck、lint、474tests、build及Backend CI通過；各階段保留各自數量／SHA | 真AI可靠性與新版iPhone驗收 |
| 回饋 | 歷史ProductionPrivacy／Feedback非AI驗收PASS；網站已顯示`csfishy@gmail.com` | Google說明新信箱重驗；管理者人工清理及新版本實機重驗 |
| 防濫用／成本 | Production獨立Redis整合21 checks PASS、HTTP runtime gate PASS；server啟用設定與runtime gate目前都停用 | 正式HTTP429未執行；真Provider費用／品質另行授權 |
| 會員／內容資料庫／queue | 無；Redis 只存短期額度與控制狀態 | 本次不加入 |

Provider adapter 固定使用 OpenAI `gpt-4.1-mini-2025-04-14` snapshot。
API key 不進 repository；Remote 環境仍須由部署者安全設定憑證與額度。
受保護 Preview 的存在不代表 Remote API 或 Production 已完成部署驗收。

## 文件入口

| 文件 | 用途 |
| --- | --- |
| [Product Plan](docs/product-plan.md) | 產品定位、範圍、信任文案與指標 |
| [Architecture](docs/architecture.md) | 目標技術、現況差異與 A／B 邊界 |
| [API Contract v2](docs/api-contract.md) | HTTP request／response、4 MiB、422、限制與錯誤 |
| [Software Design Document](docs/sdd.md) | 模組、資料流、AI rubric、timeout、設定、ADR 與待決清單 |
| [Test Plan](docs/test-plan.md) | 需求追溯、測試案例、AI holdout、release gates |
| [Deployment Runbook](docs/deployment-runbook.md) | Next.js 初始化、Vercel、PWA 遷移、發布與回復 |
| [Production Resilience](docs/production-resilience.md) | 5/min、成功額度 reservation、distributed concurrency、circuit breaker 與調整說明 |
| [Public Beta Readiness](docs/public-beta-readiness.md) | 目前分支／Production分層狀態與保留的第一階段本機證據 |
| [Release Evidence Index](docs/release-evidence-index.md) | 已歸檔的驗收、失敗、暫停與A/B紀錄；各自適用的revision |
| [Production Privacy／Feedback Final Acceptance](docs/production-privacy-feedback-final-acceptance-2026-09-29.md) | 2026-09-29正式非AI驗收與原始iPhone整體確認 |
| [Privacy Operations](docs/privacy-operations.md) | 90天回饋政策、公開Email、刪除申請與管理者人工清理／副本處理 |
| [iPhone／PWA Acceptance](docs/iphone-pwa-acceptance.md) | 歷史PASS（USER-MANUAL）及新版本重驗步驟；逐case明細未提供 |
| [Production AI Quality Plan](docs/production-ai-quality-plan.md) | 五類候選案例、expected behavior、人工覆核與待授權calls／USD；本輪不執行付費AI |
| [Privacy／Final Gates 2026-09-29](docs/privacy-final-gates-2026-09-29.md) | 本輪分支基準、實際測試數量、Production安全核對與尚待部署項目 |
| [Preview Acceptance 2026-09-29](docs/preview-acceptance-2026-09-29.md) | 第二階段實際授權、乾淨安裝、隔離 Redis／表單、Preview 部署及匿名 AI OFF 驗收進度 |
| [Buildmode 3-Day Plan](docs/buildmode-mvp-plan.md) | 四人分工、每日交付與阻塞處理 |
| [Legacy Blazor Integration](src/app/ScamShield.Web/INTEGRATION.md) | 現有 .NET 程式執行與舊部署說明 |

後續開發建議依「Architecture → API Contract → SDD → Test Plan → Runbook」
閱讀。API public 欄位以 contract 為準；不要將新文件當作舊 C# 已同步的證據。
原 v1 contract 可由 Git 歷史查閱，與舊版一同保留至遷移驗收。

## Legacy Blazor 參考實作

需要 .NET 10 SDK；以下只適用保留的舊版程式，不是目前 Next.js MVP 的主要啟動方式：

```bash
dotnet run --project src/app/ScamShield.Web/ScamShield.Web.csproj
```

預設 Mock，不需要 Backend 或 API key；所有有效輸入回相同示範結果，
不能用來驗證 AI 準確度。

既有 checks：

```bash
dotnet run --project src/app/ScamShield.Web.ContractChecks/ScamShield.Web.ContractChecks.csproj
```

這些 checks 覆蓋舊版 JSON、圖片 signature、Mock、multipart、錯誤與 timeout；
不等於 v2、真實 Backend、完整 decode 或手機流程已驗收。

## Next.js 開發方式

專案指定 Node 24.x（`.nvmrc` 為 24.19.0）、`packageManager` 為 npm 12.0.2，根目錄執行。第一階段使用 npm 10.9.2 的測試快照保留；第二階段已使用 Node 24.19.0＋npm 12.0.2 完成 `npm ci` 與當時的 231 項測試，後續新增工具測試另列。[實際版本與命令](docs/preview-acceptance-2026-09-29.md) 不以要求版本代替執行證據，Windows Corepack 啟動方式見 [Runbook §12](docs/deployment-runbook.md#12-preview-驗收工具與版本核對)：

```sh
npm ci
npm run dev
```

完整本機驗證：

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:bundle
npx --no-install playwright install chromium
npm run test:e2e
```

預設 mock，合法 `/analyze` 回 503，不會回假成功。A Demo 使用本機 fixtures。
將 `.env.example` 複製為未追蹤的 `.env.local`，或使用 Vercel server env：

| 變數 | 用途 |
| --- | --- |
| `ANALYSIS_MODE` | `mock`（預設）或 `remote` |
| `AI_PROVIDER` | Remote 必填；目前只接受 `openai` |
| `AI_MODEL` | Remote 必填；目前只接受 `gpt-4.1-mini-2025-04-14` |
| `AI_API_KEY` | Remote 必填的 server secret；不可使用 `NEXT_PUBLIC_*` |
| `AI_TIMEOUT_MS` | 選填，預設／上限 20000 |
| `ANALYSIS_TIMEOUT_MS` | 選填，預設／上限 25000，須至少比 Provider timeout 多 2000 ms |
| `PROMPT_VERSION` | 選填；目前固定為 `scam-analysis-v1` |

Beta 必要設定詳見 [.env.example](.env.example) 與 [Runbook 第 11 節](docs/deployment-runbook.md#11-beta-設定與操作2026-09-29)。新版本缺少安全設定時不預設放行付費分析；Remote 需要部署啟用、可信 IP 設定、獨立 namespace、Redis 憑證、HMAC secret 及正確的執行期控制鍵。Google 表單／Email 是非秘密設定，仍以 server allowlist props 提供給頁面。不要將 secrets 改為 `NEXT_PUBLIC_*`。

### Production 流量與 Provider 韌性政策

預設同一 HMAC IP 來源在滑動 60 秒最多 5 次 POST；每個隨機匿名裝置每日 30 次成功分析、每個 IP 每日 150 次請求安全上限、全站每日 3,000 次成功分析，並且全站最多 5 個有效 Provider 租約。日額度以 Redis TIME 在台北時間 00:00 重置。裝置與全站額度先原子 reservation，只有通過 strict normalization 的 200 分析結果才 commit；validation、資訊不足、取消、逾時、Provider 錯誤、並行拒絕與 circuit 拒絕都不消耗成功額度。IP 上限仍會計入已通過 preflight 的無效上傳，避免大量濫用。

網頁使用 `crypto.randomUUID()` 建立匿名裝置 ID 並保存於同來源 `localStorage`；不使用瀏覽器指紋。無法取得裝置 ID 的舊 client 退回 HMAC IP-derived 裝置 bucket。Redis-backed circuit breaker 預設在 60 秒內 5 次 qualifying Provider failure 後 OPEN 30 秒，之後只允許 1 個 HALF_OPEN probe；OpenAI adapter 明確 `maxRetries:0`，因此每個使用者請求最多一次 Provider call。Redis 無法確認 admission、quota、concurrency 或 circuit state 時一律 fail closed，不會退回 process-local 或 unlimited 模式。完整可調參數見 [.env.example](.env.example)。

Google表單只在使用者點選後開啟，可預填Request ID、版本與回饋類型；缺少表單時不使用假連結。一般聯絡、Privacy疑問、回饋刪除或Beta問題可寄至 **csfishy@gmail.com**，Privacy頁提供mailto及複製。這是公開產品資訊，不是secret；表單中的使用者Email仍是選填私人資料。

管理者持有的表單回饋原則最長保存90天，用於排查問題、產品改善與Beta驗收，到期刪除或去識別；長期測試案例須另行取得適當同意。網站沒有自動刪除Google回覆的服務，管理者須依[隱私操作流程](docs/privacy-operations.md)處理Forms、Sheets及匯出副本。網站不自動上傳回饋截圖、不持久保存原圖或完整分析。OpenAI的`store:false`與各平台防濫用／日誌保留不同，不能宣稱全部零留存。Production公開信箱已於2026-10-01更新並匿名確認。

2026-09-29的Google政策與Production回饋驗收見[正式非AI紀錄](docs/production-privacy-feedback-final-acceptance-2026-09-29.md)，前一分支的E2E失敗／重跑保留在[歷史紀錄](docs/privacy-final-gates-2026-09-29.md)。這些結果當時使用舊信箱；2026-10-01的新信箱部署只重新確認網站首頁與Privacy，Google表單的新信箱對齊仍待獨立確認。

`npm run eval:ai` 預設為不付費 dry-run，真正執行需人工標註與額度授權，
見[評估操作](tests/evaluation/README.md)與[下一階段有限Production AI計畫](docs/production-ai-quality-plan.md)。最大Provider呼叫數與總USD均待使用者下一輪明確核准，本輪不代填或執行。
本機與部署的區別、Windows 工具例外和實際命令結果見 [B 進度](docs/backend-progress.md)。

### `/analyze` 現況

- 僅接受 `POST multipart/form-data`；`image` 為必要的單張 JPEG／PNG，`source` 可為 `image`／`screenshot`（預設 `image`），`language` 預設 `zh-TW`。`source` 與 `language` 是分析 metadata，不是自由文字訊息輸入。
- 圖片上限 4 MiB，request body 上限 4,300,000 bytes；每邊最多 12,000 px、總像素最多 24,000,000，動畫或多 frame 圖片不接受。
- Remote 流程為設定／來源 IP 短窗與 IP safety preflight → 圖片驗證／重新編碼 → 原子取得 device/global success reservation、distributed concurrency lease 與 circuit permission → 檢查執行期開關 → OpenAI Provider → strict normalization → 原子 commit 或 rollback → JSON 回應。成功六欄結構不變。
- Provider timeout 預設 20 秒、application deadline 25 秒、route maxDuration 30 秒。Provider 會依剩餘 API 預算縮短，保留至少 2 秒收尾；增加等待時間不是 retry，每個 request 仍最多呼叫 Provider 一次。既有 Production timeout 環境值須同步更新並重新部署。
- 應用程式可控回應均為 JSON，包含 `Cache-Control: no-store` 與 `X-Request-Id`。錯誤依情況回 400／413／415／422／429／500／503；非 `POST` 回 405 並標示 `Allow: POST`。

Vercel以`vercel.json`設定Next.js、`npm ci`與`npm run build`。main push會觸發GitHub Backend CI與既有Vercel自動部署；每次核對該SHA的結果。影片成品與中間檔保留本機，`.vercelignore`排除整個`deliverables/`。影片來源、字幕及小型海報見[影片文件](deliverables/scamshield-video/README.md)。

## 限制與未來方向

- 真實 adapter 已完成一次本機圖片 smoke，但不代表目前 revision、完整案例集或詐騙辨識品質已通過驗收。
- MVP 目前只支援使用者主動選擇／上傳單張 JPEG／PNG；沒有自由文字分析、Web Share Target，亦不會在 iOS／Android 背景持續讀取訊息。
- 不包含 OCR pipeline、QR／URL scanner、Rule Engine 或 Threat Intelligence。
- 不包含原生分享／SMS／Notification、會員、分析歷史或回饋內容資料庫；Redis 僅用於額度／租約與執行期停用。
- iPhone Safari／PWA曾獲使用者整體PASS（USER-MANUAL）；未提供機型、版本、SHA與逐case明細，不能套用到目前新版UI。Android與舊Blazor PWA遷移仍需實機驗證。
- Remote 依賴網路與 Provider；離線只提供已快取的 shell／備援頁與可能已載入的 Demo，`/analyze`、圖片及分析結果不進 service worker cache。
- 模型結果可能誤判；風險分數不是機率，低風險不是安全保證。
- 應用程式不持久保存截圖，但 Provider／平台保留政策仍需另行確認。
- IP 限制只能降低一般濫用，不能代表已抵禦 VPN 輪換、分散式 bot 或 DDoS；全站配額亦可能被惡意耗盡。較大規模分享前依流量評估平台防護、WAF 或具伺服器端驗證的 CAPTCHA。
- 每日3,000次是成功分析 safety ceiling，不是固定金額保證；Provider 仍可能在成功 commit 前產生成本。匿名裝置 ID 可被清除或輪換，IP safety guard 只能降低一般濫用，不能取代 WAF／CAPTCHA。Redis淘汰／持久性、Provider帳號支出限制、AI品質、實機及每次部署gate仍須分層核對。

上述未納入功能依產品驗證再排入後續，不列入三日交付。

## 團隊與展示

| 角色 | 責任 |
| --- | --- |
| Engineer A（張小魚） | UI／PWA／手機體驗 |
| Engineer B（Louis） | AI／Backend／schema／部署與評估 |
| Product Marketing（George） | 情境、標註覆核、價值與 Pitch |
| Demo Producer（Ruru） | 素材授權、Demo、簡報與影片 |

展示 URL、影片、Sponsor 技術：TBD。
測試素材需自製或授權並去識別化；API credentials 不提交 Repository。
第三方版本／模型／授權與資料保留紀錄在實際選型後補入。

## License

本專案採用 [Apache License 2.0](LICENSE) 開源授權。
你可以依 Apache License 2.0 的條款使用、修改及散布本專案，
詳細授權條款請參閱 [LICENSE](LICENSE)。
