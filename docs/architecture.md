# ScamShield AI MVP Architecture

- 版本：2.0｜2026-09-04
- 狀態：**A+B 已整合且自動化通過；單次真實 AI smoke 已人工覆核，受保護 Preview 已部署，完整 AI／Preview Remote／實機 gate 待驗收**
- 取代舊版 Blazor＋ASP.NET Core 目標架構；現有程式仍保留 Blazor
- 詳細設計：[SDD](sdd.md)；線上介面：[API contract v2](api-contract.md)

## 1. 現況與目標

| 面向 | Repository 現況 | 目標 |
| --- | --- | --- |
| Frontend | A 正式 React UI／PWA 已整合且自動化通過；舊 Blazor 保留 | iOS／Android 與舊 PWA 遷移待實測 |
| Backend | 已實作 /analyze、圖片完整驗證 | Preview 合法／非法 POST runtime 待完整實測 |
| AI | OpenAI adapter 已完成一次真實圖片 smoke 並獲人工語意確認 | development／holdout 與 Preview Remote 待完成 |
| Deployment | 受 Vercel Authentication 保護的 Preview 已部署最新 SHA | Remote 圖片 smoke、平台邊界與 Production gate 待完成 |
| Contract | 現有 C# client 依 v1、10 MiB | v2、4 MiB＋422＋明確資源上限 |
| Storage | 無 DB／會員／queue | 維持無 DB／會員／queue |
| PWA | Blazor manifest／worker | 保留安裝與離線備援能力，重新設計 cache／更新 |

package/lockfile、Next.js source、AI adapter 與測試已建立；本機證據見
[B 進度](backend-progress.md)，引用方式見 [交接](backend-handoff.md)。
部署成功仍須 Preview 實測，不能由設定檔存在推定。

## 2. 目標資料流

```text
Mobile / Desktop Browser
  └─ Next.js UI / React Client Components
       ├─ Image picker / preview / result / errors
       ├─ Explicit Mock → local fixtures
       └─ Remote → same-origin POST /analyze
                       ↓
              Vercel Function / Node.js
              bounded body + multipart validation
                       ↓
              image decode / limits / orientation / metadata removal
                       ↓
              ScamAIProvider adapter → one Multimodal AI Provider
                       ↓
              normalization + strict public schema
                       ↓
              risk / reasons / recommendations or error
```

