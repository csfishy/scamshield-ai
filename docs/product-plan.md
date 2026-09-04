# Web/PWA AI 防詐 App 初步計劃書

團隊討論版｜產品定位、技術架構與 MVP 規劃

## 一、專案目標

開發一套以 Web 為核心、可由手機瀏覽器安裝成 PWA 的 AI 防詐 App，協助使用者在點擊網址、匯款、提供 OTP 或個人資料之前，先完成一層快速風險檢查。

- 提供詐騙風險分數與風險等級
- 清楚列出可疑原因，而不是只給出「是／不是詐騙」
- 辨識常見詐騙類型與社交工程手法
- 提供使用者下一步安全建議
- 逐步建立可跨平台、可擴充的 Scam Intelligence 平台

第一階段不追求完全攔截所有詐騙，而是先驗證「使用者願不願意把可疑內容交給 App 分析」以及「分析結果是否足以改變高風險操作行為」。

## 二、核心使用情境

**1. 圖片／截圖防詐**

使用者可先儲存 LINE、Messenger、Instagram、Threads、Email、Safari 或其他 App 中的可疑圖片或截圖，再從 ScamShield Web/PWA 的檔案選擇器提交分析。

- OCR 文字辨識
- QR Code 與 Barcode 辨識
- URL、電話與 Email 擷取
- 品牌名稱與官方網域比對
- 金融資訊、OTP、匯款與帳戶要求辨識
- 緊急、恐嚇、催促與冒名情境辨識
- Multimodal AI 進行整張圖片與上下文分析

**2. 文字防詐**

使用者可分享聊天文字、簡訊內容或手動貼上文字，系統判斷假客服、假投資、冒充親友、感情詐騙、政府或銀行冒名等情境。

**3. URL／QR Code 防詐**

- 檢查 Domain 格式與品牌是否一致
- 判斷短網址、可疑 TLD、仿冒網域與拼字近似
- 解析 QR Code 真正目的網址
- 未來串接惡意網址與 Threat Intelligence 資料庫

**4. SMS 與通知防詐**

iOS 可利用 Message Filter Extension 處理可支援的 SMS 情境；Android 則可在使用者授權下進一步使用 Notification Listener 分析部分通知內容。兩平台能力不同，因此核心產品不可依賴「一定能讀取所有通知」。

## 三、平台限制與產品策略

**Web/PWA（MVP）**

- 同一套 Responsive Web UI 支援桌面與手機瀏覽器
- 使用瀏覽器圖片選擇器取得使用者主動選取的內容
- 支援的瀏覽器可將網站安裝到主畫面，提供接近 App 的啟動體驗
- 不依賴 App Store／Play Store，也不包含原生 Share Extension、SMS Filter 或 Notification Listener
- PWA 安裝、service worker 與離線 shell 在正式環境需要 HTTPS；實際分析仍需網路連線至 Backend

**原生平台能力（Post-MVP）**

- iOS／Android 分享入口、SMS Filter 或 Notification Listener 視驗證結果另行開發
- 核心 API contract 與分析結果模型保持平台無關，未來可供原生 extension 或其他 client 重用

## 四、核心架構原則

最重要的設計原則：AI 防詐核心不得依賴特定前端平台。Web/PWA 只負責取得使用者選擇的圖片、呼叫 Backend，再顯示標準化結果。

建議資料流：

```text
Web/PWA 圖片輸入 → POST /analyze → Backend Scam Engine → Multimodal AI → ScamAnalysisResult
```

如此未來增加原生 App、Browser Extension、LINE Bot 或第三方 SDK 時，不需要重新設計 AI 核心。

## 五、標準輸入模型 ScamAnalysisInput

- Source：Image、Screenshot、SharedText、URL、QRCode、SMS、Notification、WebPage、ManualInput
- Raw Text／OCR Text
- URLs／QR Codes
- Phone Numbers／Email Addresses
- Claimed Brand
- Image Data 或 Image Reference
- Language
- Platform Metadata

