import { analysisSchema, errorSchema } from "../../lib/contracts/analysis";
export const normal = analysisSchema.parse({
  riskScore: 8,
  riskLevel: "low",
  category: "none",
  summary: "目前可讀內容未觀察到明確詐騙訊號",
  signals: [],
  recommendations: [
    "若後續出現付款或提供敏感資料的要求，請透過官方管道再次確認",
  ],
});
export const fakeDelivery = analysisSchema.parse({
  riskScore: 88,
  riskLevel: "high",
  category: "fake_customer_service",
  summary: "疑似假物流通知，要求透過可疑連結補繳費用",
  signals: [
    {
      type: "payment_request",
      severity: "high",
      reason: "訊息以包裹滯留為由要求立即補繳費用",
    },
    {
      type: "suspicious_link",
      severity: "high",
      reason: "訊息要求在非原購物平台連結輸入付款資料",
    },
  ],
  recommendations: [
    "不要在訊息連結中提供金融資訊",
    "自行從物流官方網站或原購物平台確認配送狀態",
  ],
});
export const fakeCustomerService = analysisSchema.parse({
  riskScore: 91,
  riskLevel: "high",
  category: "fake_customer_service",
  summary: "疑似假冒客服，要求轉移聯絡管道並提供驗證碼",
  signals: [
    {
      type: "off_platform_contact",
      severity: "medium",
      reason: "訊息要求加入私人 LINE 繼續處理訂單",
    },
    {
      type: "credential_request",
      severity: "high",
      reason: "訊息要求提供 OTP 驗證碼",
    },
  ],
  recommendations: [
    "不要提供 OTP、密碼或金融資訊",
    "自行從品牌官方網站取得聯絡方式並查證",
  ],
});
export const insufficientEvidence = errorSchema.parse({
  error: {
    code: "insufficient_evidence",
    message: "目前圖片資訊不足，請提供文字清楚且包含完整上下文的截圖。",
    retryable: false,
  },
});
export const demoFixtures = { normal, fakeDelivery, fakeCustomerService };
export const DEMO_NOTICE = "示範資料，未分析此圖片";
