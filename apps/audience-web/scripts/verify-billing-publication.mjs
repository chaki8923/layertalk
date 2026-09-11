// 公開前に、法務ページのプレースホルダが本番へ出るのを止める。
//
// **`LEGAL_SUPPORT_EMAIL` / `LEGAL_RESPONSE_TIME` は販売の有無に関係なく必須。**
// `/support` は App Store 1.2 の「公開された連絡先」と 1.5 の「開発者への連絡手段」
// そのもので、通報シート（`report-button.tsx`）からもリンクしている。ここが未設定だと
// `supportMailto()` が null を返し、**連絡先が1つも無いページが本番に出る**。
// 販売を止めているデプロイでも同じなので、`BILLING_PUBLICATION_ENABLED` では分岐させない。
const alwaysRequired = [
  "LEGAL_SUPPORT_EMAIL",
  "LEGAL_RESPONSE_TIME",
];

// 特商法表記に載る販売者情報。販売が有効なときだけ必要。
const salesRequired = [
  "LEGAL_SELLER_NAME",
  "LEGAL_OPERATOR_NAME",
  "LEGAL_ADDRESS",
  "LEGAL_PHONE",
  "LEGAL_REFUND_POLICY",
];

const enabled = process.env.BILLING_PUBLICATION_ENABLED === "true";
const required = enabled ? [...alwaysRequired, ...salesRequired] : alwaysRequired;

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(
    enabled
      ? `Billing publication is enabled, but legal values are missing: ${missing.join(", ")}`
      : `Contact details are required even with billing disabled, but these are missing: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  enabled
    ? "Billing legal release values are configured."
    : "Billing publication is disabled; contact details are configured.",
);
