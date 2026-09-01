# ScamShield AI

AI-powered scam risk detection for screenshots and suspicious digital content.

ScamShield AI 的目標，是在使用者點擊可疑網址、提供 OTP、匯款或交付敏感資料之前，利用 AI 提供低摩擦的詐騙風險判斷。

## Buildmode MVP

```text
Screenshot / Image
        ↓
Multimodal AI
        ↓
Scam Risk Analysis
        ↓
Risk + Reasons + Recommended Actions
```

### MVP Input

第一版只處理：

- Screenshot
- Image

### MVP Output

所有分析統一輸出：

- Risk Score
- Risk Level
- Category
- Signals
- Recommendations

## Team

- Engineer A — App / UI
- Engineer B — AI / Backend
- Product Marketing — Problem / Value / Pitch
- Planning & Packaging — Demo / Presentation

## Development Principle

> Build the smallest reliable experience that proves the product value.

三日 Hackathon 聚焦於一條可穩定展示的圖片分析流程。目前不在 MVP 範圍：

- SMS Filter
- Android Notification Listener
- Safari Extension
- Member System
- Large Scam Database
- Full Threat Intelligence
- Crowd Reporting Platform

## Documentation

- [產品初步計劃](docs/product-plan.md)
- [Buildmode 三日 MVP 計劃](docs/buildmode-mvp-plan.md)

## Architecture Direction

```text
Platform Input
     ↓
ScamAnalysisInput
     ↓
Scam Engine
     ↓
Multimodal AI
     ↓
ScamAnalysisResult
```

核心 Scam Engine 應保持 platform independent，讓相同的風險分析能力未來可支援 iOS、Android、Web 與其他平台。此架構是長期方向，不代表三日 MVP 必須一次實作全部元件。
