-- LayerTalk Event Pass monetization MVP.
-- Existing rooms are development-only and intentionally discarded before ownership
-- becomes mandatory. Storage objects are made private here and removed by the
-- retention endpoint through the Storage API (never by deleting storage metadata).

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

delete from public.comment_likes;
delete from public.comments;
delete from public.room_stamps;
delete from public.rooms;

-- ---------------------------------------------------------------- identities

create table public.presenter_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms
  add column owner_id uuid not null references auth.users(id) on delete cascade,
  add column updated_at timestamptz not null default now();

create index rooms_owner_created_idx on public.rooms(owner_id, created_at desc);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'moderator')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members(user_id, room_id);

create table public.audience_room_access (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index audience_room_access_user_expiry_idx
  on public.audience_room_access(user_id, expires_at);

-- ---------------------------------------------------------------- billing

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  kind text not null default 'event_pass' check (kind in ('event_pass', 'beta')),
  source text not null default 'stripe' check (source in ('stripe', 'manual', 'promotion')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  history_expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_price_id text,
  amount_total integer check (amount_total is null or amount_total >= 0),
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at),
  check (history_expires_at >= expires_at)
);
create index entitlements_room_active_idx on public.entitlements(room_id, expires_at desc)
  where status = 'active';
create index entitlements_owner_history_idx on public.entitlements(owner_id, history_expires_at desc);

create table public.checkout_attempts (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  stripe_checkout_session_id text unique,
  checkout_url text,
  status text not null default 'creating'
    check (status in ('creating', 'open', 'paid', 'expired', 'failed')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkout_attempts_room_status_idx on public.checkout_attempts(room_id, status, created_at desc);

create table public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  object_id text,
  livemode boolean not null,
  api_version text,
  status text not null default 'processed' check (status in ('processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------- sessions and paid settings

create table public.presentation_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  entitlement_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create unique index presentation_sessions_one_live_room_idx
  on public.presentation_sessions(room_id) where ended_at is null;
create index presentation_sessions_owner_started_idx
  on public.presentation_sessions(owner_id, started_at desc);

create table public.moderation_rules (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  comments_paused boolean not null default false,
  reactions_paused boolean not null default false,
  question_only boolean not null default false,
  approval_mode boolean not null default false,
  display_delay_seconds smallint not null default 0 check (display_delay_seconds between 0 and 5),
  custom_stamps_enabled boolean not null default true,
  entry_passcode_hash text,
  updated_at timestamptz not null default now()
);

create table public.moderation_terms (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  term text not null check (char_length(btrim(term)) between 1 and 60),
  match_mode text not null check (match_mode in ('exact', 'contains')),
  created_at timestamptz not null default now(),
  unique (room_id, term, match_mode)
);
create index moderation_terms_room_idx on public.moderation_terms(room_id);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('approve', 'hide', 'restore', 'mark_answered', 'mark_open')),
  created_at timestamptz not null default now()
);
create index moderation_actions_room_created_idx on public.moderation_actions(room_id, created_at desc);

create table public.room_branding (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  hide_layertalk_branding boolean not null default false,
  brand_color text not null default '#6B8AFF' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  updated_at timestamptz not null default now()
);

create table public.display_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  display_mode text not null check (display_mode in ('flow', 'bubble')),
  show_join_qr boolean not null default false,
  allow_custom_stamps boolean not null default true,
  hide_layertalk_branding boolean not null default false,
  brand_color text not null default '#6B8AFF' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create or replace function private.enforce_display_preset_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.display_presets where owner_id = new.owner_id) >= 10 then
    raise exception 'display preset limit reached';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_display_preset_limit() from public, anon, authenticated;
create trigger display_presets_limit before insert on public.display_presets
for each row execute function private.enforce_display_preset_limit();

-- ---------------------------------------------------------------- event data

alter table public.comments
  add column status text not null default 'approved'
    check (status in ('approved', 'pending', 'hidden')),
  add column presentation_session_id uuid references public.presentation_sessions(id) on delete set null,
  add column question_status text check (question_status in ('open', 'answered')),
  add column moderated_by uuid references auth.users(id) on delete set null,
  add column moderated_at timestamptz;
create index comments_room_status_created_idx on public.comments(room_id, status, created_at desc);
create index comments_session_created_idx on public.comments(presentation_session_id, created_at);

create table public.stamp_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  presentation_session_id uuid references public.presentation_sessions(id) on delete set null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  stamp_key text not null check (char_length(stamp_key) between 1 and 80),
  count smallint not null check (count between 1 and 20),
  created_at timestamptz not null default now()
);
create index stamp_events_session_created_idx on public.stamp_events(presentation_session_id, created_at);

