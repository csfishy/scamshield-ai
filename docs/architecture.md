# ScamShield AI Buildmode MVP Architecture Freeze

狀態：**Frozen for Buildmode MVP**

本文件只定義三日 Hackathon 的最小可行架構。任何 Production 願景都不得自動成為本次開發範圍；若要變更 API contract，Engineer A 與 Engineer B 必須先同步確認。

## 1. MVP Architecture Decision

Buildmode MVP 採用以下技術與邊界：

- App：.NET 10 MAUI，C#／XAML
- Backend：.NET 10 ASP.NET Core Minimal API
- Transport：HTTPS `multipart/form-data` request、JSON response
- AI：Backend-only `IScamAIProvider` abstraction；本次不指定或串接真正 provider
- Persistence：無 database、無 queue、無會員資料
- Primary contract：[`POST /analyze`](api-contract.md)

MVP 只完成：

```text
Screenshot / Image
        ↓
AI Analysis
        ↓
Risk Score
        ↓
Reasons
        ↓
Recommended Actions
```

## 2. Selected Technology Stack

| Layer | Frozen choice | MVP usage |
| --- | --- | --- |
| App | .NET 10 MAUI | Image picker、preview、loading、result UI、remote／mock service |
| App language | C#／XAML | UI、state、HTTP client 與 DTO |
| Backend | ASP.NET Core Minimal API | 單一 `POST /analyze` endpoint |
| Backend language | C# | Validation、provider call、normalization、error mapping |
| AI integration | `IScamAIProvider` | 隔離 provider-specific request、prompt 與 raw response |
| Contract | Multipart + JSON | 讓 App 與 Backend 平行開發 |
| Storage | None | Request 完成後不保存原始圖片 |

本機目前已有 .NET 10 SDK，但尚未安裝 MAUI workload。workload 安裝與實際裝置工具鏈驗證屬於下一個 App Skeleton 任務，不在 Architecture Freeze 內執行。

## 3. Why This Stack

選擇順序以三日 Demo 交付速度為最高優先：

1. 既有產品文件已指出團隊以 C#／.NET 經驗為主；App 與 Backend 使用同一語言可降低切換與 Debug 成本。
2. .NET MAUI 以單一共享專案支援 Android 與 iOS，並保留日後加入 platform-specific implementation 的能力。
3. MVP 所需的單張圖片選擇、HTTP upload、loading 與結果頁不需要複雜平台擴充。
4. ASP.NET Core Minimal API 適合只含一個 endpoint 的無狀態服務，且原生支援 `multipart/form-data` file binding。
5. App 與 Backend 不共享 implementation，只共享文件化 contract，因此兩位工程師可獨立工作與替換 Mock／Remote service。
6. AI key、prompt 與 provider raw response 全部留在 Backend，避免把 provider 耦合與 secret 帶進 App。

## 4. Alternatives Considered

### App alternatives

| Option | Strength for this MVP | Cost／risk | Decision |
| --- | --- | --- | --- |
| .NET MAUI | C# 單一共享專案、可進入原生平台 API、符合現有團隊方向 | 需先安裝並驗證 MAUI／Android／iOS 工具鏈；iOS build 需要 Mac | **Selected** |
| Flutter | 單一 Dart codebase、跨平台 UI 與快速迭代能力完整 | 若團隊主要是 C#，三日內增加 Dart 與 Flutter toolchain 學習成本 | Not selected |
| React Native | JavaScript／TypeScript 生態與跨平台能力成熟 | 增加 Node 與 native build toolchain；不符合目前 C# 共用方向 | Not selected |
| Native implementation | 平台能力與 Debug 路徑最直接 | iOS／Android 需要兩套 UI、client 與人力，單一 App owner 無法在三日內穩定覆蓋 | Not selected |

### Backend alternatives

| Option | Reason not selected for the MVP |
| --- | --- |
| FastAPI／Python | 可快速整合 AI，但會增加第二套語言、DTO 與部署 runtime |
| Node.js／TypeScript | 可快速建立 endpoint，但同樣增加 runtime 與團隊切換成本 |
| ASP.NET Core controllers | 適合較大型 API；目前單一 endpoint 不需要額外 controller 結構 |