僅有一個對外分析 endpoint；Client 不直接存取 AI。
`app/analyze/route.ts` 對應 /analyze，保留現有 URL。
Route Handler 可作 backend endpoint；POST 分析不能以純 static export 交付。
[Next.js 官方文件](https://nextjs.org/docs/app/guides/backend-for-frontend)

## 3. 技術選擇與替代方案

| 決策 | 理由 | 代價／限制 |
| --- | --- | --- |
| Next.js＋TypeScript | UI／API 同 repo、同源部署、共用 schema | Razor／C# 要移植 |
| Vercel Functions＋Node | 與 Next.js 整合，支援 server 圖片處理 | payload／duration／帳號方案限制 |
| Zod shared contract | Client／Server 執行時檢查與型別同步 | 需避免 server 模組被 client 引入 |
| 單一 Provider adapter | 隔離 SDK／prompt／供應商格式 | Provider 選型須 Day 1 完成 |
| 無持久儲存 | 降低 MVP 範圍與截圖保管負擔 | 沒有歷史／回報／跨請求 cache |
| 4 MiB 上傳 | 保留 multipart 空間 | 舊 10 MiB 不相容，需同批切換 |

保留 Blazor＋獨立 .NET API 技術上仍可行，但不再作本次目標，
避免三日內維護兩套新後端。React-only 靜態網站仍需另一個 API；
目前選 Next.js 作單一部署。原生 App、Edge runtime、多服務／queue 暫不採用。

## 4. Client／Server 邊界

### A：Frontend Owner

- React UI、responsive CSS、圖片選擇與 object URL 預覽。
- 讀圖／分析狀態、換圖清除、取消、競態保護、manual retry。
- 使用 shared schema，顯示後端 level，拒絕矛盾 response。
- 明確 Demo／Remote 與圖片送雲端告知；低風險不宣稱安全。
- Manifest、icons、離線頁面、Mock、service worker 遷移。
- 手機／鍵盤／可存取操作。

### B：AI／Backend Owner

- 根目錄專案初始化、lockfile、共用 schema 與 Vercel 設定。
- bounded upload、格式／完整 decode／像素驗證與 error mapping。
- 單一 Provider、prompt、normalization、score-to-level mapping。
- Server secrets、timeout／取消、非敏感 log、成本與部署控制。
- 測試 fixtures、contract tests、AI evaluation 與部署手冊。

### 共用變更

B 主責 package／lockfile／配置與 contract；A review UI 整合需求。
A 主責 app shell／PWA；B review server 資料邊界。
破壞性 contract 變更先更新文件、同批改 client／API／測試再發布。

## 5. 信任與網路邊界

- 生產前後端同源 HTTPS，通常不需跨域 CORS 配置。
- 同源不是 authentication，也不能取代限流；公開 API 可被外部 client 呼叫。
- 不從 request 接受 AI model、Provider URL、prompt 或外部圖片 URL。
- 圖片內容視為不受信任資料，不服從其中對模型的指令。
- 不執行截圖網址／QR，不宣稱做過外部 reputation 查證。
- Provider key／prompt／raw output 留在 server，Client 僅見 public contract。
- 限流／部署保護可能回平台 error，Client 必須能處理 non-JSON。
- 應用程式不保存截圖，供應商／平台 retention 另行確認並告知。

## 6. Mock、PWA 與更新

預設 Client Demo 使用正常、假物流、假客服 fixtures，顯示「示範資料，
未分析此圖片」。Remote failure 不切換假成功。

離線能力限定預先載入的靜態 shell／offline page／Demo；Remote 仍需網路。
API 與使用者圖片不進 service worker cache。
不能直接沿用 Blazor 的全 navigation cache-first 策略快取 Next.js HTML／RSC；
已安裝舊 PWA 的更新與回復流程見[部署手冊](deployment-runbook.md)。

## 7. MVP included／excluded

Included：真實 AI 串接、單圖驗證、結果／422／errors、manual retry、
手機 Web／PWA、Mock、評估集、有限 timeout／成本控制、Vercel 整合部署。

Excluded：會員、DB、queue、分析歷史、Blob 圖片儲存、OCR／QR extraction pipeline、
URL scanner、獨立 Rule Engine、Threat Intelligence、SMS／Notification、
原生 Share Extension、Browser Extension、多 Provider routing、自動模型修復。

未來若保留原始 10 MiB 圖片，需另設直傳／暫存與刪除策略，
不能只提高 Handler 常數；Vercel 的 4.5 MB payload 限制仍存在。
[官方限制](https://vercel.com/docs/functions/limitations)

## 8. 風險與對應驗證

| 風險 | 設計處理 | 驗證 |
| --- | --- | --- |
| AI 幻覺／漏判 | 有依據的 rubric、422、holdout | AI evaluation |
| 限流／費用暴增 | 單次呼叫、部署保護／用量控制 | OPS |
| 圖片大／解碼耗資源 | body、bytes、像素／frame／deadline | IMG／NET |
| Platform error 非 JSON | status fallback | NET |
| 新舊 PWA cache 混用 | worker 遷移與原裝置實測 | DEPLOY |
| 秘密或內容外洩 | server-only、log allowlist、no-store | PRIVACY |
| 排程被遷移拖延 | Day 1 部署真實分析，Day 2 凍結 | 三日計畫 |

詳见 [SDD](sdd.md) 的 ADR／待決事項和 [test-plan.md](test-plan.md) 的 gates。
