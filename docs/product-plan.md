# ScamShield AI 產品計畫

- 版本：2.0｜2026-09-04
- 狀態：Next.js MVP 產品基準；B Backend 已本機實作，真實 AI／部署／正式 UI 尚未驗收，Blazor Mock 保留
- 產品範圍文件；API 欄位以 [api-contract.md](api-contract.md) 為準

## 1. 問題與價值

使用者在點擊連結、付款或提供 OTP 前，可能無法辨識訊息中的可疑要求。
ScamShield AI 讓使用者提交一張截圖，取得有依據的風險提示與可執行的安全建議。

第一階段驗證兩件事：

1. 使用者是否願意把可疑截圖交給產品分析。
2. 分析理由與建議是否足以幫助使用者停下高風險操作。

本產品是主動提交的輔助工具，不宣稱背景攔截、不保證能確認所有詐騙。

## 2. 初始使用者與情境

MVP 先以台灣繁體中文截圖作主要驗證情境，使用桌面或手機瀏覽器：
LINE／社群聊天、物流通知、客服、付款／OTP 要求、投資與冒名話術。

不把「出現連結／付款」本身視為詐騙。正常聊天與合理通知也是必要測試案例。
對目標族群的使用意願與理解程度仍待訪談／實测，不能視為已驗證需求。

## 3. MVP 核心體驗

```text
選擇圖片 → 預覽／雲端傳輸告知 → 明確開始分析
→ 風險等級與指標 → 可疑理由 → 安全行動
或：無法判斷／失敗 → 換圖／適當手動重試
```

- 單張 JPEG／PNG，最大 4 MiB；不接受 HEIC、動畫或多圖。
- 圖片限制、解碼與 API 行為詳見 contract，Client 不自行放寬。
- 評分只有 low／medium／high 三級；不使用舊計畫的 Suspicious 第四級。
- 分數 0–100 是風險指標，不是詐騙機率；低分不等於安全保證。
- category=unknown 表示能評估風險但無法可靠分類。
- 圖片無法讀取／無關／證據不足以分析時顯示「無法判斷」，不提供假低分。
- 結果提供具體原因與下一步，不自動開啟截圖中的連結。

## 4. 目標技術與實作現況

目標：Next.js＋React＋TypeScript 前端，Next.js Route Handler 後端，
Vercel 同源部署，一個真實 Multimodal AI Provider。

現有：根 Next.js 最小 shell、B Backend／shared schema／OpenAI adapter 與本機
自動測試。尚無真實 Provider 呼叫或 Preview 證據，A 正式 UI/PWA 待完成。
舊 .NET 10 Blazor／PWA／Mock client 保留。實測與阻塞見 [B 進度](backend-progress.md)。

詳細技術責任與資料流：[architecture.md](architecture.md)、[sdd.md](sdd.md)。

## 5. 本次交付與排除範圍

| MVP 必要 | 後續方向 |
| --- | --- |
| 截圖選擇、預覽、圖片驗證 | 原始大圖壓縮／暫存／直傳 |
| 真實雲端 AI 與穩定 public schema | OCR／QR／URL 擷取 |
| 結果、證據不足、錯誤與重試 | Rule Engine／Threat Intelligence |
| 明確 Mock fixtures／展示備援 | 原生分享入口、SMS／Notification |
| 手機 Web、PWA shell／更新 | 瀏覽器 extension、phone/domain reputation |
| 評估集、成本與存取控制 | 會員、歷史、回報、DB／queue |

真實 Provider 串接屬 MVP 必要工作，不再列為排除項目。
Rule Engine／Share Sheet 不放入三日「有空順手做」清單。

## 6. 結果文案與信任

- 每個可疑理由指向可見內容；不可把推論描述成已查證事實。
- 不宣稱查過官方網域／惡意網址資料庫，除非未來確實加入該能力。
- 分數旁標示「風險指標，非詐騙機率」。
- 涉及敏感操作時建議由使用者自行取得官方聯絡方式查證。
- Demo 顯示「示範資料，未分析此圖片」，不能拿固定結果冒充任意圖片分析。
- 非必要不重述截圖內的完整個資。
- 上傳限制與雲端傳輸在提交前可見，不只藏在文件。

## 7. 隱私與資料使用

應用程式不持久保存使用者截圖、完整分析與 filename；
不上傳到 public storage／CDN，不寫入 browser storage／service worker cache。
Server 處理後釋放資源；不把原始 Provider response 放入日誌。

畫面須告知圖片會送往 Backend 與所選 AI Provider；第一版尚無自動個資遮罩。
Provider／平台可能有自己的保留政策，B＋產品在開放 Remote 前確認並記錄，
不能將本機不存圖等同整條鏈路零保存。

測試只用自製／授權、去識別化素材；測試案例留存與使用者資料分開管理。

## 8. 驗證指標與初始目標

| 指標 | 如何驗證 |
| --- | --- |
| 操作成功與理解 | 觀察使用者選圖、理解結果、選擇下一步 |
| 可分析案例成功率 | 有效 200／人工判定可分析案例，不靠全回 422 |
| 高風險漏判／正常誤判 | development＋holdout，逐例記錄 |
| 理由是否有證據 | 人工對照圖片，標記虛構／過度推論 |
| 延遲 | 成功目標 p50 ≤10 秒、p95 ≤20 秒；錯誤與逾時並列 |
| 成本 | usage、每次估計與總額；未知不記 0 |
| 信任與行為 | 是否理解分數非機率，是否知道如何官方查證 |

數值與測試方法見 [test-plan.md](test-plan.md)。所有目標尚待實測，
小型案例集不支援「整體準確率」宣傳。訪談觀察也不能直接宣稱已降低受騙率。

## 9. 三分鐘展示故事

1. 問題：在付款或提供 OTP 前，需要容易理解的風險確認。
2. Live：假物流或假客服截圖，展示具體訊號與安全建議。
3. 對照：正常訊息可獲低風險；資訊不足有明確無法判斷。
4. 技術：Next.js＋TypeScript＋Vercel＋Multimodal AI＋schema validation。
5. 願景：之後再評估 OCR／URL／原生入口。

備援依序：真實 API → 明確切 Demo fixtures → 預錄影片。
展示中說明當前模式，不宣稱固定 fixtures 的結果為現場 AI 推論。

## 10. 開發前／發布前決策

B＋產品需確認 Provider、預算、資料保留、限流／存取方式；
產品＋企劃準備案例授權與三個 Demo；A＋B 確認 4 MiB／422 contract。
Owner、期限與未完成的處理見 [SDD 待決清單](sdd.md#13-待決事項與完成時點)。

License、團隊姓名、展示 URL、影片與 Sponsor 技術目前仍 TBD，
不在本次文件更新時任意填入。
