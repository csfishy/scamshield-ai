# Buildmode MVP 三日開發與分工計畫

- 版本：2.0｜2026-09-04
- 狀態：A+B 實作與自動測試已整合；單次真實 AI smoke 已人工覆核，受保護 Preview 已部署；完整 AI／Preview Remote／實機 gate 未完成。見 [B 進度](backend-progress.md)
- 團隊：A（UI）、B（AI／Backend）、產品行銷、企劃包裝
- 設計：[SDD](sdd.md)｜介面：[API v2](api-contract.md)｜驗收：[test-plan.md](test-plan.md)

## 1. 三日目標

部署網站可以上傳真實截圖，得到風險、理由與安全行動；
無法判斷或服務失敗有清楚回應，Demo 有誠實標示的備援。
遷移範圍包含舊 Blazor UI → React，Backend 從零建立 Next.js Route Handler。

不做：會員／DB／queue、歷史、原生分享、SMS／Notification、
OCR／QR extraction、URL scanner、Rule Engine、Threat Intelligence、
多 Provider routing 或模型自動修復。真實 AI 串接在必要範圍內。

## 2. 責任分工

| Owner | 主責 | 交付 |
| --- | --- | --- |
| A | React 移植、選圖／狀態／結果／retry、PWA | 可用前端、UI tests、手機與 cache 遷移結果 |
| B | 根專案／contract、validation、AI、部署／成本 | API、schema、adapter、prompt、tests、評估與 runbook |
| 產品行銷 | 使用情境、人工標註／覆核、信任文案 | 案例期望、品質判斷、Pitch、保留政策告知 |
| 企劃包裝 | 素材授權、三組 Demo、影片與實機 | Demo fixtures、簡報、rehearsal 紀錄 |

B 主責 package／lockfile／Vercel 設定，A 提需求並 review；
A 主責頁面／service worker，B review 資料與部署邊界。
這是人員工作分工，不要求自動生成或啟動代理任務。

## 3. Day 1：讓部署環境第一次真實分析成功

### 上午前 60–90 分鐘：共同基準

- 確認 v2：4 MiB、完整 body／像素限制、422、三種風險等級。
- B 選定一個 Provider／模型、確認 key 與額度、保留政策與圖片限制。
- B 記錄預算／存取與限流方案；不能公開時採受控 Preview。
- A／B 確認根目錄 Next.js 路徑、版本、shared schema 與設定 Owner。
- 產品／企劃開始 30 張目標案例集，分 development／holdout。
- 新功能變更須先更新文件。

### 上午開發

| A | B | 產品／企劃 |
| --- | --- | --- |
| 接手 Next shell、移植文案與 CSS | 初始化根 package／lockfile／scripts | 確認案例來源與人工標註 |
| 圖片選擇、preview、狀態與三組 Mock | shared schema、/analyze、圖片驗證 | 完成三組展示情境 |
| contract error UI | 單一 adapter、prompt v1 | 上傳／Demo 告知文案 |

### 下午整合

- B 部署 Preview，確認 Node／decoder／Provider 在 Vercel 可用。
- A 同源呼叫 /analyze；共同驗證一張真實圖片取得完整結果。
- 核對 mode／key 不在 Client，Mock 不呼叫付費服務。
- 補記選型、版本、URL 與未完成事項。

Day 1 DoD：部署後的 UI → API → 真實 Provider → Result 全流程成功。
只有本機 SDK 呼叫或固定 JSON，不算達成。

## 4. Day 2：品質、失敗處理與手機體驗

### A

- 換圖失敗清理、取消與 request race 防護、manual retry。
- 422、non-JSON 平台錯誤、可存取性、手機操作。
- PWA manifest／offline page／Mock；設計舊 worker 遷移。

### B

