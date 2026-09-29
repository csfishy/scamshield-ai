# Preview 驗收 — 第二階段（2026-09-29，進行中）

本文件只記錄第一階段之後的新作業。使用者已授權功能分支 commit／push、Preview 部署、免費獨立 Redis 與 Google 表單設定及驗收；**真實 AI 尚無費用授權，Production 與公開分享未授權**。授權不代表已完成，下面每項結果獨立列出。第一階段的 231 項測試、19 項 E2E 與外部 NOT_RUN 原樣保留於 [本機交付快照](public-beta-readiness.md)，不改成新部署的 PASS。

## 1. 基準與變更範圍

| 項目 | 證據／狀態 |
| --- | --- |
| Repository／branch | `csfishy/scamshield-ai`／`codex/public-beta-readiness` |
| 階段開始 HEAD／main | `05de91dbaa960bd4d4eeae084dfa3baad57842de`；第一階段功能仍是工作區修改 |
| 工作區安全檢查 | 第一階段 39 個相关檔案檢查未發現 secrets，`git diff --check` 通過；不等於全面安全稽核 |
| 既有未追蹤資料 | `deliverables/` 保留，不修改、加入提交或清除 |
| 新增範圍 | 匿名 AI OFF smoke、獨立 Upstash REST test runner、必要離線測試及本階段文件；最終檔案清單／diff 於提交前另核對 |
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
| Vercel Preview env／部署接線 | NOT_RUN：資源及控制鍵已建立，不代表 Vercel 已使用該資源或已部署 AI OFF |
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
| 故障覆蓋限制 | transport 回應遺失注入應與真實服務故障分開說明 |
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

本次 `FEEDBACK_EXTERNAL_ACCEPTANCE` PASS 僅指外部表單的桌面匿名技術流程；網站部署整合、iPhone／PWA 與隱私完整性仍是獨立 gate。保留期間及刪除聯絡仍待確認，因此不能公開 Beta。正式非秘密設定如下；尚未成功寫入 Vercel，不代表 Preview 已採用：

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
| 功能分支 commit | NOT_RUN | 已授權；完成後填確切 SHA 與檔案範圍，排除 `deliverables/` |
| 功能分支 push | NOT_RUN | 已授權；不得 push／merge main，不自動建立 PR |
| push 前 remote 查核 | PASS | `git ls-remote` 顯示 main 仍是 `05de91dbaa960bd4d4eeae084dfa3baad57842de`，遠端功能分支尚不存在；不代表後續 push 已完成 |
| Preview env 設定 | BLOCKED | branch-specific env 寫入因 `branch_not_found` 未成功；需先 push 功能分支再重試。沒有任何新的 Vercel env 寫入成功，不冒稱部署已停用或接好 Redis／表單 |
| Preview deploy | NOT_RUN | 完成後填 deployment URL／ID、SHA、時間、實際 Node／npm、build 結果 |
| 匿名首頁／Demo／隱私／回饋 | NOT_RUN | 不用登入 session／bypass 冒充公開訪客 |
| 匿名 AI OFF HTTP smoke | NOT_RUN | 預先指定 503 code；保存各方法狀態與安全 Request ID |
| 平台 Protection | 待核對 | 302／401／403／登入頁須列 FAIL／BLOCKED；本工具不得 bypass，不能暗改 Production 存取 |
| 真實圖片 Remote smoke／AI 品質 | NOT_RUN | 尚未費用授權；呼叫數 0 |
| 舊 PWA／iPhone 實機／平台圖片邊界 | NOT_RUN | 另依完整 gate 測試，不能由 AI OFF 推定 |

匿名 AI OFF 命令依已核對設定擇一：

```sh
npm run smoke:preview -- --url https://YOUR-PREVIEW --ai-off --expected-disabled-code analysis_disabled
```

若 Mock 或 Remote 基本 Provider 配置缺少而先被 config guard 拒絕，應明確指定 `provider_unavailable`；這不證明 Redis 急停。AI OFF 不接受圖片或 paid flags，即使環境有 Vercel bypass secret 也不用；只對無效 JSON POST 驗證指定的 503、strict contract、no-store、Request ID，並驗證 GET／HEAD／OPTIONS 405／Allow。沒有成功的真實 AI 結果，不能將本階段稱為 Remote AI 驗收通過。

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
| PREVIEW_ACCEPTANCE | NOT_RUN | commit／push／deploy 與匿名 AI OFF 尚待實際結果；完整 gate 另包含付費與實機項目 |
| PRODUCTION_ACCEPTANCE | NOT_RUN | 未授權且未變更 Production |
| PUBLIC_BETA | NOT_READY | Preview、真實 Redis、AI 品質、隱私完整性、實機、Production 與公開核准未全部完成；表單技術 PASS 不代表上述項目通過 |

目前已執行的遠端修改僅免費隔離 Redis 建立／停用初始化與 Google 表單建立／測試；不將第一階段「未修改遠端」套用本階段。commit、push、部署與其他遠端設定仍依上表，尚未完成者不報成功。真實 Provider 呼叫 **0 次**；目前沒有已知外部付費費用，不代表未來平台用量必為零費用。

下一個付費 AI 階段須明確核准環境、素材、最多呼叫數、美元總預算與操作者；再依序取得 Production 發布／驗收及公開分享 Beta 核准。Preview 的權限或單一 PASS 不會自動擴大成下一階段授權。
