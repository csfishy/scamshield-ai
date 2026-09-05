# B 開發進度與驗收證據

開始：2026-09-04；基準 revision `2b4d945d91a492d4f3873426f8014c7286201d14`。
工作目錄 `C:\Project\scamshield-ai`。未找到適用 AGENTS.md。
開始時 README、architecture、api-contract、buildmode、product-plan、舊 INTEGRATION 已修改；SDD、test-plan、runbook 未追蹤。全部保留，以目前文件為規格。

| 里程碑 | 狀態 | 實際變更／驗證／阻塞 |
| --- | --- | --- |
| M1 現況、基礎、shared contract | 完成 | 根 Next.js、strict TS、精確版本／npm lock、scripts、strict public schema／enum／limits、正常／假物流／假客服 fixtures；乾淨安裝與 contract tests 通過 |
| M2 圖片、API、stub HTTP integration | 完成 | Node POST /analyze；固定 buffer 有界 multipart、欄位／BCP47、MIME／signature／副檔名、完整 sharp decode、EXIF／metadata、pixels／APNG／MPO／再編碼檢查；真正 Next HTTP＋SDK loopback stub 11 項通過 |
| M3 Provider、prompt、normalization | 實作與真實連線 smoke 完成 | OpenAI Responses adapter、snapshot、prompt v1、strict output＋normalize、422／429／500／503、15s/20s deadline、取消、maxRetries=0、單次呼叫；真實圖片呼叫成功。人工檢查發現字串結構尾碼後已改為 fail closed 並加回歸測試 |
| M4 測試、真實 AI 評估 | 自動化與單案例 smoke 完成；完整品質 gate 未完成 | A 整合後 85 tests＋10 production browser E2E 通過；真實 Provider calls=1，HTTP 200、high/phishing、估算 US$0.001152，專案負責人已確認該次輸出語意可接受。其餘主資料集人工標註與 development／holdout 尚未完成 |
| M5 Preview、部署準備、A 交接 | 受保護 Remote Preview 已部署；API live 驗收未完成 | A 已安全設定 Preview branch Remote config／secret，以最新 SHA `e29fa4a` 無 cache 重建；deployment Ready、Latest，Vercel Authentication 未授權 302、授權首頁與 GET `/analyze` 405 已驗證。合法圖片、invalid POST 完整 headers、OPTIONS、平台邊界與成本控制仍待 live 驗證；Production 保持 mock／無 key |

Goal 保留完整 B 驗收条件。Stub／本機 build 不替代真實 AI／Preview。A UI／手機／PWA 另行驗收。

## 主要交付檔案

- `package.json`、`package-lock.json`、`tsconfig.json`、`next.config.ts`、`vercel.json`、`.env.example`：根專案／scripts／server 設定；舊版 source 未刪除或改寫。
- `lib/contracts/analysis.ts`、`fixtures/demo/index.ts`：public v2 型別與 runtime schema、唯一 level mapping、status/code/retryable、三組 Demo 與 422。
- `app/analyze/route.ts`、`lib/server/analyze.ts`、`multipart.ts`、`image-validation.ts`：完整 request 管線。A 已在同一分支完成正式 React 分析流程與 PWA；public contract 與 Backend route 未改名。
- `lib/server/ai/providers/openai.ts`、`ai/provider.ts`、`ai/normalize.ts`、`prompts/scam-analysis-v1.md`：單一真實 adapter 實作與版本化 prompt。
- `lib/server/config.ts`、`deadline.ts`、`errors.ts`、`telemetry.ts`：fail-closed 設定、取消與 timeout、固定安全訊息、runtime log allowlist。
- `tests/unit/*`、`tests/integration/http.test.ts`、`tests/e2e/backend-shell.spec.ts`：不付費驗證。HTTP stub 只在 `.tools/http-app` 測試副本的 route wiring 注入，不進正式 endpoint。
- `lib/evaluation/schema.ts`、`scripts/evaluate.ts`、`prepare-evaluation.ts`、`tests/evaluation/*`：完整評估工具與待人工標註候選；真實單案例結果見 `docs/ai-smoke-2026-09-05.md`。
- `scripts/preview-smoke.ts`、`check-bundle.mjs`、`.github/workflows/backend.yml`：部署準備；GitHub Backend 與 Vercel checks 已在最新 SHA 通過，受保護 Preview 的完整 API smoke 尚待執行。
- [A 交接](backend-handoff.md)、[評估操作](../tests/evaluation/README.md)、[部署手冊](deployment-runbook.md)：引用介面、模式、錯誤、人工與外部 gates。

## 實际命令與結果

