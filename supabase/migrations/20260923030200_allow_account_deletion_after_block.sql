-- 退会（App Store 5.1.1(v)）が、一度でもブロックを押した発表者だけ失敗していた。
-- 2026-09-23 に実機で再現（画面には「アカウントを削除できませんでした」としか出ない）。
--
-- `room_participant_blocks.blocked_by` が `on delete restrict` で auth.users を指していたため、
-- `auth.admin.deleteUser` が FK 違反で落ちる。`moderation_actions.actor_id` を
-- `20260904035052_allow_presenter_account_deletion.sql` で直したのと同じ穴が、
-- `20260905033612_apple_review_safety_storekit.sql`（ブロック対応）で1つ増えていた。
--
-- **restrict は、同じ文の別の cascade でその行が消える場合でも即座に弾く**（no action と違う）。
-- room_id は rooms へ cascade していて、rooms は auth.users から cascade するが、それでは救われない。
--
-- cascade ではなく set null にする理由: ブロックは安全機能の記録で、行ごと消えると
-- 締め出したはずの参加者が戻れてしまう（`private.has_room_access` がこの表を見ている）。
-- 誰が押したかは `comments.moderated_by` / `content_reports.reporter_id` /
-- `moderation_actions.actor_id` と同じく消えてよい。アプリは blocked_by を読んでいない。
alter table public.room_participant_blocks alter column blocked_by drop not null;

alter table public.room_participant_blocks
  drop constraint room_participant_blocks_blocked_by_fkey;

alter table public.room_participant_blocks
  add constraint room_participant_blocks_blocked_by_fkey
  foreign key (blocked_by) references auth.users(id) on delete set null;
