-- ⚠️ 2026-09-11: このファイルは `20260905033612_apple_review_safety_storekit` を含まない古いミラーを
-- もとに書かれていて、本番の `post_comment` / `create_room` を 9/5 の設計から外していた
-- （投稿者の記録が消え、コメントからのブロックが全件落ちた）。
-- `20260911041638_restore_post_comment_authors_and_presenter_gate` で戻している。**単独で当て直さないこと。**

-- 新しいルームに既定の NG ワードを入れる（App Store 1.2「フィルタする手段」）。
--
-- `moderation_terms` は初期値が空だった。1.2 は「不適切な投稿をフィルタする手段」を求めるが、
-- **空のリストは「手段はあるが何もしていない」** に見える。審査員は新しいルームを作って試すので、
-- そこで 0 件のリストを見せない。
--
-- 発表者は `ModerationPanel` から1語ずつ消せる（消せないと「発表者の意図しない検閲」になる）。
-- ここは"初期値"であって強制ではない。
--
-- ---------------------------------------------------------------- 語の選び方
--
-- **`contains` は部分一致なので、短い語は普通の単語を巻き込む。** 選ぶときは
-- 「その語を含む無害な単語が無いか」を必ず確かめること。実際に踏みかけたもの:
--
--   カス   → **カスタムスタンプ**（このアプリの機能名そのもの）。絶対に入れない
--   バカ   → バカンス
--   ゴミ   → ゴミ箱（技術の話で普通に出る）
--   帰れ   → 持ち帰れ / 見て帰れ
--   ブス   → デブス / ブスッと
--   ass    → class / password / assessment（英語圏で有名な Scunthorpe problem）
--   dick   → Dickens / Dickinson（人名）
--   hell   → shell / hello
--
-- なので下の一覧は**短い語をわざと外し**、明確な罵倒・脅迫・差別語だけに絞ってある。
-- 増やすときも同じ基準で。迷ったら入れない（誤検知は発表を壊すが、取りこぼしは発表者が消せる）。
--
-- 判定は `post_comment` が `lower()` で行うので大文字小文字は区別されない。
-- 英語は語形変化（-s / -ing / -ed）が部分一致で拾われるため原形だけでよい。
--
-- ---------------------------------------------------------------- 語を足したら必ず回す
--
-- 下の一覧は良性26件・有害11件のコーパスに対して**誤検知0・取りこぼし0**を実測して決めた
-- （2026-09-08）。語を足すときは、`benign` に自分の発表で出そうな言い回しを足してから
-- これを回すこと。1行でも返ったら、その語は入れてはいけない。
--
--   with benign(txt) as (
--     select unnest(array[
--       'カスタムスタンプが便利ですね','バカンス中に試してみます','ゴミ箱の実装は？',
--       '資料は持ち帰れますか','屑鉄のリサイクル事業','殺菌フィルタの性能','相殺されるコスト',
--       'しねばならない理由','気持ちいいUXですね','アホみたいに速い','うざったい設定が減った',
--       '激しく同意します','class の継承は？','password の管理方法は？','assessment の基準',
--       'Dickinson の論文','shell script で自動化','hello world から始めましょう',
--       'Scunthorpe の事例','massive な改善ですね','we ship it every friday'
--     ])
--   )
--   select b.txt, t.term
--   from benign b
--   join unnest(private.default_moderation_terms()) as t(term)
--     on strpos(lower(b.txt), lower(btrim(t.term))) > 0;

create or replace function private.default_moderation_terms()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    -- 日本語: 脅迫・自傷の教唆
    '死ね', '氏ね', '殺す', '殺害', '消え失せろ', '自殺しろ',
    -- 日本語: 明確な罵倒
    'キモい', 'きもい', '気持ち悪い', 'ブサイク', 'クソが', 'ウザい', 'うざい',
    'アホか', '黙れ', 'クズが',
    -- 日本語: 差別語
    'キチガイ', 'きちがい', '池沼', 'メクラ', 'つんぼ',
    -- 日本語: 露骨な性的表現
    'レイプ', 'セックスしろ',
    -- English: threats
    'kill yourself', 'kill you', 'go die',
    -- English: profanity（短すぎる ass / hell / dick は入れない）
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'douchebag',
    -- English: slurs
    'nigger', 'faggot', 'retard', 'tranny', 'whore',
    -- English: sexual
    'rape'
  ];
$$;

revoke all on function private.default_moderation_terms() from public, anon, authenticated;

-- create_room に1行足しただけ。ほかは 20260815033436_monetization_event_pass.sql:279-293 と同じ。
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
  -- 既定の NG ワード。発表者は個別に消せる。
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
