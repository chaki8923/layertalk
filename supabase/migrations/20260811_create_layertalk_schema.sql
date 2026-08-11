-- ============================================================
-- LayerTalk: rooms / comments / comment_likes
-- Supabase MCP の apply_migration で適用済み（project: xnqduwlagmfaxzsaaicj）
-- このファイルは版管理用のミラー。
-- ============================================================

-- ルームコード生成: 紛らわしい文字 (0/O/1/I/L) を除いた6桁。
-- unique 制約と組み合わせるため、衝突したらループでやり直す。
create or replace function public.gen_room_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ------------------------------------------------------------------ rooms
create table public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique default public.gen_room_code(),
  title      text check (title is null or char_length(title) <= 60),
  created_at timestamptz not null default now()
);

comment on table public.rooms is '発表セッション。観客は code を使って入室する。';

-- --------------------------------------------------------------- comments
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 140),
  likes_count int  not null default 0 check (likes_count >= 0),
  created_at  timestamptz not null default now()
);

comment on table public.comments is '観客からのコメント。更新は toggle_comment_like 経由のみ。';

create index comments_room_created_idx on public.comments (room_id, created_at desc);
create index comments_room_likes_idx   on public.comments (room_id, likes_count desc, created_at desc);

-- ---------------------------------------------------------- comment_likes
-- likes_count だけだと連打でいくらでも増やせるため、誰が押したかを持って重複を防ぐ。
create table public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  client_id  text not null check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (comment_id, client_id)
);

comment on table public.comment_likes is
  '端末ごとの匿名 client_id によるいいね重複防止。クライアントから直接は触れない。';

-- =============================================================== RLS
alter table public.rooms         enable row level security;
alter table public.comments      enable row level security;
alter table public.comment_likes enable row level security;

-- rooms: 誰でも参照・作成できる。更新/削除は不可。
create policy "rooms are readable by anyone"
  on public.rooms for select to anon, authenticated using (true);

create policy "anyone can create a room"
  on public.rooms for insert to anon, authenticated with check (true);

-- comments: 誰でも参照・投稿できる。UPDATE を開けると content を書き換えられるので開けない。
create policy "comments are readable by anyone"
  on public.comments for select to anon, authenticated using (true);

create policy "anyone can post a comment"
  on public.comments for insert to anon, authenticated with check (true);

-- comment_likes: ポリシーを一切作らない = RLS により anon からは完全に不可視・不可触。
--                操作は security definer 関数だけが行う。
--                → Supabase linter の rls_enabled_no_policy (INFO) はこの設計の意図どおり。

-- ================================================== いいねトグル RPC
-- anon に comments の UPDATE 権限を与えずに likes_count を動かすための唯一の口。
-- → linter の anon_security_definer_function_executable (WARN) は意図どおり。
--   認証を持たないアプリなので、anon から呼べること自体が要件。
create or replace function public.toggle_comment_like(
  p_comment_id uuid,
  p_client_id  text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_client_id is null or char_length(p_client_id) < 8 then
    raise exception 'invalid client id';
  end if;

  insert into public.comment_likes (comment_id, client_id)
  values (p_comment_id, p_client_id)
  on conflict do nothing;

  if found then
    -- 新規に押した
    update public.comments
       set likes_count = likes_count + 1
     where id = p_comment_id
    returning likes_count into v_count;
  else
    -- すでに押していた → 取り消し
    delete from public.comment_likes
     where comment_id = p_comment_id and client_id = p_client_id;

    update public.comments
       set likes_count = greatest(likes_count - 1, 0)
     where id = p_comment_id
    returning likes_count into v_count;
  end if;

  if v_count is null then
    raise exception 'comment not found: %', p_comment_id;
  end if;

  return v_count;
end;
$$;

revoke all on function public.toggle_comment_like(uuid, text) from public;
grant execute on function public.toggle_comment_like(uuid, text) to anon, authenticated;

-- 自分が既にいいね済みのコメントを引くための関数（localStorage を信用しないため）
create or replace function public.liked_comment_ids(
  p_room_id   uuid,
  p_client_id text
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cl.comment_id
    from public.comment_likes cl
    join public.comments c on c.id = cl.comment_id
   where c.room_id = p_room_id
     and cl.client_id = p_client_id;
$$;

revoke all on function public.liked_comment_ids(uuid, text) from public;
grant execute on function public.liked_comment_ids(uuid, text) to anon, authenticated;

-- ============================================================ Realtime
-- コメントの追加・いいね更新を postgres_changes で配信する。
-- スタンプは永続化しないので Broadcast のみ（DB は経由しない）。
alter publication supabase_realtime add table public.comments;
alter table public.comments replica identity full;
