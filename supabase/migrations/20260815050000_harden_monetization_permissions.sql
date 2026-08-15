-- Supabase projects may grant function EXECUTE directly to API roles through
-- default privileges. Revoke those direct grants explicitly for server-only RPCs.
revoke execute on function public.fulfill_event_pass(
  text,text,text,boolean,text,uuid,uuid,text,text,text,text,integer,text,timestamptz
) from anon, authenticated;
revoke execute on function public.revoke_event_pass(
  text,text,text,boolean,text,text,text
) from anon, authenticated;

-- Public discovery is the only RPC callable before authentication.
revoke execute on function public.create_room(text,text) from anon;
revoke execute on function public.resume_room(text) from anon;
revoke execute on function public.join_room(text,text) from anon;
revoke execute on function public.set_room_language(uuid,text) from anon;
revoke execute on function public.set_room_passcode(uuid,text) from anon;
revoke execute on function public.post_comment(uuid,uuid,text,boolean) from anon;
revoke execute on function public.moderate_comment(uuid,text) from anon;
revoke execute on function public.start_presentation(uuid) from anon;
revoke execute on function public.end_presentation(uuid) from anon;
revoke execute on function public.reserve_room_stamp(uuid,text) from anon;
revoke execute on function public.delete_room_stamp(uuid) from anon;
revoke execute on function public.send_stamp(uuid,text,integer) from anon;
revoke execute on function public.toggle_comment_like(uuid,text) from anon;
revoke execute on function public.liked_comment_ids(uuid,text) from anon;

create index checkout_attempts_owner_idx on public.checkout_attempts(owner_id);
create index comments_moderated_by_idx on public.comments(moderated_by) where moderated_by is not null;
create index moderation_actions_actor_idx on public.moderation_actions(actor_id);
create index moderation_actions_comment_idx on public.moderation_actions(comment_id) where comment_id is not null;
create index presentation_sessions_entitlement_idx on public.presentation_sessions(entitlement_id) where entitlement_id is not null;
create index stamp_events_room_idx on public.stamp_events(room_id);
create index stamp_events_sender_idx on public.stamp_events(sender_id);
