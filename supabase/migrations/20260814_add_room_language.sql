-- ============================================================
-- LayerTalk: rooms.language
-- Supabase MCP の apply_migration で適用済み（project: xnqduwlagmfaxzsaaicj）
-- このファイルは版管理用のミラー。
-- ============================================================

-- 発表者がコントロール窓で選んだ表示言語をルームに持たせ、観客用 Web をそれに従わせる。
-- 既存の行は 'ja' になる（それが実際に使われていた言語なので正しい）。
alter table public.rooms
  add column language text not null default 'ja'
    check (language in ('ja', 'en'));

comment on column public.rooms.language is
  '発表者が選んだ表示言語。観客用 Web はこの値に従う。直接 UPDATE はできず set_room_language 経由のみ。';

-- ================================================== 言語変更 RPC
-- rooms に UPDATE ポリシーは作らない方針（ルームを閉じる概念を持たないため）。
-- ここを開けると title / code まで書き換えられてしまうので、書き換えてよい列を
-- 関数側で固定する。toggle_comment_like と同じ考え方。
create or replace function public.set_room_language(
  p_room_id  uuid,
  p_language text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_language text;
begin
  -- CHECK 制約に任せず先に弾く。制約違反より読めるエラーを返すため。
  if p_language is null or p_language not in ('ja', 'en') then
    raise exception 'unsupported language: %', p_language;
  end if;

  update public.rooms
     set language = p_language
   where id = p_room_id
  returning language into v_language;

  if v_language is null then
    raise exception 'room not found: %', p_room_id;
  end if;

  return v_language;
end;
$$;

revoke all on function public.set_room_language(uuid, text) from public;
grant execute on function public.set_room_language(uuid, text) to anon, authenticated;

-- Realtime のパブリケーションには rooms を足さない。
-- 観客は入室時に行を読んで言語を決める仕様で、発表中の切り替えを
-- 接続済みの端末へ即時配信する必要はない。
