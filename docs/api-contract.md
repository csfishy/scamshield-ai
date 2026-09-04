# ScamShield AI API Contract

- Contract revision：**v2 — Next.js／Vercel migration**
- 日期：2026-09-04
- 狀態：v2 已由新 B Backend／shared schema 實作；A 正式 Client 待整合。舊 Blazor 仍為 v1，尚未同步
- Owners：Engineer A／Engineer B
- 配套：[SDD](sdd.md)、[測試計畫](test-plan.md)

## 1. 相容性與文件規則

v2 保留 `POST /analyze` 與六欄成功結果。與既有 v1 的差異：

| 項目 | v1（現有 client 參考） | v2（待實作） |
| --- | --- | --- |
| 圖片大小 | 10 MiB | 4 MiB（4,194,304 bytes） |
| 整體 body／尺寸／文字上限 | 未完整定義 | 本文件明確定義 |
| 無法取得分析證據 | 無獨立回應 | 422 insufficient_evidence |
| HTTP 方法 | 僅定義 POST | 非 POST 回 405 與 Allow: POST |
| 語意驗證 | none 通常搭配 low | none 僅允許 low；Client 拒絕矛盾組合 |
| Client／Backend 實作語言 | C#／規劃 C# | TypeScript／Next.js |
| Mock | 固定假物流樣本 | 明確選擇正常／假物流／假客服 fixtures |

revision 是文件版本，不是 URL 版本。未來若要服務獨立第三方 client，
另行定義 API versioning。本次新前後端共同在新 Preview 驗證後整組切換；
不得把舊 Blazor v1 宣稱為符合 v2。舊規格可從遷移前 Git revision 查閱。

public contract 變更先修本文件，再改 schema、fixtures、client、API 與測試。
A／B 在同一交付變更中確認，禁止單方面加欄、改型別或改 score mapping。

## 2. Protocol

- Production／Preview 使用 HTTPS，Next.js 前端同源呼叫相對路徑 `/analyze`。
- Request：`multipart/form-data`；瀏覽器產生 boundary，不手動覆寫 Content-Type。
- Success／應用程式可控制的 error：`application/json; charset=utf-8`。
- 所有 API responses：`Cache-Control: no-store`。
- JSON 欄位為 camelCase；enum 是大小寫敏感的 lower snake_case。
- 必填屬性不可省略、不可 null；arrays 不能是 null，也不能包含 null。
- 未列出的 JSON 屬性一律拒絕，包括巢狀物件。
- Number 是 JSON 整數，不接受小數或 numeric string。
- property order 無意義；不得解析 message 文案來決定程式流程。
- 不使用會員驗證；部署保護可能先於應用程式攔截請求。
- Server 可回 `X-Request-Id` 供支援查詢；由 Server 產生，不信任 Client 提供值。
- 未知錯誤或 non-JSON response 的 fallback 見第 8 節。

## 3. Endpoint 與 request

`POST /analyze` 分析恰好一張圖片。其他方法在應用程式可控範圍回
405 invalid_request，附 `Allow: POST`；HEAD 依 HTTP 語意不回 response body。
同源部署不要求額外跨域 preflight 支援。

| Form field | 型別 | 必填 | 規則 |
| --- | --- | --- | --- |
| image | Binary file | 是 | 一個、非空，JPEG／PNG，最大 4 MiB |
| source | String | 否 | 精確為 image／screenshot；省略預設 image |
| language | String | 否 | trim 後有效 BCP 47 tag；省略預設 zh-TW |

前端第一版固定送 `source=screenshot`、`language=zh-TW`。
MVP 品質驗收以 zh-TW 為準；接受其他有效 tag 不代表已有多語系品質保證。
Provider 無法符合所要求語言且無有效輸出時回 analysis_failed，不悄悄改語言。

不接受 image URL、base64 JSON、text、QR、SMS、client metadata 或其他欄位。
source、language 必須是文字 part，不能用 file part 代替。

