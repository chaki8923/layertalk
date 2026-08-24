-- A room passcode belongs to the Event Pass that created it. Keeping only the
-- hash made an expired passcode remain effective forever and allowed it to
-- come back when the room bought another pass.
alter table public.moderation_rules
  add column entry_passcode_entitlement_id uuid references public.entitlements(id) on delete set null;

-- Preserve passcodes for passes that are active when this migration is
-- applied. Expired passcodes deliberately remain unbound and therefore inert.
update public.moderation_rules mr
   set entry_passcode_entitlement_id = (
     select e.id
       from public.entitlements e
      where e.room_id = mr.room_id
        and e.status = 'active'
        and e.starts_at <= now()
        and e.expires_at > now()
      order by e.expires_at desc
      limit 1
   )
 where mr.entry_passcode_hash is not null;

create or replace function private.active_room_passcode_hash(p_room_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select mr.entry_passcode_hash
    from public.moderation_rules mr
    join public.entitlements e on e.id = mr.entry_passcode_entitlement_id
   where mr.room_id = p_room_id
     and e.room_id = p_room_id
     and e.status = 'active'
     and e.starts_at <= now()
     and e.expires_at > now()
   limit 1;
$$;

revoke all on function private.active_room_passcode_hash(uuid) from public, anon, authenticated;

create or replace function public.find_public_room_by_code(p_code text)
returns table(id uuid, code text, title text, language text, requires_passcode boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.code, r.title, r.language,
         private.active_room_passcode_hash(r.id) is not null
    from public.rooms r
   where r.code = upper(regexp_replace(btrim(p_code), '\s', '', 'g'))
   limit 1;
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
  v_hash := private.active_room_passcode_hash(v_room.id);
  if v_hash is not null and (p_passcode is null or extensions.crypt(p_passcode, v_hash) <> v_hash) then
    raise exception 'invalid room passcode' using errcode = 'invalid_password';
  end if;
  insert into public.audience_room_access(room_id, user_id, expires_at)
  values (v_room.id, (select auth.uid()), now() + interval '12 hours')
  on conflict (room_id, user_id) do update set expires_at = excluded.expires_at;
  return query select v_room.id, v_room.code, v_room.title, v_room.language;
end;
$$;

create or replace function public.set_room_passcode(p_room_id uuid, p_passcode text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_entitlement_id uuid;
begin
  if not private.is_room_operator(p_room_id) then
    raise exception 'room access denied';
  end if;
  v_entitlement_id := private.active_entitlement_id(p_room_id);
  if v_entitlement_id is null then
    raise exception 'active Event Pass required';
  end if;
  if p_passcode is not null and char_length(p_passcode) not between 4 and 12 then
    raise exception 'passcode must contain 4 to 12 characters';
  end if;
  update public.moderation_rules
     set entry_passcode_hash = case when nullif(p_passcode, '') is null then null
                                    else extensions.crypt(p_passcode, extensions.gen_salt('bf')) end,
         entry_passcode_entitlement_id = case when nullif(p_passcode, '') is null then null
                                              else v_entitlement_id end,
         updated_at = now()
   where room_id = p_room_id;
end;
$$;
