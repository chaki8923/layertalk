-- サインイン無しでルームを作れるようにする（App Store 5.1.1(v)）。
--
-- 5.1.1(v) は「中核的なアカウント機能が無いならログインを求めないこと」を求める。
-- これまで起動直後にメール6桁 OTP の全画面ゲートがあり、**無料で試すだけの人にも
-- メールアドレスを要求していた**。指摘されうる形なので、匿名でも一通り使えるようにする。
--
-- **`is_permanent_user()` を呼んでいたのはこの関数だけ**だった。`resume_room` /
-- `join_room` / `post_comment` / `moderate_comment` はどれも `authenticated` で足りていて、
-- **Supabase の匿名ユーザーは `authenticated` ロールを持つ**ので元から通る。
-- つまり壁はここ1枚だけで、外しても RLS の設計は動かない。
--
-- 課金は本会員のみのまま。`requirePresenter`（`apps/audience-web/src/lib/server/supabase-admin.ts`）が
-- `is_anonymous` を弾いているので、購入・レポート・退会は匿名では通らない。
--
-- **匿名 → 本会員は同じ user id のまま昇格する**（`updateUser({ email })` の identity linking）。
-- 所有権の移し替えは不要で、匿名のうちに作ったルームはそのまま残る。
-- ただし Supabase 側で **Manual linking を有効にしていないと昇格できない**（既定は無効・beta）。
--
-- ⚠️ 保持ジョブ（`api/internal/retention/route.ts`）は匿名ユーザーを30日で消す。
-- **ルームを持つ匿名ユーザーは除外すること**（同じ変更で対応済み）。除外を外すと、
-- 匿名発表者のルームが cascade で消えて罠 #14 の「コードは残っているが DB に無い」状態になる。

create or replace function public.create_room(p_title text default null, p_language text default 'ja')
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms;
begin
  -- 匿名ユーザーにも開く。サインインしているかではなく、セッションがあるかだけを見る。
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_language not in ('ja', 'en') then raise exception 'unsupported language'; end if;
  insert into public.presenter_profiles(id) values ((select auth.uid())) on conflict (id) do nothing;
  insert into public.rooms(owner_id, title, language)
  values ((select auth.uid()), nullif(btrim(p_title), ''), p_language) returning * into v_room;
  insert into public.room_members(room_id, user_id, role) values (v_room.id, (select auth.uid()), 'owner');
  insert into public.moderation_rules(room_id) values (v_room.id);
  insert into public.room_branding(room_id) values (v_room.id);
  -- 既定の NG ワード（20260908055150）。発表者は個別に消せる。
  insert into public.moderation_terms(room_id, term, match_mode)
  select v_room.id, term, 'contains'
  from unnest(private.default_moderation_terms()) as term
  on conflict (room_id, term, match_mode) do nothing;
  return v_room;
end;
$$;

revoke all on function public.create_room(text, text) from public;
grant execute on function public.create_room(text, text) to authenticated;
revoke execute on function public.create_room(text, text) from anon;

-- `is_permanent_user()` は呼び出し元が無くなるが、**消さないこと。**
-- 「本会員だけに開く」判定を将来また書くときの唯一の正しい書き方で、
-- `auth.jwt() ->> 'is_anonymous'` を各所に散らすと必ず綴りを間違える。
comment on function private.is_permanent_user() is
  'True when the caller is signed in and not an anonymous user. Currently unused: create_room was opened to anonymous presenters for App Store 5.1.1(v). Keep this as the single correct way to express "permanent users only".';
