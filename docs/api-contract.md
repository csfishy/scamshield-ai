# ScamShield AI Buildmode MVP API Contract

狀態：**Frozen for Buildmode MVP**

本文件是 Engineer A 與 Engineer B 的共同 contract。App 不需要知道 Backend implementation；Backend 不可以要求文件未定義的 App 行為。

## 1. Protocol Conventions

- Base URL：由 App 的 `API_BASE_URL` 設定提供
- Transport：HTTPS
- Request：`multipart/form-data`
- Success 與已處理的 error response：`application/json; charset=utf-8`
- JSON naming：camelCase
- Enum values：case-sensitive lower snake_case；不得自行新增未定義值
- 所有定義為 required 的 JSON properties 都必須出現且不可為 `null`
- JSON arrays：永遠回傳 array，不回傳 `null`
- JSON property order：無語意；App 不得依賴欄位順序
- C# PascalCase properties 必須序列化為 camelCase，例如 `RiskScore` → `riskScore`
- Member authentication：不在 MVP scope
- Breaking change：必須先更新並重新 freeze 本文件

## 2. Endpoint

```http
POST /analyze
```

此 endpoint 分析一張 screenshot 或 image，並回傳一個完整 `ScamAnalysisResult`。

## 3. Request

### Content type

```http
Content-Type: multipart/form-data; boundary=...
```

### Form fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `image` | Binary file | Yes | 單一、非空；`image/jpeg` 或 `image/png`；最大 10 MiB（10,485,760 bytes） |
| `source` | String | No | `image` 或 `screenshot`；預設 `image` |
| `language` | String | No | BCP 47 language tag；預設 `zh-TW` |

MVP 不接受 base64 JSON image，也不接受 text、URL、QR、SMS、Notification 或任意 metadata fields。

### Request validation rules

Backend 必須在呼叫 AI Provider 前依下列規則完成驗證，且不可只信任檔名或 multipart `Content-Type`：

1. Request 必須是有效的 `multipart/form-data`，且恰好包含一個名為 `image` 的 file part。缺少、重複或結構無效時回傳 `400 invalid_request`。
2. `source` 最多出現一次。省略時使用 `image`；提供時必須精確為 lowercase `image` 或 `screenshot`，否則回傳 `400 invalid_request`。
3. `language` 最多出現一次。省略時使用 `zh-TW`；提供時 trim 後必須為非空且格式正確的 BCP 47 language tag，否則回傳 `400 invalid_request`。
4. 不接受本文件未定義的其他 form fields；出現時回傳 `400 invalid_request`。
5. `image` 長度為 0 bytes 時回傳 `400 invalid_image`；超過 10 MiB 時回傳 `413 image_too_large`。
6. File part 必須宣告 `image/jpeg` 或 `image/png`。缺少或使用其他 MIME type 時回傳 `415 unsupported_image_format`。MIME type 比對不區分大小寫，並忽略合法的 media type parameters。
7. Backend 必須檢查 binary signature 並實際 decode 圖片。無法辨識或 decode 時回傳 `400 invalid_image`。
8. 偵測到的實際格式必須與宣告的 MIME type 一致，不一致時回傳 `415 unsupported_image_format`。
9. Filename 不作為格式或安全性的唯一依據。若有副檔名，只允許 `.jpg`、`.jpeg`、`.png`（不區分大小寫），且必須與實際格式一致；不支援或不一致時回傳 `415 unsupported_image_format`。Filename 或副檔名可省略。

任一 validation failure 都不得呼叫 AI Provider，也不得回傳部分分析結果。

### Example request

```bash
curl -X POST "${API_BASE_URL}/analyze" \
  -F "image=@screenshot.png;type=image/png" \
  -F "source=screenshot" \
  -F "language=zh-TW"
```

### ScamAnalysisInput

Backend 驗證 request 後建立以下 domain model：

| Field | Type | Description |
| --- | --- | --- |
| `source` | `SourceType` | `image` 或 `screenshot` |
| `image` | Binary stream | 圖片內容；不轉成公開 URL |
| `language` | String | 要求輸出語言，預設 `zh-TW` |
| `metadata.fileName` | String | 從 multipart upload 衍生 |
| `metadata.contentType` | String | 經 Backend 驗證後的 MIME type |
| `metadata.sizeBytes` | Integer | 經 Backend 計算的 byte length |

`metadata` 由 Backend 建立，不信任同名 client input。

## 4. HTTP 200 Success Response

