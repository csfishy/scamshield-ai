# Public Beta Readiness — 目前狀態與歷史快照

## 目前隱私與最終 gates 分支（2026-09-29）

目前工作分支為`codex/privacy-and-final-gates`，基於已核對的`origin/main`／Production SHA `5a788a91f7c934667cb8f216bcc393bd164084dd`。使用者已決定：回饋最長90天、刪除或去識別、長期案例另取得適當同意；公開聯絡／刪除Email為 **cs.sakana@gmail.com**。這些資訊不再是BLOCKED_USER_INPUT，但本分支沒有Production部署授權，不能宣稱線上舊頁已更新。

本輪實際命令、測試數量、外部表單對齊、Git與最終安全核對集中記於[Privacy／Final Gates 2026-09-29](privacy-final-gates-2026-09-29.md)。[Privacy操作](privacy-operations.md)說明90天人工清理、Sheets／匯出副本及刪除申請；[iPhone／PWA清單](iphone-pwa-acceptance.md)等待真機結果；[有限Production AI計畫](production-ai-quality-plan.md)只準備素材與程序，calls／USD尚待核准。以下狀態與第1–8節的**第一階段歷史**不同：

| 項目 | 現況／範圍 |
| --- | --- |
| Production安全基準 | SHA `5a788a9…`、`dpl_3fVJ2VKFGEF4mGkYxRhkYzH65sSK` READY；canonical匿名可用；`ANALYSIS_ENABLED=false`、主runtime=`disabled`／TTL=-1；本輪不啟用AI |
| REDIS_INTEGRATION | PASS（既有Production資源隔離21checks／627commands證據）；不是本輪重跑 |
| PRODUCTION_HTTP_REDIS_RUNTIME_GATE | PASS（先前同SHA runtime-only新部署與逐筆遙測）；本輪保持雙層OFF、不重做切換 |
| PRODUCTION_HTTP_RATE_LIMIT | NOT_RUN；先前因兩gate同開可能使其他公開訪客觸發Provider而停止，沒有用standalone測試冒充HTTP429 |
| FEEDBACK_EXTERNAL_ACCEPTANCE | PARTIAL；本輪Google描述更新後匿名GET200（08:19 UTC）已確認90天／Email／刪除／長期同意；沒有新送出，歷史導覽根因未定及iPhone未驗仍保留 |
| LOCAL_PRIVACY_IMPLEMENTATION | PASS；Node24.19.0／npm12.0.2，typecheck、lint、14files／338tests（含17HTTP）、build、bundle37files／0markers、20E2E通過；完整命令與首輪E2E失敗／同命令重跑證據見本輪紀錄 |
| PRIVACY_COMPLETENESS | **PARTIAL／PENDING_DEPLOYMENT**：政策、本機實作／測試及Google描述對齊已完成；管理者人工清理仍需交接，Production網站須另獲授權部署並匿名確認後才能PASS |
| IPHONE_PWA_ACCEPTANCE／AI_QUALITY_GATE | NOT_RUN；只有人工清單／下一階段計畫，不做真機代跑或付費AI |
| PRODUCTION_ACCEPTANCE／PUBLIC_BETA | PARTIAL／NOT_READY；本分支完成不等於Production新版、品質或公開核准 |

原始Production非AI證據保存在當時ignored `.tools/production-release-2026-09-29.md`與`.tools/production-non-ai-final-acceptance-2026-09-29.md`；這是本機證據路徑，不假裝已提交到repository。當時5筆自有分析請求逐筆遙測Provider=0；不是Provider整個帳戶歷史用量，也不代表本輪有呼叫。

## 第一階段本機快照（歷史；2026-09-29）

本文件保存**第一階段本機交付時**的集中驗收快照，下文「本輪」均指該階段；原始 231 項測試、19 項 E2E 及 NOT_RUN 不追溯改寫。**功能完成、本機測試通過、Preview 通過、Production 通過與可以公開 Beta 是不同狀態。**第一階段只做本機程式、離線自動化與文件，未完成的外部項目均為 NOT_RUN／BLOCKED，不由歷史 PASS 推定通過。