此選擇只代表 Hackathon freeze，不表示 Flutter、React Native、Native 或其他 Backend 技術不適合正式產品。

## 5. System Diagram

```text
.NET MAUI App
├─ Image Picker / Preview
├─ Loading / Error / Result UI
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

App 不直接存取 AI provider。`RemoteScamAnalysisService` 與 `MockScamAnalysisService` 必須回傳相同的 `ScamAnalysisResult`。

## 6. MVP Domain Models

### ScamAnalysisInput

MVP 只保留實際需要的欄位：

| Field | Definition |
| --- | --- |
| `source` | `image` 或 `screenshot`；未提供時為 `image` |
| `image` | 單一非空圖片 binary stream |
| `language` | 可選 BCP 47 language tag；預設 `zh-TW` |
| `metadata` | Backend 從 upload 衍生的 `fileName`、`contentType`、`sizeBytes`；不接受任意 client metadata |

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

## 7. App Responsibilities

Engineer A 擁有：

- 選擇一張 JPEG 或 PNG 圖片
- 顯示圖片 preview
- 在上傳前檢查非空檔案、格式與 10 MiB 上限
- 建立 `ScamAnalysisInput`
- 透過 `IScamAnalysisService` 啟動分析
- 顯示 loading，避免重複提交
- 解析固定的 `ScamAnalysisResult`
- 顯示 Risk、Summary、Signals 與 Recommendations
- 依 error contract 顯示 retryable／non-retryable 狀態
- 提供明確的 Remote／Demo Mode 切換

App 不負責：

- 呼叫 AI provider
- 保存 AI API key
- 撰寫或版本化 prompt
- 自行重新計算 `riskLevel`
- 猜測未知 category 或 signal

## 8. Backend Responsibilities

Engineer B 擁有：

- 實作單一 `POST /analyze`
- 驗證 multipart request、圖片格式與大小
- 建立 Backend `ScamAnalysisInput`
- 透過 `IScamAIProvider` 呼叫一個 Multimodal AI implementation
- 管理 provider credential 與 prompt
- 將 provider raw output normalize 為固定 enum 與 schema
- 由 `riskScore` 唯一推導 `riskLevel`
- 驗證回傳內容完整性
- 將 provider rate limit、timeout、無效輸出與其他失敗映射為統一 error contract
- 不永久保存 upload 或 provider raw response

MVP Backend 不建立 database、background job、message queue、會員驗證、管理後台或 Threat Intelligence pipeline。

## 9. AI Provider Boundary

概念介面：

```text
IScamAIProvider
└─ AnalyzeAsync(ScamAnalysisInput, CancellationToken)
   → ProviderAnalysis
```

```text
App
 ↓
ScamShield Backend
 ↓
IScamAIProvider
 ↓
