# Event Pass を手で有効にする（テスト用）

最終更新: 2026-09-26

決済を通さずに Event Pass の機能（承認制・NG ワード・入室パスコード・発表レポート・
ブランド設定・表示プリセット）を試したいときの手順。**触るのは `public.entitlements` の1行だけ。**

実行先は **MCP か Supabase の SQL Editor**（service role）。`entitlements` に INSERT ポリシーは
無いので、アプリからは入らない。

---

## 有効にする

参加コードを差し替えて流す。

```sql
insert into public.entitlements
  (owner_id, room_id, kind, source, status, starts_at, expires_at, history_expires_at)
select r.owner_id, r.id, 'event_pass', 'manual', 'active',
       now(), now() + interval '7 days', now() + interval '37 days'
from public.rooms r
where r.code = 'XXXXXX'   -- ← 参加コード
returning id, room_id, owner_id, status, expires_at, history_expires_at;
```

`returning` が 0 行なら、そのコードのルームが存在しない（罠 #14 の幽霊ルーム）。

### 確認

```sql
select private.has_paid_room_features(
         (select id from public.rooms where code = 'XXXXXX')) as paid;
```

アプリ側は `EventPassPanel` が **15 秒ポーリング＋ウィンドウのフォーカス**で取り直すので、
**再起動も発表の再開も不要**。発表中に入れても即座に効く
（`has_paid_room_features` は「有効な権利行」と「進行中セッションの `entitlement_snapshot.paid`」の OR）。

---

## 元に戻す

```sql
update public.entitlements
   set status = 'revoked', revoked_at = now(), revoked_reason = 'test'
 where room_id = (select id from public.rooms where code = 'XXXXXX')
   and source = 'manual'
   and status = 'active'
returning id, status, revoked_at;
```

> **`source = 'manual'` を必ず付けること。** 付けないと、本物の購入（`stripe` / `app_store`）で
> 作られた権利まで取り消す。

行ごと消したいときだけ:

```sql
delete from public.entitlements
 where room_id = (select id from public.rooms where code = 'XXXXXX')
   and source = 'manual';
```

失効させたあとの挙動は「無料ルーム」と同じ。`room_branding` / `moderation_rules` の UPDATE は
**黙って 0 行更新**になる（罠 #16）ので、画面の表示だけ変わって DB が変わらない状態を
「効いている」と読み違えないこと。

---

## 押さえるところ

- **`owner_id` は必ず `rooms.owner_id`。** SELECT ポリシーは
  `owner_id = (select auth.uid())` の1本だけなので、ここがズレると
  **サーバ側の機能は有効なのに画面は無料のまま**という食い違いになる
  （`fetchActiveEntitlement` が null を返す）
- 制約は `expires_at > starts_at` と `history_expires_at >= expires_at` の2つだけ。
  Stripe 系の列（`stripe_checkout_session_id` など）は全部 null で通る
- `source` の許容値は `stripe` / `manual` / `promotion` / `app_store`。
  手で入れるものは **`manual`** に統一する（戻すときの絞り込みに使う）
- `history_expires_at` は発表レポートを後から出せる期間。失効後も触りたいなら長めに
- 権利を消しても、**直接配布版は署名済みリース（`billing.direct.ts` の
  `refreshEntitlementLease`）を localStorage に持っている**ので、その期限が切れるまで
  手元では有料のまま見えることがある。MAS 版はリースを持たない（常に null）

---

## これをやっても動かないもの

- **IAP 審査用の「価格が出ているスクリーンショット」。** 有効な権利行があると
  `EventPassPanel` は購入導線ではなく「有効」表示になる。価格入りの購入シートは
  StoreKit が動く署名ビルドで、**権利を入れる前に**撮る（`docs/app-store-listing.md` の 7.）
- **質問スライドの保存とレポート。** 権利とは別に、画面収録の許可と
  「質問時のスライドを保存」の ON が要る。しかも撮る／撮らないは
  **「プレゼンを開始」を押した瞬間にしか評価されない**（`ControlWindow.tsx` の `captureSessionId`）ので、
  発表中に ON にしてもその発表では撮れない。
  保存先（サンドボックス版）は
  `~/Library/Containers/app.layertalk.presenter/Data/Library/Application Support/app.layertalk.presenter/question-captures/<セッションID>/`。
  レポートの一覧は**画像が1枚以上あるセッションだけ**を並べる
