import { corsHeaders, corsJson } from "@/lib/server/cors";
import { createAdminClient, requirePresenter } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 退会する発表者のルームに紐づく Storage のファイルを先に消す。
 *
 * `auth.users` の削除は `on delete cascade` で **行しか** 消さない。既知の制約
 * （CLAUDE.md「ルームを消してもカスタムスタンプの画像は Storage に残る」）と同じ穴で、
 * 先に消さないと画像だけが永久に残る。行が消えたあとでは所有者を辿れないので、
 * **必ず deleteUser より前**に実行すること。
 *
 * ここで失敗しても退会そのものは止めない。残ったファイルは
 * `api/internal/retention` の `removeOrphanedStorage` が後で回収する。
 */
async function removeOwnedStorage(admin: AdminClient, userId: string) {
  const { data: rooms } = await admin.from("rooms").select("id").eq("owner_id", userId);
  const roomIds = (rooms ?? []).map((room) => room.id);
  if (roomIds.length === 0) return 0;

  const [{ data: stamps }, { data: branding }] = await Promise.all([
    admin.from("room_stamps").select("path").in("room_id", roomIds),
    admin.from("room_branding").select("logo_path").in("room_id", roomIds),
  ]);
  const stampPaths = (stamps ?? []).map((row) => row.path).filter(Boolean);
  const logoPaths = (branding ?? []).map((row) => row.logo_path).filter((path): path is string => Boolean(path));

  await Promise.all([
    stampPaths.length ? admin.storage.from("room-stamps").remove(stampPaths) : Promise.resolve(),
    logoPaths.length ? admin.storage.from("room-branding").remove(logoPaths) : Promise.resolve(),
  ]);
  return stampPaths.length + logoPaths.length;
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * 発表者が自分でアカウントを消す（App Store 5.1.1(v)「アプリ内に退会手段があること」）。
 *
 * ルーム・コメント・スタンプ・権利は `auth.users` からの `on delete cascade` で落ちる。
 * `moderation_actions.actor_id` だけは `on delete restrict` だったので
 * `20260904035052_allow_presenter_account_deletion.sql` で `set null` に変えてある
 * — **戻すと、モデレーションを一度でも使った人だけ退会できなくなる**。
 *
 * Stripe 側の決済記録はここでは消さない。会計・不正対策の記録として Stripe に残る旨は
 * プライバシーポリシー5章で告知済み。
 */
export async function POST(request: Request) {
  try {
    const { admin, user } = await requirePresenter(request);

    let removedFiles = 0;
    try {
      removedFiles = await removeOwnedStorage(admin, user.id);
    } catch (storageError) {
      // 退会は止めない。残骸は retention の掃除に任せる。
      console.error("[account/delete] storage cleanup", storageError);
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    return corsJson(request, { deleted: true, removedFiles });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: corsHeaders(request) });
    // 画面には定数しか返さないので、ここで残さないと原因が完全に消える
    // （FK 違反なのか通信なのかが分からなくなる）。
    console.error("[account/delete]", error);
    return corsJson(request, { error: "Account could not be deleted" }, { status: 500 });
  }
}
