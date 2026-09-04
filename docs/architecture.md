# ScamShield AI Buildmode MVP Architecture Freeze

狀態：**Frozen for Buildmode MVP — Web/PWA revision**

本文件定義三日 Hackathon 的最小可行架構。App 與 Backend 只透過
[`POST /analyze`](api-contract.md) contract 整合；任何 breaking change 必須先重新 freeze。

## 1. MVP Architecture Decision

Buildmode MVP 採用以下技術與邊界：

- App：.NET 10 Blazor WebAssembly Progressive Web App（PWA）
- UI：Razor components、HTML、responsive CSS
- App distribution：HTTPS Web hosting；支援的手機瀏覽器可安裝至主畫面
- Backend：.NET 10 ASP.NET Core Minimal API
- Transport：HTTPS `multipart/form-data` request、JSON response
- AI：Backend-only `IScamAIProvider` abstraction；本次不指定或串接真正 provider
- Persistence：無 database、無 queue、無會員資料；App 不持久保存選取的圖片
- Primary contract：[`POST /analyze`](api-contract.md)

MVP 只完成：

```text
Mobile / Desktop Browser
        ↓
Installable ScamShield PWA
        ↓
Select Screenshot / Image
        ↓
AI Analysis
        ↓
Risk + Reasons + Recommended Actions
```

PWA 是純 Web 應用程式，不使用 .NET MAUI、XAML、Android/iOS native project、
Blazor Hybrid 或 App Store 原生封裝。

## 2. Selected Technology Stack

| Layer | Frozen choice | MVP usage |
| --- | --- | --- |
| App | .NET 10 Blazor WebAssembly PWA | Browser image picker、preview、loading、result UI、Remote／Mock service |
| UI | Razor／HTML／CSS | Responsive mobile-first Web interface |
| PWA | Web App Manifest＋Service Worker | Home-screen installation、offline application shell |
| Backend | ASP.NET Core Minimal API | 單一 `POST /analyze` endpoint |
| Backend language | C# | Validation、provider call、normalization、error mapping |
| AI integration | `IScamAIProvider` | 隔離 provider-specific request、prompt 與 raw response |
| Contract | Multipart + JSON | 讓 App 與 Backend 平行開發 |
| Storage | None | Request 完成後不保存原始圖片 |

本機只需要 .NET 10 SDK 即可建置 Web/PWA App，不需要 MAUI workload、Android SDK、
Xcode、emulator 或 mobile signing toolchain。

## 3. Why This Stack

選擇順序以三日 Demo 交付速度與手機可用性為優先：

1. 純 Web/PWA 符合產品目前的 distribution 需求：同一 URL 支援 desktop 與 mobile。
2. 支援的 mobile browser 可將 PWA 安裝到主畫面，不需要 App Store build/signing。
3. C#／.NET 仍可同時用於 Blazor client 與 ASP.NET Core Backend，降低語言切換成本。
4. Browser `InputFile` 足以完成單張圖片選擇、preview 與 upload，不需要 native API。
5. Service Worker 可快取 application shell；Remote analysis 仍明確依賴網路。
6. API key、prompt 與 provider raw response 全部留在 Backend，不進入可下載的 PWA bundle。

## 4. Alternatives Considered

| Option | Strength for this MVP | Cost／risk | Decision |
| --- | --- | --- | --- |
| Blazor WebAssembly PWA | 純 Web、C#、responsive、可安裝、無 mobile build toolchain | 首次載入含 WebAssembly；browser 必須支援 PWA；跨 origin API 需要 CORS | **Selected** |
| .NET MAUI | 原生 Android／iOS，平台能力完整 | 需要 MAUI workload、Android SDK、Mac/Xcode 與原生發佈流程；不是純 Web/PWA | Not selected |
| React／Vue PWA | Web 生態成熟、bundle 可較小 | 增加 JavaScript／TypeScript framework 與另一套 model/client implementation | Not selected |
| Native implementation | 平台整合最直接 | 需要兩套 App 與發佈流程，不適合三日 MVP | Not selected |

## 5. System Diagram

