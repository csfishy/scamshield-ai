/** User-approved public product policy. This contact address is not a secret. */
export const PUBLIC_PRIVACY_CONTACT_EMAIL = "csfishy@gmail.com";
export const FEEDBACK_RETENTION_DAYS = 90;
export const PRIVACY_EMAIL_SUBJECT = "ScamShield Privacy / Data Request";
export const PRIVACY_CONTACT_MAILTO = `mailto:${encodeURIComponent(PUBLIC_PRIVACY_CONTACT_EMAIL)}?subject=${encodeURIComponent(PRIVACY_EMAIL_SUBJECT)}`;

export const FEEDBACK_RETENTION_POLICY =
  `表單回饋用於問題分析、產品改善與 Beta 驗收，原則上自提交日起最長保存 ${FEEDBACK_RETENTION_DAYS} 天。` +
  "管理者應在期限屆滿後刪除或去識別化；若希望將個別案例用於更長期的測試或品質改善，會另行取得適當同意，不會自動永久保存。";
