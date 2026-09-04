-- 発表者が自分でアカウントを消せるようにする（App Store 5.1.1(v)）。
--
-- `moderation_actions.actor_id` が `on delete restrict` だったので、**一度でも承認／非表示を
-- 押した発表者は `auth.admin.deleteUser` が FK 違反で必ず失敗する**。しかも失敗するのは
-- 「モデレーションを使った人＝有料で使い込んだ人」だけなので、素で試すと気付けない。
--
-- 監査行そのものは残したいので、`comments.moderated_by` が既に選んでいるのと同じ
-- `on delete set null` に揃える（誰がやったかは消えるが、いつ何が起きたかは残る）。

alter table public.moderation_actions
  drop constraint moderation_actions_actor_id_fkey;

alter table public.moderation_actions
  alter column actor_id drop not null;

alter table public.moderation_actions
  add constraint moderation_actions_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;
