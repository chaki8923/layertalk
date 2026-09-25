-- 既定の NG ワードを「日本語と英語の罵倒」だけに絞る（38語 → 16語）。
--
-- 発表者のコントロール窓に並ぶ初期一覧が過激すぎた。脅迫・差別語・性的な語は一覧に出るだけで
-- きつく見えるので、既定からは外す（必要な発表者は `SafetyPanel` から自分で足せる）。
-- App Store 1.2 が求めるのは「フィルタする手段」なので、空でなければ要件は満たしたまま。
--
-- 変えるのはこの関数だけ。呼び出し元の `create_room` は触らない（罠 #25）。
-- 既存ルームにコピー済みの語はそのまま（ルーム作成時に複製されている）。
-- 元の一覧から語を抜いただけなので、`20260908055150_seed_default_moderation_terms.sql` の
-- 誤検知チェック（良性コーパスで 0 件）はそのまま成り立つ。語を足すときはあちらの手順で回すこと。

create or replace function private.default_moderation_terms()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    -- 日本語: 明確な罵倒
    'キモい', 'きもい', '気持ち悪い', 'ブサイク', 'クソが', 'ウザい', 'うざい',
    'アホか', '黙れ', 'クズが',
    -- English: profanity（短すぎる ass / hell / dick は入れない）
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'douchebag'
  ];
$$;

revoke all on function private.default_moderation_terms() from public, anon, authenticated;
