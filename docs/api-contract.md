# ScamShield AI Buildmode MVP API Contract

狀態：**Frozen for Buildmode MVP**

本文件是 Engineer A 與 Engineer B 的共同 contract。App 不需要知道 Backend implementation；Backend 不可以要求文件未定義的 App 行為。

## 1. Protocol Conventions

- Base URL：由 App 的 `API_BASE_URL` 設定提供
- Transport：HTTPS
- Request：`multipart/form-data`
- Success response：`application/json; charset=utf-8`
- JSON naming：camelCase
- Enum values：case-sensitive lower snake_case；不得自行新增未定義值
- JSON arrays：永遠回傳 array，不回傳 `null`
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

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `riskScore` | Integer | Yes | `0`–`100`，包含邊界 |
| `riskLevel` | `RiskLevel` | Yes | 必須依 `riskScore` mapping 產生 |
| `category` | `ScamCategory` | Yes | 固定 MVP enum |
| `summary` | String | Yes | 非空、可直接顯示的簡短摘要 |
| `signals` | `ScamSignal[]` | Yes | 可為空 array，不得為 `null` |
| `recommendations` | `String[]` | Yes | 1–5 個可直接顯示的安全建議，不得為 `null` |

App 必須使用 `riskLevel` 顯示狀態，不得自行用不同 threshold 重新計算。

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

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | `SignalType` | Yes | 固定 MVP enum |
| `severity` | `SignalSeverity` | Yes | `low`、`medium` 或 `high` |
| `reason` | String | Yes | 非空、具體、可直接顯示；不得宣稱未實際完成的外部查證 |

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

| HTTP | `error.code` | Meaning | `retryable` |
| --- | --- | --- | --- |
| `400` | `invalid_request` | `source`、`language` 或 multipart request 結構無效 | `false` |
| `400` | `invalid_image` | 缺少 image、空檔案或無法解碼 | `false` |
| `413` | `image_too_large` | 圖片超過 10 MiB | `false` |
| `415` | `unsupported_image_format` | MIME type 不是 JPEG 或 PNG | `false` |
| `429` | `provider_rate_limited` | AI provider rate limit | `true` |
| `500` | `analysis_failed` | Provider output 無法 normalize 或未分類的分析失敗 | `false` |
| `503` | `provider_unavailable` | AI provider timeout 或暫時無法使用 | `true` |

Backend 不可把 provider 名稱、credential、stack trace、raw response 或內部 prompt 放進 error message。`429` 若可取得等待時間，應加上標準 `Retry-After` header。

App 對 upload POST 不做無提示的自動重試；`retryable: true` 時顯示 Retry action，由使用者決定是否重新送出。

## 9. Example Normal Case

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

## 10. Example High-Risk Case

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

## 11. Mock Response for Engineer A

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

## 12. Demo Fallback Contract

概念介面：

```text
IScamAnalysisService
└─ AnalyzeAsync(ScamAnalysisInput, CancellationToken)
   → ScamAnalysisResult
```

- `RemoteScamAnalysisService`：依本文件呼叫 `POST /analyze`。
- `MockScamAnalysisService`：回傳第 11 節固定 response。
- App 以簡單設定或明確 toggle 選擇 service。
- Remote 失敗不可靜默改用 Mock；切換 Demo Mode 必須可被操作者辨識。
- Recorded demo 屬 Plan C，不改變 API contract。

## 13. Contract Acceptance Checklist

### Engineer A

- 可只靠本文件建立 request DTO／multipart client。
- 可解析所有 success enums 與 arrays。
- 可用 normal、high-risk 與 mock examples 完成 UI。
- 可處理六種 HTTP error status。
- 不自行重算 risk level 或呼叫 AI provider。

### Engineer B

- 可只靠本文件建立 endpoint 與 validation。
- 可將 provider output normalize 為固定 enum。
- 可確保 arrays 非 `null`、score 與 level 一致。
- 可輸出所有 example shape。
- 可將 provider failure 映射為統一 error schema。