```json
{
  "riskScore": 91,
  "riskLevel": "high",
  "category": "fake_customer_service",
  "summary": "疑似假冒客服的詐騙內容",
  "signals": [
    {
      "type": "off_platform_contact",
      "severity": "high",
      "reason": "要求加入私人 LINE 進行後續操作"
    }
  ],
  "recommendations": [
    "不要加入訊息提供的 LINE",
    "不要提供 OTP 或金融資訊"
  ]
}
```

Backend 必須在回傳前完成 normalization 與 schema validation，不得把 AI provider raw response 直接透傳給 App。

## 5. ScamAnalysisResult

| JSON property | Type | Required | Nullable | Rules |
| --- | --- | --- | --- | --- |
| `riskScore` | Integer | Yes | No | `0`–`100`，包含邊界；不可為小數或 numeric string |
| `riskLevel` | `RiskLevel` string | Yes | No | 必須依 `riskScore` mapping 產生 |
| `category` | `ScamCategory` string | Yes | No | 固定 MVP enum |
| `summary` | String | Yes | No | trim 後非空、可直接顯示的簡短摘要 |
| `signals` | Array of `ScamSignal` | Yes | No | 沒有 signal 時必須為 `[]`；array elements 不可為 `null` |
| `recommendations` | Array of String | Yes | No | 1–5 個可直接顯示的安全建議；每個字串 trim 後非空 |

Success response 的六個 properties 全部 required 且不得為 `null`。App 必須使用 Backend 回傳的 `riskLevel` 顯示狀態，不得自行用不同 threshold 重新計算；Backend 是 `riskLevel` 的唯一 source of truth。

## 6. Enum Definitions

### SourceType

| Value | Meaning |
| --- | --- |
| `image` | 一般圖片或來源未知 |
| `screenshot` | 明確為螢幕截圖 |

### RiskLevel

| Value | `riskScore` range |
| --- | --- |
| `low` | `0`–`29` |
| `medium` | `30`–`69` |
| `high` | `70`–`100` |

Backend 必須由 `riskScore` 唯一推導 `riskLevel`。Hackathon contract 刻意不加入第四個 `suspicious` level，避免 App 與 Backend 解讀不一致。

### ScamCategory

| Value | Meaning |
| --- | --- |
| `none` | 未觀察到明確詐騙類型，通常搭配 low risk |
| `phishing` | 可疑連結、仿冒登入或資料竊取 |
| `fake_customer_service` | 假客服、假物流或假金流處理 |
| `investment_scam` | 投資、獲利或資金投入話術 |
| `impersonation` | 冒充政府、銀行、親友、品牌或其他身分 |
| `account_theft` | OTP、密碼或帳號控制權竊取 |
| `other` | 已辨識風險，但不屬於 MVP taxonomy |
| `unknown` | 證據不足，無法可靠分類 |

MVP 不新增更細的 taxonomy。`other` 與 `unknown` 讓 Backend 不需要虛構類別。

### SignalSeverity

```text
low
medium
high
```

### SignalType

```text
suspicious_link
off_platform_contact
credential_request
payment_request
urgency_or_threat
guaranteed_return
impersonation_claim
inconsistent_identity
other
```

App 應優先顯示 `reason`；`type` 用於穩定識別訊號，不應由 App 改寫成新的風險判斷。

## 7. ScamSignal

| JSON property | Type | Required | Nullable | Rules |
| --- | --- | --- | --- | --- |
| `type` | `SignalType` string | Yes | No | 固定 MVP enum |
| `severity` | `SignalSeverity` string | Yes | No | `low`、`medium` 或 `high` |
| `reason` | String | Yes | No | trim 後非空、具體、可直接顯示；不得宣稱未實際完成的外部查證 |

Example：

```json
{
  "type": "credential_request",
  "severity": "high",
  "reason": "訊息要求提供 OTP 驗證碼"
}
```

## 8. Error Response Shape

所有已處理的 HTTP errors 使用同一 schema：

```json
{
  "error": {
    "code": "unsupported_image_format",
    "message": "Only JPEG and PNG images are supported.",
    "retryable": false
  }
}
```

Error envelope 規則：

| JSON property | Type | Required | Nullable | Rules |
| --- | --- | --- | --- | --- |
| `error` | Object | Yes | No | 唯一 top-level error envelope |
| `error.code` | String | Yes | No | 固定、machine-readable lower snake_case；App logic 的主要依據 |
| `error.message` | String | Yes | No | trim 後非空、可向使用者顯示且 debug-safe；App 不得依文字內容做 logic |
| `error.retryable` | Boolean | Yes | No | 表示可否向使用者提供 Retry action |