- 完成 bounded body／decode／pixels 與 public schema tests。
- deadline、取消、限流／timeout／schema error mapping。
- 確认 SDK 無隱含 retry、key 隔離、log allowlist、成本紀錄。
- development 案例調整，固定 prompt／模型後跑 holdout。
- 與 A 驗證 production build、4 MiB 上傳與 Provider failure。

### 產品／企劃

- 覆核漏判、誤判、無依據理由與資訊不足處理。
- 完成三分鐘 Pitch、正常／詐騙對照、備援影片與素材說明。

Day 2 17:00 feature freeze。之後只修影響 gate 的問題，不加入新核心功能。
Day 2 DoD：test-plan 的自動化與 AI gates 有實際報告；不通過項目有負責人，
不可只因排程就標 pass。

## 5. Day 3：凍結、部署與展示

- 固定 Git revision／schema／prompt／model／依賴。
- 跑必要回歸與手機測試，驗證舊 PWA 更新。
- 驗證存取保護／限流、Provider 用量與停止 Remote 的方式。
- 按 deployment-runbook 做 rollout／rollback smoke。
- 三組 Demo 各跑三次，記錄每次結果／時間。
- 受控 Preview 或正式 URL 的發布範圍明確標示。
- 準備 Plan A 真實 API、Plan B 明確 Mock、Plan C 預錄影片。

Day 3 DoD：可用部署、實際驗收證據、已知限制、可回復版本與備援。
「Build 成功」或「Mock 正常」不能代替真實 AI 與手機驗收。

## 6. Demo 案例與節奏

| 案例 | 展示重點 |
| --- | --- |
| 假物流 | 可疑付款誘導／網址線索，避免聲稱已查證網站 |
| 假客服 | OTP／敏感資料要求與官方聯絡建議 |
| 正常訊息 | 不因出現連結／付款就一律高風險 |
| 資訊不足（失敗示範） | 無法形成評估時請換圖，不給假低分 |

三分鐘：30 秒問題、70 秒真實流程與對照、40 秒技術／限制、40 秒價值與下一步。
技術描述為 Next.js＋TypeScript＋Vercel＋Multimodal AI，
Rule Engine／Threat Intelligence 只作未來方向。

## 7. 依賴與阻塞處理

| 阻塞 | 可繼續工作 | 不能宣稱完成 |
| --- | --- | --- |
| Provider key／額度不可用 | A Mock、B validation／tests | 真實 AI |
| Vercel decoder／部署失敗 | 本機整合、調整 runtime／依賴 | 線上可用 |
| 品質 gate 失敗 | 修 prompt／縮受控展示範圍 | 一般公開 Remote |
| 限流／成本保護不可用 | 受控存取 Demo | 不限流公開 endpoint |
| 無實機 | 瀏覽器 E2E | iOS／Android 實機驗收 |
| 10 MiB 原圖被要求 | 記錄後續直傳方案 | 現有 4 MiB contract 支援 10 MiB |

Day 1／2／3 任一 gate 未達成都記錄真實狀態，不以靜默 Mock 補成成功。

## 8. 同步與最終 checklist

建議 09:00／14:00／20:00 各 10–15 分鐘：
今天交付、阻塞、Preview 是否仍可真實分析。實際時間由團隊調整。

- [ ] A／B contract v2、schema、fixtures、tests 一致。
- [ ] Preview／正式 URL 與模式已驗證。
- [ ] 真實 AI、正常／詐騙／資訊不足有證據。
- [ ] test-plan gates 與待修項目有紀錄。
- [ ] 延遲／成本是實測值，未達標有說明。
- [ ] 手機／PWA／舊 worker 更新與 rollback 已測。
- [ ] 隱私告知、來源授權、key／log 隔離完成。
- [ ] 限流／受控存取與費用控制完成。
- [ ] 三輪 Demo、簡報、影片與備援完成。
- [ ] README 只在實作通過後更新 current status。

完整技術驗收以 [test-plan.md](test-plan.md) 為準，部署依
[deployment-runbook.md](deployment-runbook.md)。
