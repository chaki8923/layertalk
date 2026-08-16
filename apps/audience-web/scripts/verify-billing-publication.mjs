const enabled = process.env.BILLING_PUBLICATION_ENABLED === "true";

if (!enabled) {
  console.log("Billing publication is disabled; legal release validation skipped.");
  process.exit(0);
}

const required = [
  "LEGAL_SELLER_NAME",
  "LEGAL_OPERATOR_NAME",
  "LEGAL_ADDRESS",
  "LEGAL_PHONE",
  "LEGAL_SUPPORT_EMAIL",
  "LEGAL_RESPONSE_TIME",
  "LEGAL_REFUND_POLICY",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Billing publication is enabled, but legal values are missing: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Billing legal release values are configured.");
