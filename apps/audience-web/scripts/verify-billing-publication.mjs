/**
 * 法務ページの表示値が揃っているかをビルド前に確かめる。
 *
 * 揃っていないと `src/content/legal/config.ts` の `draft()` が働いて、
 * 特商法・規約・プライバシーの各ページに `［販売事業者名を公開前に設定］` が
 * **そのまま出る**。App Store の審査員は購入シートからこの3ページを開くので、
 * プレースホルダのまま本番へ出ると 5.1.1(i) で止まる。
 *
 * 以前は `BILLING_PUBLICATION_ENABLED !== "true"` のとき丸ごとスキップしていた。
 * あのフラグが止めるのは **Stripe の checkout ルートだけ**で、Mac App Store 版の
 * 購入導線（`/api/billing/app-store/*`）は一切見ていない。つまり
 * 「フラグは false・App Store では売っている・法務ページは下書きのまま」が成立した。
 *
 * 判定を本番デプロイそのものに寄せてある。ローカルとプレビューは今までどおり素通り。
 */
const isProductionDeploy = process.env.VERCEL_ENV === "production";
const billingEnabled = process.env.BILLING_PUBLICATION_ENABLED === "true";

if (!isProductionDeploy && !billingEnabled) {
  console.log("Not a production deploy and billing publication is off; legal release validation skipped.");
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
  const reason = isProductionDeploy ? "This is a production deploy" : "Billing publication is enabled";
  console.error(`${reason}, but legal values are missing: ${missing.join(", ")}`);
  console.error("Set them in the Vercel project environment. They are injected at build time, so redeploy after changing them.");
  process.exit(1);
}

console.log("Billing legal release values are configured.");
