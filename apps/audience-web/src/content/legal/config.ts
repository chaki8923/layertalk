import "server-only";

const draft = (label: string) => `［${label}を公開前に設定］`;

export const legalConfig = {
  sellerName: process.env.LEGAL_SELLER_NAME || draft("販売事業者名"),
  operatorName: process.env.LEGAL_OPERATOR_NAME || draft("運営責任者名"),
  address: process.env.LEGAL_ADDRESS || draft("所在地"),
  phone: process.env.LEGAL_PHONE || draft("電話番号"),
  supportEmail: process.env.LEGAL_SUPPORT_EMAIL || draft("サポートメール"),
  responseTime: process.env.LEGAL_RESPONSE_TIME || draft("通常の返信目安"),
  refundPolicy: process.env.LEGAL_REFUND_POLICY || draft("返金・キャンセル条件"),
  systemRequirementsUrl: process.env.LEGAL_SYSTEM_REQUIREMENTS_URL || "",
  effectiveDate: "2026年8月16日",
  updatedDate: "2026年8月16日",
};

export const billingPublicationEnabled = process.env.BILLING_PUBLICATION_ENABLED === "true";

export function supportMailto(subject = "LayerTalkへのお問い合わせ") {
  if (!process.env.LEGAL_SUPPORT_EMAIL) return null;
  return `mailto:${encodeURIComponent(process.env.LEGAL_SUPPORT_EMAIL)}?subject=${encodeURIComponent(subject)}`;
}