One Multimodal AI implementation
```

此邊界確保：

- AI API key 不進入 App
- Provider 可被替換
- Prompt 集中管理
- Provider-specific output 不外洩到 App contract
- Backend 統一做 schema validation 與 normalization
- 未來可在不改 App 的情況下加入 Rule Engine 或 Threat Intelligence

Architecture Freeze 只定義介面，不選擇、安裝或呼叫真正 AI provider。MVP 實作時可以只有一個 provider adapter。

## 10. Demo Mode

```text
Plan A — RemoteScamAnalysisService → Live API
Plan B — MockScamAnalysisService → Local pre-generated result
Plan C — Recorded demo video
```

App 只需要一個簡單設定值或明確的 Demo Mode toggle 來選擇 service，不建立複雜 dependency injection framework。

重要行為：

- Backend 未完成時，Engineer A 使用 Mock service 完成完整 UI flow。
- 現場 API 異常時，可以人工切換到 Demo Mode。
- Remote 失敗時不可無提示地自動顯示 Mock 結果，避免把預存結果冒充即時分析。
- Plan C 是展示流程備援，不屬於 App runtime architecture。

## 11. Engineer A / Engineer B Boundary

| Shared dependency | Engineer A — App / UI | Engineer B — Backend / AI |
| --- | --- | --- |
| [`api-contract.md`](api-contract.md) | 依 contract 建立 DTO、Mock 與 API client | 依 contract 建立 endpoint、normalizer 與 errors |
| Request | 產生符合 contract 的 multipart request | 驗證並解析 request |
| Response | 只顯示 contract 欄位 | 只回傳 contract 欄位 |
| Errors | 依 status、code、retryable 呈現 | 將內部／provider failure 映射為 contract |
| Integration point | `RemoteScamAnalysisService` | `POST /analyze` |

平行開發規則：

1. Engineer A 先以文件中的 Mock response 完成 UI。
2. Engineer B 以相同 examples 驗證 serialization 與 error mapping。
3. 任一方不得單方面新增、改名或改型別。
4. Contract 變更必須先更新文件，再同步修改雙方 implementation。

## 12. Included Scope

- Image selection
- Image preview
- Image upload
- Multimodal AI analysis
- Risk result
- Signals
- Recommendations
- Error handling
- Demo fallback

## 13. Excluded Scope

- SMS Filter
- Android Notification Listener
- Safari Extension
- Member System
- Crowd Reporting
- Large Scam Database
- Full Threat Intelligence
- Phone reputation
- Browser extension
- OCR／QR extraction pipeline
- User history or cloud image storage
- Multiple AI providers at runtime

## 14. Hackathon Architecture vs. Future Production Architecture

### Hackathon Architecture

- 一個 MAUI App
- 一個無狀態 Minimal API
- 一個 `POST /analyze`
- 一個 AI provider adapter
- 一份固定 JSON contract
- Remote／Mock 兩種 App service
- 無 database、queue、member system 或 extension

### Future Production Architecture

正式產品可評估 Shared Scam Core、Rule Engine、OCR／QR／URL extraction、Threat Intelligence、provider routing、authentication、observability、privacy redaction、platform extensions、database 與 asynchronous processing。

以上皆為 Post-MVP evolution，不得排入三日 Buildmode 工作清單，除非本文件經團隊重新 freeze。

## 15. MVP Technical Risks

| Risk | Impact within three days | MVP mitigation |
| --- | --- | --- |
| MAUI workload／Android toolchain 尚未驗證 | Engineer A 可能在 Day 1 被環境阻塞 | App Skeleton 開始前先完成 workload、SDK、emulator／device preflight |
| iOS build 與 signing 需要可用 Mac／Xcode | 無法在現有 Windows 環境單獨產出 iOS build | 先確認 Mac owner 與 signing；缺少設備時不讓 iOS packaging 阻塞核心 Demo flow |
| AI provider latency、rate limit 或 outage | 無法達到 5–10 秒結果或 Live Demo 失敗 | 統一 429／503 mapping，並準備 Plan B／Plan C |
| Provider 回傳非預期 JSON 或 enum | App 無法解析或顯示矛盾結果 | Backend normalization、schema validation 與固定 Mock examples |
| 無會員驗證的 upload endpoint 被濫用 | 額外成本、rate limit 或服務不穩 | 限制部署暴露範圍、圖片 10 MiB 上限與基礎 request／edge rate limiting |

## 16. Post-MVP Evolution

1. 以實際 Demo 測試結果校正 taxonomy 與 risk thresholds。
2. 決定正式 AI provider、privacy policy 與 data retention。
3. 將 Rule Engine 與 extraction pipeline 加入 Backend／Shared Core。
4. 驗證 iOS 與 Android platform adapters。
5. 規劃 authentication、rate limiting、observability 與 abuse protection。
6. 再評估 SMS、Notification、Browser、URL、QR 與 Phone capabilities。

## 17. Decision References

- [.NET MAUI overview](https://learn.microsoft.com/dotnet/maui/what-is-maui)
- [.NET MAUI FilePicker](https://learn.microsoft.com/dotnet/api/microsoft.maui.storage.filepicker)
- [ASP.NET Core Minimal APIs](https://learn.microsoft.com/aspnet/core/tutorials/min-web-api)
- [Minimal API multipart file binding](https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/parameter-binding)
- [Flutter platform integration](https://docs.flutter.dev/platform-integration)
- [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment)
- [SwiftUI](https://developer.apple.com/swiftui/)
- [Jetpack Compose](https://developer.android.com/develop/ui/compose/first)
