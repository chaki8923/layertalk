-- 9/8 の3本が 9/5 の関数を上書きしていたのを戻す（2026-09-11）。
--
-- **何が起きていたか**
-- `20260908051937_free_tier_moderation` / `20260908055150_seed_default_moderation_terms` /
-- `20260908055412_allow_anonymous_room_creation` は、`20260905033612_apple_review_safety_storekit`
-- を含まない古いミラーをもとに `post_comment` と `create_room` を丸ごと書き直していた。
-- その結果、本番で次の3つが 9/5 の設計から外れていた（2026-09-11 に関数定義で確認）:
--
-- 1. `post_comment` が `private.comment_authors` に投稿者を記録しなくなった。
--    `ban_room_participant` は投稿者をここから引くので、**コメントからのブロックが
--    全件 `block target not found` で落ちていた**（スタンプからのブロックは別の列を引くので動く）。
--    記録が無いまま投稿された行は復元できない（2026-09-11 時点で 34 件。非表示にはできる）。
-- 2. NG ワードに当たった投稿が「拒否」ではなく `pending`（保留）になっていた。
-- 3. `create_room` から `is_permanent_user()` のガードが外れ、匿名でもルームを作れた。
--
-- **戻すのは上の3つだけ。** 9/8 で入った次の2つは 9/5 の設計と矛盾しないので残す:
-- - `moderate_comment` を課金の外に出したこと（非表示・復帰は無料ルームでも動く）
-- - 新しいルームに既定の NG ワードを入れること（`private.default_moderation_terms()`）
--
-- **関数を書き換えるマイグレーションは、本番の定義を読んでから書くこと。**
-- ミラーは本番より遅れていることがある（今回はそれで壊した）。
--   select pg_get_functiondef('public.post_comment(uuid,uuid,text,boolean)'::regprocedure);

-- 1 と 2: `post_comment` を 9/5 の本文に戻す（`20260905033612` と同一）。
create or replace function public.post_comment(
  p_id uuid, p_room_id uuid, p_content text, p_is_question boolean default false
) returns public.comments language plpgsql security definer set search_path = '' as $$
declare v_rules public.moderation_rules; v_status text := 'approved'; v_comment public.comments;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  p_content := btrim(p_content);
  if char_length(p_content) not between 1 and 140 then raise exception 'invalid comment length'; end if;
  if exists (
    select 1 from public.moderation_terms t where t.room_id = p_room_id and
      ((t.match_mode = 'exact' and lower(p_content) = lower(btrim(t.term))) or
       (t.match_mode = 'contains' and strpos(lower(p_content), lower(btrim(t.term))) > 0))
  ) then raise exception 'comment blocked by safety filter' using errcode = 'check_violation'; end if;
  select * into v_rules from public.moderation_rules where room_id = p_room_id;
  if private.has_paid_room_features(p_room_id) and v_rules.approval_mode then
    v_status := 'pending';
  end if;
  insert into public.comments(
    id, room_id, content, is_question, status, question_status, presentation_session_id
  ) values (
    p_id, p_room_id, p_content, coalesce(p_is_question, false), v_status,
    case when p_is_question then 'open' else null end,
    (select id from public.presentation_sessions where room_id = p_room_id and ended_at is null limit 1)
  ) returning * into v_comment;
  insert into private.comment_authors(comment_id, room_id, user_id)
  values (v_comment.id, p_room_id, (select auth.uid()));
  return v_comment;
end;
$$;

revoke all on function public.post_comment(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.post_comment(uuid,uuid,text,boolean) to authenticated;

-- 3: `create_room` に発表者のガードを戻す。既定の NG ワードは残す（`20260908055150` の版と同一）。
create or replace function public.create_room(p_title text default null, p_language text default 'ja')
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms;
begin
  if not private.is_permanent_user() then raise exception 'presenter authentication required'; end if;
  if p_language not in ('ja', 'en') then raise exception 'unsupported language'; end if;
  insert into public.presenter_profiles(id) values ((select auth.uid())) on conflict (id) do nothing;
  insert into public.rooms(owner_id, title, language)
  values ((select auth.uid()), nullif(btrim(p_title), ''), p_language) returning * into v_room;
  insert into public.room_members(room_id, user_id, role) values (v_room.id, (select auth.uid()), 'owner');
  insert into public.moderation_rules(room_id) values (v_room.id);
  insert into public.room_branding(room_id) values (v_room.id);
  -- 既定の NG ワード。発表者は個別に消せる。
  insert into public.moderation_terms(room_id, term, match_mode)
  select v_room.id, term, 'contains'
  from unnest(private.default_moderation_terms()) as term
  on conflict (room_id, term, match_mode) do nothing;
  return v_room;
end;
$$;

revoke all on function public.create_room(text, text) from public;
grant execute on function public.create_room(text, text) to authenticated;
revoke execute on function public.create_room(text, text) from anon;

-- 適用後の確認（3つとも true になること）:
-- select
--   position('comment_authors' in pg_get_functiondef('public.post_comment(uuid,uuid,text,boolean)'::regprocedure)) > 0 as records_authors,
--   position('check_violation' in pg_get_functiondef('public.post_comment(uuid,uuid,text,boolean)'::regprocedure)) > 0 as rejects_ng_words,
--   position('is_permanent_user' in pg_get_functiondef('public.create_room(text,text)'::regprocedure)) > 0 as presenter_gated;
