import { emit, listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { LayerTalkError, ROOM_LOGO_BUCKET, type RoomBranding } from "@layertalk/shared";

import { supabase } from "./supabase";

/** ロゴの署名 URL まで解決した、そのまま `JoinQrCard` に渡せる形。 */
export type BrandingState = RoomBranding & { logoUrl: string | null };

const EVENT = "branding-changed";
const cacheKey = (roomId: string) => `layertalk:branding:${roomId}`;

/**
 * 直近に確認できたブランド設定。
 *
 * `moderation_rules` が `layertalk:event-controls:${roomId}` でやっているのと同じ形。
 * オーバーレイは最初の描画でもう QR を出しうるので、DB の往復を待たずに正しい値で描く。
 * **取得に失敗したときにこれを消さないこと** — `hideLayerTalk` は fail-open なので、
 * 消すと会場の Wi-Fi が切れているだけで LayerTalk 表記が戻ってしまう。
 */
export function readCachedBranding(roomId: string | null): BrandingState | null {
  if (!roomId) return null;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(roomId)) ?? "null") as BrandingState | null;
  } catch {
    return null;
  }
}

function writeCachedBranding(roomId: string, state: BrandingState): void {
  try {
    localStorage.setItem(cacheKey(roomId), JSON.stringify(state));
  } catch { /* 保存できなくても実行時の値は正しい。次の起動でDBから取り直す。 */ }
}

/**
 * ロゴの署名 URL。バケットが private なので、表示側にも毎回これが要る。
 *
 * パス固定の upsert で差し替えるので、`updated_at` を版として付ける。
 * これが無いと差し替えたのに古いロゴが出続ける。
 */
async function resolveLogoUrl(row: RoomBranding): Promise<string | null> {
  if (!row.logo_path) return null;
  const { data } = await supabase.storage.from(ROOM_LOGO_BUCKET).createSignedUrl(row.logo_path, 3600);
  return data?.signedUrl ? `${data.signedUrl}&v=${row.updated_at}` : null;
}

/** DB から取り直してキャッシュも更新する。失敗したら null を返すだけで、キャッシュは残す。 */
export async function fetchRoomBranding(roomId: string): Promise<BrandingState | null> {
  const { data, error } = await supabase.from("room_branding").select("*").eq("room_id", roomId).maybeSingle();
  if (error || !data) return null;
  const state: BrandingState = { ...data, logoUrl: await resolveLogoUrl(data) };
  writeCachedBranding(roomId, state);
  return state;
}

/**
 * ブランド設定の一部の列を書き換える。
 *
 * **`.select()` を必ず付けること。** 付けない `update()` は RLS が 1 行も通さなくても
 * PostgREST が 204 / `error: null` を返す（実測: PATCH 6 回すべて 204 なのに DB は既定のまま）。
 * `room_branding` の UPDATE は `has_paid_room_features` を要求するので、パスが切れると
 * まさにこの 0 行更新になり、画面だけ成功に見えてスライドには反映されない。
 * 返ってきた行を正とし、無ければ弾かれたものとして扱う。
 */
export async function patchRoomBranding(roomId: string, patch: Partial<RoomBranding>): Promise<BrandingState> {
  const { data, error } = await supabase.from("room_branding")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .select()
    .maybeSingle();
  if (error) throw new LayerTalkError("branding_save_failed", error.message);
  if (!data) throw new LayerTalkError("branding_rejected");

  const state: BrandingState = { ...data, logoUrl: await resolveLogoUrl(data) };
  writeCachedBranding(roomId, state);
  await emit(EVENT, { roomId, state });
  return state;
}

type BrandingEvent = { roomId: string; state: BrandingState };

/**
 * 別の窓へ即座に伝える。
 *
 * 2つの窓は同一オリジンなので localStorage は共有されるが、別々の WKWebView なので
 * storage イベントは飛ばない（`settings.ts` の `saveSettings` と同じ事情）。
 * Realtime に頼らないのは、書き手がコントロール窓しか居ないのに罠 #3
 * （SUBSCRIBED 直後は流れてこない）を踏みに行く理由が無いため。
 */
export const onBrandingChanged = (handler: (event: BrandingEvent) => void) =>
  listen<BrandingEvent>(EVENT, (event) => handler(event.payload));

/**
 * ブランド設定を読む側の共通処理。オーバーレイ窓・コントロール窓・Event Pass パネルの3箇所で使う。
 *
 * 書き込みは `patchRoomBranding` を直接呼ぶ（成功すればイベント経由でここにも返ってくる）。
 */
export function useRoomBranding(roomId: string | null) {
  const [branding, setBranding] = useState<BrandingState | null>(() => readCachedBranding(roomId));

  const reload = useCallback(async () => {
    if (!roomId) return;
    const next = await fetchRoomBranding(roomId);
    // 取得できなかったときは手元の値を残す。null に落とすと LayerTalk 表記が戻ってしまう。
    if (next) setBranding(next);
  }, [roomId]);

  useEffect(() => {
    setBranding(readCachedBranding(roomId));
    if (!roomId) return;
    let cancelled = false;
    void fetchRoomBranding(roomId).then((next) => {
      if (!cancelled && next) setBranding(next);
    });
    return () => { cancelled = true; };
  }, [roomId]);

  useEffect(() => {
    const unlisten = onBrandingChanged((event) => {
      // ルーム切り替えの直後に、前のルームの通知で上書きしないこと。
      if (event.roomId === roomId) setBranding(event.state);
    });
    return () => { void unlisten.then((off) => off()); };
  }, [roomId]);

  return { branding, setBranding, reload };
}