alter table public.room_stamps
  add column owner_user_id uuid references auth.users(id) on delete cascade;
create index room_stamps_owner_idx on public.room_stamps(owner_user_id, room_id);

-- ---------------------------------------------------------------- helpers

create or replace function private.is_permanent_user()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false;
$$;

create or replace function private.is_room_operator(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members
     where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

create or replace function private.has_room_access(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_room_operator(p_room_id) or exists (
    select 1 from public.audience_room_access
     where room_id = p_room_id
       and user_id = (select auth.uid())
       and expires_at > now()
  );
$$;

create or replace function private.active_entitlement_id(p_room_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.entitlements
   where room_id = p_room_id and status = 'active'
     and starts_at <= now() and expires_at > now()
   order by expires_at desc limit 1;
$$;

create or replace function private.has_paid_room_features(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.active_entitlement_id(p_room_id) is not null or exists (
    select 1 from public.presentation_sessions
     where room_id = p_room_id and ended_at is null
       and coalesce((entitlement_snapshot ->> 'paid')::boolean, false)
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_permanent_user() to authenticated;
grant execute on function private.is_room_operator(uuid) to authenticated;
grant execute on function private.has_room_access(uuid) to authenticated;
grant execute on function private.active_entitlement_id(uuid) to authenticated;
grant execute on function private.has_paid_room_features(uuid) to authenticated;

-- ---------------------------------------------------------------- public RPCs

create or replace function public.find_public_room_by_code(p_code text)
returns table(id uuid, code text, title text, language text, requires_passcode boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.code, r.title, r.language, mr.entry_passcode_hash is not null
    from public.rooms r
    join public.moderation_rules mr on mr.room_id = r.id
   where r.code = upper(regexp_replace(btrim(p_code), '\s', '', 'g'))
   limit 1;
$$;

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
  return v_room;
end;
$$;

create or replace function public.resume_room(p_code text)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms;
begin
  select r into v_room from public.rooms r
   where r.code = upper(regexp_replace(btrim(p_code), '\s', '', 'g'))
     and private.is_room_operator(r.id);
  if v_room.id is null then raise exception 'owned room not found'; end if;
  return v_room;
end;
$$;

create or replace function public.join_room(p_code text, p_passcode text default null)
returns table(id uuid, code text, title text, language text)
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms; v_hash text;
begin
  if (select auth.uid()) is null then raise exception 'anonymous session required'; end if;
  select r.* into v_room
    from public.rooms r
   where r.code = upper(regexp_replace(btrim(p_code), '\s', '', 'g'));
  if v_room.id is null then return; end if;
  select mr.entry_passcode_hash into v_hash
    from public.moderation_rules mr where mr.room_id = v_room.id;
  if v_hash is not null and (p_passcode is null or extensions.crypt(p_passcode, v_hash) <> v_hash) then
    raise exception 'invalid room passcode' using errcode = 'invalid_password';
  end if;
  insert into public.audience_room_access(room_id, user_id, expires_at)
  values (v_room.id, (select auth.uid()), now() + interval '12 hours')
  on conflict (room_id, user_id) do update set expires_at = excluded.expires_at;
  return query select v_room.id, v_room.code, v_room.title, v_room.language;
end;
$$;

create or replace function public.set_room_language(p_room_id uuid, p_language text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_room_operator(p_room_id) then raise exception 'room access denied'; end if;
  if p_language not in ('ja', 'en') then raise exception 'unsupported language'; end if;
  update public.rooms set language = p_language, updated_at = now() where id = p_room_id;
  return p_language;
end;
$$;

create or replace function public.set_room_passcode(p_room_id uuid, p_passcode text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_room_operator(p_room_id) or not private.has_paid_room_features(p_room_id) then
    raise exception 'active Event Pass required';
  end if;
  if p_passcode is not null and char_length(p_passcode) not between 4 and 12 then
    raise exception 'passcode must contain 4 to 12 characters';
  end if;
  update public.moderation_rules
     set entry_passcode_hash = case when nullif(p_passcode, '') is null then null
                                    else extensions.crypt(p_passcode, extensions.gen_salt('bf')) end,
         updated_at = now()
   where room_id = p_room_id;
end;
$$;

create or replace function public.post_comment(
  p_id uuid, p_room_id uuid, p_content text, p_is_question boolean default false
) returns public.comments language plpgsql security definer set search_path = '' as $$
declare v_rules public.moderation_rules; v_status text := 'approved'; v_comment public.comments;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  p_content := btrim(p_content);
  if char_length(p_content) not between 1 and 140 then raise exception 'invalid comment length'; end if;
  select * into v_rules from public.moderation_rules where room_id = p_room_id;
  if private.has_paid_room_features(p_room_id) then
    if v_rules.approval_mode or exists (
      select 1 from public.moderation_terms t where t.room_id = p_room_id and
        ((t.match_mode = 'exact' and lower(btrim(p_content)) = lower(btrim(t.term))) or
         (t.match_mode = 'contains' and strpos(lower(p_content), lower(btrim(t.term))) > 0))
    ) then v_status := 'pending'; end if;
  end if;
  insert into public.comments(id, room_id, content, is_question, status, question_status, presentation_session_id)
  values (p_id, p_room_id, p_content, coalesce(p_is_question, false), v_status,
          case when p_is_question then 'open' else null end,
          (select id from public.presentation_sessions where room_id = p_room_id and ended_at is null limit 1))
  returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.moderate_comment(p_comment_id uuid, p_action text)
returns public.comments language plpgsql security definer set search_path = '' as $$
declare v_comment public.comments; v_status text; v_question text;
begin
  select * into v_comment from public.comments where id = p_comment_id;
  if v_comment.id is null or not private.is_room_operator(v_comment.room_id)
     or not private.has_paid_room_features(v_comment.room_id) then
    raise exception 'active Event Pass required';
  end if;
  if p_action not in ('approve', 'hide', 'restore', 'mark_answered', 'mark_open') then
    raise exception 'unsupported moderation action';
  end if;
  v_status := case p_action when 'approve' then 'approved' when 'restore' then 'approved'
                              when 'hide' then 'hidden' else v_comment.status end;
  v_question := case p_action when 'mark_answered' then 'answered' when 'mark_open' then 'open'
                                 else v_comment.question_status end;
  update public.comments set status = v_status, question_status = v_question,
    moderated_by = (select auth.uid()), moderated_at = now() where id = p_comment_id returning * into v_comment;
  insert into public.moderation_actions(room_id, comment_id, actor_id, action)
  values (v_comment.room_id, v_comment.id, (select auth.uid()), p_action);
  return v_comment;
end;
$$;

create or replace function public.toggle_comment_like(p_comment_id uuid, p_client_id text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int; v_room_id uuid; v_voter_id text := (select auth.uid())::text;
begin
  select room_id into v_room_id from public.comments where id = p_comment_id and status = 'approved';
  if v_voter_id is null or v_room_id is null or not private.has_room_access(v_room_id) then raise exception 'comment not available'; end if;
  insert into public.comment_likes(comment_id, client_id) values (p_comment_id, v_voter_id) on conflict do nothing;
  if found then
    update public.comments set likes_count = likes_count + 1 where id = p_comment_id returning likes_count into v_count;
  else
    delete from public.comment_likes where comment_id = p_comment_id and client_id = v_voter_id;
    update public.comments set likes_count = greatest(likes_count - 1, 0) where id = p_comment_id returning likes_count into v_count;
  end if;
  return v_count;
end;
$$;

create or replace function public.liked_comment_ids(p_room_id uuid, p_client_id text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select cl.comment_id from public.comment_likes cl
  join public.comments c on c.id = cl.comment_id
  where c.room_id = p_room_id and c.status = 'approved' and cl.client_id = (select auth.uid())::text
    and private.has_room_access(p_room_id);
$$;

create or replace function public.start_presentation(p_room_id uuid)
returns public.presentation_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.presentation_sessions; v_entitlement uuid;
begin
  if not private.is_room_operator(p_room_id) then raise exception 'room access denied'; end if;
  select * into v_session from public.presentation_sessions where room_id = p_room_id and ended_at is null;
  if v_session.id is not null then return v_session; end if;
  v_entitlement := private.active_entitlement_id(p_room_id);
  insert into public.presentation_sessions(room_id, owner_id, entitlement_id, entitlement_snapshot)
  values (p_room_id, (select auth.uid()), v_entitlement,
    jsonb_build_object('paid', v_entitlement is not null, 'captured_at', now(),
      'features', case when v_entitlement is null then '[]'::jsonb else
        '["moderation","passcode","reports","branding","presets"]'::jsonb end))
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.end_presentation(p_session_id uuid)
returns public.presentation_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.presentation_sessions;
begin
  update public.presentation_sessions set ended_at = now()
   where id = p_session_id and ended_at is null
     and private.is_room_operator(room_id) returning * into v_session;
  if v_session.id is null then raise exception 'live presentation not found'; end if;
  return v_session;
end;
$$;

create or replace function public.reserve_room_stamp(p_room_id uuid, p_client_id text)
returns public.room_stamps language plpgsql security definer set search_path = '' as $$
declare v_stamp public.room_stamps; v_path text;
begin
  if not private.has_room_access(p_room_id) then raise exception 'join room first'; end if;
  if not (select custom_stamps_enabled from public.moderation_rules where room_id = p_room_id)
     and private.has_paid_room_features(p_room_id) then raise exception 'custom stamps disabled'; end if;
  if (select count(*) from public.room_stamps where room_id = p_room_id) >= 24 then raise exception 'room stamp limit reached for room'; end if;
  if (select count(*) from public.room_stamps where room_id = p_room_id and owner_user_id = (select auth.uid())) >= 5
     then raise exception 'room stamp limit reached for client'; end if;
  v_path := p_room_id::text || '/' || gen_random_uuid()::text || '.png';
  insert into public.room_stamps(room_id, path, client_id, owner_user_id)
  values (p_room_id, v_path, p_client_id, (select auth.uid())) returning * into v_stamp;
  return v_stamp;
end;
$$;

create or replace function public.delete_room_stamp(p_stamp_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_stamp public.room_stamps;
begin
  select * into v_stamp from public.room_stamps where id = p_stamp_id;
  if v_stamp.id is null then raise exception 'stamp not found'; end if;
  if v_stamp.owner_user_id <> (select auth.uid()) and not private.is_room_operator(v_stamp.room_id) then
    raise exception 'stamp access denied';
  end if;
  delete from public.room_stamps where id = p_stamp_id;
  return v_stamp.path;
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
    if not (select custom_stamps_enabled from public.moderation_rules where room_id = p_room_id)
       and private.has_paid_room_features(p_room_id) then return jsonb_build_object('accepted', false); end if;
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

-- Atomic Stripe fulfillment. Only the server role may call this RPC.
create or replace function public.fulfill_event_pass(
  p_event_id text, p_event_type text, p_object_id text, p_livemode boolean, p_api_version text,
  p_owner_id uuid, p_room_id uuid, p_checkout_session_id text, p_payment_intent_id text,
  p_customer_id text, p_price_id text, p_amount_total integer, p_currency text, p_paid_at timestamptz
) returns public.entitlements language plpgsql security definer set search_path = '' as $$
declare v_entitlement public.entitlements;
begin
  insert into public.billing_events(stripe_event_id, event_type, object_id, livemode, api_version, processed_at)
  values (p_event_id, p_event_type, p_object_id, p_livemode, p_api_version, now())
  on conflict (stripe_event_id) do nothing;
  if not found then
    select * into v_entitlement from public.entitlements where stripe_checkout_session_id = p_checkout_session_id;
    return v_entitlement;
  end if;
  select * into v_entitlement from public.entitlements where stripe_checkout_session_id = p_checkout_session_id;
  if v_entitlement.id is not null then return v_entitlement; end if;
  if not exists (select 1 from public.rooms where id = p_room_id and owner_id = p_owner_id) then
    raise exception 'checkout room ownership mismatch';
  end if;
  insert into public.presenter_profiles(id, stripe_customer_id)
  values (p_owner_id, p_customer_id)
  on conflict (id) do update set stripe_customer_id = coalesce(public.presenter_profiles.stripe_customer_id, excluded.stripe_customer_id), updated_at = now();
  insert into public.entitlements(owner_id, room_id, starts_at, expires_at, history_expires_at,
    stripe_checkout_session_id, stripe_payment_intent_id, stripe_price_id, amount_total, currency)
  values (p_owner_id, p_room_id, p_paid_at, p_paid_at + interval '7 days', p_paid_at + interval '30 days',
    p_checkout_session_id, p_payment_intent_id, p_price_id, p_amount_total, lower(p_currency))
  returning * into v_entitlement;
  update public.checkout_attempts set status = 'paid', updated_at = now()
    where stripe_checkout_session_id = p_checkout_session_id;
  return v_entitlement;
end;
$$;

create or replace function public.revoke_event_pass(
  p_event_id text, p_event_type text, p_object_id text, p_livemode boolean, p_api_version text,
  p_payment_intent_id text, p_reason text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.billing_events(stripe_event_id, event_type, object_id, livemode, api_version, processed_at)
  values (p_event_id, p_event_type, p_object_id, p_livemode, p_api_version, now()) on conflict do nothing;
  if not found then return 0; end if;
  update public.entitlements set status = 'revoked', revoked_at = now(), revoked_reason = p_reason, updated_at = now()
   where stripe_payment_intent_id = p_payment_intent_id and status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- RLS and grants

alter table public.presenter_profiles enable row level security;
alter table public.room_members enable row level security;
alter table public.audience_room_access enable row level security;
alter table public.entitlements enable row level security;
alter table public.checkout_attempts enable row level security;
alter table public.billing_events enable row level security;
alter table public.presentation_sessions enable row level security;
alter table public.moderation_rules enable row level security;
alter table public.moderation_terms enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.room_branding enable row level security;
alter table public.display_presets enable row level security;
alter table public.stamp_events enable row level security;

drop policy if exists "rooms are readable by anyone" on public.rooms;
drop policy if exists "anyone can create a room" on public.rooms;
create policy "room operators can read rooms" on public.rooms for select to authenticated
  using (private.is_room_operator(id) or private.has_room_access(id));

drop policy if exists "comments are readable by anyone" on public.comments;
drop policy if exists "anyone can post a comment" on public.comments;
create policy "room participants read approved comments" on public.comments for select to authenticated
  using (private.is_room_operator(room_id) or (status = 'approved' and private.has_room_access(room_id)));

drop policy if exists "room stamps are readable by anyone" on public.room_stamps;
drop policy if exists "anyone can add a room stamp" on public.room_stamps;
drop policy if exists "anyone can remove a room stamp" on public.room_stamps;
create policy "room participants read stamps" on public.room_stamps for select to authenticated
  using (private.has_room_access(room_id));

create policy "presenters read own profile" on public.presenter_profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "members read their membership" on public.room_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "audience read their room access" on public.audience_room_access for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owners read entitlements" on public.entitlements for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owners read checkout attempts" on public.checkout_attempts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owners read sessions" on public.presentation_sessions for select to authenticated
  using (private.is_room_operator(room_id));
create policy "participants read moderation state" on public.moderation_rules for select to authenticated
  using (private.has_room_access(room_id));
create policy "operators update paid moderation" on public.moderation_rules for update to authenticated
  using (private.is_room_operator(room_id) and private.has_paid_room_features(room_id))
  with check (private.is_room_operator(room_id) and private.has_paid_room_features(room_id));
create policy "operators manage moderation terms" on public.moderation_terms for all to authenticated
  using (private.is_room_operator(room_id) and private.has_paid_room_features(room_id))
  with check (private.is_room_operator(room_id) and private.has_paid_room_features(room_id));
create policy "operators read moderation actions" on public.moderation_actions for select to authenticated
  using (private.is_room_operator(room_id));
create policy "participants read branding" on public.room_branding for select to authenticated
  using (private.has_room_access(room_id));
create policy "operators update paid branding" on public.room_branding for update to authenticated
  using (private.is_room_operator(room_id) and private.has_paid_room_features(room_id))
  with check (private.is_room_operator(room_id) and private.has_paid_room_features(room_id));
create policy "owners manage paid presets" on public.display_presets for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "operators read stamp events" on public.stamp_events for select to authenticated
  using (private.is_room_operator(room_id));

-- Private stamp broadcasts. Supabase permits policies on realtime.messages but
-- intentionally forbids changing the realtime schema itself.
drop policy if exists "layertalk room participants receive stamps" on realtime.messages;
create policy "layertalk room participants receive stamps" on realtime.messages
  for select to authenticated using (
    realtime.messages.extension = 'broadcast' and exists (
      select 1 from public.rooms r
       where (select realtime.topic()) = 'room:' || r.id::text || ':stamps'
         and private.has_room_access(r.id)
    )
  );

-- Storage buckets are private. Files are read only by joined room participants;
-- uploads require a row reserved by reserve_room_stamp().
update storage.buckets set public = false where id = 'room-stamps';
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('room-branding', 'room-branding', false, 1048576, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can upload a room stamp" on storage.objects;
drop policy if exists "anyone can remove a room stamp" on storage.objects;
drop policy if exists "room stamp objects are listable" on storage.objects;
create policy "participants read room assets" on storage.objects for select to authenticated using (
  bucket_id in ('room-stamps', 'room-branding') and
  private.has_room_access((storage.foldername(name))[1]::uuid)
);
create policy "participants upload reserved stamps" on storage.objects for insert to authenticated with check (
  bucket_id = 'room-stamps' and exists (
    select 1 from public.room_stamps rs where rs.path = name
      and rs.owner_user_id = (select auth.uid()) and private.has_room_access(rs.room_id)
  )
);
create policy "operators manage room assets" on storage.objects for all to authenticated
  using (bucket_id in ('room-stamps', 'room-branding') and private.is_room_operator((storage.foldername(name))[1]::uuid))
  with check (bucket_id in ('room-stamps', 'room-branding') and private.is_room_operator((storage.foldername(name))[1]::uuid));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.rooms, public.presenter_profiles, public.room_members, public.audience_room_access,
  public.entitlements, public.checkout_attempts, public.presentation_sessions, public.moderation_rules,
  public.moderation_terms, public.moderation_actions, public.room_branding, public.display_presets,
  public.comments, public.comment_likes, public.room_stamps, public.stamp_events to authenticated;
grant update on public.moderation_rules, public.room_branding to authenticated;
grant select, insert, update, delete on public.moderation_terms, public.display_presets to authenticated;

revoke all on function public.find_public_room_by_code(text) from public;
grant execute on function public.find_public_room_by_code(text) to anon, authenticated;
revoke all on function public.create_room(text, text) from public;
grant execute on function public.create_room(text, text) to authenticated;
revoke all on function public.resume_room(text) from public;
grant execute on function public.resume_room(text) to authenticated;
revoke all on function public.join_room(text, text) from public;
grant execute on function public.join_room(text, text) to authenticated;
revoke all on function public.set_room_language(uuid, text) from public;
grant execute on function public.set_room_language(uuid, text) to authenticated;
revoke all on function public.set_room_passcode(uuid, text) from public;
grant execute on function public.set_room_passcode(uuid, text) to authenticated;
revoke all on function public.post_comment(uuid, uuid, text, boolean) from public;
grant execute on function public.post_comment(uuid, uuid, text, boolean) to authenticated;
revoke all on function public.moderate_comment(uuid, text) from public;
grant execute on function public.moderate_comment(uuid, text) to authenticated;
revoke all on function public.start_presentation(uuid) from public;
grant execute on function public.start_presentation(uuid) to authenticated;
revoke all on function public.end_presentation(uuid) from public;
grant execute on function public.end_presentation(uuid) to authenticated;
revoke all on function public.reserve_room_stamp(uuid, text) from public;
grant execute on function public.reserve_room_stamp(uuid, text) to authenticated;
revoke all on function public.delete_room_stamp(uuid) from public;
grant execute on function public.delete_room_stamp(uuid) to authenticated;
revoke all on function public.send_stamp(uuid, text, integer) from public;
grant execute on function public.send_stamp(uuid, text, integer) to authenticated;
revoke all on function public.fulfill_event_pass(text,text,text,boolean,text,uuid,uuid,text,text,text,text,integer,text,timestamptz) from public;
revoke execute on function public.fulfill_event_pass(text,text,text,boolean,text,uuid,uuid,text,text,text,text,integer,text,timestamptz) from anon, authenticated;
grant execute on function public.fulfill_event_pass(text,text,text,boolean,text,uuid,uuid,text,text,text,text,integer,text,timestamptz) to service_role;
revoke all on function public.revoke_event_pass(text,text,text,boolean,text,text,text) from public;
revoke execute on function public.revoke_event_pass(text,text,text,boolean,text,text,text) from anon, authenticated;
grant execute on function public.revoke_event_pass(text,text,text,boolean,text,text,text) to service_role;

-- Existing public RPCs are replaced above or remain explicitly granted.
revoke execute on function public.enforce_room_stamp_limits() from public, anon, authenticated;
revoke execute on function public.toggle_comment_like(uuid, text) from anon;
revoke all on function public.toggle_comment_like(uuid, text) from public;
grant execute on function public.toggle_comment_like(uuid, text) to authenticated;
revoke all on function public.liked_comment_ids(uuid, text) from public;
grant execute on function public.liked_comment_ids(uuid, text) to authenticated;

alter publication supabase_realtime add table public.presentation_sessions;
alter publication supabase_realtime add table public.moderation_rules;
alter publication supabase_realtime add table public.room_branding;
