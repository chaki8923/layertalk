-- 「コメントを一時停止」と「カスタムスタンプを無効化」を廃止する。
--
-- どちらも無料版の発表者ローカルのトグル（PresenterSettings の emergencyPaused /
-- allowCustomStamps）と重複していて、DB 側は Event Pass が切れた瞬間に
-- 罠 #16 の「黙った0行 UPDATE」になる方だった。確実に効くローカルのトグルだけを残す。
--
-- reactions_paused は UI トグルを最初から持たないまま OverlayWindow が読むだけの
-- 死に列だったので、comments_paused と対のまま一緒に落とす。
--
-- 順番が重要: plpgsql の本文は依存として追跡されない。先に列を落とすと関数は
-- 実行時まで壊れたことに気付けないので、関数を貼り替えてから drop column する。

create or replace function public.reserve_room_stamp(p_room_id uuid, p_client_id text)
returns public.room_stamps language plpgsql security definer set search_path = '' as $$
declare v_stamp public.room_stamps; v_path text;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  if (select count(*) from public.room_stamps where room_id = p_room_id) >= 24 then raise exception 'room stamp limit reached for room'; end if;
  if (select count(*) from public.room_stamps where room_id = p_room_id and owner_user_id = (select auth.uid())) >= 5
     then raise exception 'room stamp limit reached for client'; end if;
  v_path := p_room_id::text || '/' || gen_random_uuid()::text || '.png';
  insert into public.room_stamps(room_id, path, client_id, owner_user_id)
  values (p_room_id, v_path, p_client_id, (select auth.uid())) returning * into v_stamp;
  return v_stamp;
end;
$$;

create or replace function public.send_stamp(p_room_id uuid, p_stamp_key text, p_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_payload jsonb; v_custom_id uuid;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  if p_count not between 1 and 20 then raise exception 'invalid stamp count'; end if;
  if p_stamp_key not in ('👍','❤️','😂','👀','🔥','👏') then
    if p_stamp_key !~ '^custom:[0-9a-f-]{36}$' then raise exception 'invalid stamp'; end if;
    v_custom_id := substring(p_stamp_key from 8)::uuid;
    if not exists (select 1 from public.room_stamps where id = v_custom_id and room_id = p_room_id) then
      raise exception 'custom stamp not found';
    end if;
  end if;
  select id into v_session from public.presentation_sessions where room_id = p_room_id and ended_at is null;
  insert into public.stamp_events(room_id, presentation_session_id, sender_id, stamp_key, count)
  values (p_room_id, v_session, (select auth.uid()), p_stamp_key, p_count);
  v_payload := jsonb_build_object('emoji', p_stamp_key, 'count', p_count,
    'clientId', (select auth.uid())::text, 'at', floor(extract(epoch from now()) * 1000));
  perform realtime.send(v_payload, 'stamp', 'room:' || p_room_id::text || ':stamps', true);
  return jsonb_build_object('accepted', true);
end;
$$;

alter table public.moderation_rules
  drop column comments_paused,
  drop column reactions_paused,
  drop column custom_stamps_enabled;
