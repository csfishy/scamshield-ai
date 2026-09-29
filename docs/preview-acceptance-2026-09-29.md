# Preview 驗收 — 第二階段（2026-09-29）

本文件只記錄第一階段之後的新作業。使用者已授權功能分支 commit／push、Preview 部署、免費獨立 Redis 與 Google 表單設定及驗收；**真實 AI 尚無費用授權，Production 與公開分享未授權**。授權不代表已完成，下面每項結果獨立列出。第一階段的 231 項測試、19 項 E2E 與外部 NOT_RUN 原樣保留於 [本機交付快照](public-beta-readiness.md)，不改成新部署的 PASS。

## 1. 基準與變更範圍

| 項目 | 證據／狀態 |
| --- | --- |
| Repository／branch | `csfishy/scamshield-ai`／`codex/public-beta-readiness` |
| 階段開始 HEAD／main | `05de91dbaa960bd4d4eeae084dfa3baad57842de`；第一階段功能仍是工作區修改 |
| 工作區安全檢查 | 第一階段 39 個相关檔案檢查未發現 secrets，`git diff --check` 通過；不等於全面安全稽核 |
| 既有未追蹤資料 | `deliverables/` 保留，不修改、加入提交或清除 |
| 最終提交範圍 | 49個檔案：第一階段39個＋本階段10個验收工具／測試／文件；完整清單見下方。沒有lockfile變更 |
| Node／npm | Node 24.19.0；由確切 Node 啟動 Corepack JavaScript，npm 12.0.2 |
| 相依安裝 | `npm@12.0.2 ci` PASS：391 packages installed、392 audited、0 vulnerabilities；lockfile 不變 |
| 真實 AI | 0 次；未執行 paid smoke／evaluation，不以免費服務授權推定 AI 費用授權 |

