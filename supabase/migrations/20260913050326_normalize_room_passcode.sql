-- 入室パスコードが「正しく打っても弾かれる」件の修正（2026-09-13、テスト用ルームで再現）。
--
-- 1. 保存と照合で値の形をそろえる。
--    発表者の保存欄は WKWebView の普通の文字入力欄で、macOS の自動大文字化・スペル修正が
--    効きうる（観客側はパスワード欄なので効かない）。欄の側でも補正は切ったが、全角英数字や
--    前後の空白でも食い違わないよう、保存と照合の両方で NFKC 正規化＋前後の空白除去を通す。
--    大文字と小文字は区別したまま。半角・空白なしで保存された既存のハッシュは、正規化しても
--    入力が変わらないのでそのまま照合できる。
--
-- 2. `join_room` をもう一度 Event Pass の期限に従わせる。
--    20260824000000_expire_room_passcodes.sql で `private.active_room_passcode_hash` を
--    通すようにしたが、20260905033612_apple_review_safety_storekit.sql（ブロック対応）が
--    `moderation_rules.entry_passcode_hash` を直接読む形で上書きしていた。そのままだと
--    Event Pass が切れたあとも古いパスコードを要求し続ける一方、`find_public_room_by_code` は
--    「パスコード不要」と返して入室画面に欄が出ないので、誰も入室できなくなる。
--
-- どちらの関数も、それ以外は 2026-09-13 に読んだ本番の定義のまま。

create or replace function private.normalize_room_passcode(p_passcode text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(normalize(p_passcode, NFKC)), '');
$$;

revoke all on function private.normalize_room_passcode(text) from public, anon, authenticated;

create or replace function public.set_room_passcode(p_room_id uuid, p_passcode text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_entitlement_id uuid;
  v_passcode text := private.normalize_room_passcode(p_passcode);
begin
  if not private.is_room_operator(p_room_id) then
    raise exception 'room access denied';
  end if;
  v_entitlement_id := private.active_entitlement_id(p_room_id);
  if v_entitlement_id is null then
    raise exception 'active Event Pass required';
  end if;
  if v_passcode is not null and char_length(v_passcode) not between 4 and 12 then
    raise exception 'passcode must contain 4 to 12 characters';
  end if;
  update public.moderation_rules
     set entry_passcode_hash = case when v_passcode is null then null
                                    else extensions.crypt(v_passcode, extensions.gen_salt('bf')) end,
         entry_passcode_entitlement_id = case when v_passcode is null then null
                                              else v_entitlement_id end,
         updated_at = now()
   where room_id = p_room_id;
end;
$$;

create or replace function public.join_room(p_code text, p_passcode text default null)
returns table(id uuid, code text, title text, language text)
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms; v_hash text; v_passcode text;
begin
  if (select auth.uid()) is null then raise exception 'anonymous session required'; end if;
  select r.* into v_room from public.rooms r
  where r.code = upper(regexp_replace(btrim(p_code), '\s', '', 'g'));
  if v_room.id is null then return; end if;
  if exists (
    select 1 from public.room_participant_blocks b
    where b.room_id = v_room.id and b.user_id = (select auth.uid())
  ) then raise exception 'room participant blocked' using errcode = 'insufficient_privilege'; end if;
  v_hash := private.active_room_passcode_hash(v_room.id);
  v_passcode := private.normalize_room_passcode(p_passcode);
  if v_hash is not null and (v_passcode is null or extensions.crypt(v_passcode, v_hash) <> v_hash) then
    raise exception 'invalid room passcode' using errcode = 'invalid_password';
  end if;
  insert into public.audience_room_access(room_id, user_id, expires_at)
  values (v_room.id, (select auth.uid()), now() + interval '12 hours')
  on conflict (room_id, user_id) do update set expires_at = excluded.expires_at;
  return query select v_room.id, v_room.code, v_room.title, v_room.language;
end;
$$;
