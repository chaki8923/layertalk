import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@layertalk/shared";

import { serverEnv } from "./env";

export function createAdminClient() {
  return createClient<Database>(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requirePresenter(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = authorization.slice(7);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new Response("Unauthorized", { status: 401 });
  return { admin, user: data.user };
}
