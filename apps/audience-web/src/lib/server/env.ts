import "server-only";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  stripeKey: () => required("STRIPE_RESTRICTED_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  stripeEventPassPriceId: () => required("STRIPE_EVENT_PASS_PRICE_ID"),
  appUrl: () => required("NEXT_PUBLIC_APP_URL"),
  entitlementPrivateKey: () => required("ENTITLEMENT_SIGNING_PRIVATE_KEY").replace(/\\n/g, "\n"),
  entitlementKeyId: () => process.env.ENTITLEMENT_SIGNING_KEY_ID ?? "event-pass-v1",
};
