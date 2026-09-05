# ScamShield AI 開發、遷移與部署手冊

- 版本：2.0｜2026-09-04
- 狀態：Next.js 與受保護 Preview 已部署最新 SHA；單次本機真實 AI 已人工覆核，Preview Remote 圖片與平台邊界尚未驗收
- Owner：B（初始化／部署），A（前端／PWA 更新）
- 配套：[SDD](sdd.md)、[測試與 gate](test-plan.md)、[API v2](api-contract.md)

## 1. 目前可執行與目標指令

目前根 Next.js 與舊 .NET 共存，指令在 [README](../README.md)。
以下 npm 介面已建立；實際執行結果、未驗證項目見 [B 進度](backend-progress.md)：

| 指令 | 目標用途 |
| --- | --- |
| npm ci | 依已提交 lockfile 安裝 |
| npm run dev | 本機 Next.js |
| npm run typecheck | TypeScript strict 檢查 |
| npm run lint | lint |
| npm test | 不呼叫真實 AI 的 unit／contract／integration |
| npm run test:e2e | production build 的瀏覽器驗證 |
| npm run eval:ai | 明確執行付費 AI evaluation，預設不得被 CI 自動呼叫 |
| npm run build | Next.js production build |
| npm start | 本機 production server |

Day 1 由 B 建立根目錄 package.json、lockfile、tsconfig、Next 設定與 scripts；
A 接手頁面。使用 Vercel 支援且符合 Next.js requirements 的 Node LTS，
將確切版本寫入 engines／版本設定與交付紀錄。不要只記「latest」。

## 2. 遷移清單與順序

1. 記錄當前 Git revision、既有部署 URL／mode／service worker 狀態。
   不刪除 `src/app/ScamShield.Web` 或 ContractChecks。
2. 根目錄初始化 Next.js，保留既有 docs／assets／src；根 app/ 是新 App Router。
3. B 建立 shared schemas／API stub／環境設定；A 移植既有文案、CSS、UI 與 fixtures。
4. B 完成真實 Provider 與 validation；A 串接相對路徑 /analyze。
5. 建立 Preview，驗證 runtime、圖片 decoder 與真實分析。
6. 通過 test-plan gates，再修改正式部署指向／提升候選版本。
7. 同源切換須完成第 6 節 service worker 過渡方案。
8. Next.js 完成同等功能驗收後，另行變更移除舊 .NET 目錄與舊執行文件，
   更新 README current status；不要在本文件更新時先移除可用舊版。

新 contract v2 與舊 v1 不宣稱兼容。新前後端作為同一部署一起發布，
避免新 API 與舊 UI 混搭。舊版仍可能送 10 MiB，不能把它當新 API 測試 client。

## 3. Vercel 專案設定

| 項目 | 目標 |
| --- | --- |
| Root Directory | repository root |
| Framework | Next.js |
| Install／Build | npm ci／npm run build，與 lockfile 一致 |
| Output Directory | 使用 Next.js framework 預設，不填舊 publish/wwwroot |
| Runtime | Node.js，與本機相容且已鎖定版本 |
| API route | app/analyze/route.ts 對應 /analyze |
| Function duration | 30 秒，確認帳號與部署允許且設定生效 |
| Region | B 依使用者／Provider 位置與方案測量決定，記錄實際值 |
| Environments | Development／Preview／Production 分開配置 |
| API cache | no-store；CDN／service worker 不存分析回應 |

`vercel.json` 已移除 dnf／dotnet publish、.NET outputDirectory、
_framework headers 與全站 index.html rewrite，改為 Next.js framework。
Vercel Dashboard 若仍有舊專案 overrides，操作者須核對後才部署 Preview；不可讓 SPA rewrite 吞掉 /analyze。
Next.js POST Route Handler 需要伺服器執行，禁止使用純 static export。

Function maxDuration 是平台執行上限，不是應用程式 deadline。
官方依方案／runtime 說明可用時長，部署當天再核對：
[Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration)。

## 4. 環境變數與 secrets

