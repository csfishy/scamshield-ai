# Engineer A 前端整合驗證（2026-09-04）

## 範圍與基準

- Branch：`codex/backend-handoff`
- 起始 HEAD：`b9d2ce1974c4dcf0f5be444a0904247d3bfaf03b`
- Contract：沿用 `docs/api-contract.md` v2；未修改 shared schema、Backend、Provider 或 Vercel 設定。
- Runtime：Node.js `v24.19.0`；依既有 `package-lock.json` 執行 `npm ci`，0 vulnerabilities。
- Demo：直接引用 `fixtures/demo/index.ts`，畫面明確顯示「示範資料，未分析此圖片」。
- Remote browser tests：只在 Playwright 攔截同源 `/analyze`，沒有加入 public debug 參數、production stub 或真實 AI 呼叫。

## 自動化結果

| 檢查                               | 結果                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| Prettier（本次變更檔）             | 通過                                                      |
| TypeScript `tsc --noEmit`          | 通過                                                      |
| ESLint                             | 通過，0 errors／0 warnings                                |
| Vitest unit／contract／integration | 8 files、83 tests 全部通過                                |
| Next.js 16.3.4 production build    | 通過；`/` 與 `/analyze` 均為 dynamic route                |
| Browser bundle secret scan         | 33 files；0 server-only markers；prompt／sharp trace 正常 |
| Playwright Mock production flow    | 7 tests 全部通過                                          |
| Playwright controlled Remote flow  | 3 tests全部通過                                           |

Playwright 已驗證：選圖／預覽、Demo loading/result/reset、無效圖片後復原、分析中換圖與 generation guard、取消、平台 HTML 503 不假成功、手動重試、422 不提供同圖重試、320px 無水平溢位、390×844 結果 focus／可達性、PWA assets 與 `/analyze` 排除快取。負向 422／503 請求會產生 Chromium 預期的 non-2xx resource console 訊息；除此之外沒有 console 或 page error。

## 視覺檢查

- 1440×900（full page）：`C:\Users\csFishy\.codex\visualizations\2026\09\01\01a05c02-6042-7b52-a0ef-787495c850b9\scamshield-next-desktop.png`
- 390×844（full page）：`C:\Users\csFishy\.codex\visualizations\2026\09\01\01a05c02-6042-7b52-a0ef-787495c850b9\scamshield-next-mobile.png`

兩者均確認標題、模式告知、上傳控制、Demo 情境、結果空狀態與頁尾提醒無重疊或水平溢位。首次 service worker 安裝不顯示更新提示；只有已有 controller 的升級情境才提示使用者在目前操作結束後重新載入。

## PWA 與尚未完成 gate

程式已保留 `/service-worker.js`，啟用版本化 Next.js worker，並只刪除本應用已知的 `offline-cache-*`、`scamshield-static-*`、`scamshield-document-*`。Worker 僅快取明確靜態資產、root document 與離線頁；不攔截或快取 `POST /analyze`、上傳圖片或分析結果。

下列項目本次**未驗證／未完成**：

- 真實 iOS Safari／Android Chrome 的安裝、關閉重開、安全區與更新流程。
- 同一 Production origin 上已安裝舊 Blazor PWA 的真實遷移、多分頁與 rollback 演練。
- Vercel Preview／Production runtime、Deployment Protection、平台 413／timeout 與正式網址 smoke。
- 真實 AI 憑證、額度、Provider usage、人工標註／holdout 評估與資料保留政策。

以上仍分別依 A 實機 gate、B 的真實 AI／部署收尾與產品決策處理；本機 Demo 通過不代表 Remote 或 AI 品質完成。
