# Production Privacy／Feedback 最終非 AI 驗收 — 2026-09-29

> 歷史紀錄：本報告只適用於正文指定的revision與當次測試。「目前／本輪／未提交」描述當時狀態。2026-10-02歸檔時保留原始正文，現況與其他版本結果見[歷史索引](release-evidence-index.md)。

本輪將既有Privacy功能commit `2b6e65229153182456db23fd90a8724d833be915`以fast-forward整合至main，在fresh release checks全部通過後push並部署Production。**新版Privacy及Feedback驗收PASS；AI維持OFF、AI品質NOT_RUN、Production整體PARTIAL、PUBLIC_BETA仍NOT_READY。**

本紀錄及README／readiness／iPhone／runbook／test-plan／privacy-operations共7份文件更新在部署後產生，保留為工作區未提交的文件變更；沒有額外evidence-only documentation SHA，也不為文件另做部署。實際驗收只對下列deployment／SHA成立。歷史報告不改寫，舊Preview／Production／本機結果不冒充本輪。

## A. Git

| 項目 | 實際結果 |
| --- | --- |
| Repository | `csfishy/scamshield-ai` |
| origin/main before | `5a788a91f7c934667cb8f216bcc393bd164084dd`；fetch後核對 |
| Feature branch／HEAD | `codex/privacy-and-final-gates`／`2b6e65229153182456db23fd90a8724d833be915` |
| 整合方式 | `--ff-only`成功；保留既有commit，不squash／rebase／改寫歷史 |
| Final main／origin/main after | `2b6e65229153182456db23fd90a8724d833be915`；release checks全PASS後再次核對base並成功push，沒有force push |
| Feature branch | 保留，沒有刪除 |
| Working tree | 整合及push前tracked乾淨；部署後新增本紀錄並最小更新6份相關文件，共7份文件變更，尚未提交 |
| `deliverables/` | 原有未追蹤內容完整保留；未讀取、add、stash、clean、刪除或修改 |
| `.env*.local` | 未追蹤；不輸出secret值、不加入Git |

## B. Release checks

本輪在整合後**重新執行**，Node **24.19.0**、Corepack npm **12.0.2**；不是沿用分支先前PASS。原始安全摘要位於本機ignored `.tools/production-final-release-checks.json`，9項均exit0。

| 命令／檢查 | 結果 | 實際數量／範圍 |
| --- | --- | --- |
| `npm ci` | PASS | 391 packages added／392 audited／0 vulnerabilities；lockfile無非預期修改、無新runtime dependency |
| `npm run typecheck` | PASS | 本輪fresh strict檢查 |
| `npm run lint -- --ignore-pattern 'deliverables/**'` | PASS | 排除不屬本輪的既有deliverables，不降低應用安全檢查 |
| `npm test` | PASS | 14 files／338 tests，含17 HTTP；HTTP已含在338中 |
| `npm run build` | PASS | 本輪production build，不代替遠端deployment結果 |
| `npm run verify:bundle` | PASS | 37 files／0 server markers |
| `npm run test:e2e` | PASS | 20／20，9 Mock/backend＋11 Remote UI；本輪第一次執行全部通過 |
| `git diff --check` | PASS | 發布前無whitespace錯誤 |
| Secrets scan | PASS | 174檔案，4個已知Redis／HMAC秘密比對0 hits及秘密格式檢查無洩漏；沒有讀取Provider key值 |

公開Email `cs.sakana@gmail.com`是使用者明確授權的產品資訊，非secret。先前分支階段曾有E2E `ERR_NO_BUFFER_SPACE`及重跑證據，保留於原報告；本輪fresh 20／20首次PASS，不覆蓋舊紀錄。沒有執行付費AI、真實eval或新增AI呼叫。

## C. Production deploy

