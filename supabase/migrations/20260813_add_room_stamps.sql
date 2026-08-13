-- ルーム内だけで使えるカスタムスタンプ（観客がアップロードした画像）。
-- 画像の実体は Storage の room-stamps バケット、この表はその索引。

create table public.room_stamps (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  -- Storage のオブジェクトパス '<room_id>/<uuid>.png'
  path       text not null unique,
  client_id  text not null check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now()
);

comment on table public.room_stamps is
  'ルーム固有のカスタムスタンプ。Broadcast には id だけを載せ、URL は受信側が解決する。';

create index room_stamps_room_created_idx on public.room_stamps (room_id, created_at);

alter table public.room_stamps enable row level security;

create policy "room stamps are readable by anyone"
  on public.room_stamps for select to anon, authenticated using (true);

create policy "anyone can add a room stamp"
  on public.room_stamps for insert to anon, authenticated with check (true);

-- このプロジェクトで唯一の DELETE ポリシー。
-- 不適切な画像を消す操作は絶対に詰まってはいけない側なので開ける。
-- この行が持つのはパスと端末IDだけで、守るべき本文がない（comments.content とは事情が違う）。
create policy "anyone can remove a room stamp"
  on public.room_stamps for delete to anon, authenticated using (true);

-- 枚数の上限。RLS の with check に同じ表の副問い合わせを書くと自分の SELECT ポリシーを
-- 再帰的に踏むので、トリガで守る。
-- 数値は packages/shared/src/constants.ts の ROOM_STAMP_MAX_PER_* と一致させること。
create or replace function public.enforce_room_stamp_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
  mine  int;
begin
  select count(*), count(*) filter (where client_id = new.client_id)
    into total, mine
    from public.room_stamps
   where room_id = new.room_id;

  if total >= 24 then
    raise exception 'room stamp limit reached for room'
      using errcode = 'check_violation';
  end if;

  if mine >= 5 then
    raise exception 'room stamp limit reached for client'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger room_stamps_limits
  before insert on public.room_stamps
  for each row execute function public.enforce_room_stamp_limits();

-- Realtime。comments と揃えて full にしてあるが、DELETE のペイロードは
-- replica identity に関係なく主キーしか載らない（実測）。購読側は old.id だけを見ること。
alter publication supabase_realtime add table public.room_stamps;
alter table public.room_stamps replica identity full;

-- ---------------------------------------------------------------- Storage

-- カスタムスタンプの画像置き場。
-- public バケットなので画像の取得に署名は要らない（Tauri の webview からもそのまま出る）。
-- 300KB / image/png のみ。ブラウザ側で 128px の PNG に正規化してから上げる前提。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-stamps', 'room-stamps', true, 307200, array['image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "anyone can upload a room stamp"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'room-stamps');

create policy "anyone can remove a room stamp"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'room-stamps');

-- ⚠️ SELECT が要る。public バケットの画像取得そのものはポリシー無しでも通るが、
-- Storage の remove() / list() は storage.objects を引いてから消すので、SELECT が無いと
-- 「エラーも返らないのに1件も消えていない」になる（実測でファイルが残り続けた）。
-- バケットが public な時点で中身は誰でも読めるので、これで新たに開くものはない。
create policy "room stamp objects are listable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'room-stamps');
