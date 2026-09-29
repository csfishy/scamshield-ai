# ScamShield AI

以可疑截圖提供詐騙風險、原因與安全行動建議的 Web／PWA 專案。

> **目前：Next.js＋TypeScript 的正式 React UI、Node Backend 與 PWA shell 已整合，舊 Blazor Mock 保留作參考。**
> shared contract v2、圖片驗證、POST /analyze、OpenAI adapter 與本機自動測試已實作。
> **Production非AI部署已完成，真實分析維持OFF。此分支補齊90天回饋政策、公開Privacy聯絡方式及後續驗收準備，尚未部署。公開Beta仍NOT_READY。**
> 本機功能、測試、隔離Redis、正式HTTP、AI品質、真機及公開核准分開判定。[目前狀態與第一階段歷史快照](docs/public-beta-readiness.md)集中說明；[第二階段Preview紀錄](docs/preview-acceptance-2026-09-29.md)保留原始結果。Production目前SHA為`5a788a91f7c934667cb8f216bcc393bd164084dd`，`ANALYSIS_ENABLED=false`、runtime=`disabled`。本輪不呼叫真實AI、不部署Production或公開分享；歷史[AI smoke](docs/ai-smoke-2026-09-05.md)不等於本分支品質驗收。

## 產品目標

使用者在點擊可疑網址、付款或提供 OTP 前，選擇一張截圖並主動提交，
取得風險指標、可疑原因與下一步。結果屬輔助判斷，不保證能確定是否詐騙。

目標流程：選圖 → 預覽／傳輸告知 → 真實 AI → 風險／原因／行動；
證據不足顯示無法判斷，失敗提供適當換圖或手動重試。

## 現況與目標技術

| 面向 | 目前 Repository | 尚待驗收 |
| --- | --- | --- |
| 前端 | Mobile-first React UI；選圖、預覽、Demo／Remote、取消、手動重試與結果呈現 | iOS／Android 實機驗收 |
| API | Node Route Handler `POST /analyze`；multipart 單圖、strict schema、錯誤映射與 `no-store` | Preview Remote 圖片與平台邊界驗收 |
| AI | OpenAI Responses adapter＋版本化 prompt；已有一次本機真實圖片 smoke | 完整 development／holdout 品質 gate |
| PWA | Next.js manifest、icons、Apple metadata、版本化 service worker 與離線備援頁 | 真實裝置安裝、更新與舊版遷移驗收 |
| 部署 | Production同SHA非AI部署READY；正式HTTP→Redis runtime停用守門有獨立實測證據 | 本分支隱私變更新部署與匿名驗收；目前正式HTTP短窗429仍NOT_RUN |
| 上傳 | Client／Server 共用 v2 限制：單張 JPEG／PNG，最大 4 MiB | 維持 contract 同步 |
| 測試 | unit／contract／HTTP integration／E2E、真Redis隔離測試與AI OFF smoke；每階段保留自己的數量／SHA | 本分支新回歸結果、AI品質及iPhone gate |
| 回饋 | 首頁、成功與錯誤入口；Google表單、Request ID複製；本機Privacy測試PASS，Google說明已匿名確認90天／公開聯絡`cs.sakana@gmail.com` | Production部署新政策、管理者人工清理交接、歷史導覽失敗根因與iPhone實測 |
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
| [Public Beta Readiness](docs/public-beta-readiness.md) | 目前分支／Production分層狀態與保留的第一階段本機證據 |
| [Privacy Operations](docs/privacy-operations.md) | 90天回饋政策、公開Email、刪除申請與管理者人工清理／副本處理 |
| [iPhone／PWA Acceptance](docs/iphone-pwa-acceptance.md) | 真機操作步驟與證據模板；目前NOT_RUN |
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
| `AI_TIMEOUT_MS` | 選填，預設／上限 15000 |
| `ANALYSIS_TIMEOUT_MS` | 選填，預設／上限 20000，須至少比 Provider timeout 多 2000 ms |
| `PROMPT_VERSION` | 選填；目前固定為 `scam-analysis-v1` |

