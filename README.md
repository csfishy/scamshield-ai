# ScamShield AI

以可疑截圖提供詐騙風險、原因與安全行動建議的 Web／PWA 專案。

> **目前：Next.js＋TypeScript Backend 已建立，舊 Blazor Mock 保留。**
> 2026-09-04：shared contract v2、圖片驗證、POST /analyze、OpenAI adapter 與本機測試已實作。
> **真實 AI 評估、Vercel Preview、A 正式 UI／PWA 尚未驗收；整體 MVP 未完成。**
> 實際證據與阻塞見 [B 進度](docs/backend-progress.md)；A 引用方式見 [整合交接](docs/backend-handoff.md)。

## 產品目標

使用者在點擊可疑網址、付款或提供 OTP 前，選擇一張截圖並主動提交，
取得風險指標、可疑原因與下一步。結果屬輔助判斷，不保證能確定是否詐騙。

目標流程：選圖 → 預覽／傳輸告知 → 真實 AI → 風險／原因／行動；
證據不足顯示無法判斷，失敗提供適當換圖或手動重試。

## 現況與目標技術

| 面向 | 目前 Repository | 目標 MVP（待實作） |
| --- | --- | --- |
| 前端 | Next.js 最小 shell；Blazor 留作參考 | A 完成正式 React UI |
| API | 已實作 Node Route Handler、POST /analyze | Vercel Preview 驗證待完成 |
| AI | OpenAI adapter＋版本化 prompt 已實作；未付費呼叫 | 真實評估與品質 gate |
| PWA | manifest／icons／Blazor service worker | 遷移 manifest／icons，重做 cache／更新 |
| 部署 | vercel.json 已轉 Next.js；本機 production build 通過 | Vercel Next.js＋Node.js Functions |
| 上傳 | 新 Server v2 單圖 4 MiB；舊 client 10 MiB 不相容 | A 使用 shared LIMITS |
| 測試 | TypeScript／API HTTP／最小 shell E2E，AI dry-run | 真實 AI／Preview／UI／手機 gate 待完成 |
| DB／會員／queue | 無 | MVP 不加入 |

Provider 建議 OpenAI `gpt-4.1-mini-2025-04-14`；adapter 固定此 snapshot。
採用確認、key、帳號額度與部署 URL 尚待提供。
Vercel 設定存在不代表已完成部署驗收。

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

## 目前程式的執行方式（Blazor）

需要 .NET 10 SDK；以下只適用現有程式：

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
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:bundle
npx --no-install playwright install chromium
npm run test:e2e
npm run dev
```

預設 mock，合法 `/analyze` 回 503，不會回假成功。A Demo 使用本機 fixtures。
設定名稱見 `.env.example`；安全配置 `.env.local` 或 Vercel server env。
`npm run eval:ai` 預設為不付費 dry-run，真正執行需人工標註與額度授權，
見 [評估操作](tests/evaluation/README.md)。
本機與部署的區別、Windows 工具例外和實際命令結果見 [B 進度](docs/backend-progress.md)。

## 限制與未來方向

- Backend／真實 adapter 已實作；尚無真實連線或品質驗收證據。
- 目標 MVP 僅單張 JPEG／PNG；4 MiB、像素與 body 限制見 contract。
- 不包含 OCR pipeline、QR／URL scanner、Rule Engine 或 Threat Intelligence。
- 不包含原生分享／SMS／Notification、會員／歷史／資料庫。
- Remote 依賴網路與 Provider；離線僅預載 shell／明確 Demo。
- 模型結果可能誤判；風險分數不是機率，低風險不是安全保證。
- 目標應用程式不保存截圖；Provider／平台保留政策需另行確認。

上述未納入功能依產品驗證再排入後續，不列入三日交付。

## 團隊與展示

| 角色 | 責任 |
| --- | --- |
| Engineer A（姓名 TBD） | UI／PWA／手機體驗 |
| Engineer B（姓名 TBD） | AI／Backend／schema／部署與評估 |
| Product Marketing（姓名 TBD） | 情境、標註覆核、價值與 Pitch |
| Demo Producer（姓名 TBD） | 素材授權、Demo、簡報與影片 |

展示 URL、影片、Sponsor 技術：TBD。
測試素材需自製或授權並去識別化；API credentials 不提交 Repository。
第三方版本／模型／授權與資料保留紀錄在實際選型後補入。

## License

TBD。License 尚待團隊確認，根目錄 LICENSE 尚未加入；
本次文件更新不代替授權決策。
