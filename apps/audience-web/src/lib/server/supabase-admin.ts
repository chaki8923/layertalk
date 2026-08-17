import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@layertalk/shared";

import { serverEnv } from "./env";

export function createAdminClient() {
  return createClient<Database>(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * 401 は **JSON で投げる**。各ルートの catch は本文をそのまま流し直すので、
 * プレーンテキストで投げると発表者アプリ側の `jsonBody()` が解析に失敗し、
 * 「認証が切れている」という情報が握り潰されて汎用の通信エラーに化ける。
 */
const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function requirePresenter(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const token = authorization.slice(7);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw unauthorized();
  return { admin, user: data.user };
}
