import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type LayerTalkConfig = {
  url: string;
  anonKey: string;
};

export type LayerTalkClient = SupabaseClient<Database>;

/** 両アプリで env のプレフィックスが違う（NEXT_PUBLIC_* / VITE_*）ため、
 *  このパッケージは env を直接読まず、解決済みの値を受け取る。 */
export function createLayerTalkClient({ url, anonKey }: LayerTalkConfig): LayerTalkClient {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase の URL / anon キーが未設定です。各アプリの .env.local を確認してください。",
    );
  }

  return createClient<Database>(url, anonKey, {
    // Presenter OTP と観客の匿名セッションを同じクライアントで扱う。
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      // 既定の 10 だとスタンプ連打で送信がドロップする。
      params: { eventsPerSecond: 20 },
    },
  });
}

/** 端末ごとの匿名 ID。いいねの重複判定と、自分のスタンプのエコー抑止に使う。 */
export function getClientId(storageKey = "layertalk:client-id"): string {
  if (typeof window === "undefined") return "";

  let id = window.localStorage.getItem(storageKey);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(storageKey, id);
  }
  return id;
}
