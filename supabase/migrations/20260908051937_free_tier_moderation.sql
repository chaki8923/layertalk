-- ⚠️ 2026-09-11: このファイルは `20260905033612_apple_review_safety_storekit` を含まない古いミラーを
-- もとに書かれていて、本番の `post_comment` / `create_room` を 9/5 の設計から外していた
-- （投稿者の記録が消え、コメントからのブロックが全件落ちた）。
-- `20260911041638_restore_post_comment_authors_and_presenter_gate` で戻している。**単独で当て直さないこと。**

-- 無料ルームでも「NG ワードで弾く」と「コメントを非表示にする」が動くようにする。
--
-- **`moderate_comment` と NG ワードに `has_paid_room_features` を絶対に戻さないこと。**
-- App Store 1.2 は UGC アプリに4つ（フィルタ／通報／対処・排除／連絡先）を求める。
-- 通報（`report_content`）と連絡先は既に無料だが、これまで**フィルタと対処が有料**だったため、
-- 無料ルームは「通報はできるが誰も消せない」状態だった。審査員は無料ルームで試すので、
-- そこが1.2 の一番濃い落とし方になっていた。
--
-- Event Pass に残す（ここは有料のままでよい）:
--   承認制トグル・入室パスコード・表示遅延・質問のみ表示（= moderation_rules の UPDATE）、
--   ブランディング（room_branding の UPDATE）、発表レポート、質問スライド撮影。
--
-- 有料に残らないもの（この migration で外すもの）:
--   moderate_comment の全アクション、moderation_terms の管理。

-- 1) モデレーション操作から課金判定を外す。
--
-- 本体は 20260827000000_preserve_comment_status_on_restore.sql のものと同一で、
-- 変えたのは冒頭のガード1行だけ（`has_paid_room_features` を落とし、`is_room_operator` だけにした）。
-- `status_before_hidden` の扱いを崩さないよう、意図的に丸ごと書き直している。
--
-- `approve` も無料にしてある。NG ワードに当たった投稿は status='pending' になるので、
-- hide/restore だけ無料にすると**誤検知した投稿を発表者が二度と出せなくなる**。
create or replace function public.moderate_comment(p_comment_id uuid, p_action text)
returns public.comments language plpgsql security definer set search_path = '' as $$
declare
  v_comment public.comments;
  v_status text;
  v_status_before_hidden text;
  v_question text;
begin
  select * into v_comment from public.comments where id = p_comment_id;
  if v_comment.id is null or not private.is_room_operator(v_comment.room_id) then
    raise exception 'not a room operator';
  end if;
  if p_action not in ('approve', 'hide', 'restore', 'mark_answered', 'mark_open') then
    raise exception 'unsupported moderation action';
  end if;

  v_status := v_comment.status;
  v_status_before_hidden := v_comment.status_before_hidden;

  case p_action
    when 'approve' then
      v_status := 'approved';
      -- Only this explicit transition represents a new approval.
      v_status_before_hidden := null;
    when 'hide' then
      -- Repeated hide calls must not replace the original status with hidden.
      if v_comment.status <> 'hidden' then
        v_status_before_hidden := v_comment.status;
      end if;
      v_status := 'hidden';
    when 'restore' then
      if v_comment.status = 'hidden' then
        v_status := coalesce(v_comment.status_before_hidden, 'approved');
      end if;
    else
      null;
  end case;

  v_question := case p_action
    when 'mark_answered' then 'answered'
    when 'mark_open' then 'open'
    else v_comment.question_status
  end;

  update public.comments
  set status = v_status,
      status_before_hidden = v_status_before_hidden,
      question_status = v_question,
      moderated_by = (select auth.uid()),
      moderated_at = now()
  where id = p_comment_id
  returning * into v_comment;

  insert into public.moderation_actions(room_id, comment_id, actor_id, action)
  values (v_comment.room_id, v_comment.id, (select auth.uid()), p_action);
  return v_comment;
end;
$$;

revoke all on function public.moderate_comment(uuid, text) from public;
grant execute on function public.moderate_comment(uuid, text) to authenticated;
revoke execute on function public.moderate_comment(uuid, text) from anon;

-- 2) 投稿時の判定を「NG ワード（無料）」と「承認制（有料）」に割る。
--
-- 以前は両方が1つの `if private.has_paid_room_features(...)` の中に入っていたので、
-- 無料ルームでは NG ワードが一度も評価されなかった。
create or replace function public.post_comment(
  p_id uuid, p_room_id uuid, p_content text, p_is_question boolean default false
) returns public.comments language plpgsql security definer set search_path = '' as $$
declare v_rules public.moderation_rules; v_status text := 'approved'; v_comment public.comments;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  p_content := btrim(p_content);
  if char_length(p_content) not between 1 and 140 then raise exception 'invalid comment length'; end if;
  select * into v_rules from public.moderation_rules where room_id = p_room_id;

  -- NG ワードは無料ルームでも効く（1.2 の「フィルタする手段」そのもの）。
  if exists (
    select 1 from public.moderation_terms t where t.room_id = p_room_id and
      ((t.match_mode = 'exact' and lower(btrim(p_content)) = lower(btrim(t.term))) or
       (t.match_mode = 'contains' and strpos(lower(p_content), lower(btrim(t.term))) > 0))
  ) then
    v_status := 'pending';
  end if;

  -- 「投稿を全件いったん保留する」承認制は Event Pass の機能。
  if v_rules.approval_mode and private.has_paid_room_features(p_room_id) then
    v_status := 'pending';
  end if;

  insert into public.comments(id, room_id, content, is_question, status, question_status, presentation_session_id)
  values (p_id, p_room_id, p_content, coalesce(p_is_question, false), v_status,
          case when p_is_question then 'open' else null end,
          (select id from public.presentation_sessions where room_id = p_room_id and ended_at is null limit 1))
  returning * into v_comment;
  return v_comment;
end;
$$;

revoke all on function public.post_comment(uuid, uuid, text, boolean) from public;
grant execute on function public.post_comment(uuid, uuid, text, boolean) to authenticated;
revoke execute on function public.post_comment(uuid, uuid, text, boolean) from anon;

-- 3) NG ワードの管理から課金判定を外す。
--
-- **本番はこの時点で既に `is_room_operator` だけになっていた**（2026-09-08 に実測）。
-- ミラーの `20260815033436_monetization_event_pass.sql:615-617` は
-- `has_paid_room_features` 付きのままなので、そこだけ本番と食い違っていた。
-- ここで貼り直すのは、その食い違いを畳んでミラーを本当のミラーに戻すため。
-- 実害としては「無料ルームでも NG ワードは登録できるが、`post_comment` が
-- 評価しないので黙って何もしない」という状態だった（2 で解消）。
--
-- `moderation_rules`（承認制・パスコード・表示遅延・質問のみ）と
-- `room_branding` の UPDATE ポリシーは**有料のまま**。ここで触るのは
-- `moderation_terms` だけ。
drop policy if exists "operators manage moderation terms" on public.moderation_terms;
create policy "operators manage moderation terms" on public.moderation_terms for all to authenticated
  using (private.is_room_operator(room_id))
  with check (private.is_room_operator(room_id));