```text
.NET 10 Blazor WebAssembly PWA
├─ Browser Image Picker / Preview
├─ Loading / Error / Result UI
├─ Web App Manifest / Service Worker
└─ IScamAnalysisService
   ├─ RemoteScamAnalysisService ── HTTPS POST /analyze ─┐
   └─ MockScamAnalysisService                          │
                                                       ▼
                                           ASP.NET Core Minimal API
                                           ├─ Request Validation
                                           ├─ IScamAIProvider
                                           │  └─ Multimodal AI
                                           ├─ Result Normalization
                                           └─ ScamAnalysisResult JSON
```

App 不直接存取 AI provider。Remote 與 Mock service 必須回傳相同的
`ScamAnalysisResult`。

## 6. MVP Domain Models

### ScamAnalysisInput

| Field | Definition |
| --- | --- |
| `source` | `image` 或 `screenshot`；PWA MVP 使用 `screenshot` |
| `image` | 使用者明確選擇的一個 JPEG 或 PNG browser file stream |
| `language` | 可選 BCP 47 language tag；PWA MVP 使用 `zh-TW` |
| `metadata` | Backend 從 upload 衍生的 `fileName`、`contentType`、`sizeBytes` |

不在 MVP model 預先加入 text、URL、QR、SMS 或 Notification 欄位。

### ScamAnalysisResult

固定包含：

- `riskScore`
- `riskLevel`
- `category`
- `summary`
- `signals[]`
- `recommendations[]`

欄位、enum 與 validation 規則以 [`api-contract.md`](api-contract.md) 為唯一實作依據。

## 7. PWA App Responsibilities

Engineer A 擁有：

- Responsive desktop／mobile Web UI
- PWA manifest、icons 與 production service worker
- 由 browser picker 選擇一張 JPEG 或 PNG 圖片
- 顯示本機圖片 preview
- 上傳前檢查非空檔案、signature／extension 與 10 MiB 上限
- 透過 `IScamAnalysisService` 啟動分析
- 顯示 loading 並避免重複提交
- 解析固定 `ScamAnalysisResult`
- 顯示 Risk、Summary、Signals 與 Recommendations
- 依 error contract 顯示 retryable／non-retryable 狀態
- 提供明確的 Remote／Demo Mode 設定與 UI 標示
- 不將使用者圖片寫入 local storage、IndexedDB 或 service-worker cache

App 不負責：

- 呼叫 AI provider或保存 AI API key
- 撰寫或版本化 prompt
- 自行重新計算 `riskLevel`
- 猜測未知 category 或 signal
- 背景讀取手機相簿、簡訊或其他 App 內容

## 8. Backend Responsibilities

Engineer B 擁有：

- 實作單一 `POST /analyze`
- 驗證 multipart request、圖片格式與大小
- 透過 `IScamAIProvider` 呼叫一個 Multimodal AI implementation
- 管理 provider credential 與 prompt
- 將 provider output normalize 為固定 enum 與 schema
- 由 `riskScore` 唯一推導 `riskLevel`
- 將失敗映射為統一 error contract
- 不永久保存 upload 或 provider raw response
- 允許實際 PWA origin 的 CORS request

MVP Backend 不建立 database、background job、message queue、會員驗證、管理後台或
Threat Intelligence pipeline。

## 9. Browser and Network Boundary

PWA 與 Backend 分開部署時受 browser security model 約束：

1. PWA 與 API production endpoints 都必須使用 HTTPS，避免 mixed-content blocking。
2. Backend 必須設定精確的 allowed PWA origin；不以任意 `*` origin 搭配 credentials。
3. 手機上的 `localhost` 指向手機，不是開發者電腦；實機測試需使用可達 LAN 或 HTTPS URL。
4. PWA service worker 只快取 application shell 與靜態 assets，不快取 `POST /analyze`。
5. Remote failure 不可靜默切換 Mock，避免將預存結果冒充即時分析。
6. App bundle 中不得包含 AI provider secret。

## 10. Demo Mode

```text
Plan A — RemoteScamAnalysisService → Live API
Plan B — MockScamAnalysisService → Local pre-generated result
Plan C — Recorded demo video
```

- 預設 `wwwroot/appsettings.json` 使用明確的 Mock mode。
- 操作者可在部署前將 `AnalysisMode` 改為 `Remote` 並設定 `ApiBaseUrl`。
- 畫面永遠標示目前 Mode。
- Offline application shell 不代表 Remote AI 可以離線執行。