缺少 `image` 的 canonical response：

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Image is required.",
    "retryable": false
  }
}
```

| HTTP | `error.code` | Meaning | `retryable` |
| --- | --- | --- | --- |
| `400` | `invalid_request` | 缺少／重複 image、multipart 結構、`source`、`language` 或額外欄位無效 | `false` |
| `400` | `invalid_image` | 圖片為空、signature 無效或無法 decode | `false` |
| `413` | `image_too_large` | 圖片超過 10 MiB | `false` |
| `415` | `unsupported_image_format` | MIME type／副檔名不支援，或與實際 JPEG／PNG 格式不一致 | `false` |
| `429` | `provider_rate_limit` | AI Provider rate limit | `true` |
| `500` | `analysis_failed` | Provider output 經 validation／normalization／internal repair 後仍不符合 public schema，或發生未分類分析失敗 | `false` |
| `503` | `provider_unavailable` | AI provider timeout 或暫時無法使用 | `true` |

App 可依 `error.code` 決定呈現與流程，並應將 HTTP status 視為 transport-level 分類；不得解析 `message` 文字做條件判斷。Backend 必須讓 status 與 code 符合上表。Backend 不可把 Provider 名稱、credential、stack trace、raw response、內部 prompt 或 exception detail 放進 error message。`429` 若可取得等待時間，應加上標準 `Retry-After` header。

Backend 必須在可產生 HTTP response 時，將上表所列的 endpoint／framework failures（包含 request-size rejection）轉成相同 JSON envelope。DNS、TLS、連線中斷、client cancellation，或 Backend 外部 proxy 產生且無法由 endpoint 控制的 non-JSON response 屬於 transport failure；App 必須以 generic connection／service error 處理，不可假設所有失敗都有可解析的 `error.code`。

App 對 upload POST 不做無提示的自動重試；`retryable: true` 時顯示 Retry action，由使用者決定是否重新送出。

## 9. AI Boundary and Provider Normalization

Public request／response contract 的資料流固定為：

```text
App
→ ScamShield API
→ IScamAIProvider
→ AI Provider
```

App 不得直接呼叫 AI Provider、依賴 Provider-specific fields，或解析 Provider raw JSON。Backend 必須：

1. 驗證 Provider output 的 required fields、types、nullability、array rules 與 integer range。
2. 將 Provider labels 映射到本文件定義的 public enums；Provider-specific enum 不得進入 public response。
3. 將無法精確分類的 category 映射為 `other` 或 `unknown`，將未列入 taxonomy 的 signal type 映射為 `other`。
4. 依 `riskScore` 重新產生唯一一致的 `riskLevel`。
5. 可在 Backend 內部進行 deterministic normalization 或 schema repair，但不得改變 public schema。
6. 若最終仍無法產生完整有效的 `ScamAnalysisResult`，回傳 `500 analysis_failed`，不得回傳 Provider raw response 或部分結果。

## 10. Example Normal Case

```json
{
  "riskScore": 8,
  "riskLevel": "low",
  "category": "none",
  "summary": "未觀察到明確的詐騙訊號",
  "signals": [],
  "recommendations": [
    "若後續出現付款或提供敏感資料的要求，請再次確認對方身分"
  ]
}
```

## 11. Example High-Risk Case

```json
{
  "riskScore": 91,
  "riskLevel": "high",
  "category": "fake_customer_service",
  "summary": "疑似假冒客服並要求轉移至私人聯絡管道",
  "signals": [
    {
      "type": "off_platform_contact",
      "severity": "high",
      "reason": "要求加入私人 LINE 進行後續操作"
    },
    {
      "type": "credential_request",
      "severity": "high",
      "reason": "要求提供 OTP 或金融驗證資訊"
    }
  ],
  "recommendations": [
    "不要加入訊息提供的 LINE",
    "不要提供 OTP、密碼或金融資訊",
    "使用品牌官方網站上的聯絡方式自行查證"
  ]
}
```

## 12. Mock Response for Engineer A

`MockScamAnalysisService` 使用以下固定資料完成 image → loading → result flow：

```json
{
  "riskScore": 88,
  "riskLevel": "high",
  "category": "phishing",
  "summary": "訊息以包裹配送失敗為由，要求立即開啟可疑連結付款",
  "signals": [
    {
      "type": "suspicious_link",
      "severity": "high",
      "reason": "網址與訊息宣稱的物流品牌不一致"
    },
    {
      "type": "urgency_or_threat",
      "severity": "medium",
      "reason": "訊息要求在短時間內完成補繳費用"
    },
    {
      "type": "payment_request",
      "severity": "high",
      "reason": "要求透過訊息內連結支付額外費用"
    }
  ],
  "recommendations": [
    "不要開啟訊息中的連結",
    "不要輸入信用卡或個人資料",
    "直接前往物流公司官方網站查詢包裹"
  ]
}
```

此 response 必須走與 Remote response 相同的 App DTO 與 Result UI，不建立另一套 Demo-only UI model。

## 13. Demo Fallback Contract

概念介面：

```text
IScamAnalysisService
└─ AnalyzeAsync(ScamAnalysisInput, CancellationToken)
   → ScamAnalysisResult
