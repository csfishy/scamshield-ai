# 跨平台 AI 防詐 App 初步計劃書

## 1. 專案目標

ScamShield AI 旨在於使用者採取高風險動作前，分析可疑數位內容並提供容易理解的風險、理由與下一步建議。產品應降低判斷詐騙所需的知識門檻，同時避免以單一訊號做出過度肯定的結論。

## 2. 核心使用情境

使用者收到可疑對話、網站、付款要求、QR Code、簡訊或通知時，可將內容交給 ScamShield AI 分析。系統回傳風險等級、可疑訊號及安全建議，協助使用者在點擊網址、提供 OTP、匯款或交付個人資料前停下確認。

## 3. 圖片／截圖防詐

圖片與截圖是第一階段主要入口。正式產品可從畫面文字、品牌冒用、異常付款要求、急迫話術、聯絡方式、URL 與 QR Code 等線索判斷風險；原始圖片的保存與傳輸應遵循最小化原則。

## 4. 文字防詐

未來可支援貼上訊息、電子郵件或社群對話文字。分析時應辨識冒充身分、利益誘惑、威脅催促、要求保密、要求提供驗證碼或導向站外聯絡等常見社交工程訊號。

## 5. URL／QR Code 防詐

正式產品可擷取圖片中的 URL 與 QR Code，檢查網域拼寫、短網址、可疑導向、非預期協定及品牌與網域是否一致。URL 訊號只能作為整體風險的一部分，不應單獨保證網站安全。

## 6. SMS／通知防詐

SMS 與系統通知屬後續能力。若平台允許，可在使用者明確授權下擷取或分享內容進行分析；若受平台限制，則提供複製、分享或截圖匯入等低摩擦替代流程。

## 7. iOS 與 Android 平台限制

iOS 與 Android 對簡訊、通知、背景執行、分享擴充及系統權限有不同限制。產品不可假設能持續讀取所有通知或訊息；架構應讓平台層只負責取得使用者授權的輸入，核心分析維持跨平台，並依各平台政策設計降級方案。

## 8. ScamAnalysisInput

`ScamAnalysisInput` 是平台輸入與分析引擎之間的標準契約。未來可包含：

- 輸入類型，例如 image、text、URL 或 QR Code
- 原始內容或受控的檔案參照
- 使用者提供的情境資訊
- 語言、地區與平台等必要 metadata
- 隱私、保留與處理同意資訊

三日 MVP 僅需支援圖片或截圖，不擴大為其他輸入類型。

## 9. Scam Engine

Scam Engine 負責協調內容擷取、規則檢查、AI 分析、風險彙整與結果正規化。它應與 UI、行動平台 API 及特定 AI provider 解耦，以便替換模型、加入平台或獨立測試。

正式產品的核心方向：

```text
Image
 ↓
OCR / QR / URL Extraction
 ↓
Rule Engine
 ↓
Multimodal AI
 ↓
Risk Aggregator
 ↓
ScamAnalysisResult
```

## 10. Rule Engine

Rule Engine 用於處理可解釋且可重現的訊號，例如可疑關鍵字、OTP 要求、急迫付款、異常網域格式或 QR Code 目的地。規則需可版本化、測試與調整權重，並避免把規則命中直接等同於詐騙定案。

## 11. Multimodal AI

Multimodal AI 綜合畫面文字、視覺脈絡、對話關係與社交工程模式，輸出結構化判斷。Prompt 應要求模型引用可觀察訊號、表達不確定性、避免虛構外部查證結果，並符合固定 JSON Schema。

## 12. ScamAnalysisResult

`ScamAnalysisResult` 應提供跨平台一致的結果：

- `riskScore`：標準化風險分數
- `riskLevel`：清楚的風險層級
- `category`：可能的詐騙類型
- `signals`：具體、可解釋的可疑訊號
- `recommendations`：安全且可執行的建議

結果應明示這是風險輔助判斷，不是安全保證或執法認定。

## 13. 跨平台架構

```text
iOS / Android / Web
          ↓
   Platform Adapter
          ↓
 ScamAnalysisInput
          ↓
      Scam Engine
          ↓
ScamAnalysisResult
```

平台層處理權限、選檔與呈現；Scam Engine 維持 platform independent；AI provider、規則與資料來源透過介面接入。正式選定 framework 前，不建立任何平台專案。

## 14. MVP 第一階段

三日 Hackathon MVP 僅驗證最小價值流程：選擇一張詐騙截圖或圖片，交由 Multimodal AI 分析，再顯示 Risk Score、Reasons 與 Recommended Actions。此階段可由單一 `/analyze` API 完成 OCR 理解與風險判斷，不要求先建成完整 Rule Engine、資料庫或威脅情報系統。

## 15. 第二階段

MVP 驗證後，可依測試結果逐步加入文字輸入、URL／QR Code 擷取、可測試的 Rule Engine、更完整的結果 schema、模型評估、使用者回饋與平台分享入口。優先順序應由真實使用情境與誤判成本決定。

## 16. Scam Intelligence Platform

長期可建立 Scam Intelligence Platform，彙整經授權且去識別化的詐騙模式、網域、話術與案例，支援規則更新、模型評估及趨勢分析。這是正式產品方向，不屬於三日 MVP。

## 17. 隱私與資安

- 僅收集完成分析所需的最少資料
- 清楚告知圖片會如何傳輸、處理與保留
- 預設不保存原始圖片；如需保存，須取得明確同意並設定期限
- 傳輸與儲存資料應加密，API key 僅存於安全的 server-side secret 管理
- Log、測試資料與分析結果應移除 OTP、帳號及個人識別資訊
- 提供刪除、退出與事件回應機制
- 對 prompt injection、惡意檔案、超大圖片、濫用及模型輸出失敗設置防護

## 18. 技術選型方向

選型應評估三日內的交付速度、圖片選取與預覽體驗、團隊熟悉度、跨平台需求、Multimodal AI 整合、部署成本、可觀測性及長期維護性。App framework、backend runtime、AI provider 與 hosting 目前均未定案；正式決策前維持技術中立。

## 正式產品架構與三日 MVP 的界線

正式架構描述可演進的完整能力；三日 MVP 只證明「圖片進、可信且可解釋的風險結果出」這項核心價值。OCR、QR／URL 擷取、Rule Engine、Risk Aggregator、跨平台整合與 Scam Intelligence Platform 不因出現在長期設計中，就自動成為本次 Hackathon scope。