本機實際啟動形式如下；完整可重現步驟见 [Runbook §12](deployment-runbook.md#12-preview-驗收工具與版本核對)。路徑以環境變數表示，避免綁定私人帳號名稱。

```powershell
$node24 = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$corepackJs = Join-Path $env:ProgramFiles 'nodejs/node_modules/corepack/dist/corepack.js'
$env:PATH = (Split-Path $node24) + ';' + $env:PATH
$env:COREPACK_HOME = Join-Path $PWD '.tools/corepack'
& $node24 $corepackJs npm@12.0.2 ci
& $node24 $corepackJs npm@12.0.2 test
```

## 2. 本機測試與工具證據

| 命令／檢查 | 狀態 | 範圍／限制 |
| --- | --- | --- |
| Node 24／Corepack npm 12.0.2 `ci` | PASS | 乾淨安裝結果如上；不覆寫第一階段 npm 10.9.2 快照 |
| npm 12.0.2 `test`，新增工具測試合併前 | PASS | 231 tests；仍是離線 Provider／Redis 替身，不能作為後續新增檔案的最終全量結果 |
| Node 24.19.0 Vitest 單檔：`tests/unit/preview-smoke.test.ts` | PASS | 46 個離線測試，全使用 fetch 替身；不呼叫 Vercel／Provider |
| Node 24.19.0 Vitest：`tests/unit/redis-runner.test.ts`／`tests/unit/quota.test.ts` | PASS | 新增 runner 安全測試 53 項＋既有 quota 70 項＝123 項；離線 transport／quota 替身，不是真 Redis PASS；既有 quota 不重複計入新總數 |
| npm 12.0.2 `run build` | PASS | 第二階段本機 build；確切 build ID 待從本次產物補記，不沿用第一階段 ID |
| npm 12.0.2 `run verify:bundle` | PASS | 37 files／0 server markers；不是 Vercel 部署驗收 |
| npm 12.0.2 `run test:e2e` | PASS | 重新執行 19／19（8 Mock/backend＋11 Remote UI）；全為本機替身，非真實 iPhone／Google／AI。此後僅測試工具及文件變動，沒有再改 app |
| 最終整合版本 `npm test`／`npm run typecheck`／`npm run lint` | PASS | npm12.0.2；13 files／333 tests，含17 HTTP tests與新增3項HTTP故障測試；typecheck／lint exit0。離線Provider，真Redis另列 |
| 最終 diff／secret／lockfile 檢查 | PASS | 49個相關檔案（原39＋10個驗收工具／測試／文件）；實際Preview token／HMAC比對與token patterns無洩漏；Email候選均人工fixture；lockfile不變、diff check exit0 |
| Backend GitHub CI | NOT_RUN | 目前 workflow 只監聽 PR 與 `main` push；功能分支 push 不觸發，不以本機 PASS 代替 |

AI OFF 的 46 項工具測試涵蓋預期 code 必填、禁 image／付費參數、不用 bypass、no-store／Request ID／strict schema、Protection／redirect 拒絕與既有付費 guard。這不是實際匿名 Preview 驗收。

## 3. 免費隔離 Redis

| 項目 | 證據／狀態 |
| --- | --- |
| 資源建立 | PASS：獨立免費 Upstash Redis `scamshield-preview`，resource ID `0f87faf3-e03d-469f-8e04-8c401155b92d` |
| 建立時方案／區域 | AWS `us-east-1`；console 顯示 256 MB、10 GB bandwidth；沒有選擇付費方案 |
| Eviction | PASS：實際 console 確認 OFF，不只引用文件預設；不代表 failover／資料遺失零風險 |
| 主 Preview 控制鍵 | PASS：`{scamshield:preview:scamshield}:control:analysis-enabled`，`SET disabled` 無 TTL，`GET` 確認 `disabled` |
| Vercel Preview env／部署接線 | 設定PASS：25個變數全部限定preview＋`codex/public-beta-readiness`，token／HMAC為sensitive Secret；實際匿名application流程被Protection擋住，不能以設定成功冒充完整接線驗收 |
| 真實 Upstash REST runner | PASS：16 checks／197 commands；真Redis版本回報8.4.0，exact cleanup confirmed，Provider calls=0 |
| Production 隔離 | 未修改 Production 資源／憑證／資料；不同 namespace 不冒充權限隔離 |

實際執行 `npm run test:redis:rest`，使用已確認host與明確允許寫入旗標；下列重跑範例仍必須核對資源，token只安全注入程序：

```sh
npm run test:redis:rest -- --expected-host VERIFIED-TEST-HOST.upstash.io --allow-isolated-redis-write
```

runner只讀 `TEST_UPSTASH_REDIS_REST_URL`／`TEST_UPSTASH_REDIS_REST_TOKEN`，不fallback應用程式憑證。16項checks已實跑，包括最後名額／租約競態、canonical IP、隔離namespace、START急停、日額度不退款與handler＋真Redis＋Provider tripwire。另在真Redis完成ACQUIRE後，以loopback HTTP proxy實際reset socket／延遲回應至application timeout，驗證503且Provider進入數0；這是故障注入，不宣稱Upstash真的停機。測試最多250個命令，限定腳本、隨機namespace、TTL與exact-key cleanup；不改主Preview控制鍵、不FLUSH、不呼叫AI。

| 待記錄證據 | 結果 |
| --- | --- |
| 執行時間／操作者／git SHA／Lua hashes | 2026-09-29／Codex經使用者授權；基準HEAD `05de91d…` 的未提交修訂，以以下Lua hashes定位實際程式，不能把基準SHA誤認為已有這些實作 |
| profile／target fingerprint／random namespace | `upstash_rest`／`e1d7993644bafbc2`／`integration-a530fd10-6f5b-4379-bb8a-ae6d0581b80a`；另一namespace `integration-1827144b-cb7f-4146-bc10-a7c44cf88309` |
| checks 通過數／失敗項／命令數 | 16 PASS／無失敗／197 commands（含清理），上限250 |
| cleanup 與殘留風險 | 精確DEL後EXISTS=0，confirmed；未使用Production keys或credentials |
| 故障覆蓋限制 | 真Redis執行後的HTTP reset／timeout及executor回應遺失注入，不是Upstash實際outage／failover／容量耗盡；跨日使用真Lua邊界時間與前一天seed，不宣稱等待自然午夜 |
| Provider 呼叫數 | 0；runner 不含 Provider 呼叫 |

Lua SHA256：`preflight=a908a390daded676c75005f180e90f0680500ca15f7191aa7ce13f6be43dd2c8`、`acquire=33bc68b3de36aeda6f5139ad5f1abd39164fc9bdb0f93c1301e509bd58e4f41e`、`start=4b16f8e776d475a2b090b41f6a6e9e6b7606ea7859fa785da5dd42e4b3049be4`、`release=15ffdb4903b7267e30d3c7888589315189cad1a0fde05004b9583ddb113a1712`。

## 4. Google 表單與匿名存取

| 項目 | 狀態 | 證據／限制 |
| --- | --- | --- |
| 表單建立／發布 | PASS | 已發布 [ScamShield AI 公開測試版意見回饋](https://docs.google.com/forms/d/e/1FAIpQLScSOj5VGNEJ_q_LMeFJic2hNl6cggqXgTx3KdkXokFxD7fnRQ/viewform)，六個題目，僅類型與描述必填 |
| 已登入瀏覽器實際送出 | PASS | 1 次測試回覆；只證明已登入流程，不代表匿名可用 |
| 未登入瀏覽器實際送出 | PASS | 另以未登入的 in-app browser 實際填答，Email 留空、鍵盤 Enter 提交，Google 確認頁顯示已收到；共 2 筆合成測試回覆（1 已登入＋1 匿名） |
| 一般網址／預填與編碼 | PASS | 未帶 entry 的一般網址空白可填；真實 entry 預填操作問題、合成 UUID、`beta+09/29`，URL 編碼 `beta%2B09%2F29` 正常 |
| 不強制登入／Email、無檔案上傳、關閉回覆摘要 | PASS | 不收集帳號 Email，另建選填 Email 題；Limit to 1 response／View results summary 均關閉，無 File upload；匿名確認頁無摘要連結 |
| Preview 前端預填與實際送出 | NOT_RUN | 需確切部署版本、Request ID／build／type 正確，且沒有敏感內容 |
| iPhone Safari／PWA | NOT_RUN | 桌面 signed-in 操作不代替實機 |
| 保存期限／刪除聯絡／選填 Email 管道 | 待確認 | 未提供者不捏造；不記私有 Email 或管理連結於本報告 |

本次 `FEEDBACK_EXTERNAL_ACCEPTANCE` PASS僅指外部表單的桌面匿名技術流程；網站部署整合、iPhone／PWA與隱私完整性仍是獨立gate。保留期間及刪除聯絡仍待確認，因此不能公開Beta。以下正式非秘密設定已寫入功能分支Preview；匿名網站整合仍被Protection阻擋：

```env
FEEDBACK_FORM_URL=https://docs.google.com/forms/d/e/1FAIpQLScSOj5VGNEJ_q_LMeFJic2hNl6cggqXgTx3KdkXokFxD7fnRQ/viewform
FEEDBACK_FORM_ENTRY_TYPE=entry.2025741425
FEEDBACK_FORM_ENTRY_REQUEST_ID=entry.185968933
FEEDBACK_FORM_ENTRY_BUILD=entry.528959604
```

公開 responder URL 與 entry IDs 非 secrets；不在本報告記錄編輯網址、管理帳號或私人 Email。`FEEDBACK_CONTACT_EMAIL` 尚未提供，不捏造或以管理帳號代填。

## 5. Git、Preview 部署與匿名 AI OFF

| 項目 | 狀態 | 待補證據 |
| --- | --- | --- |
| 功能分支 commit | PASS | `48fc1be5091dbc1cf2467bd2c15e6cc3364ad978`，單一功能commit，49個檔案，排除影片與秘密 |
| 功能分支 push | PASS | `origin/codex/public-beta-readiness`；沒有merge、force push或PR |
| push 前 remote 查核 | PASS | `git ls-remote` 顯示 main 仍是 `05de91dbaa960bd4d4eeae084dfa3baad57842de`，遠端功能分支尚不存在；不代表後續 push 已完成 |
| Preview env 設定 | PASS（設定層） | push前曾因branch_not_found拒絕，push後25個分支限定變數全部成功；`ANALYSIS_MODE=remote`、`ANALYSIS_ENABLED=false`。Provider專用credential未設，未沿用Production key |
| Preview deploy | PASS（建置層） | `dpl_7h3Fk1vCAvSahVrTFFJ21KKzX8sf`，READY，SHA `48fc1be5091dbc1cf2467bd2c15e6cc3364ad978`；CLI指定`--target preview`。Node24.x／iad1；log確認Corepack選定並下載npm12.0.2、Next16.3.4、Build Completed。實際Node patch未由log確認 |
| 匿名首頁／Demo／隱私／回饋 | BLOCKED | `/`、`/demo`、`/privacy`皆302至Vercel SSO；未進入應用，不冒稱頁面E2E完成 |
| 匿名 AI OFF HTTP smoke | FAIL（Protection blocker） | `--ai-off --expected-disabled-code provider_unavailable`：首個GET302即中止；另做七項無圖HTTP探測，結果見下表 |
| Preview E2E／API quota smoke | NOT_RUN（BLOCKED） | 匿名瀏覽器首頁導向Vercel Login；不登入、不帶bypass，不自動改存取。真Redis handler測試PASS不能代替Preview端到端 |
| Runtime kill switch | PARTIAL | 主資源GET仍為disabled，TTL=-1；16項隔離Redis測試驗證急停。Preview HTTP被平台先攔截，未證明部署上的runtime急停與恢復流程 |
| 平台 Protection | BLOCKED | API查核`all_except_custom_domains`；匿名IAB到Login。未修改保護／Production alias，不繞過 |
| 真實圖片 Remote smoke／AI 品質 | NOT_RUN | 尚未費用授權；呼叫數 0 |
| 舊 PWA／iPhone 實機／平台圖片邊界 | NOT_RUN | 另依完整 gate 測試，不能由 AI OFF 推定 |

匿名 AI OFF 命令依已核對設定擇一：

```sh
npm run smoke:preview -- --url https://YOUR-PREVIEW --ai-off --expected-disabled-code analysis_disabled
```

若 Mock 或 Remote 基本 Provider 配置缺少而先被 config guard 拒絕，應明確指定 `provider_unavailable`；這不證明 Redis 急停。AI OFF 不接受圖片或 paid flags，即使環境有 Vercel bypass secret 也不用；只對無效 JSON POST 驗證指定的 503、strict contract、no-store、Request ID，並驗證 GET／HEAD／OPTIONS 405／Allow。沒有成功的真實 AI 結果，不能將本階段稱為 Remote AI 驗收通過。

實際驗收URL：[功能Preview](https://scamshield-l1i1e1bdo-sakanano.vercel.app)；branch alias：`scamshield-ai-git-codex-public-beta-readiness-sakanano.vercel.app`。推送先自動產生`scamshield-9fu2281hs-sakanano.vercel.app`，隔離設定完成後才明確重新部署同一SHA，採上方immutable URL作證據。平台raw API的target=null表示非production；CLI inspect明確標示preview。

| 匿名HTTP | 實際status | 結論 |
| --- | --- | --- |
| GET `/`、`/demo`、`/privacy` | 302 | `vercel.com/sso-api`，未進入應用 |
| GET／HEAD／OPTIONS `/analyze` | 302 | 同上，尚不能驗application405／Allow／strict contract |
| POST `/analyze`（只有`{}`，無圖片） | 401 | 平台阻擋，非應用503／429 |

七項回應都沒有application `X-Request-Id`，平台Cache-Control為`no-store, max-age=0`。不將平台header冒充應用`no-store`與Request ID驗收通過。沒有送出有效圖片、沒有Provider credential，真實Provider calls=0。

### iPhone Safari／PWA人工項目（全部NOT_RUN）

1. 先由管理者另行決定預定測試者的合法Preview存取方式；不可繞過目前Protection。
2. 記錄機型／iOS／Safari與確切deployment SHA；測首頁、Demo、隱私、表單外開與返回。
3. AI OFF時測選圖僅本機預覽、手動提交的安全失敗、複製問題編號、回饋預填與無自動重送；真AI未核准前不啟用。
4. 真機匿名Google表單送出、Email留空、無他人摘要；iOS桌面模擬不能代替本項。
5. 加入主畫面、舊worker更新、多分頁、離線shell、新錯誤契約fallback、取消／重新整理不重送。
6. 真實成功分析與完整PWA結果流程留待隔離Provider＋有限花費明確核准後執行。

## 6. 分層狀態與後續核准

| Gate | 目前狀態 | 範圍／原因 |
| --- | --- | --- |
| LOCAL_IMPLEMENTATION | PASS | 功能與第二階段驗收工具已整合 |
| LOCAL_AUTOMATED_TESTS | PASS | npm12：333 tests、typecheck、lint、build、bundle、19本機E2E |
| CLEAN_INSTALL_REPRODUCIBILITY | PASS | Node24.19.0／npm12.0.2 ci成功，lockfile不變 |
| REDIS_INTEGRATION | PASS | 專用Upstash：16 checks、197 commands、清理確認；故障覆蓋限制如上 |
| FEEDBACK_EXTERNAL_ACCEPTANCE | PASS | 表單桌面匿名技術流程：一般／預填 URL、編碼、Email 空白、實際提交、無回覆摘要；網站部署整合與實機另列 NOT_RUN |
| AI_QUALITY_GATE | NOT_RUN | 真實 AI 0 次，未核准費用；既有品質 gate 不降低 |
| IPHONE_PWA_ACCEPTANCE | NOT_RUN | iPhone Safari／PWA尚未實機驗收 |
| PREVIEW_ACCEPTANCE | FAIL（BLOCKED） | 部署READY，但Vercel Authentication阻擋匿名入口；HTTP／E2E／quota／runtime端到端未驗收 |
| PRODUCTION_ACCEPTANCE | NOT_RUN | 未授權且未變更 Production |
| PUBLIC_BETA | NOT_READY | Preview存取及端到端、獨立Provider／成本設定、AI品質、隱私完整性、實機、Production與公開核准未完成 |

本階段已commit／push功能分支、建立免費獨立Redis並寫入測試／停用資料、建立Google表單及2筆合成回覆、設定25個branch-specific Preview變數並部署Preview。未修改main、Production設定／資料／alias，未merge、未PR、未公開分享Beta，未呼叫AI。Provider calls **0**；Redis免費方案及Vercel Hobby既有用量內目前沒有已知新增付費，不把此敘述當帳單或未來費用保證。

本文件的最終驗收結果在部署後才可得知，因此另用純文件證據commit保存；不變更功能實作。該文件commit若再觸發Preview，不會自動取得本表的驗收結果：本表測試對象始終是上方`48fc1be…`的immutable deployment。後續版本必須記錄自己的URL／SHA及測試結果。

### 修改檔案對照

原39個功能檔案的原因與契約影響見[第一階段清單](public-beta-readiness.md#修改檔案交付-d)。本階段額外10個檔案為：`scripts/preview-smoke.ts`、`tests/unit/preview-smoke.test.ts`、`tests/redis/run-rest.ts`、`tests/redis/runner.ts`、`tests/redis/suite.ts`、`tests/redis/support.ts`、`tests/redis/tcp.ts`、`tests/redis/network-faults.ts`、`tests/unit/redis-runner.test.ts`、本驗收文件。另更新原有runner入口、package scripts與相關文件；沒有新runtime dependency、模型／prompt變更或成功JSON結構變更。

下一個付費 AI 階段須明確核准環境、素材、最多呼叫數、美元總預算與操作者；再依序取得 Production 發布／驗收及公開分享 Beta 核准。Preview 的權限或單一 PASS 不會自動擴大成下一階段授權。
