# Privacy 與最終驗收準備（2026-09-29）

本次只更新功能分支的隱私 UI、公開政策、測試及驗收文件。沒有 merge／push main、Production deploy、啟用 AI 或公開分享 Beta。正式站新政策是否已顯示，與本機新程式是否通過，分開判定。

## 基準及安全狀態

- Repository：`csfishy/scamshield-ai`。
- 已 fetch 並確認 `origin/main`：`5a788a91f7c934667cb8f216bcc393bd164084dd`；沒有未知新增 commit。
- 功能分支：`codex/privacy-and-final-gates`，從上述 revision 建立。
- 開始時 tracked working tree 乾淨；既有 `deliverables/` 不讀取、不修改、不加入提交、不清除。
- Node `24.19.0`；Corepack 執行專案宣告的 npm `12.0.2`。本次不改套件／lockfile，前一階段 clean install 證據保持歷史範圍。
- 2026-09-29 08:07 UTC 唯讀確認：Production deployment `dpl_3fVJ2VKFGEF4mGkYxRhkYzH65sSK` 為 `READY`、target `production`、branch `main`、Git SHA 為上述 `5a788a9…`，canonical alias 指向同一 deployment。
- Canonical：[正式站](https://scamshield-ai-fawn.vercel.app)；本次不向 Production `/analyze` 發送任何請求。
- Production 24 項設定／秘密 metadata 檢查通過；`ANALYSIS_ENABLED=false`。Provider 憑證 metadata 未變，未讀取其值。
- Production Redis 只 GET／TTL 指定 runtime control，確認 `disabled`、TTL `-1`；沒有遠端 Redis 寫入。
- 本次真實 Provider calls：**0**。本機 SDK transport 替身不算真實 AI，沒有執行付費 smoke／`eval:ai --execute`。

收尾在08:22 UTC再次唯讀核對24項設定、Redis disabled／TTL=-1及同一READY deployment／alias，均未變。匿名GET正式 `/privacy` 回200，仍沒有新90天政策與公開Email，並有舊「尚待管理者確認」文案；這是本輪禁止Production部署的實際界線，不標Privacy公開驗收PASS。再次fetch後`origin/main`仍是上述SHA。

## 修改檔案

以下17個檔案為本次功能提交範圍；核心分析、Provider、quota、prompt、API契約、Service Worker、package及lockfile均無變更。

| 路徑                                        | 目的                                   | 使用者可見         |
| ------------------------------------------- | -------------------------------------- | ------------------ |
| `lib/privacy.ts`                            | 公開90天政策、Email及固定mailto        | 是，公開bundle資訊 |
| `app/privacy/page.tsx`                      | 各系統資料分類、90天、刪除申請與聯絡   | 是                 |
| `components/feedback/FeedbackLinks.tsx`     | 所有回饋入口可達隱私聯絡               | 是                 |
| `components/analysis/AnalysisWorkspace.tsx` | 信用卡遮蔽與Beta限制提醒               | 是                 |
| `tests/unit/privacy.test.ts`                | 政策、編碼與Email不進Redis／AI payload | 測試               |
| `tests/e2e/analysis-ui.spec.ts`             | Privacy頁、入口、鍵盤複製及行動排版    | 測試               |
| `tests/e2e/remote-ui.spec.ts`               | 成功／錯誤回饋、公開聯絡與payload限制  | 測試               |
| `.env.example`                              | 公開政策常量與選填feedback Email的差異 | 設定範本           |
| `README.md`                                 | 現況、公開政策及驗收文件入口           | 公開repo文件       |
| `docs/public-beta-readiness.md`             | 新分支與Production各gate，保留歷史     | 公開repo文件       |
| `docs/deployment-runbook.md`                | 政策發布界線、目前安全狀態及操作       | 公開repo文件       |
| `docs/test-plan.md`                         | 15項Privacy／發布層次回歸要求          | 公開repo文件       |
| `docs/privacy-operations.md`                | 90天人工清理與副本／刪除申請流程       | 公開repo文件       |
| `docs/iphone-pwa-acceptance.md`             | 真機A–G流程與證據模板                  | 公開repo文件       |
| `docs/production-ai-quality-plan.md`        | 5類案例、工具限制、門檻及預算模板      | 公開repo文件       |
| `tests/evaluation/README.md`                | 連至下一階段Production品質計畫         | 公開repo文件       |
| `docs/privacy-final-gates-2026-09-29.md`    | 本輪可追溯的基準、測試與限制           | 公開repo文件       |

## 政策與實作範圍

使用者已明確核定：Google Forms 回饋最長保存 **90 天**；期滿刪除或去識別化，長期測試／品質用途須另行取得適當同意。公開聯絡、隱私、回饋刪除與 Beta 問題信箱為 **cs.sakana@gmail.com**，此地址已授權公開及進 Git。

`lib/privacy.ts` 是公開政策來源；不是 server secret，不需 Email API。Privacy 頁提供 mailto 與複製地址，Feedback 在首頁／結果／錯誤均可找到隱私聯絡。Mailto 僅含固定主旨，不含圖片、IP、分析內容或信件正文。原有選填 `FEEDBACK_CONTACT_EMAIL` 仍是額外回饋管道，不決定正式隱私聯絡地址是否顯示。

不改 Provider／模型／prompt／額度／分析契約。程式核對支持一般使用不持久存原圖、完整分析；Redis 僅含防濫用狀態，HMAC 不代表完全匿名；Service Worker 排除分析 POST 及使用者圖片。`store:false` 與 Provider 安全留存分開說明。[OpenAI 官方資料控制](https://developers.openai.com/api/docs/guides/your-data)

Google Forms 原描述仍寫保存期間與刪除管道尚待確認；使用者在本輪另行明確核准替換。僅更新說明文字，保留問題、存取設定及既有回覆。2026-09-29 08:20 UTC 全新未登入瀏覽器 GET 200，實際確認90天、公開Email、刪除／去識別及較長期用途另行同意；舊占位文案已移除。6個問題仍在、Email選填且空白、無檔案上傳；Request ID、含 `+`／`/` 的build及類型預填均通過。本輪沒有提交Google回覆，攔截2個背景非GET請求。沒有重新驗證送出及摘要設定，不冒充整體外部驗收完成。

網站沒有新增Google回覆儲存或自動清理後端。90天是正式政策，管理者仍需執行到期清理、處理刪除申請及所有受管副本；管理流程見 [Privacy operations](privacy-operations.md)。

## 本機驗證

命令由Node24.19.0啟動Corepack的npm12.0.2；所有Provider測試均採替身，沒有真實AI費用。相依版本、模型、prompt與lockfile未變。

| 檢查                                                 | 狀態／證據                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                  | PASS，exit0                                                                                                                                          |
| `npm run lint -- --ignore-pattern 'deliverables/**'` | PASS，exit0                                                                                                                                          |
| `npm test`                                           | PASS，14 files／338 tests，包含17項本機HTTP整合；其餘321項unit。SDK使用fake HTTP transport，HTTP整合用loopback Provider stub，不是真Redis／AI        |
| `npm run build`                                      | PASS，Next16.3.4 production build，exit0                                                                                                             |
| `npm run verify:bundle`                              | PASS，37個browser deliverable files，0個server-only markers；prompt／sharp trace存在                                                                 |
| `npm run test:e2e`                                   | 最終PASS，20 tests＝9 Mock/backend＋11 Remote UI。Privacy／回饋包含行動viewport、鍵盤複製、成功／錯誤入口與不自動送圖；桌面Chromium不代表iPhone      |
| `node .tools/privacy-secrets-scan.mjs`               | PASS，174個tracked／本輪新增檔案比對4個已存在local secret值及token patterns，0命中；公開聯絡Email已授權。local env與deliverables未追蹤，不輸出秘密值 |
| `git diff --check`                                   | PASS，exit0；Git的LF→CRLF提示不是diff whitespace error                                                                                               |
| 3組AI evaluation dry-run                             | PASS，development20、holdout10、demo9個預備嘗試；真Provider calls=0。不是品質PASS                                                                    |

E2E第一次執行：Mock/backend 8 PASS／1 FAIL（`changing image cancels pending work and stale Demo cannot overwrite`），瀏覽器報 `net::ERR_NO_BUFFER_SPACE`，圖片未進ready狀態而click timeout，Remote suite因前段失敗未執行。沒有調低斷言、改程式或增加自動retry；同一命令第二次完整20／20 PASS。第一次失敗仍保留此紀錄，根本環境原因未獨立證實。

初步secrets regex曾把synthetic manifest的 `high-risk-…` case ID中子字串誤判成 `sk-` token；加入token前綴邊界後、連同實際local secrets逐字比對均無命中。沒有發現實際秘密洩漏，也沒有因公開Email而關閉秘密檢查。

Lint 以 `--ignore-pattern 'deliverables/**'` 明確排除使用者要求保留的未追蹤目錄；此目錄不屬本次驗證範圍。本機測試使用測試替身／loopback stub，不能冒充真實 Redis 或 AI 品質 PASS。

## 驗收準備與 Gate

- [iPhone Safari／PWA 真機清單](iphone-pwa-acceptance.md)：本次只準備，`IPHONE_PWA_ACCEPTANCE=NOT_RUN`。
- [Production AI Quality Gate 計畫](production-ai-quality-plan.md)：模型／prompt 維持目前設定；最大 Provider calls、USD 與案例數均 **TBD**，等待下一輪明確核准；`AI_QUALITY_GATE=NOT_RUN`。
- `LOCAL_IMPLEMENTATION=PASS`、`LOCAL_AUTOMATED_TESTS=PASS`、`LOCAL_PRIVACY_IMPLEMENTATION=PASS`；本機頁面90天、公開Email、mailto／複製、舊占位移除及各平台資料分類均已驗證。
- Production `PRIVACY_COMPLETENESS=PARTIAL / PENDING_DEPLOYMENT`：使用者政策輸入與Google說明已補齊，但本輪禁止Production deploy，正式站仍是舊SHA。不能把本機PASS寫成正式站政策已更新。
- `REDIS_INTEGRATION=PASS` 與 `PRODUCTION_HTTP_REDIS_RUNTIME_GATE=PASS` 保留前階段 `5a788a9…` 證據；本次沒有重跑 Redis 競態或 HTTP runtime gate。
- `FEEDBACK_EXTERNAL_ACCEPTANCE=PARTIAL`：本輪Google新政策／匿名讀取／預填PASS；送出／摘要設定未重驗，iPhone尚未執行，歷史導覽失敗原因仍無足夠證據。
- `PRODUCTION_HTTP_RATE_LIMIT=NOT_RUN`、`PRODUCTION_ACCEPTANCE=PARTIAL`、`PUBLIC_BETA=NOT_READY`。

下一階段仍需另行核准部署並驗證正式站Privacy、落實Google資料清理、完成iPhone真機驗收及有明確呼叫數與USD上限的AI品質驗收。回饋誤判回報先人工覆核，不直接當成ground truth。
