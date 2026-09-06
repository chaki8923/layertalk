-- Apple App Review readiness:
--   * Guideline 1.2: free objectionable-content filtering and room-scoped blocking.
--   * Guideline 3.1.1: idempotent App Store consumable fulfillment.
--
-- Server routes verify Apple-signed JWS before calling the service-role-only RPCs
-- below. The database still validates every binding that it can independently
-- enforce (owner, room, product and appAccountToken).

-- ---------------------------------------------------------------- App Store billing

alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'manual', 'promotion', 'app_store'));

alter table public.entitlements
  add column app_store_transaction_id text unique;

create table public.app_store_purchase_attempts (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  product_id text not null,
  status text not null default 'created'
    check (status in ('created', 'pending', 'fulfilled', 'failed', 'expired')),
  transaction_id text unique,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index app_store_attempts_owner_created_idx
  on public.app_store_purchase_attempts(owner_id, created_at desc);
create index app_store_attempts_room_status_idx
  on public.app_store_purchase_attempts(room_id, status, created_at desc);

create table public.app_store_transactions (
  transaction_id text primary key,
  original_transaction_id text,
  app_account_token uuid not null,
  product_id text not null,
  bundle_id text not null,
  environment text not null check (environment in ('Sandbox', 'Production')),
  purchase_at timestamptz not null,
  signed_transaction text not null,
  status text not null default 'purchased'
    check (status in ('purchased', 'refunded')),
  entitlement_id uuid unique references public.entitlements(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index app_store_transactions_token_idx
  on public.app_store_transactions(app_account_token);

create table public.app_store_events (
  notification_uuid uuid primary key,
  notification_type text not null,
  subtype text,
  transaction_id text,
  environment text check (environment is null or environment in ('Sandbox', 'Production')),
  status text not null default 'processed'
    check (status in ('processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index app_store_events_transaction_idx
  on public.app_store_events(transaction_id, received_at desc);

alter table public.app_store_purchase_attempts enable row level security;
alter table public.app_store_transactions enable row level security;
alter table public.app_store_events enable row level security;

create policy "owners read App Store purchase attempts"
  on public.app_store_purchase_attempts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owners read App Store transactions"
  on public.app_store_transactions for select to authenticated
  using (exists (
    select 1 from public.app_store_purchase_attempts a
    where a.id = public.app_store_transactions.app_account_token
      and a.owner_id = (select auth.uid())
  ));

revoke all on table public.app_store_purchase_attempts from public, anon, authenticated;
revoke all on table public.app_store_transactions from public, anon, authenticated;
revoke all on table public.app_store_events from public, anon, authenticated;
grant select on table public.app_store_purchase_attempts to authenticated;
grant select on table public.app_store_transactions to authenticated;
grant all on table public.app_store_purchase_attempts, public.app_store_transactions,
  public.app_store_events to service_role;

create or replace function public.fulfill_app_store_event_pass(
  p_attempt_id uuid,
  p_owner_id uuid,
  p_transaction_id text,
  p_original_transaction_id text,
  p_product_id text,
  p_bundle_id text,
  p_environment text,
  p_purchase_at timestamptz,
  p_signed_transaction text
) returns public.entitlements
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.app_store_purchase_attempts;
  v_entitlement public.entitlements;
  v_starts_at timestamptz;
begin
  select * into v_entitlement
  from public.entitlements where app_store_transaction_id = p_transaction_id;
  if v_entitlement.id is not null then return v_entitlement; end if;

  select * into v_attempt from public.app_store_purchase_attempts
  where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.owner_id <> p_owner_id then
    raise exception 'App Store attempt ownership mismatch';
  end if;
  if v_attempt.product_id <> p_product_id then
    raise exception 'App Store attempt product mismatch';
  end if;
  if v_attempt.expires_at <= now() and v_attempt.status <> 'fulfilled' then
    update public.app_store_purchase_attempts set status = 'expired', updated_at = now()
    where id = p_attempt_id;
    raise exception 'App Store attempt expired';
  end if;
  if not exists (
    select 1 from public.rooms where id = v_attempt.room_id and owner_id = p_owner_id
  ) then raise exception 'App Store room ownership mismatch'; end if;
  if p_environment not in ('Sandbox', 'Production') then
    raise exception 'unsupported App Store environment';
  end if;

  insert into public.app_store_transactions(
    transaction_id, original_transaction_id, app_account_token, product_id,
    bundle_id, environment, purchase_at, signed_transaction
  ) values (
    p_transaction_id, p_original_transaction_id, p_attempt_id, p_product_id,
    p_bundle_id, p_environment, p_purchase_at, p_signed_transaction
  ) on conflict (transaction_id) do nothing;

  -- Consumables are additive. A delayed Ask-to-Buy approval must not erase time
  -- already purchased through another channel.
  select greatest(
    p_purchase_at,
    now(),
    coalesce(max(expires_at) filter (where status = 'active'), now())
  ) into v_starts_at
  from public.entitlements where room_id = v_attempt.room_id;

  insert into public.entitlements(
    owner_id, room_id, kind, source, status, starts_at, expires_at,
    history_expires_at, app_store_transaction_id
  ) values (
    p_owner_id, v_attempt.room_id, 'event_pass', 'app_store', 'active',
    v_starts_at, v_starts_at + interval '7 days',
    v_starts_at + interval '37 days', p_transaction_id
  ) returning * into v_entitlement;

  update public.app_store_transactions
  set entitlement_id = v_entitlement.id, updated_at = now()
  where transaction_id = p_transaction_id;
  update public.app_store_purchase_attempts
  set status = 'fulfilled', transaction_id = p_transaction_id, updated_at = now()
  where id = p_attempt_id;
  return v_entitlement;
end;
$$;

create or replace function public.record_app_store_event(
  p_notification_uuid uuid,
  p_notification_type text,
  p_subtype text,
  p_transaction_id text,
  p_environment text,
  p_status text,
  p_error_message text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_store_events(
    notification_uuid, notification_type, subtype, transaction_id,
    environment, status, error_message, processed_at
  ) values (
    p_notification_uuid, p_notification_type, p_subtype, p_transaction_id,
    p_environment, p_status, p_error_message, now()
  ) on conflict (notification_uuid) do update set
    notification_type = excluded.notification_type,
    subtype = excluded.subtype,
    transaction_id = excluded.transaction_id,
    environment = excluded.environment,
    status = excluded.status,
    error_message = excluded.error_message,
    processed_at = excluded.processed_at;
  return found;
end;
$$;

create or replace function public.refund_app_store_event_pass(
  p_transaction_id text,
  p_refunded_at timestamptz,
  p_reason text default 'app_store_refund'
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.app_store_transactions
  set status = 'refunded', revoked_at = p_refunded_at, updated_at = now()
  where transaction_id = p_transaction_id;
  update public.entitlements
  set status = 'revoked', revoked_at = p_refunded_at,
      revoked_reason = p_reason, updated_at = now()
  where app_store_transaction_id = p_transaction_id and status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.reverse_app_store_refund(p_transaction_id text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.app_store_transactions
  set status = 'purchased', revoked_at = null, updated_at = now()
  where transaction_id = p_transaction_id;
  update public.entitlements
  set status = case when expires_at > now() then 'active' else 'revoked' end,
      revoked_at = case when expires_at > now() then null else revoked_at end,
      revoked_reason = case when expires_at > now() then null else revoked_reason end,
      updated_at = now()
  where app_store_transaction_id = p_transaction_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fulfill_app_store_event_pass(
  uuid,uuid,text,text,text,text,text,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.fulfill_app_store_event_pass(
  uuid,uuid,text,text,text,text,text,timestamptz,text
) to service_role;
revoke all on function public.record_app_store_event(
  uuid,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.record_app_store_event(
  uuid,text,text,text,text,text,text
) to service_role;
revoke all on function public.refund_app_store_event_pass(text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.refund_app_store_event_pass(text,timestamptz,text)
  to service_role;
revoke all on function public.reverse_app_store_refund(text)
  from public, anon, authenticated;
grant execute on function public.reverse_app_store_refund(text) to service_role;

-- ---------------------------------------------------------------- UGC safety

create table private.comment_authors (
  comment_id uuid primary key references public.comments(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index comment_authors_room_user_idx
  on private.comment_authors(room_id, user_id);
revoke all on table private.comment_authors from public, anon, authenticated;

create table public.room_participant_blocks (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_participant_blocks_user_idx
  on public.room_participant_blocks(user_id, room_id);
alter table public.room_participant_blocks enable row level security;
create policy "operators read room participant blocks"
  on public.room_participant_blocks for select to authenticated
  using (private.is_room_operator(room_id));
revoke all on table public.room_participant_blocks from public, anon, authenticated;
grant select on table public.room_participant_blocks to authenticated;
grant all on table public.room_participant_blocks to service_role;

-- A blocked audience identity cannot regain access by calling join_room again.
create or replace function private.has_room_access(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_room_operator(p_room_id) or (
    not exists (
      select 1 from public.room_participant_blocks b
      where b.room_id = p_room_id and b.user_id = (select auth.uid())
    ) and exists (
      select 1 from public.audience_room_access a
      where a.room_id = p_room_id
        and a.user_id = (select auth.uid())
        and a.expires_at > now()
    )
  );
$$;
revoke all on function private.has_room_access(uuid) from public, anon, authenticated;
grant execute on function private.has_room_access(uuid) to authenticated;

create or replace function public.join_room(p_code text, p_passcode text default null)
returns table(id uuid, code text, title text, language text)
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms; v_hash text;
begin
  if (select auth.uid()) is null then raise exception 'anonymous session required'; end if;
  select r.* into v_room from public.rooms r
  where r.code = upper(regexp_replace(btrim(p_code), '\s', '', 'g'));
  if v_room.id is null then return; end if;
  if exists (
    select 1 from public.room_participant_blocks b
    where b.room_id = v_room.id and b.user_id = (select auth.uid())
  ) then raise exception 'room participant blocked' using errcode = 'insufficient_privilege'; end if;
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
revoke all on function public.join_room(text,text) from public, anon;
grant execute on function public.join_room(text,text) to authenticated;

-- Filtering is a free safety baseline. Paid approval mode remains independent.
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

drop policy if exists "operators manage moderation terms" on public.moderation_terms;
create policy "operators manage moderation terms"
  on public.moderation_terms for all to authenticated
  using (private.is_room_operator(room_id))
  with check (private.is_room_operator(room_id));

create or replace function public.ban_room_participant(
  p_room_id uuid,
  p_comment_id uuid default null,
  p_room_stamp_id uuid default null,
  p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_comment public.comments; v_stamp public.room_stamps;
begin
  if not private.is_room_operator(p_room_id) then raise exception 'room access denied'; end if;
  if num_nonnulls(p_comment_id, p_room_stamp_id) <> 1 then raise exception 'invalid block target'; end if;
  if p_comment_id is not null then
    select c.* into v_comment from public.comments c
    where c.id = p_comment_id and c.room_id = p_room_id;
    select a.user_id into v_user_id from private.comment_authors a
    where a.comment_id = p_comment_id and a.room_id = p_room_id;
    if v_comment.id is null or v_user_id is null then raise exception 'block target not found'; end if;
  else
    select s.* into v_stamp from public.room_stamps s
    where s.id = p_room_stamp_id and s.room_id = p_room_id;
    v_user_id := v_stamp.owner_user_id;
    if v_stamp.id is null or v_user_id is null then raise exception 'block target not found'; end if;
  end if;
  if exists (
    select 1 from public.room_members m where m.room_id = p_room_id and m.user_id = v_user_id
  ) then raise exception 'room operators cannot be blocked'; end if;

  insert into public.room_participant_blocks(room_id, user_id, blocked_by, reason)
  values (p_room_id, v_user_id, (select auth.uid()), nullif(btrim(p_reason), ''))
  on conflict (room_id, user_id) do update
    set blocked_by = excluded.blocked_by, reason = excluded.reason, created_at = now();
  delete from public.audience_room_access
  where room_id = p_room_id and user_id = v_user_id;

  if p_comment_id is not null then
    update public.comments
    set status_before_hidden = case when status = 'hidden' then status_before_hidden else status end,
        status = 'hidden', moderated_by = (select auth.uid()), moderated_at = now()
    where id = p_comment_id;
  else
    delete from public.room_stamps where id = p_room_stamp_id;
  end if;
  return v_user_id;
end;
$$;

create or replace function public.unblock_room_participant(
  p_room_id uuid, p_user_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_room_operator(p_room_id) then raise exception 'room access denied'; end if;
  delete from public.room_participant_blocks
  where room_id = p_room_id and user_id = p_user_id;
end;
$$;

revoke all on function public.ban_room_participant(uuid,uuid,uuid,text)
  from public, anon;
grant execute on function public.ban_room_participant(uuid,uuid,uuid,text)
  to authenticated;
revoke all on function public.unblock_room_participant(uuid,uuid)
  from public, anon;
grant execute on function public.unblock_room_participant(uuid,uuid)
  to authenticated;

-- Explicitly expose only the new public API objects. This is required both now
-- and after Supabase's 2026-10-30 default-grant lockdown.
grant select on table public.entitlements to authenticated;