Beta 必要設定詳見 [.env.example](.env.example) 與 [Runbook 第 11 節](docs/deployment-runbook.md#11-beta-設定與操作2026-09-29)。新版本缺少安全設定時不預設放行付費分析；Remote 需要部署啟用、可信 IP 設定、獨立 namespace、Redis 憑證、HMAC secret 及正確的執行期控制鍵。Google 表單／Email 是非秘密設定，仍以 server allowlist props 提供給頁面。不要將 secrets 改為 `NEXT_PUBLIC_*`。

### Beta 使用政策

預設同一 IP 在滑動 60 秒最多 3 次 POST、每天最多 10 次分析嘗試；全站每天最多 200 次、同時最多 3 個有效分析租約。日額度在台北時間 00:00 重置。圖片驗證通過且獲准進入 AI 流程才扣日額度；取消、逾時、資訊不足或 Provider 失敗不自動退還。這不是保證每天有 10 次成功分析，同一家庭、公司或公共網路可能共用額度。

Google表單只在使用者點選後開啟，可預填Request ID、版本與回饋類型；缺少表單時不使用假連結。一般聯絡、Privacy疑問、回饋刪除或Beta問題可寄至 **cs.sakana@gmail.com**，Privacy頁提供mailto及複製。這是公開產品資訊，不是secret；表單中的使用者Email仍是選填私人資料。

管理者持有的表單回饋原則最長保存90天，用於排查問題、產品改善與Beta驗收，到期刪除或去識別；長期測試案例須另行取得適當同意。網站沒有自動刪除Google回覆的服務，管理者須依[隱私操作流程](docs/privacy-operations.md)處理Forms、Sheets及匯出副本。網站不自動上傳回饋截圖、不持久保存原圖或完整分析。OpenAI的`store:false`與各平台防濫用／日誌保留不同，不能宣稱全部零留存。分支頁面與本機測試完成仍不代表Production新政策已生效。

本輪Google表單描述經使用者明確核准後更新，2026-09-29 08:19 UTC匿名GET200已確認90天、刪除Email與長期同意說明；沒有新增回覆或更改題目／存取設定。本機完整回歸通過，實際數量及首次E2E失敗／原命令重跑結果見[本輪紀錄](docs/privacy-final-gates-2026-09-29.md)。Production網站尚未部署此分支，因此線上`PRIVACY_COMPLETENESS`仍PARTIAL／PENDING_DEPLOYMENT。

`npm run eval:ai` 預設為不付費 dry-run，真正執行需人工標註與額度授權，
見[評估操作](tests/evaluation/README.md)與[下一階段有限Production AI計畫](docs/production-ai-quality-plan.md)。最大Provider呼叫數與總USD均待使用者下一輪明確核准，本輪不代填或執行。
本機與部署的區別、Windows 工具例外和實際命令結果見 [B 進度](docs/backend-progress.md)。

### `/analyze` 現況

- 僅接受 `POST multipart/form-data`；`image` 為必要的單張 JPEG／PNG，`source` 可為 `image`／`screenshot`（預設 `image`），`language` 預設 `zh-TW`。`source` 與 `language` 是分析 metadata，不是自由文字訊息輸入。
- 圖片上限 4 MiB，request body 上限 4,300,000 bytes；每邊最多 12,000 px、總像素最多 24,000,000，動畫或多 frame 圖片不接受。
- Remote 流程為設定／來源 IP／短期防濫用 → 圖片驗證／重新編碼 → 原子取得日額度與租約、檢查執行期開關 → OpenAI Provider → strict normalization → JSON 回應。成功六欄結構不變。
- 應用程式可控回應均為 JSON，包含 `Cache-Control: no-store` 與 `X-Request-Id`。錯誤依情況回 400／413／415／422／429／500／503；非 `POST` 回 405 並標示 `Allow: POST`。

Vercel以`vercel.json`設定Next.js、`npm ci`與`npm run build`。每次部署分別記錄SHA、實際Node／npm、匿名存取及AI OFF結果，不把歷史部署或本機build當作新分支已發布。功能分支push不會觸發目前只監聽`main` push／PR的Backend CI；本輪未授權Production部署。

## 限制與未來方向

- 真實 adapter 已完成一次本機圖片 smoke，但不代表目前 revision、完整案例集或詐騙辨識品質已通過驗收。
- MVP 目前只支援使用者主動選擇／上傳單張 JPEG／PNG；沒有自由文字分析、Web Share Target，亦不會在 iOS／Android 背景持續讀取訊息。
- 不包含 OCR pipeline、QR／URL scanner、Rule Engine 或 Threat Intelligence。
- 不包含原生分享／SMS／Notification、會員、分析歷史或回饋內容資料庫；Redis 僅用於額度／租約與執行期停用。
- Manifest、icons、Apple metadata 與 production service worker 已實作，但 iOS／Android 加入主畫面、更新與舊 Blazor PWA 遷移尚未完成實機驗收。
- Remote 依賴網路與 Provider；離線只提供已快取的 shell／備援頁與可能已載入的 Demo，`/analyze`、圖片及分析結果不進 service worker cache。
- 模型結果可能誤判；風險分數不是機率，低風險不是安全保證。
- 應用程式不持久保存截圖，但 Provider／平台保留政策仍需另行確認。
- IP 限制只能降低一般濫用，不能代表已抵禦 VPN 輪換、分散式 bot 或 DDoS；全站配額亦可能被惡意耗盡。較大規模分享前依流量評估平台防護、WAF 或具伺服器端驗證的 CAPTCHA。
- 每日200次是分析嘗試上限，不是固定金額保證；Redis淘汰／持久性、Provider支出限制、AI品質、實機及每次部署gate均須分層核對。Production非AI驗收證據已存在，仍不代表允許付費AI、發布本分支或公開Beta。

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
