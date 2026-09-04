# B 開發進度與驗收證據

開始：2026-09-04；基準 revision `2b4d945d91a492d4f3873426f8014c7286201d14`。
工作目錄 `C:\Project\scamshield-ai`。未找到適用 AGENTS.md。
開始時 README、architecture、api-contract、buildmode、product-plan、舊 INTEGRATION 已修改；SDD、test-plan、runbook 未追蹤。全部保留，以目前文件為規格。

| 里程碑 | 狀態 | 實際變更／驗證／阻塞 |
| --- | --- | --- |
| M1 現況、基礎、shared contract | 完成 | 根 Next.js、strict TS、精確版本／npm lock、scripts、strict public schema／enum／limits、正常／假物流／假客服 fixtures；乾淨安裝與 contract tests 通過 |
| M2 圖片、API、stub HTTP integration | 完成 | Node POST /analyze；固定 buffer 有界 multipart、欄位／BCP47、MIME／signature／副檔名、完整 sharp decode、EXIF／metadata、pixels／APNG／MPO／再編碼檢查；真正 Next HTTP＋SDK loopback stub 11 項通過 |
| M3 Provider、prompt、normalization | 實作完成；真實連線未完成 | OpenAI Responses adapter、snapshot、prompt v1、strict output＋normalize、422／429／500／503、15s/20s deadline、取消、maxRetries=0、單次呼叫；unit／SDK transport tests 通過。key／採用确认／額度尚缺 |
| M4 測試、真實 AI 評估 | 自動化完成；AI 品質未完成 | 69 tests＋1 production browser smoke 通過；30 張 synthetic candidates、20/10 split、Demo 3×3 dry-run。人工標註全 pending；真實 Provider calls=0，不能聲稱品質 gate pass |
| M5 Preview、部署準備、A 交接 | 準備與交接完成；Preview 未完成 | Vercel Next.js 設定、prompt/sharp trace、CI workflow、smoke 工具與交接文件已建立；沒有已授權 Vercel project/link/token／Preview URL／保護和成本控制證據 |

Goal 保留完整 B 驗收条件。Stub／本機 build 不替代真實 AI／Preview。A UI／手機／PWA 另行驗收。

## 主要交付檔案

- `package.json`、`package-lock.json`、`tsconfig.json`、`next.config.ts`、`vercel.json`、`.env.example`：根專案／scripts／server 設定；舊版 source 未刪除或改寫。
- `lib/contracts/analysis.ts`、`fixtures/demo/index.ts`：public v2 型別與 runtime schema、唯一 level mapping、status/code/retryable、三組 Demo 與 422。
- `app/analyze/route.ts`、`lib/server/analyze.ts`、`multipart.ts`、`image-validation.ts`：完整 request 管線。`app/layout.tsx`／`page.tsx` 只最小 shell，A 接手。
- `lib/server/ai/providers/openai.ts`、`ai/provider.ts`、`ai/normalize.ts`、`prompts/scam-analysis-v1.md`：單一真實 adapter 實作與版本化 prompt。
- `lib/server/config.ts`、`deadline.ts`、`errors.ts`、`telemetry.ts`：fail-closed 設定、取消與 timeout、固定安全訊息、runtime log allowlist。
- `tests/unit/*`、`tests/integration/http.test.ts`、`tests/e2e/backend-shell.spec.ts`：不付費驗證。HTTP stub 只在 `.tools/http-app` 測試副本的 route wiring 注入，不進正式 endpoint。
- `lib/evaluation/schema.ts`、`scripts/evaluate.ts`、`prepare-evaluation.ts`、`tests/evaluation/*`：完整評估工具與待人工標註候選。
- `scripts/preview-smoke.ts`、`check-bundle.mjs`、`.github/workflows/backend.yml`：部署準備，尚未在遠端 CI／Vercel 執行。
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
| npm test | **6 files、69 tests 通過**；包含 contract／圖片／pipeline／SDK／evaluation／真正 Next HTTP integration |
| npm run test:integration | 獨立 **11 tests 通過**；亦包含在 npm test |
| npm run build | 通過；`/` 靜態，`/analyze` dynamic Node route；未用 static export |
| npx --no-install playwright install chromium | 已下載 Chromium 151 與配套；實際以本機 CLI path 執行 |
| npm run test:e2e | **1 passed**，production Next runtime＋最小 shell＋實際 /analyze mock 503／405／no-store；正常退出 |
| npm run verify:bundle | 36 browser-deliverable files；0 server markers；prompt 與 sharp 均包含在 route trace |
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
| 1 可重現安裝/typecheck/lint/test/build | 本機通過；Linux CI workflow 已備妥但未跑遠端 |
| 2 POST /analyze contract | 本機實作與 HTTP stub integration 通過 |
| 3 schema/image/normalize/timeout/cancel/calls | 本機測試通過 |
| 4 真實 Provider 圖片紀錄與品質評估 | **未完成**：0 真實呼叫，人工標註 pending |
| 5 Preview Backend 驗證 | **未完成**：無 URL／可用專案授權設定 |
| 6 secret/log/no-store/access/cost 證據 | 本機前三者通過；**外部存取／成本控制未完成** |
| 7 A shared schema/fixtures/endpoint 交接 | 文件完成，A 正式整合仍由 A 執行 |
| 8 文件狀態／待決／限制同步 | 已同步八份主要文件與新增交接／評估紀錄 |

## 下一個必要輸入

1. 確認採用建議 OpenAI snapshot，將 `AI_API_KEY` 安全設定於未提交 `.env.local`（或 Preview server env）；不要貼入聊天。另明確授權美元總額與最多呼叫次數。
2. 產品／覆核者完成候選 manifest 的實際人工標註（annotator/reviewer/approved），收斂合理 score/category，或提供已授權、已標註的替代資料集。B 不冒充人類標註。
3. 提供已授權的 Vercel project/team 與登入／連結，確認 Preview 存取保護與實際支出停止措施，再建立受控 Preview、實跑合法圖片與平台邊界／logs／usage，保存 URL 與版本。

首次本機驗收時的決策：**不公開 Remote、不提升 Production、Goal 未完成**。當時尚未執行真實 AI、遠端 CI、Preview/Production、外部存取／限流／支出控制、rollback、A 手機/PWA gates。此節與 JSON 證據記錄該次本機驗收狀態；後續 GitHub 交接與 CI 狀態以交接分支及 PR 為準。

### GitHub 交接

使用者後續已授權 commit／push 與 Draft PR，交接分支為 `codex/backend-handoff`，目標 repository 為 `csfishy/scamshield-ai`。交接保留既有文件修改、B 實作與舊 Blazor；A 先依 `docs/backend-handoff.md` 完成正式 React UI／手機／PWA。此交接不代表 B 的外部 AI／部署 gate 已完成，也不授權提升 Production。

### Goal 外部阻塞稽核

同一組外部條件已連續三個 Goal 回合確認缺失：沒有 `.env.local`／可用 AI key、沒有明確費用與呼叫次數授權、30 張人工標註全部 pending、沒有 `.vercel/project.json`／部署憑證。前一續作回合沒有實作進展，也沒有已確認執行中的外部工作可等待。本機可獨立完成的交付已完成，因此 Goal 標記 **blocked，非 complete**，完整目標保留；取得上述輸入後繼續真實 AI 與 Preview 驗收。