### 3.1 大小與資源限制

| 項目 | 上限（包含邊界） |
| --- | --- |
| image binary | 4,194,304 bytes |
| 完整 multipart body | 4,300,000 bytes，含 boundary／headers／fields |
| 解碼寬、高 | 每邊 12,000 pixels |
| 解碼總像素 | 24,000,000 pixels |
| source | 10 UTF-8 bytes |
| language（原始文字 part） | 64 UTF-8 bytes |
| filename | 255 UTF-8 bytes，允許省略 |
| 圖片 frames | 恰好 1；不接受動畫／多 frame |

pixel count 為 width × height；width／height 必須為正整數。
檔案／body／像素超限使用 413 image_too_large。
source／language／filename 長度或欄位結構錯誤使用 400 invalid_request。
動畫／多 frame 使用 415 unsupported_image_format。

4 MiB 是應用層選擇，留出 multipart 空間；Vercel Functions 的平台 payload
上限是 4.5 MB，平台攔截可能不回本 contract JSON。
[官方限制](https://vercel.com/docs/functions/limitations)

### 3.2 驗證順序

1. HTTP method、頂層媒體類型、body 上限。頂層不是合法 multipart 回 400 invalid_request。
2. 表單完整性：恰好一個 image file；重複／未知欄位、額外 file part、
   source／language 重複或型別錯誤均回 400 invalid_request。
3. source／language／filename 長度、值與預設；空白 language 不等於省略。
4. image 非空與大小；空檔回 400 invalid_image，過大回 413。
5. image MIME 必須為 image/jpeg 或 image/png；比對忽略大小寫與合法參數。
   缺少／不支援 MIME 回 415。
6. 檢查 binary signature；無法辨識回 400 invalid_image。
7. 實際格式須與 MIME 一致；若有副檔名只允許 .jpg／.jpeg／.png（忽略大小寫），
   且須符合格式；不一致回 415。無 filename／副檔名可接受。
8. 檢查尺寸、frame count，並實際完整 decode；壞檔回 400 invalid_image。
9. 校正方向、去除 metadata 後再編碼；再次檢查圖片大小／尺寸，超限回 413。

同時有多個錯誤時，以最先完成且失敗的驗證為準；已知總 body 超限可先拒絕，
不用完整解析。任何第 1–9 步失敗均不得呼叫 AI。
Client 檢查不取代 Server 驗證。不得只根據 filename、MIME 或 signature 判定檔案有效。

### 3.3 Request example

```bash
curl -X POST "${API_BASE_URL}/analyze" \
  -F "image=@screenshot.png;type=image/png" \
  -F "source=screenshot" \
  -F "language=zh-TW"
```

API_BASE_URL 僅為此命令的 shell 變數；目標瀏覽器不需要跨域 API URL 設定。

## 4. Success schema

HTTP 200 必須恰好包含以下六個 properties：

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| riskScore | integer | 0–100 |
| riskLevel | string enum | 必須符合第 5 節 score mapping |
| category | string enum | 第 5 節 taxonomy |
| summary | string | trim 後 1–300 Unicode code points |
| signals | array of ScamSignal | 0–10 個 |
| recommendations | array of string | 1–5 個；每個 trim 後 1–300 Unicode code points |

ScamSignal 必須恰好包含：

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| type | string enum | 第 5 節 SignalType |
| severity | string enum | low／medium／high |
| reason | string | trim 後 1–300 Unicode code points；有具體圖片依據 |

Server 回傳 trim 後字串。文字長度以 Unicode code points 計，
不是 UTF-8 bytes，也不是 JavaScript UTF-16 code units。
Client schema 對錯誤／矛盾結果採拒絕，不改寫評分或猜測 enum。

riskScore 是風險指標，不是校準過的詐騙機率。low 不代表官方查證或安全保證。
理由不可宣稱未執行的網站探測、官方資料庫命中或真偽確認。

## 5. Enums 與風險語意

| RiskLevel | riskScore |
| --- | --- |
| low | 0–29 |
| medium | 30–69 |
| high | 70–100 |

Backend 是 level 的唯一產生者；Client 可驗證一致性，但不能修正矛盾 response。

| ScamCategory | 定義 |
| --- | --- |
| none | 有足夠可讀內容，未觀察到明確詐騙類型；僅允許 low |
| phishing | 可疑連結、仿冒登入或資料竊取 |
| fake_customer_service | 假客服、假物流或假金流處理 |
| investment_scam | 投資／獲利／資金投入話術 |
| impersonation | 冒充政府、銀行、親友、品牌等身分 |
| account_theft | OTP、密碼或帳號控制權竊取 |
| other | 有可辨識風險，但不屬於其他分類 |
| unknown | 內容足以評估風險，但不足以可靠判定類型 |

none 若與 medium／high 組合視為無效，Server 不得輸出；
其他 category 不建立額外的分數硬限制。

SignalSeverity：`low`、`medium`、`high`。

SignalType：

- suspicious_link
- off_platform_contact
- credential_request
- payment_request
- urgency_or_threat
- guaranteed_return
- impersonation_claim
- inconsistent_identity
- other

## 6. 正常／高風險 examples

正常樣本：

```json
{
  "riskScore": 8,
  "riskLevel": "low",
  "category": "none",
  "summary": "目前可讀內容未觀察到明確詐騙訊號",
  "signals": [],
  "recommendations": [
    "若後續出現付款或提供敏感資料的要求，請透過官方管道再次確認"
  ]
}
```

高風險樣本：

```json
{
  "riskScore": 91,
  "riskLevel": "high",
  "category": "fake_customer_service",
  "summary": "疑似假冒客服，要求轉移聯絡管道並提供驗證碼",
  "signals": [
    {
      "type": "off_platform_contact",
      "severity": "medium",
      "reason": "訊息要求加入私人 LINE 繼續處理訂單"
    },
    {
      "type": "credential_request",
      "severity": "high",
      "reason": "訊息要求提供 OTP 驗證碼"
    }
  ],
  "recommendations": [
    "不要提供 OTP、密碼或金融資訊",
    "自行從品牌官方網站取得聯絡方式並查證"
  ]
}
```

examples 用於 schema／UI，不代表真實圖片評估結果或準確率。

## 7. 證據不足與拒絕分析

有效圖片若不可辨讀、內容與風險評估無關、缺少必要上下文，
或 Provider 明確拒絕分析，回 HTTP 422：

```json
{
  "error": {
    "code": "insufficient_evidence",
    "message": "目前圖片資訊不足，請提供文字清楚且包含完整上下文的截圖。",
    "retryable": false
  }
}
```

不能回成功＋0 分／50 分替代。不可辨讀和 unknown 不同：
unknown 是「可評估風險，無法可靠分類」；422 是「無法形成有效風險評估」。
retryable=false 代表不鼓勵重送同圖；使用者仍能選擇新圖。

Provider raw output 無法解析或 schema 損壞是 500，不是 422；
正常聊天若足以閱讀，應能回低風險，不因沒有詐騙訊號就回 422。

## 8. Error contract 與 transport fallback

Error 必須恰好為 `{"error":{"code":...,"message":...,"retryable":...}}`。
code 為下表 enum；message 為 trim 後 1–300 Unicode code points，
只含可顯示訊息；retryable 必須是 boolean 並符合下表。

| HTTP | code | 條件 | retryable |
| --- | --- | --- | --- |
| 400 | invalid_request | 缺少／重複／額外欄位、multipart 或文字欄位無效 | false |
| 400 | invalid_image | 空檔、signature 無效、損壞或無法 decode | false |
| 405 | invalid_request | 非 POST；另回 Allow: POST | false |
| 413 | image_too_large | 圖片 bytes、完整 body、單邊尺寸或總像素超限 | false |
| 415 | unsupported_image_format | MIME／副檔名／實際格式不一致、不支援或多 frame | false |
| 422 | insufficient_evidence | 有效圖片但無法形成分析；含明確 Provider refusal | false |
| 429 | provider_rate_limit | Provider 限流 | true |
| 500 | analysis_failed | Provider schema 無效、normalization 失敗或未分類錯誤 | false |
| 503 | provider_unavailable | Provider／API timeout、暫時服務或配置無法使用 | true |

Server 可取得等待時間時，429 附 `Retry-After`；Client 支援合法秒數或 HTTP-date，
無效 header 採一般「稍後再試」。同一 error code 的 message 可以改文案，
Client 不可用字串比對做邏輯。

所有 error 禁止包含 key、stack trace、Provider 原文、內部 prompt 或 exception detail。
App 必須同時檢查 status、schema 與 code/retryable 對應，矛盾回應視為 invalid response。

### 平台與網路例外

DNS／TLS／取消／斷線、Vercel body limit、部署存取保護、WAF／平台限流、
Function timeout 可能在 Handler 之外發生，不能保證 JSON 或 X-Request-Id。

| 無有效 contract 的情況 | Client 行為 |
| --- | --- |
| 413 | 圖片／請求過大，換圖，不重試原圖 |
| 429 | 服務忙碌，讀取合法 Retry-After，允許稍後手動重試 |
| 502／503／504、網路失敗／Client timeout | 暫時無法連線／服務不可用，允許手動重試 |
| 401／403 | 無權存取此部署，提示操作者確認存取，不循環重送 |
| 其他 non-2xx、2xx schema 無效、HTML／redirect login | 通用服務／資料格式錯誤，不當作分析成功 |

已處理的應用程式錯誤使用表列 contract；平台產生的 429 不冒稱
已收到 provider_rate_limit JSON。Client 不對 upload POST 自動重試。

## 9. Provider normalization 與取消

Backend 的中立 adapter、評分 rubric 與 deadline 詳見 [SDD](sdd.md)。
必須驗證 required fields、型別、null、長度、enum、arrays 與整數範圍；
只允許有依據的 deterministic cleanup。由 score 重新產生 level，
不可把 Provider raw response 直接傳給 Client。

不允許隱含 SDK retry 或模型修復再呼叫；一次合法請求最多一次外部 AI 呼叫。
取消向下傳遞；Provider cancellation／停止計費屬 best effort。
Client 仍連線而 deadline 耗盡回 503；Client 已中斷則無須再產生 response。

## 10. Demo 與資訊保護

Client 明確選擇 mock／remote；Mock 使用與 Remote 相同的 schema。
fixtures 至少包含正常、假物流、假客服；假物流可沿用舊版 88 分示例，
但必須搭配示範說明，不宣稱分析了使用者任意選取的圖片。
insufficient_evidence fixture 可用於 UI／失敗展示。

Remote 失敗不可靜默改用 Mock。API 本身在 mock 設定下不呼叫 AI、
不回假成功，回 503；Client Demo 在本機完成。

使用者圖片、完整結果、filename、Provider raw output 不進應用程式 log，
不快取 POST／API response。不承諾 Provider 或平台零保存，依部署政策告知。

## 11. Contract acceptance

- [ ] A／B 共用 strict schema；所有 enums、長度、數量、邊界與 null／extra-field 測試。
- [ ] 4 MiB／總 body／像素／frame／完整解碼測試；無效輸入 Provider calls=0。
- [ ] missing／duplicate／invalid field 與 non-POST 測試。
- [ ] 所有表列 status/code/retryable 組合與 transport fallback。
- [ ] score 邊界 0、29、30、69、70、100 與矛盾 level／none category。
- [ ] readable normal、unknown 與 insufficient_evidence 三者分流。
- [ ] cancellation、timeout、一次呼叫限制、手動重試與 Mock 標示。
- [ ] 舊 v1 client 不列為 v2 驗收證據。

具體測試 ID 與發佈門檻見 [test-plan.md](test-plan.md)。
