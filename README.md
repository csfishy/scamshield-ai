# ScamShield AI

以可疑截圖提供詐騙風險、原因與安全行動建議的 Web／PWA 專案。

> **目前：Next.js＋TypeScript 的正式 React UI、Node Backend 與 PWA shell 已整合，舊 Blazor Mock 保留作參考。**
> shared contract v2、圖片驗證、POST /analyze、OpenAI adapter 與本機自動測試已實作。
> **Repository 已記錄一次本機真實 AI 圖片 smoke 與受保護 Vercel Preview；完整 AI 品質、Preview Remote 圖片與手機實機 gate 尚未驗收。**
> 實際證據與阻塞見 [B 進度](docs/backend-progress.md)；A 引用方式見 [整合交接](docs/backend-handoff.md)。

## 產品目標

使用者在點擊可疑網址、付款或提供 OTP 前，選擇一張截圖並主動提交，
取得風險指標、可疑原因與下一步。結果屬輔助判斷，不保證能確定是否詐騙。

目標流程：選圖 → 預覽／傳輸告知 → 真實 AI → 風險／原因／行動；
證據不足顯示無法判斷，失敗提供適當換圖或手動重試。

## 現況與目標技術

| 面向 | 目前 Repository | 目標 MVP（待實作） |
| --- | --- | --- |
| 前端 | Mobile-first React UI；選圖、預覽、Demo／Remote、取消、手動重試與結果呈現 | iOS／Android 實機驗收 |
| API | Node Route Handler `POST /analyze`；multipart 單圖、strict schema、錯誤映射與 `no-store` | Preview Remote 圖片與平台邊界驗收 |
| AI | OpenAI Responses adapter＋版本化 prompt；已有一次本機真實圖片 smoke | 完整 development／holdout 品質 gate |
| PWA | Next.js manifest、icons、Apple metadata、版本化 service worker 與離線備援頁 | 真實裝置安裝、更新與舊版遷移驗收 |
| 部署 | Vercel Next.js 專案與受保護 Preview 已建立；Production 依紀錄仍為 mock、無 key | Remote／Production 發布 gate |
| 上傳 | Client／Server 共用 v2 限制：單張 JPEG／PNG，最大 4 MiB | 維持 contract 同步 |
| 測試 | TypeScript、unit／integration、production build、bundle scan 與 Playwright E2E 已通過 | 完整 AI／Preview／手機 gate 待完成 |
| DB／會員／queue | 無 | MVP 不加入 |

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

Node 24.x（本機鎖定 24.19.0）、npm 12.0.2，根目錄執行：

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

`npm run eval:ai` 預設為不付費 dry-run，真正執行需人工標註與額度授權，
見 [評估操作](tests/evaluation/README.md)。
本機與部署的區別、Windows 工具例外和實際命令結果見 [B 進度](docs/backend-progress.md)。

### `/analyze` 現況

- 僅接受 `POST multipart/form-data`；`image` 為必要的單張 JPEG／PNG，`source` 可為 `image`／`screenshot`（預設 `image`），`language` 預設 `zh-TW`。`source` 與 `language` 是分析 metadata，不是自由文字訊息輸入。
- 圖片上限 4 MiB，request body 上限 4,300,000 bytes；每邊最多 12,000 px、總像素最多 24,000,000，動畫或多 frame 圖片不接受。
- Remote 流程為圖片驗證／重新編碼 → OpenAI Provider → strict normalization → JSON 回應。成功欄位為 `riskScore`、`riskLevel`、`category`、`summary`、`signals`、`recommendations`。
- 應用程式可控回應均為 JSON，包含 `Cache-Control: no-store` 與 `X-Request-Id`。錯誤依情況回 400／413／415／422／429／500／503；非 `POST` 回 405 並標示 `Allow: POST`。

Vercel 以 `vercel.json` 設定 Next.js、`npm ci` 與 `npm run build`。Repository 僅記錄受登入保護的 Preview，未提供可視為正式產品的 Production URL；部署與驗收步驟見 [Deployment Runbook](docs/deployment-runbook.md)。

## 限制與未來方向

- 真實 adapter 已完成一次本機圖片 smoke，但不代表目前 revision、完整案例集或詐騙辨識品質已通過驗收。
- MVP 目前只支援使用者主動選擇／上傳單張 JPEG／PNG；沒有自由文字分析、Web Share Target，亦不會在 iOS／Android 背景持續讀取訊息。
- 不包含 OCR pipeline、QR／URL scanner、Rule Engine 或 Threat Intelligence。
- 不包含原生分享／SMS／Notification、會員／歷史／資料庫。
- Manifest、icons、Apple metadata 與 production service worker 已實作，但 iOS／Android 加入主畫面、更新與舊 Blazor PWA 遷移尚未完成實機驗收。
- Remote 依賴網路與 Provider；離線只提供已快取的 shell／備援頁與可能已載入的 Demo，`/analyze`、圖片及分析結果不進 service worker cache。
- 模型結果可能誤判；風險分數不是機率，低風險不是安全保證。
- 應用程式不持久保存截圖，但 Provider／平台保留政策仍需另行確認。
- 目前是 Hackathon MVP，尚未完成正式 security product 所需的完整模型評估、公開服務防濫用／成本控制與 production hardening。

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

本專案採用自訂的 [ScamShield Source Code License](LICENSE)，屬 source-available、
非開源授權。允許 Hackathon 評審／展示，以及個人非商業的閱讀、研究與本機測試；
未經著作權人書面同意，不得商業使用、重新散布或散布修改版本與衍生作品。
