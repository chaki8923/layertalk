-- Keep visibility toggles separate from approval. Restoring a hidden pending
-- comment must return it to pending, and restoring an approved comment must
-- not look like a new approval to Realtime clients.

alter table public.comments
  add column status_before_hidden text
    check (status_before_hidden in ('approved', 'pending'));

comment on column public.comments.status_before_hidden is
  'Status to restore after a visibility-only hide. Kept after restore so clients can distinguish restore from explicit approval.';

-- Hidden rows predate this column. The production moderation history was
-- audited before this migration; all existing hidden rows came from approved.
update public.comments
set status_before_hidden = 'approved'
where status = 'hidden';

create or replace function public.moderate_comment(p_comment_id uuid, p_action text)
returns public.comments language plpgsql security definer set search_path = '' as $$
declare
  v_comment public.comments;
  v_status text;
  v_status_before_hidden text;
  v_question text;
begin
  select * into v_comment from public.comments where id = p_comment_id;
  if v_comment.id is null or not private.is_room_operator(v_comment.room_id)
     or not private.has_paid_room_features(v_comment.room_id) then
    raise exception 'active Event Pass required';
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