## 六、AI 防詐分析流程

整體建議採多層判斷，不以單一大型語言模型決定結果。

```text
輸入 → 正規化 → OCR／QR／URL Extraction → Local Rule Engine → Threat Intelligence → AI Scam Classifier → Multimodal AI → Risk Aggregator → 結果
```

**第一層：裝置端分析**

- OCR、QR Code、URL、電話等基礎擷取
- 基本關鍵字與本地規則
- 可疑品牌與網域初步比對
- 低風險內容盡可能在裝置端完成，降低隱私風險與 API 成本

**第二層：Rule Engine**

規則引擎提供可解釋且快速的基礎分數，例如 OTP、網銀密碼、私人 LINE、官方網域不一致、保證獲利、緊急匯款等訊號。規則只作為特徵來源，不單獨取代 AI 判斷。

**第三層：AI 語意分析**

- 詐騙類型分類
- 對話與上下文理解
- 假客服、假政府、假銀行與冒充親友情境辨識
- 投資、交友、社交工程與帳號盜用話術辨識

**第四層：Multimodal AI**

針對截圖或圖片理解 UI、文字、Logo、網址、QR Code 與整體情境，可用於辨識假交易平台、假公文、假客服聊天截圖、假銀行頁面與投資獲利截圖等。

## 七、風險結果 ScamAnalysisResult

- Risk Score：0–100
- Risk Level：Low／Medium／Suspicious／High
- Category：Phishing、Fake Customer Service、Investment Scam、Romance Scam、Government Impersonation、Bank Impersonation、Account Theft、Fake Shopping、Unknown
- Signals：列出具體可疑原因
- Recommendations：提供下一步安全建議

產品顯示重點不是單純「詐騙機率 92%」，而是讓使用者知道為什麼可疑、哪些行為不能做、如何透過官方管道查證。

## 八、跨平台技術架構

**Web/PWA App**

- .NET 10 Blazor WebAssembly
- Razor／HTML／CSS Responsive UI
- Browser `InputFile` 圖片選擇與 client-side preview
- Web app manifest 與 service worker
- Mock／Remote analysis service abstraction
- Contract-aligned models 與 JSON serialization

**Backend**

- .NET 10 ASP.NET Core Minimal API
- Scam Analysis API
- Multimodal AI Gateway
- Request validation
- Provider abstraction
- Result normalization 與 error mapping

Database、queue、會員系統、OCR、QR、Threat Intelligence 與原生 platform adapter 均不在三日 MVP 內。

## 九、技術選型建議

**目前建議**

第一階段已選定 `.NET 10 Blazor WebAssembly PWA`。它以單一 Web codebase 提供桌面與手機 responsive UI，並讓支援的瀏覽器安裝至主畫面。Backend 維持 `.NET 10 ASP.NET Core Minimal API`，前後端共用已凍結的 JSON contract。

.NET MAUI、Kotlin Multiplatform 與原生 iOS／Android client 不屬於本次 MVP；若日後需要 Share Extension 或 Notification Listener，再依實際平台需求評估。

## 十、建議的抽象介面

- ITextRecognizer
- IQRCodeScanner
- IShareReceiver
- INotificationReader
- IScamAnalyzer
- IThreatIntelligenceService
- IRiskCalculator

核心程式只依賴介面，不直接依賴 UIKit、Android SDK、Vision 或 ML Kit。平台層可自由替換實作。

## 十一、MVP 第一階段

第一版只聚焦「透過 Web/PWA 選取圖片／截圖進行防詐分析」，同一套介面支援桌面與手機瀏覽器。

流程：

```text
選取圖片 → Web/PWA preview → POST /analyze → Multimodal AI Analysis → Risk Score → 可疑原因＋安全建議
```

**MVP 必要功能**