| 項目 | 實際結果 |
| --- | --- |
| Deployment ID | `dpl_5UUs4mi71oWwdw51xVA93Lvbo2YW` |
| Immutable URL | [scamshield-28tynrk5q-sakanano.vercel.app](https://scamshield-28tynrk5q-sakanano.vercel.app) |
| Canonical URL | [scamshield-ai-fawn.vercel.app](https://scamshield-ai-fawn.vercel.app/) |
| Git SHA／branch／target | `2b6e65229153182456db23fd90a8724d833be915`／main／production |
| Created／READY | `2026-09-29T08:52:11.334Z`／`2026-09-29T08:52:56.266Z` |
| READY與alias核對 | PASS；`08:55:36.419Z`確認canonical alias精確指向此deployment |
| 匿名Homepage／Privacy | PASS，均HTTP200，無Vercel登入阻擋，沒有bypass或匯入登入狀態 |
| Homepage UI | PASS；Beta、Privacy與Feedback入口、上傳前敏感資訊／雲端處理告知可讀 |
| 無自動上傳／分析／retry | PASS（本輪観察範圍）；選圖僅本機預覽，只有一次明確操作產生安全POST；圖片bytes送出0，無重送 |
| 畫面覆核 | 主操作者實際查看Privacy行動尺寸、錯誤返回頁及Google預填3張安全截圖，可讀且無溢出；不當成iPhone真機證據 |

部署核對保存於ignored `.tools/production-final-deployment-state.json`。瀏覽器驗收`08:55:45.356Z`至`08:55:59.166Z`的結果為 **7／7 groups PASS**，見ignored `.tools/production-privacy-feedback-2026-09-29T08-55-45-353Z/result.json`及同目錄的安全導覽紀錄／截圖。它們不是已提交的repository artifacts。

## D. Privacy final acceptance

本輪匿名讀取**新部署的**`/privacy`，回HTTP200，policy／contact等23個紀錄欄位全部符合預期；mailto與Email copy實際操作通過。

| 公開頁項目 | 結果／證據 |
| --- | --- |
| 保存期限與到期處理 | PASS：自提交日起最長90天，到期刪除或去識別化 |
| 長期案例 | PASS：需另取得適當同意，不自動永久保存 |
| 公開Email | PASS：精確`cs.sakana@gmail.com` |
| mailto／複製 | PASS：正確收件人與安全主旨，無敏感正文／附件；複製值一致 |
| 刪除申請與Privacy疑問 | PASS：公開Email用途與申請方式清楚 |
| ScamShield應用 | PASS：不持久保存上傳截圖／完整分析歷史；不將圖片寫入Redis或worker cache |
| Redis | PASS：rate／quota／lease／control等必要狀態；raw IP不作key，HMAC不宣稱完全匿名 |
| OpenAI | PASS：`store:false`的Response儲存與abuse／security保留分開，不誤稱全部零留存 |
| Vercel／Google | PASS：第三方平台獨立政策與應用分開，回饋90天不等於所有平台共同期限 |
| Google回饋 | PASS：管理者持有回饋與應用storage分開，人工清理不誤稱自動刪除 |
| 占位或虛構資訊 | PASS：無舊TBD／待確認、placeholder Email、虛構公司／法人 |
| 絕對保證誤導 | PASS：無所有資料立即刪除／完全匿名／全部平台零留存宣稱；以完整句意判讀否定說明 |

**PRIVACY_COMPLETENESS = PASS**，範圍為目前Production公開政策、實際頁面／互動及Google表單說明一致。這不等於管理者過往每筆資料清理都已執行、平台所有備份已刪除或取得法律認證。[人工90天清理與刪除申請流程](privacy-operations.md)仍須由管理者持續執行。

## E. Feedback final acceptance

| 項目 | 本輪結果 |
| --- | --- |
| Homepage feedback | PASS：實際點擊入口開Google popup，HTTP200、無redirect |
| Error feedback | PASS：真實Production安全503驅動錯誤UI，回饋入口可用；未mock伺服器回應 |
| Request ID／copy／prefill | PASS：`b0a5a776-ee43-410f-afa8-2b1538a9a919`與HTTP、複製值及表單一致 |
| Build／完整SHA | PASS：Google欄位精確預填`2b6e65229153182456db23fd90a8724d833be915` |
| Type／URL encoding | PASS：首頁「其他」、錯誤「操作問題」正確編碼及預填，既有參數未破壞 |
| Anonymous opening | PASS：2個fresh context、初始cookies=0、無匯入storage；2個真Googlepopup均200，沒有強制登入gate |
| Optional Email／upload | PASS：Email空白且選填，無檔案上傳；4個文字欄位就緒後可編輯 |
| URL safety | PASS：只允許build／type／必要Request ID；無圖片、base64、分析全文、IP、Redis key、HMAC、Cookie／session或secret |
| Privacy linkage | PASS：入口可找到90天及公開Privacy聯絡；Google說明同樣含90天、Email、刪除、長期同意 |
| 返回原站／無重送 | PASS：關閉popup可返回Production頁面；沒有自動重試、額外分析或頁面錯誤 |
| 本輪表單提交 | 0；不需新增回覆即可驗上述流程，沒有formResponse嘗試；4個Google背景寫入被阻擋 |
| 他人摘要管理設定 | 本輪重查NOT_RUN：管理者控制工具不可用，未修改Google設定。先前設定核對證據保留於[Preview紀錄](preview-acceptance-2026-09-29.md)；不是本輪重新查看或提交後驗證 |

當次browser的Production及Google頁面錯誤0、非預期請求0；總107個GET包含頁面／assets，不等於107次表單或分析。表單DOMContentLoaded時欄位暫時disabled，等待可編輯後實際讀取預填，不把尚未就緒狀態當完成。

**FEEDBACK_EXTERNAL_ACCEPTANCE = PASS。** 歷史單次失敗根因未知，但在目前Production revision未重現；本次重新驗收上述目前流程全項通過。依本輪使用者明確規則，以新revision完整證據判定，不宣稱歷史失敗一定是flaky，也不抹除原FAIL。可選的目前摘要管理重查／送出時登入檢查仍NOT_RUN；沒有為了取得新提交紀錄而增加表單資料。

### 安全請求方法與限制

使用者選圖只在瀏覽器預覽。測試在網路傳送前，將UI原本multipart POST替換為`Content-Type: application/json`、內容`{}`（2 bytes），只forward **1次真實Production `/analyze` POST**；原multipart與圖片bytes未送出。伺服器503回應**沒有mock**，因此Request ID／error UI／回饋預填來自真實部署。測試讓Production頁面的網路流量繞過service worker攔截以確保route guard控制請求，這不是worker／PWA驗收證據，也不宣稱完成真實圖片上傳或AI分析。

## F. iPhone／PWA

**IPHONE_PWA_ACCEPTANCE = PASS (USER-MANUAL)。** 本輪使用者明確回報「iPhone Safari＋PWA 實機驗收：OK」。來源是使用者實體iPhone人工驗收，不是Codex執行或桌面自動化結果。

| 明細 | 使用者提供情況 |
| --- | --- |
| 機型／iOS／Safari版本 | 未提供 |
| 實際測試日期時間 | 未提供；本文件日期不等於實測時間 |
| 受測Git SHA／deployment ID | 未提供；不擅自綁定本輪`2b6e652…`部署 |
| 逐case結果／截圖 | 未提供；不逐列補造PASS |

[iPhone人工清單](iphone-pwa-acceptance.md)保留可重做步驟與未提供明細。整體gate依本輪使用者確認通過，不補證AI品質或Production HTTP429。

## G. Production safety

| 項目 | 實際證據 |
| --- | --- |
| Deployment gate | 驗收前`ANALYSIS_ENABLED=false`；本輪從未設true |
| Redis runtime／TTL | `08:54:09`及browser preflight再次確認`disabled`／-1；本輪無Redis寫入，不啟用runtime |
| Redis資源／namespace | `scamshield-production`／`production-beta`，必要憑證只供工具內部安全讀取，不輸出 |
| Provider key | 不讀值、不新增或修改，不因key存在使用它 |
| Disabled response | 唯一真實POST回503 `analysis_disabled`、`Cache-Control: no-store`、UUID `b0a5a776-ee43-410f-afa8-2b1538a9a919`，strict error contract通過 |
| Server telemetry | `08:56:19.307Z`精確匹配本deployment／Request ID：mode=remote、duration6ms、quotaOutcome=denied、`providerEntered=false`、`usageKnown=false` |
| Provider calls | **0**，有本輪唯一請求的伺服器遙測證據；不是只依預期推定，也不代表整個帳戶的用量／帳單 |
| 驗收後最終安全讀回 | PASS，`2026-09-29T08:58:38.328Z`（台北16:58:38）彙整；24項env核對於08:58:11.757Z確認false／Provider key未讀未改，Redis於08:57:32.557Z確認disabled／TTL=-1，08:57:48.532Z確認READY／alias與4個Git refs均對應`2b6e652…`；無新增遠端寫入 |

遙測安全摘要位於ignored `.tools/production-final-telemetry.json`，最終安全讀回保存於`.tools/production-final-safety.json`。Provider=0取自獨立伺服器遙測，不拿browser中要求遙測覆核的欄位當證據；usage缺失保持unknown，不填0token或0估算usage費用。部署gate=false的503在Redis之前拒絕，不能冒充本revision runtime-only路徑或HTTP429的新驗收。

## H. Gates

| Gate | 狀態 | 範圍 |
| --- | --- | --- |
| LOCAL_IMPLEMENTATION | PASS | 既有feature完整整合；本輪沒有新產品功能 |
| LOCAL_AUTOMATED_TESTS | PASS | 本輪fresh 338tests／20E2E及其餘release checks |
| CLEAN_INSTALL_REPRODUCIBILITY | PASS | 本輪Node24.19.0／npm12.0.2 `npm ci` |
| REDIS_INTEGRATION | PASS（既有分層證據） | Production資源21checks／627commands；不是本輪重跑或HTTP429 |
| PRODUCTION_HTTP_REDIS_RUNTIME_GATE | PASS（既有分層證據） | 前一`5a788a9…`runtime-only部署實測；本輪不重開gates、不改寫成新版新測 |
| PRODUCTION_HTTP_RATE_LIMIT | NOT_RUN | 本輪明確排除，不能把standalone PASS變成正式429 PASS |
| FEEDBACK_EXTERNAL_ACCEPTANCE | PASS | 目前revision完整回饋流程重驗；歷史RCA未知保留，可選未測項目見E節 |
| PRIVACY_COMPLETENESS | PASS | 新Production頁面、互動及Google政策一致 |
| IPHONE_PWA_ACCEPTANCE | PASS (USER-MANUAL) | 使用者人工回報；機型／版本／時間／受測SHA明細未提供 |
| PRODUCTION_DEPLOYMENT | PASS | 最新main `2b6e652…`、READY、canonical alias一致 |
| PRODUCTION_NON_AI_ACCEPTANCE | PASS | 本輪授權的Privacy／Feedback／AI OFF與部署範圍；不包含明確排除的HTTP429 |
| AI_QUALITY_GATE | NOT_RUN | 本輪禁止真AI／paid evaluation，max calls／USD下一階段另核准 |
| PRODUCTION_ACCEPTANCE | PARTIAL | 非AI通過不等於真AI品質通過 |
| PUBLIC_BETA | NOT_READY | AI品質及明確公開核准仍缺，不公開分享 |

## I. Operations

| 操作 | 結果 |
| --- | --- |
| Commit／整合 | 無新commit；`--ff-only`保留feature原commit，無force／squash／rebase |
| Push | main成功；feature branch保留 |
| Production deploy | 由main push觸發的新Production部署完成；沒有本機未追蹤來源上傳 |
| Redis變更 | 0次寫入；只讀確認disabled／TTL=-1 |
| Provider變更／呼叫 | 無key、模型、prompt或風險算法變更；真實Provider calls=0 |
| Google變更／提交 | 本輪未改題目、描述或安全設定；提交0，背景寫入阻擋；先前政策更新另有原紀錄 |
| Known external AI spend | 本輪限定請求未進Provider，已知AI請求支出0；不是帳戶整體或未來費用保證 |
| 部署後文件 | 本紀錄＋README／readiness／iPhone／runbook／test-plan／privacy-operations共7份文件留未提交，無額外documentation SHA／docs-only redeploy |
| 停止範圍 | 遠端驗收與最終安全讀回已完成並停止；文件只做本機diff／秘密／連結檢查，不開AI、不跑quality／429、不刪feature branch、不宣告Beta READY |

證據不含Redis token／HMAC／OpenAI key、Vercel敏感值、Google表單管理網址或私人帳號資訊。公開Email為正式政策值；截圖／JSON原件留在ignored `.tools/`，不整包加入Git。

部署後文件檢查於`2026-09-29T09:05:15Z`完成：7份文件的78個本機連結均可找到、無管理網址；175檔案／4個已知Redis與HMAC秘密比對0 findings，`git diff --check` PASS，package／lockfile未變，HEAD與origin/main仍為`2b6e65229153182456db23fd90a8724d833be915`。只增加證據文件，未再部署或新增遠端操作。