## 11. Engineer A / Engineer B Boundary

| Shared dependency | Engineer A — Web/PWA | Engineer B — Backend / AI |
| --- | --- | --- |
| [`api-contract.md`](api-contract.md) | 依 contract 建立 DTO、Mock 與 API client | 依 contract 建立 endpoint、normalizer 與 errors |
| Request | 產生符合 contract 的 browser multipart request | 驗證並解析 request |
| Response | 只顯示 contract 欄位 | 只回傳 contract 欄位 |
| Errors | 依 status、code、retryable 呈現 | 將 internal/provider failure 映射為 contract |
| Browser boundary | 提供實際 PWA origin | 設定 HTTPS 與 CORS |
| Integration point | `RemoteScamAnalysisService` | `POST /analyze` |

任一方不得單方面新增、刪除、改名或改型別。Contract 變更必須先更新文件。

## 12. Included Scope

- Responsive Web UI
- Installable PWA metadata and offline application shell
- Single image selection and preview
- Image upload
- Risk result, signals and recommendations
- Error handling and manual retry
- Demo/Mock mode
- Remote API client skeleton

## 13. Excluded Scope

- .NET MAUI、native Android／iOS package、Blazor Hybrid
- SMS Filter、Android Notification Listener、Safari Extension
- Camera capture、background photo access、multiple image selection
- Authentication、history、database、crowd reporting
- OCR／QR extraction pipeline、URL scanner
- Threat Intelligence、phone reputation、browser extension
- Real AI provider implementation

## 14. Hackathon vs. Future Architecture

### Hackathon Architecture

- 一個 standalone Blazor WebAssembly PWA
- 一個無狀態 Minimal API
- 一個 `POST /analyze`
- 一個 AI provider adapter
- 一份固定 JSON contract
- Remote／Mock 兩種 service
- 無 database、queue、member system 或 native extension

### Future Production Architecture

正式產品可評估 Server-side rendering、shared .NET contracts、Web Push、OCR／QR／URL
extraction、Threat Intelligence、authentication、observability、privacy redaction、database、
platform-specific native extensions 與 asynchronous processing。

## 15. MVP Technical Risks

| Risk | Impact | MVP mitigation |
| --- | --- | --- |
| WebAssembly first-load size | 手機首次開啟較慢 | Publish compression、保持依賴最小、預先暖機 Demo 裝置 |
| PWA install UX 因 browser／OS 不同 | 評審裝置可能看不到一致 install prompt | Demo 以 URL 為主，主畫面安裝為加值流程 |
| CORS／HTTPS／mixed content | Remote API 在 browser 被封鎖 | 整合前確認 allowed origin、HTTPS 與實機可達 URL |
| Service worker cache 舊版 | Demo 可能載入舊 assets | Deploy versioned build，Demo 前重新載入並驗證版本 |
| AI latency、rate limit 或 outage | Live Demo 無法取得結果 | 統一 429／503 mapping，保留 Mock／recorded fallback |
| Provider schema 異常 | App 無法解析 | Backend normalization 與固定 contract checks |

## 16. Post-MVP Evolution

1. 以實際 Demo 測試校正 taxonomy 與 risk thresholds。
2. 決定 hosting、正式 AI provider、privacy policy 與 retention。
3. 將 CORS、rate limiting、observability 與 abuse protection productionize。
4. 評估 Web Share Target、camera capture 與 Web Push 的 browser coverage。
5. 再評估需要 native capability 的 SMS、Notification、Safari Extension 等功能。

## 17. Decision References

- [Blazor WebAssembly](https://learn.microsoft.com/aspnet/core/blazor/hosting-models#blazor-webassembly)
- [ASP.NET Core Blazor PWA](https://learn.microsoft.com/aspnet/core/blazor/progressive-web-app)
- [Blazor file uploads](https://learn.microsoft.com/aspnet/core/blazor/file-uploads)
- [ASP.NET Core CORS](https://learn.microsoft.com/aspnet/core/security/cors)
- [ASP.NET Core Minimal APIs](https://learn.microsoft.com/aspnet/core/tutorials/min-web-api)