```

- `RemoteScamAnalysisService`：依本文件呼叫 `POST /analyze`。
- `MockScamAnalysisService`：回傳第 12 節固定 response。
- App 以簡單設定或明確 toggle 選擇 service。
- Remote 失敗不可靜默改用 Mock；切換 Demo Mode 必須可被操作者辨識。
- Recorded demo 屬 Plan C，不改變 API contract。

## 14. Timeout and Cancellation

- App 可以取消進行中的 HTTP request，例如使用者離開頁面或明確按下取消。
- Backend 應監聽 request cancellation，並在可行時將 cancellation 傳遞給 `IScamAIProvider`，停止不再需要的工作。
- Backend 必須設定有限的 Provider timeout；實際秒數屬部署設定，不是 public API contract。
- Client 已中斷連線時，Backend 不需要產生 response。
- Client 仍連線而 Provider timeout 或暫時不可用時，Backend 回傳 `503 provider_unavailable`。
- Backend 不得回傳 partial `ScamAnalysisResult`。
- App 不自動重送圖片；收到 `retryable: true` 時由使用者決定是否 Retry。

## 15. API Versioning Decision

Buildmode MVP 維持 `POST /analyze`，不改為 `/api/v1/analyze`。目前只有一個受同一份 frozen contract 約束的 App client；增加 URL versioning 不會解除三日並行開發的任何阻塞。若 Post-MVP 必須導入 breaking change，再另行定義 versioning 與 migration，不得直接改變目前 endpoint 的語意。

## 16. Security and Exposure

- 只接受 HTTPS，並在進入 Provider 前執行 10 MiB image part 上限與格式驗證。
- 不得將 image binary、base64 image、完整圖片內容或 Provider raw response 寫入 application log。
- 不得將 API key、Token、credential、stack trace、internal prompt 或 exception detail 放入任何 response。
- 原始 upload 不永久保存；若實作需要暫存，request 結束後必須清除。
- Filename 是不受信任的 metadata，不得直接作為 filesystem path 使用。
- MVP 無 member authentication；不得因此在 public response 或 client bundle 中放置 Provider secret。

## 17. Contract Change Rules

1. Engineer A 不自行增加或假設 public response field。
2. Engineer B 不自行新增、刪除、改名或改變 public field type／nullability。
3. 所有 contract change 必須先更新 `docs/api-contract.md`，再修改 implementation。
4. 任何 enum value 或 score-to-level mapping 變更都需要 Engineer A 與 Engineer B 明確同意。
5. Backend 必須向後兼容目前 App contract，直到 A/B 已同步修改並共同切換。
6. Provider-specific schema、field、enum 或 error 不可進入 public API。
7. Mock JSON 必須與 production schema 使用相同 models；不得新增 mock-only field。

## 18. Contract Acceptance Checklist

### Engineer A

- 可只靠本文件建立 request DTO／multipart client。
- 可解析所有 success enums 與 arrays。
- 可用 normal、high-risk 與 mock examples 完成 UI。
- 可處理六種 HTTP error status。
- 可只依 `error.code` 與 `retryable` 完成 error handling，不解析 message。
- 可取消 request，且不依賴 JSON property order。
- 不自行重算 risk level 或呼叫 AI provider。

### Engineer B

- 可只靠本文件建立 endpoint 與 validation。
- 可明確處理缺少／空白／過大／不支援／宣告與實際格式不一致的圖片。
- 可將 provider output normalize 為固定 enum。
- 可確保 arrays 非 `null`、score 與 level 一致。
- 可輸出所有 example shape。
- 可將 provider failure 映射為統一 error schema。
- 可處理 request cancellation、Provider timeout 與無法修復的 Provider schema。