- JPEG／PNG 圖片選擇、驗證與 preview
- Responsive Web/PWA UI
- `/analyze` multipart request
- Cloud Multimodal AI 分析
- 統一的風險結果頁、loading、error 與 retry
- Mock mode，確保 Demo 不受 Backend 或網路狀態影響

**MVP 暫不納入**

- 原生 iOS／Android App 與分享入口
- OCR、QR Code／URL Extraction 與 Rule Engine
- 全面通知監控
- 完整電話 Reputation
- 大型群眾回報平台
- 複雜會員與社交功能
- 完整瀏覽器即時攔截
- 自建大型 Threat Intelligence Database

## 十二、第二階段

- 純文字分享
- URL／QR Code 單獨分析
- OCR 與 Rule Engine
- 原生 iOS／Android 分享入口
- iOS Message Filter
- Android Notification Listener
- 官方品牌 Domain Database
- 已知詐騙網址資料庫
- 使用者回報機制

## 十三、第三階段：Scam Intelligence Platform

- 電話 Reputation
- URL／Domain Reputation
- 詐騙話術與樣板資料庫
- 即時詐騙趨勢與新型詐騙警示
- 匿名群眾回報與模式統計
- 第三方 API／SDK
- Browser Extension、原生 App、Windows、LINE Bot 等入口

## 十四、隱私與資安原則

- 可在瀏覽器完成的檔案類型與大小驗證優先留在 client 端
- 不預設永久儲存使用者原始截圖
- 送往 Cloud AI 前評估遮罩姓名、電話、Email、身分證、信用卡與其他個資
- 分析資料設定明確保存期限與刪除政策
- API 傳輸全程加密，後端服務採最小權限設計
- 使用者應清楚知道選取的圖片會送往 Backend 與 AI Provider
- AI 分析結果定位為風險輔助判斷，不宣稱百分之百正確

## 十五、MVP 驗證指標

- 分享圖片到取得結果所需時間
- 圖片選擇與 API request 成功率
- AI 能否正確指出可疑訊號
- 高風險案例漏判率與正常案例誤判率
- 使用者是否理解結果與建議
- 使用者看到警告後是否停止點擊、匯款或提供敏感資訊
- 單次分析平均 Cloud AI 成本

## 十六、初步開發順序

1. 凍結 `/analyze` API contract 與 `ScamAnalysisResult`
2. 建立 Blazor WebAssembly PWA skeleton
3. 完成圖片選擇、validation、preview 與 responsive UI
4. 完成 Mock／Remote analysis service
5. Backend 實作 `/analyze` 與 provider abstraction
6. 串接 Multimodal AI Provider
7. 進行前後端 integration 與 error mapping 測試
8. 建立 Demo 案例集與誤判分析流程
9. 部署 HTTPS Web/PWA 並進行桌面、iOS、Android 瀏覽器驗證

## 十七、團隊第一輪需要決策的問題

- 第一版技術路線已決定採 .NET 10 Blazor WebAssembly PWA。
- Cloud AI 使用哪一個 Multimodal Provider？是否需保留 Provider Abstraction？
- 第一版 Risk Score 如何定義與校正？
- 哪些資料允許送到 Cloud？哪些必須留在 Device？
- MVP 測試案例與 Ground Truth 從哪裡建立？
- 產品是否先鎖定台灣繁體中文詐騙情境？
- 第一階段成功的 Go／No-Go 指標為何？

## 十八、目前建議結論

第一版以「Web/PWA 圖片／截圖防詐」作為 MVP。技術上採 Blazor WebAssembly PWA + ASP.NET Core Minimal API + Cloud Multimodal AI 的最小架構，先把圖片提交、`ScamAnalysisResult`、錯誤處理與 AI Gateway 串接穩定。

這樣可用單一 Web codebase 快速驗證產品價值，讓手機透過 PWA 使用，同時保留原生分享入口、主動通知預警、瀏覽器擴充與第三方 SDK 的後續發展空間。
