import { createLayerTalkClient, getClientId } from "@layertalk/shared";

export const supabase = createLayerTalkClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

/** プレゼンター端末の識別子。スタンプの送信はしないが、API 呼び出しの整合のため持つ。 */
export const clientId = getClientId("layertalk:presenter-client-id");
