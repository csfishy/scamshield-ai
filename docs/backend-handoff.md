# B → A 整合交接（2026-09-04）

## 實作與驗收邊界

Next.js 根專案與 B Backend 已可在本機執行。A 已在同一分支完成正式 UI／PWA 自動化範圍，A+B 整合後的 typecheck、lint、87 Vitest、11 HTTP integration、production build 與 10 Playwright E2E 均通過。真實 adapter 已完成一次獲授權圖片 smoke，專案負責人已確認該次輸出語意可接受。A 已為交接分支配置受保護的 Remote Preview，但**完整 AI 品質與 Preview Remote Backend 圖片 smoke 尚未完成**。舊 `src/app/ScamShield.Web*` 保留。

進度與實測紀錄：[backend-progress.md](backend-progress.md)。API public contract 維持 v2，未增減欄位或更名 endpoint。

## A 的引用介面

```ts
import {
  analysisSchema, errorSchema, parseAnalysisResponse,
  LIMITS, RISK_LEVELS, CATEGORIES, SIGNAL_TYPES,
  validRetryAfter,
  type AnalysisResult, type AnalysisError,
} from '@/lib/contracts/analysis';
import { demoFixtures, insufficientEvidence, DEMO_NOTICE } from '@/fixtures/demo';

const form = new FormData();
form.set('image', file);
form.set('source', 'screenshot');
form.set('language', 'zh-TW');
const response = await fetch('/analyze', {
  method: 'POST', body: form, signal: abortController.signal,
  cache: 'no-store', redirect: 'error',
});
// 先處理平台非 JSON／網路 fallback，才將 JSON 交给 schema。
const result = parseAnalysisResponse(response.status, await response.json());
// 'riskScore' in result => valid success；否則 result.error。
```

`parseAnalysisResponse` 同時檢查 strict schema、status/code/retryable，以及 score/level、none/low 語意。它會拋出驗證錯誤，A 必須顯示通用資料格式錯誤，不能重新評分修補。enum 不能忽略大小寫，文字長度按 Unicode code points。`riskLevelForScore` 是 B 產生 level 的唯一函式；A 只驗證／顯示後端值。

不要手動設定 multipart Content-Type。單圖 4 MiB，body 4,300,000 bytes；圖片每邊 12,000、總像素 24,000,000、恰好 1 frame。Client 檢查僅作提示，Server 仍會完整驗證。Filename 可以省略，若有副檔名須與 JPEG/PNG 格式相符。

## 狀態與錯誤

| HTTP | code | A 行為 |
| --- | --- | --- |
| 400 | invalid_request / invalid_image | 修正欄位／換圖，不重送原圖 |
| 405 | invalid_request | 程式呼叫錯誤；Allow: POST |
| 413 | image_too_large | 換较小圖；平台非 JSON 亦適用 |
| 415 | unsupported_image_format | 換單張 JPEG/PNG，拒絕動畫 |
| 422 | insufficient_evidence | 換清楚且有上下文圖片，不顯示分數 |
| 429 | provider_rate_limit | 採有效 Retry-After，稍後手動重試 |
| 500 | analysis_failed | 顯示分析失敗，不假成功；retryable=false |
| 503 | provider_unavailable | 手動稍後重試；也可能尚未配置 Remote |

HEAD 無 body。所有可控回應皆 no-store、server-generated X-Request-Id。平台 401/403、HTML 登入頁、413/429/502/503/504、網路或取消可能不是 contract JSON，按 API contract §8 處理，不能拿 `message` 判斷邏輯。

Client timeout 建議 25 秒；Provider 15 秒、API 20 秒、Function 30 秒。換圖／reset／離頁取消並防止舊 response 覆寫；禁止自動重送 POST。取消付費呼叫僅 best effort，不保證停止計費。

## Demo 與公開設定

`demoFixtures.normal`、`.fakeDelivery`、`.fakeCustomerService` 均為六欄結果，`insufficientEvidence` 為 error。Demo 必須顯示 `DEMO_NOTICE`（示範資料，未分析此圖片）。API 沒有任何 stub/debug 參數或切 Mock 成功的機制；`ANALYSIS_MODE=mock` 時合法請求回 503。Remote failure 不能靜默切 Demo。

所有 `lib/server/*` 與 prompt 都是 server-only。A 不可在 Client import config/provider；Server Component 若需傳 mode，只傳 allowlist 的 mode 字串與 25000 timeout 數值，不能序列化 config。`.env.local` 或 Vercel server env 放 key，不能使用 NEXT_PUBLIC_*。

## A 已完成與尚待實機項目

- 已完成正式 React UI、選圖／object URL、busy／generation guard、純文字結果、manual retry、422／平台 fallback，以及明確上傳與風險指標告知。
- 已完成 PWA 靜態快取邊界；`/analyze`、POST、截圖與分析結果不進 cache。
- 尚待真實 iOS Safari／Android Chrome、舊 Blazor PWA 遷移、多分頁、安裝／更新與 rollback 實機驗證；詳見 `frontend-validation-2026-09-04.md`。

## B 的外部剩餘 gate

本機 `AI_API_KEY` 已安全設定，且一次獲授權的真實 smoke 已完成並獲人工語意確認；後續呼叫仍需新的明確美元額度與呼叫次數，以及其餘 evaluation candidates 的人工標註／覆核。A 已把 Preview branch 設為 Remote，安全加入 branch-specific secret，以最新 SHA `e29fa4ad9fe20e891e21dd4e15642dc53123f9d5` 重建 [Preview](https://scamshield-f24rsyzp2-csfishy-1632s-projects.vercel.app/)；Vercel Authentication 已驗證能攔截未授權請求，Production 保持 `ANALYSIS_MODE=mock` 且無 key。Preview 合法圖片、非法 POST 完整 headers、app-level OPTIONS、usage 與實際支出停止措施尚未完成 live 驗證。Vercel project 設定、secret、保護與 runtime logs 仍由 Hobby owner A 管理。真實使用前須確認 Provider/平台保留政策；同源、CORS 或單 instance 計數不能當全站限流。
