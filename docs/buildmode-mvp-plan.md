# Buildmode AI 防詐 MVP－三日人員分工與開發計劃

4 人團隊｜2 位程式設計師＋產品行銷＋企劃包裝

## 一、MVP 目標

三天內完成一個可在 Buildmode 現場穩定 Demo 的 AI 防詐 MVP。核心體驗只保留一條主流程：

```text
可疑截圖／圖片 → AI 分析 → 顯示風險分數 → 說明可疑原因 → 提供下一步安全建議。
```

成功標準：

- 一張圖片可真正交給 AI 分析。
- 5–10 秒內可取得結果。
- 結果包含 Risk Score、Risk Level、Category、Signals、Recommendations。
- 正常案例與詐騙案例能形成明顯對照。
- 3 分鐘內讓第一次看到專案的人理解產品價值。

## 二、三天內明確不做

- SMS Filter。
- Android Notification Listener。
- Safari Extension。
- 完整會員系統。
- 大型詐騙資料庫。
- 群眾回報平台。
- 完整 Threat Intelligence。
- 複雜後台。
- 非必要登入流程。

原則：任何不影響 Demo 主流程的功能，都延後。

## 三、人員分工

### 程式設計師 A－App／UI Owner

主要責任：確保 Demo App 主流程順暢，即使後端尚未完成，也能先用 Mock Data 跑完整流程。

- Day 1：建立 App、圖片選擇、預覽、Loading、Result Screen、Mock JSON。
- Day 2：串接真實 API、改善結果頁、錯誤處理、Retry、Demo Mode。
- Day 3：只做 Bug Fix、穩定性、效能與現場備援。
- 交付物：可操作 App、結果頁、Demo Mode、備援結果。

### 程式設計師 B－AI／Backend Owner

主要責任：讓 AI 對預先準備的 Demo 案例穩定輸出合理結果。

- Day 1：建立 POST /analyze、Multimodal AI 串接、固定 JSON Schema、第一版 Prompt。
- Day 2：使用 10–20 張測試圖片校正 Prompt，加入少量 Rule Engine，降低 Demo 誤判。
- Day 3：鎖定版本、處理 timeout／API exception、準備本機預存結果。
- 交付物：AI API、Prompt、JSON Result、測試案例結果、Fallback Data。

### 產品行銷－Problem／Value／Pitch Owner

主要責任：讓評審快速理解「為什麼這個產品值得存在」。

- Day 1：整理 Problem、Target User、Value Proposition、競品差異。
- Day 2：完成 3 分鐘 Pitch Story 與商業延伸方向。
- Day 3：Pitch rehearsal、回答可能的評審問題。

核心訊息：真正正在被騙的人，往往不知道自己正在被騙；產品的價值是在使用者點擊、輸入 OTP 或匯款之前，多提供一次低摩擦的風險確認。

### 企劃包裝－Demo Producer／Presentation Owner

主要責任：讓產品被看懂、被記住，而且現場不翻車。

- Day 1：準備 Demo Script、UI 文案、3 組核心情境與測試圖片。
- Day 2：完成簡報、Demo Story、畫面包裝、正常／詐騙對照案例。
- Day 3：控制 Demo 節奏、現場素材、備援影片與展示順序。
- 交付物：簡報、Demo Script、測試圖片、30 秒備援錄影。

## 四、Day 1－把產品跑起來

上午前 60–90 分鐘，全員只做一次 Scope Freeze：

- Input：圖片。
- Output：Risk Score、Category、Signals、Recommendations。
- 確認 API Schema 後立即分頭作業，不再新增需求。

中午前目標：

- 工程師 A：Mock Data 可跑完整 App Flow。
- 工程師 B：至少一張圖片可透過 AI API 回傳 JSON。
- 產品行銷：完成一句 Pitch 與 Problem Statement。
- 企劃包裝：完成 3 個 Demo Case。

下午目標：

- App 與 API 第一次整合。

Day 1 Definition of Done：