對應本機 build ID 與程式／prompt／lockfile SHA-256 清單：[backend-validation-2026-09-04.json](backend-validation-2026-09-04.json)。這是實際命令結果的彙整，未宣稱遠端執行。

本環境 PATH 沒有 npm；從官方 npm registry 安裝 npm 12.0.2 到 ignored `.tools/package`。下列 `npm` 實際等價執行 `node .tools/package/bin/npm-cli.js`，不是虛構 PATH 可用。標準 Node＋npm 安裝環境可直接用 npm scripts。

| 命令 | 結果 |
| --- | --- |
| npm install / dev dependencies | 精確版本寫入 lock；必要 esbuild/unrs-resolver native install scripts 已按版本 allowlist |
| npm ci | 最終乾淨安裝成功：391 packages added，392 audited，0 vulnerabilities |
| npm run typecheck | 通過，production build 亦再次完成 TypeScript 檢查 |
| npm run lint | 通過 |
| npm test | A 整合及 Provider-output 修復後重跑：**8 files、85 tests 通過**；包含 contract／圖片／pipeline／SDK／evaluation／Client／PWA／真正 Next HTTP integration |
| npm run test:integration | 獨立 **11 tests 通過**；亦包含在 npm test |
| npm run build | 通過；`/` 靜態，`/analyze` dynamic Node route；未用 static export |
| npx --no-install playwright install chromium | 已下載 Chromium 151 與配套；實際以本機 CLI path 執行 |
| npm run test:e2e | A 整合後重跑：**10 passed**；7 項 Demo/UI/PWA＋3 項 controlled Remote error/cancel flow |
| npm run verify:bundle | A 整合後重跑：33 browser-deliverable files；0 server markers；prompt 與 sharp 均包含在 route trace |
| npm run eval:prepare | 30 自製去識別化 PNG，20 development／10 holdout；來源、family、候選期望、人工欄位與 split 已記錄 |
| npm run eval:ai | dry-run：20/20 development 圖片完整解碼；paidCalls=0 |
| npm run eval:ai -- --split holdout | dry-run：10/10 圖片完整解碼；paidCalls=0 |
| npm run eval:ai -- --split demo | dry-run：3 張×3=9 案例、3 張完整解碼；不是三輪真實 Demo |
| npm run eval:ai -- --execute | **預期 exit 1**：缺 budget/max-calls/authorized-by 即拒絕，未讀 key 或呼叫 AI |
| git diff --check | 通過；LF/CRLF 提示是既有 Windows Git 設定，不是 whitespace error |

已修复：套件 export 相容性、Zod superRefine 越界拋錯、真實再編碼超限 fixture、BCP47 子集差異、APNG/MPO 首 frame 誤判風險、tiny-chunk body 記憶體開銷，以及 Windows E2E 伺服器未退出造成 npm ci DLL lock。E2E 改為受控子程序 IPC 主動 shutdown；最終已確認測試程序退出。

環境例外：受管 Windows 沙箱拒絕 npm 網路及 tsx 的 OS userInfo，因此依使用者授權、經自動審核 escalation 安裝套件／瀏覽器與跑 dry-run，沒有繞過存取限制。最初 npm ci 被測試 DLL lock 阻擋，修正收尾後乾淨安裝成功。ESLint 9.39.5 有上游 deprecated 警告，目前與 Next plugin 相容且 audit 無漏洞，列作後續 dev-tool 升級事項。

## Secret、內容與成本證據

- invalid input calls=0；合法結果、Provider error／schema failure／refusal 最多 1 次；SDK 429／5xx／network 無 retry；pre-cancelled 0 calls。
- deadline tests 包含 stalled body、剩餘時間不足、Provider 不配合中止與 Client 取消；Provider signal 向下傳。Native decoder 中止仍 best effort，先靠 bytes/pixels 限制。
- application telemetry 只輸出 requestId／狀態／有限 failureKind／timing／image dimensions／usage，未知 usage 不當 0；實測測試中的 filename／結果內容／Provider error／key 標記未進 log 或 response。
- 所有應用程式可控 API 回應 no-store；bundle scan 未發現 server key 名稱、prompt、Provider URL 或 test stub markers；server-only 模組不進 Client。
- `store:false`、max_output_tokens=2400、tools=[]、fixed snapshot、maxRetries=0。這些只限制本次呼叫，不是帳號級全站限流或硬費用上限。
- 評估工具固定 selected cases、額度預檢、call cap、版本/hash、每案不可覆寫 runId，所有錯誤與未知成本列入報告；真實帳號 usage／硬上限／部署存取仍沒有證據。
- Provider/平台保留政策仍需產品確認；不宣稱供應鏈零保存。

## B 驗收狀態

