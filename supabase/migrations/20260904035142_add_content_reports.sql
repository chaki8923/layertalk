-- 観客が不適切なコメント／カスタムスタンプを通報できるようにする（App Store 1.2）。
--
-- **`has_paid_room_features` を絶対に噛ませないこと。** NG ワードと承認制は Event Pass の
-- 機能だが、通報は「無料ルームでも必ず効く」ことが要件そのもの。ここに課金判定を足すと、
-- 無料ルームが「フィルタも通報も無い UGC」になり、1.2 を1つも満たさなくなる。
--
-- 書き込みは `report_content` だけ。INSERT ポリシーは作らない（`post_comment` と同じ形）。
-- 生 INSERT を開けると、room_id を偽って他ルームの表を膨らませられる。

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  room_stamp_id uuid references public.room_stamps(id) on delete cascade,
  reason text not null check (reason in ('offensive', 'harassment', 'spam', 'other')),
  -- 通報者が退会しても通報は残す（発表者の判断材料を消さない）。
  reporter_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- 対象はコメントかスタンプのどちらか片方だけ。
  constraint content_reports_single_target check (num_nonnulls(comment_id, room_stamp_id) = 1)
);

create index content_reports_room_created_idx on public.content_reports(room_id, created_at desc);
-- 同じ人が同じ対象を何度も通報して件数を水増しできないようにする。
create unique index content_reports_comment_reporter_idx
  on public.content_reports(comment_id, reporter_id) where comment_id is not null;
create unique index content_reports_stamp_reporter_idx
  on public.content_reports(room_stamp_id, reporter_id) where room_stamp_id is not null;

alter table public.content_reports enable row level security;

-- 読めるのは発表者だけ。観客に自分の通報を見せない（誰が通報したかを推測させない）。
-- 画面上の「通報済み」表示は観客側の localStorage で持つ。
create policy "operators read content reports" on public.content_reports for select to authenticated
  using (private.is_room_operator(room_id));

create or replace function public.report_content(
  p_room_id uuid,
  p_comment_id uuid default null,
  p_room_stamp_id uuid default null,
  p_reason text default 'other'
) returns void language plpgsql security definer set search_path = '' as $$
declare v_recent integer;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  if num_nonnulls(p_comment_id, p_room_stamp_id) <> 1 then raise exception 'invalid report target'; end if;
  if p_reason not in ('offensive', 'harassment', 'spam', 'other') then raise exception 'invalid report reason'; end if;

  -- 対象が本当にこのルームの行か確かめる。確かめないと、他ルームの id を投げて
  -- 「例外が出るか出ないか」で存在を探れる。
  if p_comment_id is not null and not exists (
    select 1 from public.comments where id = p_comment_id and room_id = p_room_id
  ) then raise exception 'report target not found'; end if;
  if p_room_stamp_id is not null and not exists (
    select 1 from public.room_stamps where id = p_room_stamp_id and room_id = p_room_id
  ) then raise exception 'report target not found'; end if;

  -- 連打で表を埋めさせない。対象ごとの重複は一意索引が弾くので、ここは総量だけ見る。
  select count(*) into v_recent from public.content_reports
   where reporter_id = (select auth.uid()) and created_at > now() - interval '1 minute';
  if v_recent >= 10 then raise exception 'too many reports'; end if;

  -- 2度目は黙って成功させる。エラーにすると「もう通報済み」が観客に漏れる。
  insert into public.content_reports(room_id, comment_id, room_stamp_id, reason, reporter_id)
  values (p_room_id, p_comment_id, p_room_stamp_id, p_reason, (select auth.uid()))
  on conflict do nothing;
end;
$$;

grant execute on function public.report_content(uuid, uuid, uuid, text) to authenticated;

-- 発表者が壇上で即座に気付けるように Realtime へ載せる。
alter publication supabase_realtime add table public.content_reports;
