/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_AUDIENCE_BASE_URL?: string;
  readonly VITE_BILLING_API_BASE_URL?: string;
  readonly VITE_ENTITLEMENT_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
