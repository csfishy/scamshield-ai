# Buildmode AI 防詐 MVP－三日人員分工與開發計劃

## 團隊與目標

團隊由 2 位專業程式設計師、1 位產品行銷及 1 位企劃包裝組成。三日內只完成並打磨以下唯一核心流程：

```text
選擇詐騙截圖
 ↓
AI Analysis
 ↓
Risk Score
 ↓
Reasons
 ↓
Recommended Actions
```

> Build the smallest reliable experience that proves the product value.

## 人員分工

### Engineer A — App / UI Owner

負責：

- Image picker
- Preview
- Loading
- Result UI
- API integration
- Demo mode
- Error handling

### Engineer B — AI / Backend Owner

負責：

- `/analyze`
- Multimodal AI
- Prompt
- JSON Schema
- Scam analysis
- Test cases
- Fallback result

### Product Marketing

負責：

- Problem
- Target user
- Value proposition
- Market story
- Pitch
- Judge Q&A

### Planning & Packaging

負責：

- Demo script
- Demo cases
- Presentation
- UI copy
- Backup video
- Demo production

## Day 1 — End-to-End Prototype

### 目標

建立可操作的 end-to-end prototype，優先打通完整路徑，不追求功能數量或視覺細節。

### Definition of Done

至少一張圖片可以完成：

```text
App
→ AI API
→ AI Analysis
→ JSON
→ Result Screen
```

當日同步確認 API request／response 契約、最小 UI 狀態、測試圖片及基本失敗處理，並及早驗證真實裝置與網路環境。

## Day 2 — Stability and Demo Quality

### 目標

提升 AI 穩定性與 Demo 品質，讓輸出格式一致、理由可解釋、展示流程可重複。

### 最低測試集

- 5 normal
- 5 phishing
- 5 fake customer service
- 5 investment scam

記錄每個案例的預期類別、實際結果、主要 signals、失敗原因與是否適合 Demo。針對 schema error、timeout、模型拒答或低信心輸出準備 fallback result。

### Feature Freeze

Day 2 17:00 後進入 Feature Freeze，禁止新增核心功能。未完成但不影響唯一核心流程的功能移出本次 scope。

## Day 3 — Delivery Readiness

只允許：

- Bug fix
- Stability
- Performance
- Demo rehearsal
- Fallback verification

所有角色依完整時間限制至少進行數次演練，確認講稿、裝置、帳號、網路、案例順序及切換 fallback 的責任人。

## Demo Fallback

```text
Plan A — Live API
Plan B — Pre-generated local result
Plan C — Recorded demo video
```

- Plan A：正常情況使用 Live API，展示真實 end-to-end 分析。
- Plan B：API 或網路不穩時，切換到與 demo case 對應的預先產生本機結果。
- Plan C：裝置、App 或現場環境無法操作時，播放事先錄製且驗證過的完整 Demo。

三種方案都必須呈現相同的產品流程與輸出欄位，避免 fallback 改變核心故事。

## Scope Guardrails

本次只交付圖片／截圖分析體驗。SMS Filter、Notification Listener、Browser Extension、Member System、大型詐騙資料庫、完整 Threat Intelligence 與群眾回報平台均不進入三日開發排程。