至少有一張圖片可以真正從 App 送進 AI，並在 Result Screen 顯示分析結果。

## 五、Day 2－準確度與展示品質

**程式設計師 A：**

- 優化 Result UI、Loading、錯誤處理、Retry、Demo Mode。
- 時間足夠再處理 Share Sheet，不列為阻塞項目。

**程式設計師 B：**

建立簡單 Test Matrix：

- 5 張正常內容。
- 5 張 phishing。
- 5 張假客服。
- 5 張投資詐騙。
- 確認 Demo 主案例穩定回傳預期風險等級。

**產品行銷：**

- 完成 Pitch：Problem → Solution → Demo → Technology → Vision。

**企劃包裝：**

- 完成簡報、Demo Case 視覺與主持流程。

**Feature Freeze：**

Day 2 下午 17:00 後，禁止增加核心功能，只允許修 Bug、提高穩定度與改善 Demo 體驗。

## 六、Day 3－Demo Day

原則：第三天不再做產品開發，只處理穩定性。

上午：

- 完整 rehearsal。
- 計時。
- 確認 API latency。
- 確認手機／網路／帳號。
- 確認三組 Demo Case。
- 確認備援流程。

Demo 主流程控制在 60–90 秒：

```text
收到可疑圖片 → 選擇圖片 → AI 分析 → 顯示高風險 → 指出可疑訊號 → 顯示安全建議。
```

## 七、三分鐘 Pitch 建議

**0:00–0:30 Problem**

詐騙資訊很多，但正在被騙的人通常不會意識到自己需要查證。

**0:30–1:40 Live Demo**

Screenshot → AI → Risk → Why → Action。

**1:40–2:20 Technology**

Multimodal AI + Rule Engine + 未來 Threat Intelligence。

**2:20–3:00 Vision**

- Today：Screenshot Scam Detection。
- Next：SMS、Android Notification、Browser、URL、QR、Phone。
- 長期方向：Scam Intelligence Platform。

## 八、Demo 案例

**Case 1－假物流**

- 內容：包裹配送失敗、要求立即補繳小額費用、提供可疑網址。
- 預期：High Risk。

**Case 2－假客服**

- 內容：訂單／金流設定錯誤、要求加入私人 LINE、要求提供金融資料。
- 預期：High Risk，並解釋官方客服通常不應透過私人 LINE 處理金融驗證。

**Case 3－正常訊息**

- 內容：一般朋友聊天或正常購物訊息。
- 預期：Low Risk。
- 目的：證明不是所有圖片都被判為詐騙。

## 九、Demo 備援

- Plan A：Live API。
- Plan B：App 內預存分析結果。
- Plan C：30 秒預先錄製 Demo 影片。

備援的目的是避免現場網路或 API 異常，不用來冒充即時 AI 能力。

## 十、團隊每日同步方式

每天最多三次短同步：

- 09:00：今天最重要的交付。
- 14:00：整合狀態與阻塞。
- 20:00：Demo 主流程是否仍可完整執行。

每次 10–15 分鐘，禁止開長會。

任何新需求必須回答：

- 它是否直接提升 3 分鐘 Demo？
- 如果不是，就進入 Post-MVP Backlog。

## 十一、最終 Go／No-Go Checklist

- App 可以選擇一張圖片。
- AI API 可以正常回傳。
- JSON Schema 固定且 App 能解析。
- 至少三組 Demo Case 穩定。
- Risk／Reason／Action 三者都能呈現。
- 斷網或 API 失敗時有 fallback。
- 簡報完成。
- Demo Script 完成。
- 至少完成三次全流程 rehearsal。
- 現場展示控制在時間內。

## 十二、團隊共識

三天的目標不是完成一個完整防詐產品，而是完成一個「足以證明產品價值」的 MVP。

判斷每個工作是否值得做的唯一問題：

> 「這件事情會不會讓評審更容易相信，這個產品真的能在使用者被騙之前多提供一次有效的安全提醒？」

若答案是否定的，就延後到 Buildmode Demo 之後。
