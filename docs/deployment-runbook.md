# ScamShield AI 開發、遷移與部署手冊

- 版本：2.2｜2026-09-29
- 狀態：第 9–10 節與 [第一階段本機檢核](public-beta-readiness.md) 保留歷史證據；第 11–12 節為現行操作依據。已授權的功能分支／Preview／免費隔離 Redis／Google 表單進度見 [第二階段驗收](preview-acceptance-2026-09-29.md)；付費 AI、Production 與公開分享仍待核准
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
| npm run eval:ai | 預設素材 dry-run；付費執行另需明確授權及執行參數，不由 CI 自動呼叫 |
| npm run test:redis | 僅隔離本機 Redis 的 Lua／競態測試 |
| npm run test:redis:rest | 明確授權且指定目標的隔離 Upstash REST 測試，見第 12 節 |
| npm run smoke:preview | Preview HTTP 檢查；本階段使用第 12 節 AI OFF 模式 |
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

AI 基礎設定見 [SDD 第 10 節](sdd.md#10-環境設定與可觀測性)；Beta 新增設定與預設以 [.env.example](../.env.example) 及本文件第 11 節為準：

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
5. 驗證 Provider 呼叫最多一次；分析完成／取消清理本機資源；Redis 租約按第 11 節處理，取消或無法確認 Provider 停止時保守保留至期限，不退日額度。
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
| 異常費用／大量請求 | 保護規則、key usage | 按第 11 節對明確目標 Redis 控制鍵急停；必要時部署停用或由已授權操作者撤銷專用 Provider key |
| 結果格式或品質退化 | 模型／prompt／schema revision | 回復已驗證的完整版本，重跑 smoke |

### 回復步驟

1. 記錄事故時間與 revision；保留不含敏感內容的證據。
2. 按第 11 節對明確環境的 Redis 控制鍵急停，必要時部署 `ANALYSIS_ENABLED=false` 或由已授權操作者限制／撤銷专用 Provider key；
   只改 UI 模式不會停止已發出的 Provider request，任何急停都不能保證撤回已產生費用。
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

本節保留 2026-09-04 的初始阻塞快照；後續歷史配置在第 10 節，2026-09-29 進度另見第二階段驗收。下述舊操作建議不代表目前授權，尤其不能沿用自動 bypass 或付費 smoke 許可；本階段以第 12 節匿名 AI OFF 流程為準。當時沒有 `.vercel/project.json`、Vercel CLI 登入憑證或 VERCEL_TOKEN，未取得 project/team 與保護規則，也沒有 Preview URL；未修改正式網域、未提升 Production、未建立付費服務。

必要輸入：已授權 Vercel project/team、Preview 的存取保護、專用測試 key、美元總額與最多呼叫次數。CLI 可由操作者登入後 `vercel link` 選**既有**專案，核對 root/framework/install/build/output/Node 24.x，再 `vercel deploy` 建立 Preview；不得加 `--prod`。若使用已登入 Dashboard，先確認專案 identity 與保護設定，不靠 URL 猜權限。

設定 `maxDuration=30` 在 route；未任意指定 region，先依帳號與台灣使用者實測。官方 Node major 支援與 duration／payload 要在部署當天再核對：[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Functions limits](https://vercel.com/docs/functions/limitations)。本機 Windows sharp 成功，不替代 Vercel Linux decoder 驗證。

Preview 先設 mock，確認受控存取確實攔截未授权請求，再在已核准測試範圍設 remote。僅 Vercel Authentication／可用保護機制或可靠 WAF 等才能控制外部存取；本次沒有用 in-memory Map／CORS 假裝限流。沒有已驗證支出阻擋或受控存取時，不開放公開 Remote。[Deployment Protection](https://vercel.com/docs/deployment-protection)

不付費 smoke：`npm run smoke:preview -- --url https://YOUR-PREVIEW`，驗證 method/header/invalid-input。若需自動通過部署保護，將 `VERCEL_AUTOMATION_BYPASS_SECRET` 安全設於本機 process env，工具不列印。另用無 bypass 的請求確認保護确實攔截。

有圖片 smoke 必須已具明確額度授權，使用 `--image APPROVED_IMAGE --allow-paid-call --budget-usd APPROVED_USD --max-calls 1 --authorized-by OPERATOR`；目前 bounded reservation 要求至少 US$0.02，只發出一次合法圖片呼叫。輸出僅 status 與 URL，不列印圖片／分析內容。完整品質改用 eval:ai；4 MiB／平台 413／timeout、取消、logs、Provider usage／支出控制仍依第 5 節逐項記錄，工具成功不代替這些 gates。

保留政策：adapter 設 `store:false`，不代表供應商零保存；OpenAI 的 abuse monitoring／帳號資料控制依實際方案而異，產品開放 Remote 前需確認並告知。[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

## 10. Preview 實際配置紀錄（2026-09-05）

- Preview URL：`https://scamshield-f24rsyzp2-csfishy-1632s-projects.vercel.app/`；deployment `4ArokYEYXcQXsraTXrYB7tBrxuZ2`。
- Branch／SHA：`codex/backend-handoff`／`e29fa4ad9fe20e891e21dd4e15642dc53123f9d5`；狀態 Ready、Latest、Preview。
- Preview：`ANALYSIS_MODE=remote`、OpenAI snapshot 與 timeout／prompt config 已設定；`AI_API_KEY` branch-specific secret present，未 reveal。
- Production：`ANALYSIS_MODE=mock`，無 `AI_API_KEY`；未 redeploy、promote 或更動正式網域。
- Vercel Authentication／Require Log In 已啟用；無登入請求得到 302。GitHub Backend、Vercel、Preview Comments checks 均通過。
- 已登入 session 載入首頁成功；runtime log 證實 `GET /analyze` 回 405。沒有新增付費呼叫。
- 仍待：受保護 session 下的合法圖片 Remote smoke、invalid POST 完整 headers、app-level OPTIONS、平台 413／timeout、usage／成本控制與手機實機驗收。

## 11. Beta 設定與操作（2026-09-29）

本節是操作文件，**範例不代表已執行**。第一階段未建立遠端資源；第二階段已授權功能分支 commit／push、Preview 部署、免費獨立 Redis 與 Google 表單作業，實際執行紀錄見 [第二階段驗收](preview-acceptance-2026-09-29.md)。真實 AI、Production 操作與公開分享未授權；第 9–10 節舊 SHA 的 PASS 不適用新部署。

### 11.1 設定順序與隔離

1. 先保持 `ANALYSIS_MODE=mock`、`ANALYSIS_ENABLED=false`，網站、Demo、隱私與回饋可先驗收。
2. 由管理者核准既有 Redis 資源；Preview／Production 優先使用不同資源及不同憑證。不讓不受信任的 Preview branch 取得正式 Redis／Provider／HMAC 秘密。
3. 設定 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、至少 32 bytes 的隨機 `QUOTA_IP_HMAC_SECRET`；server-only，禁止輸出實際值。REST URL 僅接受 HTTPS 的預期 `*.upstash.io`，不接受任意 host／路徑／credentials。
4. 明確設定 `QUOTA_ENVIRONMENT=preview` 或 `production`，必須符合可信部署的 `VERCEL_ENV`；`QUOTA_NAMESPACE` 用於該環境的 stable namespace。單一環境各執行個體共用它，**不要以每次 deployment SHA 當 namespace 重置每日額度**。
5. 正式 Vercel 設 `QUOTA_TRUST_PROXY=vercel`，實作僅在 `VERCEL=1` 的 Preview／Production 接受 `x-vercel-forwarded-for`。部署外的同名 header 沒有信任權；不解析 visitor 提供的 body/query IP，也不信任任意 `X-Forwarded-For`。若架構加入其他 proxy，先重新驗證信任鏈，無可信 IP 就拒絕 Remote。[Vercel request headers](https://vercel.com/docs/headers/request-headers)
6. 只在 `NODE_ENV=development`、`QUOTA_ENVIRONMENT=development` 的明確本機測試可設 `QUOTA_DEV_IP`；Production／Preview 設此值會失敗，不要偽造 `VERCEL` 環境變數繞過驗證。
7. 核對政策值、Redis 記憶體／淘汰／一致性／區域、Provider 費用控制及隱私資訊後，才在已授權環境設 remote、部署啟用與執行期開關。未核對不可公開付費分析。

有效 prefix 是 `{scamshield:<environment>:<namespace>}`，因此 Preview／Production key 不混用；**不同 prefix 不等於憑證權限隔離**。HMAC 只降低 IP 辨識風險，不是匿名保證。IPv4、IPv6 與 mapped IPv4 會正規化；不自行把 IPv6 網段當同一個人。NAT 會共用額度，VPN／IPv6 輪換可取得不同來源額度。

### 11.2 原子操作、TTL 與故障政策

採 Upstash Redis 官方 REST `EVAL` 的單次原子 Lua，不引入限流 SDK。IP 日額度、全站日額度及並行名額一次取得；任一不足不部分扣次。所有 Lua keys 使用相同 hash tag，以符合多鍵 cluster same-slot 要求。[Upstash EVAL](https://upstash.com/docs/redis/commands/scripting/eval)、[key locking](https://upstash.com/docs/redis/features/key-locking)、[Redis cluster hash tags](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

| 狀態 | 時間／生命週期 |
| --- | --- |
| 短期 POST 計數 | 滑動 60 秒；key 有 60 秒 TTL |
| IP／全站日額度 | Redis `TIME` 換算 Asia/Taipei 00:00；key TTL 為下一個台北午夜加 1 小時，最長約 25 小時 |
| 去重 receipt | 48 小時，防同一 operation 重複執行／扣次；不是重試 AI 的許可 |
| 並行租約 | 預設 60 秒，允許 45–120 秒，涵蓋 20 秒 API deadline 與安全餘裕；唯一 ownership token；到期回收 |
| 執行期控制鍵 | 不設 TTL；只有精確字串 `enabled` 允許新分析，缺少／其他值全部停用 |

並行 `Retry-After` 按目前有效租約與目前設定上限，算到足夠名額到期的時間；部署下調上限時不能只看第一個租約。到時仍可能被其他新請求占用，這是可手動再試的等待提示，不是保證服務恢復或保留名額。

正常settled結果（包含資訊不足／normalization失敗）與明確Provider限流／配置／schema／refusal可用ownership token移除自己的租約，重複釋放不動他人的名額，不使用無ownership的DECR。取消／逾時／網路／unknown失敗後無法證明Provider已停止時，保守保留至租約期限；執行個體崩潰後也由期限回收。配額取得回應遺失／逾時時不呼叫AI，但可能已扣額度，**不推測成功、不退款**。reserve後再取消或急停也不退日額度，即使Provider呼叫為0。Provider流程前再次檢查控制鍵、receipt及自己的租約是否仍有超過25秒餘裕，避免實例停頓後用快到期租約呼叫AI；不滿足時拒絕且不退款。急停與呼叫之間仍有不可消除的極短時間差，已開始的Provider請求不保證可撤回。

REST transport 單次 POST，`redirect:error`、`no-store`、預設 1000ms deadline（可調 100–3000ms），不自動重試。Upstash TS SDK 官方預設重試 5 次，本實作未採其 SDK；勿後續替換成 fail-open 或預設 retry wrapper。[REST API](https://upstash.com/docs/redis/features/restapi)、[SDK retries](https://upstash.com/docs/redis/sdks/ts/retries)

未設定、連線、認證、timeout、取消、非預期結果或未知額度狀態統一 fail closed，安全回 `rate_limit_unavailable`，不退回 Map、process memory 或 localStorage。Redis Lua 原子性不等於任意故障下的絕對費用硬上限：需實際核對 resource 的 eviction 關閉（有效 key 不應被提早淘汰）、容量與一致性／failover 行為。Upstash 文件說明預設 eviction 關閉，也揭露一致性／故障限制；實際資源的 console 證據另記驗收報告，不以文件預設當作帳號證據。[Eviction](https://upstash.com/docs/redis/features/eviction)、[Consistency](https://upstash.com/docs/redis/features/consistency)

### 11.3 急停、初始化與恢復

控制鍵格式：`{scamshield:<environment>:<namespace>}:control:<QUOTA_CONTROL_KEY_SUFFIX>`，suffix 預設 `analysis-enabled`。控制鍵每次新 admission／Provider 開始前讀取，沒有長時間快取；環境變數改動則需重新部署。

以下僅供已獲授權的操作者在**已明確核對目標資源的 Redis console**逐條人工操作。不得把 Preview 命令套到 Production，不用清空資料庫重置限額。初始化先停用，無 TTL：

```text
SET {scamshield:preview:scamshield}:control:analysis-enabled disabled
GET {scamshield:preview:scamshield}:control:analysis-enabled
```

確認 Preview 配置及核准測試預算後才啟用：

```text
SET {scamshield:preview:scamshield}:control:analysis-enabled enabled
```

正式事故急停必須先確認目前使用的是 Production 專用 Redis、namespace 与目標鍵；下例只適用 namespace=`scamshield`：

```text
SET {scamshield:production:scamshield}:control:analysis-enabled disabled
GET {scamshield:production:scamshield}:control:analysis-enabled
```

核對新合法 HTTP POST 回 `503 analysis_disabled` 且 Provider call 沒增加；同時確認 Demo／回饋可用。Redis 失聯時應由 fail-closed 阻擋新分析；可另設 `ANALYSIS_ENABLED=false` 重新部署。若已出現不受控 Provider 使用，依既有授權撤銷／限制獨立 Provider 憑證。這些操作不保證撤回已送出的請求或費用。

恢復前記錄事故、檢查來源／成本／Redis狀態、補齊故障測試、確認目前日額度與有效租約，不刪 key 清零。重新獲准後才把**相同已確認環境**控制鍵設 `enabled`，先少量 smoke，再核對 usage／日誌。本階段主 Preview 控制鍵保持 `disabled`，隔離測試只操作隨機 test namespace；Production 與任何付費呼叫仍需另行核准。

### 11.4 費用與必要觀察

- Preview／Production 使用獨立 Provider 專案與憑證，限制可用模型／人員；保存最大 2400 output tokens、圖片 4 MiB／24M pixels、API20s／Provider15s、無自動 retry。
- 圖片尺寸／細節、input／output tokens、當期模型價格影響成本；200 次是分析嘗試上限，不能換算成固定費用，也不能把歷史單次 US$0.001152 套用全部請求。
- 人工檢查帳號的 spend alerts 與組織／專案 **Enforce a hard limit**。現行 OpenAI 官方文件說明 hard limit 達到已追蹤金額後讓受影響 API 回 429，但傳播不是即時，可能小幅超支；警報本身不阻擋。帳號可見功能、門檻、權限與實際效果均待確認，不寫成已啟用。[OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits)
- 沿用 telemetry 觀察成功／錯誤比例、duration、限流／failure kind、是否進 Provider、model／promptVersion、取得時的 usage；缺 usage 是 unknown，不是 0 成本。再與 Provider Usage／billing、Vercel 及 Redis dashboard 用量交叉核對。
- 不記錄圖像、base64、完整 request／prompt／分析、raw IP、HMAC code、feedback Email／正文或 secrets。log失敗不改 HTTP，也不重呼叫 Provider；本轮不新增第三方追蹤或管理後台。

### 11.5 設定更新與回復

Google 表單公開 URL、三個 `entry.<digits>` 與 Email／build 設定詳 [.env.example](../.env.example)，外部表單管理清單見 [Beta 檢核](public-beta-readiness.md#2-google-表單設定)。頁面每次 server render 讀取 allowlist 設定，不把整份 env 給 client。Vercel env 修改需新部署；只有 Redis runtime key 的变更可立即影響後續 admission，不需 rebuild。App build identifier 缺少時不捏造 revision。

回復需同步檢查程式、公開契約、PWA、mode、啟用變數、Redis namespace／key、Provider 憑證與費用設定；rollback 不會自動回復 Redis 資料或控制鍵。舊 UI 遇新未知 code 應安全顯示 fallback，禁止自動重新送出；要在已安裝舊 PWA 實測後才視為相容。

不要回復成缺少限額保護的公開 Remote。必要時先停用真分析、維持 Demo／回饋可用，待受控驗收後恢復。IP 限流不能證明抵禦 VPN輪換、分散bot或DDoS；全站配額可能被惡意耗盡，更大規模分享需評估平台防護／WAF／server驗證CAPTCHA。

## 12. Preview 驗收工具與版本核對

本節工具需對確切環境執行，結果寫入獨立驗收紀錄。第二階段已授權免費隔離 Redis 寫入與 Preview 部署，但沒有付費 AI 授權；主 Preview 部署設定及 Redis 控制鍵均應保持 AI 停用。Redis 初始化 `disabled` 只證明該資源鍵值，不能冒稱尚未部署的應用已採用它。

### 12.1 Windows 與 Vercel 的 Node／npm

Windows 的 `npm.cmd`／`corepack.cmd` 可能使用系統 Node 22，即使另有 Node 24。先核對執行檔，再由確切 Node 24 啟動 Corepack JavaScript，並讓 lifecycle 子程序的 PATH 使用同一 Node。以下路徑是此次實測位置，以使用者目錄變數取代帳號名稱；其他機器需先定位，不能假設存在：

```powershell
$node24 = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$corepackJs = Join-Path $env:ProgramFiles 'nodejs/node_modules/corepack/dist/corepack.js'
$env:PATH = (Split-Path $node24) + ';' + $env:PATH
$env:COREPACK_HOME = Join-Path $PWD '.tools/corepack'
& $node24 --version
& $node24 $corepackJs npm@12.0.2 --version
& $node24 $corepackJs npm@12.0.2 ci
& $node24 $corepackJs npm@12.0.2 test
```

第二階段已以 Node 24.19.0／npm 12.0.2 乾淨安裝成功，lockfile 未變；詳情及後續整合測試另見該階段紀錄。不要覆寫第一階段 npm 10.9.2 的歷史測試證據。

Vercel 的 `engines` 選擇 Node 24.x major，平台可更新 minor／patch，必須保存 build log 的實際版本。專案 `packageManager` 指定 npm 12.0.2 不代表每次部署自動使用該版本；現行 `vercel.json` 是 `npm ci`。如採 Corepack，依 Vercel 官方方式在**已授權的 Preview 範圍**設定 `ENABLE_EXPERIMENTAL_COREPACK=1` 並核對 install log，不能順手改 Production／全專案設定。Corepack 仍為平台實驗功能，build 成功及實際 package manager 都要實測。[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Vercel Corepack](https://vercel.com/docs/builds/configure-a-build#corepack)

目前 `.github/workflows/backend.yml` 只監聽 PR 及 `main` push。只 push `codex/public-beta-readiness` 不會觸發該 Backend CI；本機測試、Vercel build、GitHub workflow 各自記錄，沒有 run 就列 NOT_RUN，不建立未獲授權的 PR 來補一個綠燈。

### 12.2 匿名 AI OFF smoke

先依**已核對的部署設定**選擇預期錯誤，不能執行後再放寬接受任意 503：

```sh
npm run smoke:preview -- --url https://YOUR-PREVIEW --ai-off --expected-disabled-code analysis_disabled
```

如果目標是 Mock，或 Remote 缺少基本 Provider 設定而先被 config guard 拒絕，改明確指定 `--expected-disabled-code provider_unavailable`。此時通過只證明 Provider 未配置／不可用，不證明 Redis 急停有效；不得為取得另一錯誤碼而新增假的 key。

AI OFF 模式拒絕 `--image` 與全部付費參數，不讀圖片、不送合法圖片，只送無效 JSON POST `{}`；檢查 GET／HEAD／OPTIONS 的 405／Allow，以及 POST 的 **503＋指定錯誤碼**、strict contract、`no-store` 與有效 Request ID。工具不自動重試，且即使 shell 已有 `VERCEL_AUTOMATION_BYPASS_SECRET` 也完全不用，請求不帶登入 Cookie，不跟隨 redirect。

若 Vercel Protection 回 302／401／403、登入頁或非應用程式 JSON，該匿名驗收不得報 PASS，也不能加 bypass 來掩蓋。記錄實際阻擋結果，僅在使用者另行授權且設定範圍明確時變更 Preview 存取；不可改 Production。AI OFF PASS 不等於真實分析、Google 表單、Redis 原子性、iPhone／PWA 或完整 Preview gate PASS。

原有圖片 smoke 的 `--image`、`--allow-paid-call`、`--budget-usd`、`--max-calls 1`、`--authorized-by` guard 保留；本階段不執行。最低 reservation 由現行程式計算，不把歷史固定金額當作目前所有請求成本或授權。

### 12.3 真實隔離 Upstash REST 測試

`test:redis` 保持只連本機 loopback。遠端測試使用獨立入口，先安全注入 `TEST_UPSTASH_REDIS_REST_URL`／`TEST_UPSTASH_REDIS_REST_TOKEN` 到執行程序，不寫入文件、shell history、版控或輸出。核對該憑證只屬於已授權的免費 Preview 測試資源，再執行：

```sh
npm run test:redis:rest -- --expected-host VERIFIED-TEST-HOST.upstash.io --allow-isolated-redis-write
```

`VERIFIED-TEST-HOST.upstash.io` 是需換成已核對 host 的占位值；不是可直接執行的目標。工具要求 HTTPS、精確 host 與顯式寫入 flag，不從 `UPSTASH_REDIS_*` 或 Vercel／Production 設定 fallback。若目標不明或未提供憑證，保留 NOT_RUN，不猜測。

工具使用隨機 `integration-<UUID>` namespace、限定 Lua／命令、最多 250 次命令（含保留的清理命令），拒絕主 Preview／Production prefix、SCAN／KEYS／FLUSH。測試 seed 控制鍵設 10 分鐘 TTL；結束僅刪本次確切 keys，並用 EXISTS 驗證清理；其他腳本產生 key 有各自 TTL。若程序中斷或清理失敗，記錄殘留可能與 TTL，不能宣稱全部已刪。它不改 `{scamshield:preview:scamshield}:control:analysis-enabled`，也不呼叫 Provider。

保存執行 profile、target fingerprint、git SHA、Lua script hashes、checks／命令數、cleanup 狀態與 Provider=0 證據；不要記 token 或原始 Redis 例外。回應遺失測試是在真實 Redis 執行後的 transport fault injection，不等同真的中斷 Upstash 服務。離線 transport 測試 PASS、真實 REST runner PASS、部署 HTTP fail-closed 各是獨立證據；不得互相替代。