第二階段曾授權功能分支commit／push、Preview、免費Redis與Google表單，歷史結果保留於[Preview驗收](preview-acceptance-2026-09-29.md)。其後另經授權完成Production非AI驗收；最新範圍以上方目前分支段落為準，不用本節歷史授權／未勾選清單否定後來可追溯證據。

## 基準與可追溯性

| 項目 | 第一階段紀錄 |
| --- | --- |
| Repository／remote | `csfishy/scamshield-ai`／`https://github.com/csfishy/scamshield-ai.git` |
| 基準 HEAD | `05de91dbaa960bd4d4eeae084dfa3baad57842de` |
| 作業分支 | `codex/public-beta-readiness`；在使用者明確授權後由 main 建立 |
| 作業前 working tree | 存在未追蹤 `deliverables/`，與本輪範圍無關；不 stash、不刪除、不修改該目錄 |
| 作業後 working tree | 本輪相關程式／測試／文件尚未提交；`deliverables/` 保留。交付時以 `git status --short` 核對 |
| 工具與框架 | Node 24.19.0；實際 npm 10.9.2，專案 `packageManager` 要求 12.0.2；Next.js 16.3.4、React 19.2.8、TypeScript 6.0.3、OpenAI SDK 7.10.0、sharp 0.35.4、Zod 4.5.4、Vitest 5.0.0、Playwright 1.62.1 |
| 相依變更 | 本輪 Redis 使用單次 REST EVAL，未新增限流／Redis SDK。既有安裝樹的 `@emnapi/runtime`、`@img/sharp-wasm32` extraneous 未自動刪除 |
| Provider／prompt | 保持 `gpt-4.1-mini-2025-04-14`、`scam-analysis-v1`；未變更模型、核心 prompt 或風險分數規則 |