設定名稱與預設以 [SDD 第 10 節](sdd.md#10-環境設定與可觀測性) 為準：

- Development 預設 mock；Remote 本機測試使用未提交的 .env.local。
- Preview 預設 mock；受控整合 Preview 明確改 remote，使用測試 key／額度。
- Production 只有完成 gate 才設 remote。
- 正式 key 不提供不受信任分支／fork 的 Preview，避免任意部署程式讀取。
- AI_API_KEY／AI_MODEL／AI_PROVIDER 只在 Server 可用；Client 僅取得模式與 timeout。
- .env.example 已改為新設定與空 key；不可將真實 key 寫入此檔。
- 不將整份 process.env 或 SDK exception 印入 log。
- 修改環境變數後重新部署，驗證實際 mode／模型；不要假設既有 bundle 已改。

Remote 缺 key／模型或設定非法 → 顯式失敗，不退回 Mock。
UI 顯示 Demo 時必須使用 fixtures 並告知未執行分析。
Mock 環境 /analyze 回 503，避免誤用真實 API。

## 5. Preview 與發布前檢查

先用去識別化素材；每次驗證記錄 URL、Git revision、時間與操作者：

1. 完成 lockfile 安裝、typecheck、lint、unit／integration、production build。
2. 確認 / 頁面與 /analyze 分別回 HTML／contract JSON，非 POST 正確拒絕。
3. 合法 JPEG／PNG、接近 4 MiB 圖片、400／413／415／422 正確；
   signature-only 壞檔不得呼叫 AI。
4. 驗證 API 20 秒 budget、Provider 15 秒 timeout、Client 25 秒與平台 30 秒。
5. 驗證 Provider 呼叫最多一次；分析完成／取消皆清理資源。
6. 查 application logs 僅有 allowlist metadata；Client bundle 無 secrets。
7. 查看實際 Provider usage 與成本控制，確認部署保護／限流真的阻擋。
8. 真實手機 smoke，依 test-plan 記錄成功、失敗、重試與 PWA 行為。
9. 跑已鎖定 prompt／model 的 AI evaluation 與三輪 Demo。
10. 發布候選版本、記錄上一可回復部署與配置，再切正式。
11. 正式切換後重跑小量 smoke；部署 build 成功不等於 Remote 已驗收。

日誌請使用 caseId／requestId 查詢，不把上傳原圖或完整分析 body 貼到公開 issue。

## 6. PWA 與舊 Blazor service worker 遷移

既有 root-scope worker 使用 offline-cache-* 並攔截 navigation，
即使 Server 已改為 Next.js，舊裝置仍可能載入快取 Blazor。
不能只改 Vercel framework 後認定使用者已切換。

A 在 implementation 中完成：

1. 新 Preview／新 origin 先驗證 Next.js，避開既有 worker 干擾。
2. 同一正式 origin 過渡時保留 /service-worker.js 路徑，
   發布有版本的 migration worker；install／activate 依設計接手。
3. 只刪除本應用已知的 offline-cache-* 與明確前一版本 cache，
   不刪除 origin 上不屬於本 app 的任意 cache。
4. 新 worker 不再回舊 Blazor index.html；提示使用者重新載入，
   避免正在分析時強制 refresh 遺失內容。
5. 處理舊 worker waiting／多分頁／已安裝 PWA；測試關閉重開與更新通知。
6. 新 PWA 僅快取明確靜態 assets、離線頁面與無敏感資料的 Demo fixtures。
   不把 Next.js 所有 navigation／RSC response 一律 cache-first。
7. 不快取 /analyze、user upload、analysis result、Provider request。
8. Demo 可離線操作以「已成功預載」為前提，首次離線不保證可用。

實際 worker 方案由 A 設計並在測試報告附版本；
本文不是要求現在執行 unregister／清除使用者儲存。

## 7. 發布與回復決策

### 切換條件

B 確認 API／AI／成本與配置；A 確認 UI／PWA；產品確認案例與告知；
企劃確認展示 URL。未驗收不更新 README 為「已完成 Next.js」。

### 事故處理

| 症狀 | 優先檢查 | 處理 |
| --- | --- | --- |
| 頁面能開，Remote 全失敗 | mode／key／model／Provider usage | 修正配置並重部署；必要時明確停用 Remote |
| 413 無 JSON | body 實際大小／平台上限 | 使用較小圖，檢查 UI 與 request overhead |
| 504／分析逾時 | API deadline、Provider duration、SDK retry | 限制呼叫；查去識別化 timing，不盲目延長所有上限 |
| 新版發布卻仍舊 UI | service worker／waiting worker／部署 revision | 執行已驗證遷移方案、提示 reload |
| 異常費用／大量請求 | 保護規則、key usage | 限制部署存取、停用／撤銷專用 key；聯絡 B |
| 結果格式或品質退化 | 模型／prompt／schema revision | 回復已驗證的完整版本，重跑 smoke |

### 回復步驟

1. 記錄事故時間與 revision；保留不含敏感內容的證據。
2. 緊急成本控制先限制存取或撤銷專用 Provider key；
   只改 UI 模式不會停止已發出的 Provider request。
3. 回復上一個已驗證 Next.js 部署；核對環境變數、模型與 prompt 配置，
   不假設部署 rollback 自動回復外部 key／Provider 或全部環境設定。
4. 若必須回舊 Blazor，明確是 v1 Mock 備援，不能稱 Remote 已恢復；
   同時處理 worker 與原有部署設定。
5. 在已安裝 PWA 與新瀏覽器各做 smoke，更新 mode 告知。
6. 記錄修復／重發版本、失敗案例與後續工作。

不直接在未備份狀態刪除舊部署／舊程式以完成遷移。
API keys 的輪替或撤銷需由已授權操作者執行並記錄。

## 8. 發布紀錄模板

- 日期／B／A／覆核人：
- Git revision／schema revision／promptVersion：
- Node／Next.js／Provider SDK／model：
- Preview URL／Production URL／上一可回復 URL：
- Vercel Root／Framework／runtime／region／duration：
- mode／timeout（不填 key 值）：
- Provider／平台資料保留政策來源與確認日期：
- 限流／存取保護／費用門檻／硬限制或告警：
- CI／AI evaluation／手機／PWA／rollback 證據：
- 限制／未完成項／對外發布範圍：
- 決策：不發布／受控 Demo／公開 Remote。

## 9. B 本次部署準備與外部阻塞（2026-09-04）

本節保留 2026-09-04 的初始阻塞快照；目前狀態已由第 10 節取代。當時沒有 `.vercel/project.json`、Vercel CLI 登入憑證或 VERCEL_TOKEN，未取得 project/team 與保護規則，也沒有 Preview URL；未修改正式網域、未提升 Production、未建立付費服務。

必要輸入：已授權 Vercel project/team、Preview 的存取保護、專用測試 key、美元總額與最多呼叫次數。CLI 可由操作者登入後 `vercel link` 選**既有**專案，核對 root/framework/install/build/output/Node 24.x，再 `vercel deploy` 建立 Preview；不得加 `--prod`。若使用已登入 Dashboard，先確認專案 identity 與保護設定，不靠 URL 猜權限。

設定 `maxDuration=30` 在 route；未任意指定 region，先依帳號與台灣使用者實測。官方 Node major 支援與 duration／payload 要在部署當天再核對：[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Functions limits](https://vercel.com/docs/functions/limitations)。本機 Windows sharp 成功，不替代 Vercel Linux decoder 驗證。

Preview 先設 mock，確認受控存取確實攔截未授权請求，再在已核准測試範圍設 remote。僅 Vercel Authentication／可用保護機制或可靠 WAF 等才能控制外部存取；本次沒有用 in-memory Map／CORS 假裝限流。沒有已驗證支出阻擋或受控存取時，不開放公開 Remote。[Deployment Protection](https://vercel.com/docs/deployment-protection)

不付費 smoke：`npm run smoke:preview -- --url https://YOUR-PREVIEW`，驗證 method/header/invalid-input。若需自動通過部署保護，將 `VERCEL_AUTOMATION_BYPASS_SECRET` 安全設於本機 process env，工具不列印。另用無 bypass 的請求確認保護确實攔截。

有圖片 smoke 必須已具明確額度授權，使用 `--image APPROVED_IMAGE --allow-paid-call`，只發出一次合法圖片呼叫；輸出僅 status 與 URL，不列印圖片／分析內容。完整品質改用 eval:ai；4 MiB／平台 413／timeout、取消、logs、Provider usage／支出控制仍依第 5 節逐項記錄，工具成功不代替這些 gates。

保留政策：adapter 設 `store:false`，不代表供應商零保存；OpenAI 的 abuse monitoring／帳號資料控制依實際方案而異，產品開放 Remote 前需確認並告知。[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

## 10. Preview 實際配置紀錄（2026-09-05）

- Preview URL：`https://scamshield-f24rsyzp2-csfishy-1632s-projects.vercel.app/`；deployment `4ArokYEYXcQXsraTXrYB7tBrxuZ2`。
- Branch／SHA：`codex/backend-handoff`／`e29fa4ad9fe20e891e21dd4e15642dc53123f9d5`；狀態 Ready、Latest、Preview。
- Preview：`ANALYSIS_MODE=remote`、OpenAI snapshot 與 timeout／prompt config 已設定；`AI_API_KEY` branch-specific secret present，未 reveal。
- Production：`ANALYSIS_MODE=mock`，無 `AI_API_KEY`；未 redeploy、promote 或更動正式網域。
- Vercel Authentication／Require Log In 已啟用；無登入請求得到 302。GitHub Backend、Vercel、Preview Comments checks 均通過。
- 已登入 session 載入首頁成功；runtime log 證實 `GET /analyze` 回 405。沒有新增付費呼叫。
- 仍待：受保護 session 下的合法圖片 Remote smoke、invalid POST 完整 headers、app-level OPTIONS、平台 413／timeout、usage／成本控制與手機實機驗收。
