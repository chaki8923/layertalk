-- Keep the legacy client-id argument for API compatibility, but never trust it
-- as an identity. Anonymous Auth gives every audience session a server-signed uid.
create or replace function public.toggle_comment_like(p_comment_id uuid, p_client_id text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int; v_room_id uuid; v_voter_id text := (select auth.uid())::text;
begin
  select room_id into v_room_id from public.comments where id = p_comment_id and status = 'approved';
  if v_voter_id is null or v_room_id is null or not private.has_room_access(v_room_id) then
    raise exception 'comment not available';
  end if;
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
  where c.room_id = p_room_id and c.status = 'approved'
    and cl.client_id = (select auth.uid())::text
    and private.has_room_access(p_room_id);
$$;

revoke execute on function public.toggle_comment_like(uuid,text) from public, anon;
grant execute on function public.toggle_comment_like(uuid,text) to authenticated;
revoke execute on function public.liked_comment_ids(uuid,text) from public, anon;
grant execute on function public.liked_comment_ids(uuid,text) to authenticated;