历史 [2026-09-05 AI smoke](ai-smoke-2026-09-05.md) 記錄 `bbdcff41…` 一次真實呼叫及人工語意確認，另有 [Runbook §10](deployment-runbook.md#10-preview-實際配置紀錄2026-09-05) 的 `e29fa4a…` 受保護 Preview。這些證據保留，不等於本次未提交修訂的驗收。歷史 smoke 提及的 delimiter 處理後續已在 repository 演進中調整，勿將當時修復敘述當作目前程式規格。

已修正文檔過時敘述：API 文件的 Client「待整合」、evaluation README 不加範圍的「真實 calls=0」，以及 README 尚無成本防濫用功能的說法。第一階段未查驗當時線上部署，因此不根據舊文檔斷言線上仍是 Mock 或尚未部署。

### 修改檔案（交付 D）

以下是本輪39個修改／新增檔案，依用途分組；不包含未修改的 `deliverables/`，亦沒有lockfile變更。

| 路徑 | 修改原因 | 既有契約影響 |
| --- | --- | --- |
| `lib/server/quota-config.ts`、`lib/server/quota-scripts.ts`、`lib/server/quota.ts` | 集中server-only設定、可信IP/HMAC、Redis原子限額、receipt、ownership租約與急停 | 新增server內部服務；拒絕結果接既有error contract |
| `lib/server/analyze.ts` | decode前防濫用、圖片通過後reserve、Provider前START檢查、保守release | 新增守門／計次語義；成功JSON六欄不變 |
| `lib/contracts/analysis.ts`、`lib/server/errors.ts`、`lib/client/analysis-service.ts` | 六個新錯誤schema／status／retryable／文案與Client解析、Request ID | **是**，擴充v2錯誤enum；需新舊PWA相容驗收；成功body不變 |
| `lib/server/telemetry.ts` | allowlist追加providerEntered、usageKnown、quotaOutcome、leaseDisposition | 僅內部遙測；無敏感正文／IP |
| `lib/feedback.ts`、`lib/server/public-config.ts`、`components/feedback/FeedbackLinks.tsx` | URL／entry／Email／build驗證、預填編碼、Email與Request ID複製 | 新增回饋元件／allowlist props；無新公開API |
| `app/page.tsx`、`app/demo/page.tsx`、`app/privacy/page.tsx`、`app/globals.css` | 首頁Beta／回饋、獨立Demo／隱私、行動可操作樣式 | 新增頁面；不改分析結果結構 |
| `components/analysis/AnalysisResult.tsx`、`components/analysis/AnalysisWorkspace.tsx` | 結果與錯誤回饋、必要告知、額度文案／Request ID、保留手動提交 | UI內部props擴充；HTTP成功schema不變 |
| `public/service-worker.js` | 版本更新供新頁面／契約發布驗收；保留敏感資料不快取 | PWA版本更新；需實機舊worker驗收 |
| `package.json`、`scripts/check-bundle.mjs`、`scripts/test-e2e.mjs` | test:redis入口、新增secrets的bundle檢查、隔離離線E2E環境 | 開發／測試介面；沒有新runtime dependency |
| `tests/helpers/quota.ts`、`tests/redis/run.ts`、`tests/unit/quota.test.ts`、`tests/unit/quota-pipeline.test.ts` | DI替身、配額／IP／故障／provider0回歸、隔離真Redis9項runner | 驗證新server流程；替身非正式fallback |
| `tests/unit/feedback.test.ts`、`tests/unit/client-analysis-service.test.ts`、`tests/unit/pipeline.test.ts`、`tests/unit/pwa.test.ts` | 回饋安全、錯誤schema、Request ID、取消／租約與PWA測試 | 驗證既有契約與新增錯誤 |
| `tests/integration/http.test.ts`、`tests/e2e/analysis-ui.spec.ts`、`tests/e2e/remote-ui.spec.ts` | 真本機HTTP＋SDK loopback、UI／錯誤回饋／快速提交／鍵盤與窄螢幕 | contract／UI回歸；全部使用離線替身 |
| `.env.example`、`README.md`、`docs/api-contract.md`、`docs/test-plan.md`、`docs/deployment-runbook.md`、`docs/public-beta-readiness.md`、`tests/evaluation/README.md` | 安全設定、API新錯誤、測試層級、人工表單／費用／隱私與發布檢核；修正歷史敘述範圍 | API文件同步新enum；品質gates不降低 |

## 1. 本機程式與自動測試

新增回饋入口／Request ID複製、隱私頁、Beta提示、Google表單 allowlist 與編碼、選填 Email；新增 server-only Redis quota 服務與兩層停用；新增 4 種網站429與2種503錯誤。成功 JSON 六欄、strict parser、圖像 validation／重新編碼、no-store、server secrets、最大輸出2400tokens、timeout／取消、無Provider自動retry、PWA cache政策均保留。

### 實際執行紀錄

以下狀態只在實際執行後更新；建立腳本不算 PASS。測試使用既有相依安裝樹，不能宣稱已完成乾淨安裝再現。

| 命令／檢查 | 狀態 | 數量／限制 |
| --- | --- | --- |
| npm12／`npm ci`乾淨安裝再現 | NOT_RUN | 本輪未install／ci；lockfile未改；實際npm10.9.2執行下列檢查 |
| `npm run typecheck` | PASS | strict TypeScript，exit0 |
| `npm run lint` | PASS | 全repository ESLint，exit0 |
| `npm test` | PASS | 11 files／231 tests，含17 HTTP；離線Provider／Redis替身，不代表真Redis或AI品質 |
| `npm run test:integration`（亦含於 `npm test`） | PASS | 17 tests；真正Next HTTP＋OpenAI SDK loopback stub，quota DI替身；6新錯誤均斷言Provider stub calls=0；不重複計入231項總數 |
| `npm run build` | PASS | build ID `mBB_hLbrO3O_S1TwsewWT`；本機production build不是部署驗收 |
| `npm run verify:bundle` | PASS | 37 files／0 server markers；prompt與sharp deployment trace包含 |
| `npm run test:e2e` | PASS | 8 Mock/backend＋11 Remote UI＝19 tests；Provider、Redis與Google頁面皆本機替身／攔截；桌面瀏覽器不代替iPhone實機 |
| `npm run test:redis` | NOT_RUN | runner已執行，127.0.0.1:16379無隔離Redis；非零退出並明確NOT_RUN。預備9項真RedisLua／競態checks未執行，勿將skip視為PASS |
| `node --conditions=react-server --import tsx scripts/evaluate.ts`，另加 `--split holdout`／`--split demo` | PASS（dry-run） | development20/20、holdout10/10圖片驗證；Demo9case/3圖；paidCalls=0、人工標註pending；不是AI品質PASS |
| `npm audit --omit=dev --json` | PASS | 此次production相依查詢0 known vulnerabilities；不等於全面安全稽核 |
| `git diff --check` | PASS | 無whitespace error；Windows既有LF／CRLF提示不算error |

測試案例／層級對照見 [Test plan §9](test-plan.md#9-beta-回饋額度與費用保護回歸)。沒有使用真實 OpenAI、遠端 Redis、真實 Google 表單作為自動化測試依賴。原子性結論必須另外取得第 3 節證據。

額外檢查：390px手機寬度錯誤／展開回饋截圖經視覺檢查，無文字截斷或水平溢出；更新Markdown的本機相對檔案連結全部可解析。單獨回饋／Client／PWA unit 3files／56tests與quota unit70tests已包含在總數231內，不重複加總。Google新分頁以Playwright本機route fulfill測試，沒有真的填表；E2E子程序清除真實Provider／Redis憑證、明確停用付費分析。實機iPhone、真實Redis、付費AI及外部表單維持NOT_RUN。

### 採用的使用政策

| 項目 | 預設與語義 |
| --- | --- |
| 短時間防濫用 | 每個正規化IP滑動60秒最多3次分析POST；在昂貴解碼前執行 |
| IP每日 | 最多10次獲准進入AI流程的分析嘗試，同網路可能共用 |
| 全站每日 | 最多200次分析嘗試，非固定金額保證 |
| 並行 | 最多3個有效租約，預設60秒；唯一ownership token |
| 重置時間 | Redis伺服器TIME，Asia/Taipei每日00:00；不使用瀏覽器日期 |
| 何時扣日額度 | 圖片驗證通過且即將進入AI流程，IP／全站／租約條件原子性全部允許時 |
| 何時不扣日額度 | 格式／圖片失敗、早期配置／停用／短期限流、額度或並行條件未允許 |
| 已reserve後取消／急停／未知結果 | 不退還日額度；可能Provider仍為0，不能宣稱只對已收到AI結果扣次 |
| 422／Provider失敗／逾時／取消 | 已獲准嘗試不退額度；使用者只能手動再試，新的嘗試可能再次扣次 |
| Redis故障 | 缺少／連線／認證／timeout／非法結果／操作不確定一律fail closed，Provider=0；無memory fallback |
| 租約釋放 | 正常settled結果與已知拒絕可釋放；network／timeout／cancel／unknown保守保留到期；釋放不退日額度 |

Redis控制鍵在preflight／取得額度／Provider開始前確認，僅精確 `enabled` 放行；最後START還要求自己的租約剩餘超過25秒，不足則拒絕且不退款。部署開關也必須明確啟用。已送出的Provider請求可能仍運算／計費；有限租約不是Provider實際同時運算數的絕對保證。Lua各項檢查不部分扣次，不代表Redis在OOM、淘汰、資料遺失或故障複寫時提供零風險的費用硬上限。

## 2. Google 表單設定

**第一階段 FEEDBACK_EXTERNAL_ACCEPTANCE：NOT_RUN／BLOCKED（當時缺少正式表單與實際可用管道證據）。** 該階段未登入Google、建立／修改表單或送真實回饋；目前設定與驗收進度另見第二階段文件。公開Beta前至少要有一個真實可用回饋管道；若採本版主流程，Google表單必須完成以下驗收。

| 建議題目 | 型態／要求 |
| --- | --- |
| 回饋類型 | 判斷可能有誤／操作問題／功能建議／其他 |
| 問題描述 | 文字；提醒不貼OTP、電話、帳號或完整私訊 |
| 分析是否有幫助 | 有／部分有／沒有／不確定 |
| 問題編號 Request ID | 文字，允許沒有Request ID的訪客回饋 |
| 網站版本或build identifier | 文字；無法取得時可留空 |
| 聯絡Email | 另外建立**選填**文字欄位 |

管理者人工清單（官方設定名稱核對日2026-09-29，實际帳號仍待操作）：

- [ ] 發布表單（Publish），核對Manage／General access允許預期外部訪客；公測一般需Anyone with link，不能誤留網域限制。
- [ ] Settings → Responses：關閉Limit to 1 response，該設定會要求Google登入。
- [ ] 不啟用內建強制Collect email addresses；聯絡Email另建選填題，不能把Verified或Responder input當選填欄位。
- [ ] 第一版沒有File upload題目（它會要求Google登入）。
- [ ] Settings → Presentation：關閉View results summary，避免填答者看到他人文字／圖表。
- [ ] 取得正式responder link；在More → Pre-fill form輸入測試值並Get link，**從真實連結取得entry IDs**，不猜測。
- [ ] 設定 `FEEDBACK_FORM_URL`；可選的 `FEEDBACK_FORM_ENTRY_REQUEST_ID`、`FEEDBACK_FORM_ENTRY_BUILD`、`FEEDBACK_FORM_ENTRY_TYPE` 值為 `entry.<digits>`；值與選項一致。
- [ ] 未設定entry仍可開一般表單；`forms.gle`短址不嘗試預填；既有query保留且新增參數經編碼。
- [ ] 未登入／無痕視窗能開啟及送出；不需登入Google，不必提供Email。
- [ ] iPhone Safari與已安裝PWA能主動開啟、送出及回到原站，外部服務提示明確。
- [ ] 提交後無法看到其他填答者回覆摘要；不公開回覆試算表。
- [ ] 表單說明列出用途、保存期間、管理者及刪除聯絡方式；若連到Sheets／匯出CSV，清理與存取權也納入。
- [ ] 若設 `FEEDBACK_CONTACT_EMAIL`，驗證mailto和複製Email可用；無Email時不顯示無效操作。

官方依據：[發布、存取與預填](https://support.google.com/docs/answer/2839588?hl=en)、[Email與回覆管理](https://support.google.com/docs/answer/139706?hl=en)、[檔案上傳登入需求](https://support.google.com/docs/answer/15473134?hl=en)。本網站不使用未公開formResponse POST、不申請Google API權限、不自動送出；只有Request ID、build與類型可預填，絕不帶原圖、完整分析、IP／HMAC、Cookie、token、session或Email。

## 3. Redis 隔離整合

**REDIS_INTEGRATION：NOT_RUN。** 應用測試替身不證明Redis分散式原子性；本機未取得可安全執行的Redis環境，提供runner供後續執行。禁止用正式或共用遠端Redis跑競態／故障測試。

在專用本機Redis監聽 `127.0.0.1:16379` 後，執行：

```sh
npm run test:redis
```

必要時設定 `REDIS_TEST_PORT` 為另一個**本機測試**port；runner使用唯一test namespace，不清空整個資料庫。具體啟動方式由本機可用Redis／容器環境決定，不能把命令存在當作已安裝或已執行。

- [ ] 真實Redis執行Lua；最後IP名額、全站名額、並行租約競態不超限。
- [ ] 條件失敗不部分扣次；去重receipt／重放不重複扣次；ownership及重複釋放不影響其他請求。
- [ ] 過期／模擬實例中斷可回收；跨台北午夜與Retry-After符合實際伺服器時間。
- [ ] 網路／認證／timeout／未知結果Provider=0；實際部署直接HTTP不能繞過。
- [ ] Preview／Production使用不同資源／憑證或明確環境namespace；prefix隔離不能替代權限隔離。
- [ ] 實際Upstash方案、區域、多鍵腳本、hash slot、容量、eviction關閉與failover／一致性風險均記錄；TTL未被任意提早淘汰。
- [ ] 管理者按runbook初始化停用，再核准啟用；演練急停與恢復。

實作、TTL、信任IP、當前官方Redis來源與確切控制鍵操作見 [Runbook §11](deployment-runbook.md#11-beta-設定與操作2026-09-29)。

## 4. AI 品質及人工覆核

**AI_QUALITY_GATE：NOT_RUN。** 本輪真實Provider呼叫0次，不執行付費evaluation、不產生假輸出或人工標註；Mock PASS不等於AI品質PASS。既有30張自製去識別化候選集、development20／holdout10及release gates保留。

代表性案例、人工標註與執行授權流程見 [Evaluation README](../tests/evaluation/README.md)。必須覆核明顯詐騙、正常、模糊難辨、資訊不足與圖片prompt injection；檢查危險低估、虛構查證、惡意指令遵從、資訊不足告知及安全建議。使用者誤判回報是待review線索，不直接成為ground truth。

後續小量真實smoke與完整品質評估需分別授權環境、操作者、最多呼叫數和總預算。保留既有成功率≥90%、holdout高風險無低估／正常無high、無依據理由0與對抗無遵從等門檻，詳 [Test plan §6](test-plan.md#6-評估方法與發佈門檻)。不能用免責文字取代品質驗收。

## 5. 隱私與聯絡資訊

本節以下是第一階段缺項快照。2026-09-29後續使用者已正式指定90天與cs.sakana@gmail.com，現行政策及部署界線改見[Privacy操作](privacy-operations.md)及本文件最上方目前狀態；不回填修改當時BLOCKED結果。

**人工完整性驗收：BLOCKED。** 網站提供Beta標示、上傳前傳輸告知及 `/privacy`；選圖與預覽不先上傳。上傳前提醒遮蔽非必要姓名、電話、帳號、OTP。結果固定說明：「本工具提供詐騙風險提示，可能誤判。低風險不代表安全，請勿僅依本結果付款或提供個人資料。」分數不是經校準機率；未實作網址／银行／官方身分查證不宣稱已查證。

| 層次 | 已知設計／政策來源 | 公開前仍需填寫／確認 |
| --- | --- | --- |
| 本應用程式 | 不持久存原圖、完整分析、回饋正文；必要telemetry；Redis存HMAC來源碼與短期額度／lease／receipt | 管理者身分、刪除聯絡方式、日誌實際保存期間、存取者與刪除流程 |
| Redis | HMAC不是匿名；短窗60秒、日key到下午夜+1h、receipt48h、lease預設60秒；control無TTL | 實際資源、備份／replication／平台日誌政策、容量與eviction設定 |
| AI Provider（OpenAI） | adapter `store:false`；不表示所有資料零留存。API一般不訓練除非明確opt in；abuse monitoring預設最多30天，法律／防害與圖片安全檢查另有例外 | 專案資料控制、組織是否opt in、實際適用保留／區域；不能假定已獲ZDR核准 |
| 部署／日誌平台（Vercel） | 平台可能有request metadata與獨立日誌；應用不記raw IP不代表平台不處理IP | 帳號方案、runtime/build logs、Drains、備份、存取者及刪除期限 |
| Google回饋表單 | 外部Google服務，使用者自願送文字／選填Email；不自動上傳圖片 | 表單／linked Sheets／匯出副本保存期間、管理者、刪除聯絡、權限、摘要關閉與匿名訪客實測 |

官方來源：[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)、[Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)。Vercel文件的runtime retention依方案不同（Hobby1h、Pro1d、Enterprise3d、Observability Plus30d）；這不是本帳號已核定保留政策，Drains另計。未確認的期限／Email不可捏造；公開前須把確認後資訊補入網站與表單，不宣稱合規認證。

## 6. Preview

**第一階段 PREVIEW_ACCEPTANCE：NOT_RUN。** 該階段未部署或改存取設定。功能分支commit／push、Preview與免費隔離環境其後已獲授權，實際進度另記第二階段文件；有限付費AI驗收仍待獨立費用授權。

- [ ] 記錄部署SHA（不能只填基準HEAD）、URL、build identifier、Node／model／prompt、時間與操作者。
- [ ] 預定公開入口無須Vercel登入，且符合本次核准分享範圍；若受保護須記錄，不冒稱已公開。
- [ ] 真分析確實是Remote、非Demo／Mock；無安全設定時不放行。
- [ ] iPhone Safari／PWA完整選圖、預覽、送出、成功／失敗、回饋與回站流程。
- [ ] Google表單實際送出、無登入、無他人回覆摘要。
- [ ] 隔離Redis原子／故障、直接HTTP限額、急停／恢復與期限回收。
- [ ] 舊PWA更新、多分頁及新錯誤契約fallback，沒有重送付費分析。
- [ ] 去識別化素材有限真實AI smoke；記錄實際calls／usage／未知usage／成本與失敗，不回推固定單價。
- [ ] 基本憑證洩漏、相依套件／公開設定、bundle／headers／平台non-JSON檢查。

## 7. Production

**PRODUCTION_ACCEPTANCE：NOT_RUN。** 只有取得下一階段正式發布授權後才操作。Preview PASS不自動給Production PASS。

重新記錄正式deployment SHA／URL／環境／操作者；重做第6節適用項目，確認Production獨立Redis與Provider、真實匿名入口、費用／隱私設定、PWA遷移、急停與回復。在日誌與Provider usage查驗新版本的有限smoke，不能引用Preview或歷史部署代替。

## 8. 正式公開核准

| Gate | 第一階段交付狀態 | 原因 |
| --- | --- | --- |
| LOCAL_IMPLEMENTATION | PASS | 本次功能、strict契約、失敗保護、UI與文件已整合；外部設定另列 |
| LOCAL_AUTOMATED_TESTS | PASS | typecheck／lint／231 tests／build／bundle／19 E2E通過；真Redis與外部品質不列入此PASS |
| REDIS_INTEGRATION | NOT_RUN | 無可用本機Redis；替身不能證明Redis原子性 |
| FEEDBACK_EXTERNAL_ACCEPTANCE | NOT_RUN | 正式Google表單／Email未外部驗收 |
| AI_QUALITY_GATE | NOT_RUN | 本輪禁止付費AI；既有完整品質與人工覆核未完成 |
| PREVIEW_ACCEPTANCE | NOT_RUN | 第一階段未授權部署，未執行；第二階段授權與結果另記 |
| PRODUCTION_ACCEPTANCE | NOT_RUN | 第一階段未授權發布，未執行；第二階段仍不含Production |
| PUBLIC_BETA | NOT_READY | 外部回饋、Redis、品質、隱私／聯絡資訊、Preview與Production gates及公開核准均未完成 |

IP限制只能降低一般濫用，不能代表已抵禦VPN輪換、分散式bot或DDoS。全站配額能限制消耗，也可能被惡意耗盡。更大規模分享前，再依流量與濫用評估平台防護、WAF或具伺服器端驗證CAPTCHA；本輪不新增會員、付費機制或複雜反機器人系統。

第一階段交付時列出的後續核准順序如下，僅保留當時安排。後來Preview／Production非AI操作另經授權並有分階段證據，不將這份歷史清單解讀為現在仍未部署。新的付費AI仍需明確calls／美元額度，本輪隱私分支Production發布及公開分享另待核准：

1. 功能分支commit／push與Preview部署。
2. 隔離環境與有限次付費AI驗收（明確calls／美元額度）。
3. Production發布與驗收。
4. 明確公開分享Beta核准。

第一階段操作確認：**未commit、未push、未建立PR、未部署、未修改遠端設定／資料、未呼叫真實AI。實際Provider呼叫0次；沒有該階段已知外部付費服務費用。** 這是第一階段結束時的歷史紀錄；第二階段的遠端資源、部署與驗收應以其獨立紀錄為準。