| 使用者完成條件 | 狀態 |
| --- | --- |
| 1 可重現安裝/typecheck/lint/test/build | 本機通過；PR #3 Backend check 成功 |
| 2 POST /analyze contract | 本機實作與 HTTP stub integration 通過 |
| 3 schema/image/normalize/timeout/cancel/calls | 本機測試通過 |
| 4 真實 Provider 圖片紀錄與品質評估 | **部分完成**：1 次真實圖片呼叫成功且獲人工語意確認；其餘人工標註與 development／holdout 品質評估未完成 |
| 5 Preview Backend 驗證 | **部分完成**：最新 SHA 的 branch-specific Remote config／secret、Ready deployment、Authentication 與 GET 405 已驗證；合法圖片與完整 HTTP contract live smoke 未完成 |
| 6 secret/log/no-store/access/cost 證據 | 本機 secret/log/no-store 通過；Preview key scope／Protection／sanitized logs 已確認；**實際支出停止措施與 Remote usage 尚未驗證** |
| 7 A shared schema/fixtures/endpoint 交接 | 完成；A 已引用 shared schema／fixtures 與 `/analyze`，A+B 自動化通過 |
| 8 文件狀態／待決／限制同步 | 已同步八份主要文件與新增交接／評估紀錄 |

## 下一個必要輸入

1. 單案例授權已用完；任何後續真實呼叫都需要新的明確美元額度與最多呼叫次數授權。建議完整 evaluation 上限為 39 calls／US$1.00，但尚未獲授權，也尚未執行。
2. 產品／覆核者完成其餘候選 manifest 的實際人工標註（annotator/reviewer/approved）；已完成的單案例語意確認不替代 development／holdout 標註。
3. Preview Remote env、branch-specific secret 與 Protection 已完成；仍需獲授權後在已登入 session 實跑一個合法圖片，並完成 invalid POST headers、OPTIONS、平台邊界、logs、usage 與實際支出停止措施。若 B 執行環境無法取得受保護 session，改由 A 執行工具並保存去敏證據。

目前決策：**受保護 Preview 可維持 Remote；不提升 Production、Goal 未完成**。Production 明確保持 mock 且無 key。尚未完成 Preview Remote 圖片、完整品質評估、實際支出停止措施、Production／rollback 與 A 手機實機 gates。初次 JSON 保留當時證據；後續狀態以交接分支、PR 與本文件為準。

### GitHub 交接

使用者後續已授權 commit／push 與 Draft PR，交接分支為 `codex/backend-handoff`，目標 repository 為 `csfishy/scamshield-ai`。A 已於 `0c39b4549e95925a3931b5607fac2c7131c07a53` 完成 React UI／PWA 自動化範圍；B 已用 `git pull --ff-only` 拉回並重跑完整本機 checks。交接保留 B 實作與舊 Blazor；此狀態不代表真實 AI／Preview Remote gate 已完成，也不授權提升 Production。

### 2026-09-05 A+B 整合後驗證

- A UI 整合後 B 完成 Provider-output 防護修復；Local HEAD 與 `origin/codex/backend-handoff` 均為 `e29fa4ad9fe20e891e21dd4e15642dc53123f9d5`，working tree 在本次文件同步前 clean。
- `typecheck`、`lint`、85 Vitest、11 HTTP integration、production build、10 Playwright E2E、bundle scan 全部通過。
- Draft PR：`https://github.com/csfishy/scamshield-ai/pull/3`。最新 Preview 為 `https://scamshield-f24rsyzp2-csfishy-1632s-projects.vercel.app/`，deployment `4ArokYEYXcQXsraTXrYB7tBrxuZ2`，exact SHA `e29fa4a`；Backend、Vercel 與 Preview Comments checks 均通過。
- Preview branch 已設 Remote config 與未 reveal 的 branch-specific key；Vercel Authentication 啟用，未授權 302，已授權首頁載入與 runtime GET `/analyze` 405 通過。Production 未 redeploy／promote，保持 mock／無 key。
- 尚未建立 automation bypass secret；因此 invalid POST 完整 headers、OPTIONS 與合法圖片仍未完成 live 驗證。本輪 Preview 配置驗證 provider calls=0、token=0、cost=US$0。

### Goal 外部阻塞稽核

先前因 key、額度與 Vercel 存取缺失而記錄的 blocked 狀態已在使用者恢復額度後續作；本機真實 smoke 與 A 的 Preview 配置已有新增證據。現在剩餘外部輸入是後續付費呼叫的明確授權、其餘人工標註，以及 A／專案負責人的手機實機與受保護 Preview session 驗證。完整 Goal 仍未完成。
