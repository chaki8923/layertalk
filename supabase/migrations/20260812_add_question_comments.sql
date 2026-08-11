-- 質問投稿を通常コメントと同じ Realtime 経路で扱う。
-- default false により既存行と旧クライアントからの INSERT は通常コメントのままになる。
alter table public.comments
  add column is_question boolean not null default false;

comment on column public.comments.is_question is
  '質問として投稿されたコメント。プレゼンターでは右側の質問レールに表示する。';
