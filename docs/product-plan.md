# 跨平台 AI 防詐 App 初步計劃書

團隊討論版｜產品定位、技術架構與 MVP 規劃

## 一、專案目標

開發一套可同時支援 iOS 與 Android 的 AI 防詐 App，協助使用者在點擊網址、掃描 QR Code、匯款、提供 OTP 或個人資料之前，先完成一層快速風險檢查。

- 提供詐騙風險分數與風險等級
- 清楚列出可疑原因，而不是只給出「是／不是詐騙」
- 辨識常見詐騙類型與社交工程手法
- 提供使用者下一步安全建議
- 逐步建立可跨平台、可擴充的 Scam Intelligence 平台

第一階段不追求完全攔截所有詐騙，而是先驗證「使用者願不願意把可疑內容交給 App 分析」以及「分析結果是否足以改變高風險操作行為」。

## 二、核心使用情境

**1. 圖片／截圖防詐**

使用者可從 LINE、Messenger、Instagram、Threads、Email、Safari 或其他 App 分享圖片或截圖到防詐 App。

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

**iOS**

- 一般第三方 App 無法任意讀取其他 App 的 Push Notification
- 主要入口以 Share Extension、圖片／文字分享、URL 分享、SMS Message Filter 與未來 Safari Extension 為主
- 不可把產品核心建立在背景監控所有 App 推播內容上

**Android**

- 可在使用者授權下使用 NotificationListenerService 取得部分通知資料
- 不同 App 暴露的 notification 內容不同，不能保證取得完整聊天或圖片
- Android 可提供比 iOS 更主動的提醒能力，但仍應使用相同 Scam Engine

## 四、核心架構原則

最重要的設計原則：AI 防詐核心不得依賴 iOS 或 Android。平台層只負責取得資料、轉成標準格式，再交給共用防詐引擎。

建議資料流：

```text
平台入口 → OCR／QR／URL 擷取 → ScamAnalysisInput → Scam Engine → Cloud AI／Threat Intelligence → ScamAnalysisResult
```

如此未來增加 Web、Windows、Browser Extension、LINE Bot 或第三方 SDK 時，不需要重新設計 AI 核心。

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

**Core／Shared**

- Models
- Scam Engine
- Rule Engine
- Risk Calculator
- URL Analyzer
- AI Client
- Cache／Local Database
- Shared Business Logic

**iOS**

- Main App
- Share Extension
- Message Filter Extension
- 未來 Safari Extension
- OCR／QR Platform Adapter

**Android**

- Main App
- Share Intent Receiver
- Notification Listener
- OCR／QR Platform Adapter

**Backend**

- Scam Analysis API
- Multimodal AI Gateway
- Threat Intelligence
- Domain／Phone Reputation
- Scam Knowledge Base
- Model 與規則版本管理

## 九、技術選型建議

**方案 A：.NET／C# 為主**

以 .NET 共用 Scam.Core，Main App 可評估 .NET MAUI，平台特殊功能則使用 iOS／Android platform-specific implementation。適合既有 .NET 團隊快速開始。

**方案 B：Kotlin Multiplatform**

以 Kotlin Multiplatform 共用 Domain Model、Networking、Storage 與 Scam Logic；iOS 使用 Swift／SwiftUI，Android 使用 Kotlin／Compose。平台原生整合較自然，但初期學習成本較高。

**目前建議**

若團隊規模不大、既有開發經驗以 C#／.NET 為主，第一階段建議採「.NET 共用核心 + Platform Adapter」路線；但 iOS Extension 與 Android Notification Listener 等 OS 特殊能力不要硬塞進共用層。

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

第一版只聚焦「圖片／截圖分享防詐」，同時支援 iOS 與 Android。

流程：

```text
其他 App 分享圖片 → 防詐 App → OCR → URL／QR 擷取 → Rule Engine → AI Analysis → Risk Score → 可疑原因＋安全建議
```

**MVP 必要功能**

- iOS 與 Android 圖片分享入口
- OCR 中文文字辨識
- QR Code／URL 擷取
- 基本 Scam Rule Engine
- Cloud AI 或 Multimodal AI 分析
- 統一的風險結果頁
- 基本匿名事件紀錄，用於評估分析成功率與使用流程

**MVP 暫不納入**

- 全面通知監控
- 完整電話 Reputation
- 大型群眾回報平台
- 複雜會員與社交功能
- 完整瀏覽器即時攔截
- 自建大型 Threat Intelligence Database

## 十二、第二階段

- 純文字分享
- URL／QR Code 單獨分析
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
- Browser Extension、Web、Windows、LINE Bot 等入口

## 十四、隱私與資安原則

- OCR 與可在本機完成的預處理優先留在裝置端
- 不預設永久儲存使用者原始截圖
- 送往 Cloud AI 前評估遮罩姓名、電話、Email、身分證、信用卡與其他個資
- 分析資料設定明確保存期限與刪除政策
- API 傳輸全程加密，後端服務採最小權限設計
- 使用者應清楚知道哪些資料會離開裝置
- AI 分析結果定位為風險輔助判斷，不宣稱百分之百正確

## 十五、MVP 驗證指標

- 分享圖片到取得結果所需時間
- OCR 成功率
- AI 能否正確指出可疑訊號
- 高風險案例漏判率與正常案例誤判率
- 使用者是否理解結果與建議
- 使用者看到警告後是否停止點擊、匯款或提供敏感資訊
- 單次分析平均 Cloud AI 成本

## 十六、初步開發順序

1. 建立 ScamAnalysisInput／ScamAnalysisResult Domain Model
2. 建立 Scam.Core 與 Platform Adapter 介面
3. 完成 iOS／Android 圖片分享入口
4. 導入 OCR、QR 與 URL Extraction
5. 建立第一版 Rule Engine
6. 串接 Multimodal AI API
7. 完成統一 Risk Result UI
8. 建立測試案例集與誤判分析流程
9. 小規模內部測試後再決定 SMS／Notification 第二階段範圍

## 十七、團隊第一輪需要決策的問題

- 第一版技術路線採 .NET MAUI／C# 還是 Kotlin Multiplatform？
- OCR 是否統一使用跨平台方案，或各平台使用原生最佳方案？
- Cloud AI 使用哪一個 Multimodal Provider？是否需保留 Provider Abstraction？
- 第一版 Risk Score 如何定義與校正？
- 哪些資料允許送到 Cloud？哪些必須留在 Device？
- MVP 測試案例與 Ground Truth 從哪裡建立？
- 產品是否先鎖定台灣繁體中文詐騙情境？
- 第一階段成功的 Go／No-Go 指標為何？

## 十八、目前建議結論

第一版建議以「跨平台圖片／截圖防詐」作為 MVP。技術上採 Shared Scam Core + Platform Adapter + Cloud Multimodal AI 的架構，先把 ScamAnalysisInput／Result、Rule Engine 與 AI Gateway 定義穩定。iOS 與 Android 只負責各自最適合的資料入口與平台能力。

這樣可以在不被 iOS 通知限制綁死的前提下快速驗證產品價值，同時保留 Android 主動通知預警、瀏覽器擴充、Web 與第三方 SDK 的後續發展空間。
