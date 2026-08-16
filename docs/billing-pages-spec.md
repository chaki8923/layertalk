# Stripe課金関連ページ 実装仕様

- ステータス: 実装準備
- 更新日: 2026-08-16
- 対象: Event Pass（2,980円／1ルーム／7日間）の単発購入
- 対象アプリ: `apps/presenter-app`、`apps/audience-web`
- 関連資料: `docs/monetization-plan.md`、`docs/monetization-setup.md`

> この文書は実装仕様であり、法的助言ではない。公開前に、実際の販売主体・返金方針・
> 問い合わせ先を確定し、必要に応じて専門家の確認を受けること。

## 1. 目的

現在実装済みのStripe Checkoutフローに、購入前の説明、法務情報、問い合わせ、
購入後の確認導線を追加し、利用者が次の内容を迷わず確認できる状態にする。

- 何を、いくらで購入するのか
- どのルームで、いつまで利用できるのか
- 決済後、いつ有効になるのか
- キャンセル・返金を希望するとき、どこへ連絡するのか
- 販売主体、利用規約、個人情報の取り扱い
- 購入が完了・保留・未完了のどの状態か

## 2. 現状

実装済み:

- Presenterアプリ内のEvent Pass販売カード
  - `apps/presenter-app/src/components/EventPassPanel.tsx`
- Presenterアプリから外部ブラウザでStripe Checkoutを開く処理
  - `apps/presenter-app/src/lib/billing.ts`
- Checkout Session作成API
  - `apps/audience-web/src/app/api/billing/checkout/route.ts`
- Stripe Webhookと冪等な権利付与
  - `apps/audience-web/src/app/api/billing/webhook/route.ts`
  - `apps/audience-web/src/lib/server/fulfillment.ts`
- 決済成功ページ
  - `apps/audience-web/src/app/billing/success/page.tsx`
- 決済キャンセルページ
  - `apps/audience-web/src/app/billing/cancelled/page.tsx`
- `entitlements`、`checkout_attempts`、`billing_events`
  - `supabase/migrations/20260815033436_monetization_event_pass.sql`

不足しているもの:

- Event Passの公開説明ページ
- Checkoutへ移動する直前の購入確認UI
- 特定商取引法に基づく表記
- 利用規約
- プライバシーポリシー
- 問い合わせ・返金案内
- アプリ内の購入履歴／有効期限確認
- 成功・キャンセルページの状態別表示と次の行動

## 3. 固定する実装方針

### 3.1 決済UI

- カード情報はLayerTalkで収集せず、Stripe-hosted Checkoutを継続使用する。
- Event Passは `Checkout Sessions` の `mode: "payment"` を使う。
- `payment_method_types` は指定しない。Stripe Dashboardの動的な支払い方法設定を使う。
- Checkout Sessionには8文字のランダムサフィックスを含む `integration_identifier` を付ける。
- Stripe APIはAudience Webのサーバーからだけ呼ぶ。
- PresenterアプリへRestricted API KeyやWebhook Secretを入れない。

### 3.2 認証境界

- 購入開始と購入履歴の確認は、ログイン済みPresenterアプリから行う。
- 外部ブラウザ側に、新しいPresenterログイン画面は作らない。
- 法務・説明・サポートページは認証不要の公開ページにする。
- 購入対象ルームの所有権は、Checkout Session作成APIで必ず再検証する。

### 3.3 権利付与

- 表示上の成功ページを権利付与の根拠にしない。
- Stripeから取得したCheckout Sessionの支払い状態、商品、金額、通貨、metadataを検証する。
- Webhookを通常経路とし、成功ページからの検証はWebhook遅延時の補助経路として扱う。
- 同一Sessionまたは同一Eventの再送で権利を二重作成しない。

### 3.4 初期スコープ

- 今回は単発のEvent Passのみを扱う。
- 独自のカード入力フォームは作らない。
- Pro／Teamのサブスクリプション、プラン変更、解約は今回実装しない。
- Stripe Customer PortalはPro／Team実装時に追加する。
- 自動税計算は、税務登録と課税方針が確定するまで有効化しない。

## 4. 画面とルート一覧

| 優先度 | 画面 | 配置 | ルート／実装場所 | 認証 |
|---|---|---|---|---|
| P0 | Event Pass説明 | Audience Web | `/event-pass` | 不要 |
| P0 | 購入確認シート | Presenter | `EventPassPanel`内 | 必要 |
| P0 | 特定商取引法に基づく表記 | Audience Web | `/legal/tokusho` | 不要 |
| P0 | 利用規約 | Audience Web | `/legal/terms` | 不要 |
| P0 | プライバシーポリシー | Audience Web | `/legal/privacy` | 不要 |
| P0 | 問い合わせ・返金案内 | Audience Web | `/support` | 不要 |
| P0 | 決済完了／確認中 | Audience Web | `/billing/success` | 不要 |
| P0 | 決済未完了 | Audience Web | `/billing/cancelled` | 不要 |
| P1 | 購入履歴・有効期限 | Presenter | `EventPassPanel`内の詳細表示 | 必要 |

## 5. 共通レイアウト

Audience Webの公開ページに、次の共通コンポーネントを追加する。

```text
apps/audience-web/src/components/public/
├── public-header.tsx
├── public-footer.tsx
└── legal-document.tsx
```

要件:

- 既存の `docs/design-system.md` と `packages/shared/styles/theme.css` を正とする。
- 新しい色・角丸をページ側に直書きしない。
- ダークファーストで、ライトモードでも読めること。
- 本文幅は `max-w-3xl` 程度、課金カードは `max-w-xl` 程度に抑える。
- 法務ページは見出しへのアンカーリンクを持つ。
- `PublicFooter` から次へ常時リンクする。
  - Event Pass
  - 利用規約
  - プライバシーポリシー
  - 特定商取引法に基づく表記
  - お問い合わせ
- 日本語を初期表示とする。英語を公開する場合は、法務文書を機械翻訳だけで確定しない。

## 6. Event Pass説明ページ

### 6.1 ルート

```text
apps/audience-web/src/app/event-pass/page.tsx
```

### 6.2 目的

購入前に商品内容を確認できる公開ページ。Presenterアプリを持っていない閲覧者にも説明できるが、
購入自体は対象ルームを所有するPresenterアプリから開始する。

### 6.3 表示内容

1. ヒーロー
   - 商品名: `LayerTalk Event Pass`
   - 見出し: `本番を安全に運営するための、1イベント用パス`
   - 価格: `2,980円（税込）`
   - 有効範囲: `購入した1ルームで7日間`
2. 含まれる機能
   - コメント承認制
   - NGワード
   - コメント・リアクションの一時停止
   - 入室パスコード
   - 発表レポートとCSV／Markdown出力
   - ブランドカラー、ロゴ、LayerTalk表記の非表示
3. 利用条件
   - 購入したルームにのみ適用
   - 購入完了後から7日間有効
   - 同じルームであればリハーサルと本番に利用可能
   - 発表中に期限へ達しても、その発表が終わるまでは権利スナップショットを維持
   - 発表履歴の出力期限は購入後30日間
4. 購入方法
   - Presenterアプリでログイン
   - 対象ルームを作成または再開
   - Event Passカードから購入
   - Stripe Checkoutで支払い
   - アプリへ戻り、有効化状態を確認
5. 注意事項
   - 決済にはStripeを使用
   - 返金条件へのリンク
   - 利用規約、プライバシー、特商法表記へのリンク

### 6.4 CTA

- 主CTA: `LayerTalkアプリで購入する`
- 初期実装ではアプリのダウンロード先または利用案内へリンクする。
- ルームIDなしでCheckout Sessionを作成してはならない。
- Webページ上に汎用の「今すぐ決済」ボタンは置かない。

### 6.5 受け入れ条件

- 価格、税込表記、期間、対象ルーム数がファーストビュー内で確認できる。
- 有料機能とFree機能の境界が説明されている。
- 返金条件と法務ページに2クリック以内で到達できる。
- モバイル幅320pxでも横スクロールが発生しない。

## 7. 購入確認シート

### 7.1 実装場所

```text
apps/presenter-app/src/components/EventPassPanel.tsx
```

必要なら次へ分割する。

```text
apps/presenter-app/src/components/EventPassPurchaseSheet.tsx
```

### 7.2 挙動

現在の `購入する` ボタンから、即座に外部ブラウザを開かない。
最初に購入確認シートを表示し、内容を確認した後の主ボタンでCheckoutを開始する。

表示項目:

- 商品: `LayerTalk Event Pass`
- 対象ルーム: ルーム名と6桁コード
- 数量: `1`
- 利用期間: `購入完了から7日間`
- 提供時期: `決済確認後、通常は即時`
- 支払額: `2,980円（税込）`
- 支払方法: `Stripe Checkoutに表示される方法`
- 返金・キャンセル条件へのリンク
- 利用規約、プライバシー、特商法表記へのリンク

ボタン:

- 主: `Stripeで2,980円を支払う`
- 副: `戻る`

### 7.3 Checkout開始中の状態

- ボタンを無効化し、スピナーを表示する。
- 二重クリックで複数Sessionを作らない。
- `attemptId` は1回の購入試行につき1つ生成し、同じ試行のリトライでは再利用する。
- 外部ブラウザを開けなかった場合は、シートを閉じずに再試行できる。
- 発表中は従来どおり購入を開始できない。

### 7.4 文言案

```text
このルーム用のEvent Passを購入します

対象: {roomTitle}（{roomCode}）
期間: 購入完了から7日間
金額: 2,980円（税込）

決済確認後、このルームの承認制、NGワード、入室パスコード、
レポート、ブランド設定が利用できるようになります。
```

### 7.5 受け入れ条件

- 対象ルームを取り違えない表示になっている。
- 金額、期間、提供時期、返金条件がCheckout移動前に確認できる。
- 外部ブラウザを開く操作は明確な1回のユーザー操作から発生する。
- 発表中は購入できず、発表操作を妨げるモーダルを自動表示しない。

## 8. Stripe Checkout設定

Checkout Session作成時に、現状のパラメータを維持した上で次を追加する。

```ts
{
  mode: "payment",
  line_items: [{ price: STRIPE_EVENT_PASS_PRICE_ID, quantity: 1 }],
  consent_collection: {
    terms_of_service: "required",
  },
  custom_text: {
    submit: {
      message: "購入完了後、このルームでEvent Passが7日間有効になります。返金条件はリンク先をご確認ください。",
    },
  },
  success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${appUrl}/billing/cancelled`,
  integration_identifier: randomIntegrationIdentifier(),
}
```

実装前のStripe Dashboard設定:

- Public detailsに利用規約URLを登録する。
- Privacy policy URLを登録する。
- Support URLまたはSupport emailを登録する。
- Statement descriptorを確認する。
- Successful paymentsのメール領収書を有効化する。
- Refundsのメール通知を有効化する。
- 動的な支払い方法をテストモードと本番モードで確認する。

注意:

- `consent_collection.terms_of_service = "required"` は、Dashboardに有効な利用規約URLがないと使えない。
- `custom_text` だけを法定表示の代わりにしない。購入前ページと法務ページも用意する。
- `payment_method_types` は追加しない。
- `automatic_tax` は税務登録確認前に追加しない。

## 9. 決済完了／確認中ページ

### 9.1 ルート

```text
apps/audience-web/src/app/billing/success/page.tsx
```

### 9.2 状態

| 状態 | 条件 | 見出し | 主な案内 |
|---|---|---|---|
| `ready` | 支払い済みで権利確認済み | Event Passを有効にしました | アプリへ戻って更新 |
| `processing` | 非同期決済またはWebhook待ち | 支払いを確認しています | 数秒後に再確認 |
| `failed` | Session不正、期限切れ、取得失敗 | 購入状態を確認できませんでした | サポートへ連絡 |

### 9.3 実装要件

- `session_id` の存在だけで成功表示しない。
- `fulfillCheckoutSession` 内のStripe再取得と検証を維持する。
- `session_id` を画面やログへ全文表示しない。
- `processing` では10秒間隔、最大6回程度の再確認を行えるようにする。
- 再確認上限後は失敗と断定せず、`確認に時間がかかっています` とサポート導線を表示する。
- ブラウザ更新で二重権利付与されないこと。
- Presenterアプリ側は復帰時に `refreshEntitlementLease(roomId)` を実行する。

### 9.4 ボタン

- `LayerTalkアプリへ戻る`
- `購入状態を再確認`
- `お問い合わせ`

カスタムURLスキームを導入していない間は、「アプリへ戻る」は説明文として表示し、
存在しないディープリンクを付けない。将来 `layertalk://billing/complete` を導入する場合は、
Tauri側の許可設定とフォールバックURLを同時に実装する。

### 9.5 受け入れ条件

- 偽の `session_id` で成功表示または権利付与されない。
- Webhookが先でも成功ページが先でも結果が同じになる。
- 同じURLを複数回更新しても権利が1件だけ存在する。
- 支払い確認が遅い場合に、購入をやり直すよう誤誘導しない。

## 10. 決済キャンセルページ

### 10.1 ルート

```text
apps/audience-web/src/app/billing/cancelled/page.tsx
```

### 10.2 表示内容

- 見出し: `購入は完了していません`
- 本文: `料金は請求されていません。LayerTalkアプリへ戻ると、そのまま無料版を利用できます。`
- 補足: `もう一度購入する場合は、アプリのEvent Passカードから再開してください。`
- リンク: Event Pass説明、サポート

### 10.3 受け入れ条件

- キャンセルをエラーや失敗として強く警告しない。
- 無料版を継続利用できることが分かる。
- Webページからルーム情報なしでCheckoutを再作成しない。

## 11. 特定商取引法に基づく表記

### 11.1 ルート

```text
apps/audience-web/src/app/legal/tokusho/page.tsx
```

### 11.2 公開前に確定する項目

次のプレースホルダーを、本番公開前に実情報へ置き換える。

| 項目 | 記載内容 |
|---|---|
| 販売事業者 | `[法人名または個人事業者名]` |
| 運営責任者 | `[責任者氏名]` |
| 所在地 | `[住所]` |
| 電話番号 | `[確実に連絡可能な番号]` |
| メールアドレス | `[サポートメール]` |
| 販売価格 | Event Pass 2,980円（税込） |
| 商品代金以外の必要料金 | インターネット接続料金等は利用者負担 |
| 支払方法 | Stripe Checkoutに表示される決済方法 |
| 支払時期 | 購入手続き完了時 |
| サービス提供時期 | 決済確認後、通常は即時 |
| 利用期間 | 購入した1ルームで購入完了から7日間 |
| 申込期限 | Checkout Sessionの有効期限まで。期間限定販売時は別途表示 |
| キャンセル・返金 | `[確定した条件、方法、期限、連絡先]` |
| 動作環境 | 対応OS、ブラウザ、ネットワーク要件へのリンク |

### 11.3 返金方針で必ず決めること

- 未使用の場合に返金するか
- 購入ルームを誤った場合に、移動または返金へ応じるか
- 有料機能の利用開始後に返金するか
- 障害時の返金または期間延長条件
- 返金申請期限
- 返金方法と処理日数
- 一部返金を許可するか
- チャージバック発生時の権利状態

`返金は都度相談` のような曖昧な表現だけで公開しない。

### 11.4 受け入れ条件

- フッターと購入確認シートから直接開ける。
- 販売主体、連絡方法、価格、支払時期、提供時期、返金条件が欠けていない。
- プレースホルダーが残っている場合、本番ビルドまたはリリースチェックで検知する。

## 12. 利用規約

### 12.1 ルート

```text
apps/audience-web/src/app/legal/terms/page.tsx
```

### 12.2 最低限の章立て

1. 適用
2. 用語の定義
3. Presenterアカウントと認証情報の管理
4. ルームの作成と観客の匿名利用
5. Event Passの内容、対象ルーム、期間
6. 料金、決済、返金
7. 投稿コンテンツと知的財産権
8. モデレーションと主催者の責任
9. 禁止事項
10. データ保持と削除
11. サービスの変更、中断、終了
12. 保証の否認と責任制限
13. 規約変更
14. 準拠法と管轄
15. 問い合わせ

### 12.3 Event Pass固有の明記

- 1回の購入は1ルームにのみ紐づく。
- 有効期間は決済確認後から7日間。
- 有効期間中に開始した発表は、終了まで有料権利を維持する。
- レポート履歴は購入後30日間保持する初期方針。
- 権利の譲渡、別ルームへの移動条件。
- 返金・取消条件。
- ネットワーク障害時に利用するオフライン権利確認の扱い。

### 12.4 受け入れ条件

- Stripe Checkoutの利用規約同意リンク先として公開URLを設定できる。
- 施行日と最終更新日を表示する。
- 重要な変更時に既存利用者へ通知する方針がある。

## 13. プライバシーポリシー

### 13.1 ルート

```text
apps/audience-web/src/app/legal/privacy/page.tsx
```

### 13.2 最低限の記載内容

- 取得する情報
  - Presenterのメールアドレス、ユーザーID
  - ルーム、設定、コメント、質問、スタンプ、レポート
  - 購入状態、Stripe Customer ID、Checkout Session ID、PaymentIntent ID
  - IPアドレス、端末・ブラウザ情報、エラーログ
- 利用目的
  - 認証、サービス提供、決済、権利確認、サポート、不正防止、改善
- 外部サービス
  - Stripe
  - Supabase
  - Cloudflare Turnstile
  - 実際に導入するホスティング、監視、メール配信サービス
- 保存期間
  - Freeのイベントデータ: 7日
  - Event Passのイベントデータ: 30日
  - 決済・会計・不正対策に必要な記録: 法令・正当な目的に応じた期間
- 第三者提供、委託、越境移転
- Cookie、ローカルストレージ
- 安全管理措置
- 開示、訂正、削除、利用停止の請求方法
- 未成年者の利用
- 改定と問い合わせ先

### 13.3 注意

- Stripeの秘密鍵やWebhook Secretを取得情報として記載しない。これらは利用者データではなく運用秘密情報。
- 実際に使っていない分析・広告サービスを雛形から残さない。
- Stripeへカード情報が送信され、LayerTalkのサーバーではカード番号を保持しないことを明記する。

### 13.4 受け入れ条件

- 現在利用している外部サービスと記載内容が一致する。
- データ保持ジョブの実装と保存期間の説明が一致する。
- 問い合わせ先が有効である。

## 14. 問い合わせ・返金案内

### 14.1 ルート

```text
apps/audience-web/src/app/support/page.tsx
```

### 14.2 初期実装

バックエンド付きフォームを最初から作らず、サポートメールと必要情報を案内する。

表示項目:

- サポートメール
- 通常の返信目安
- 購入トラブル時に送る情報
  - Presenterのメールアドレス
  - ルームコード
  - 購入日時
  - 金額
  - Stripeの領収書番号またはメール
- 送ってはいけない情報
  - カード番号全文
  - セキュリティコード
  - Stripe API Key
  - Supabase Access Token
- 返金条件へのリンク
- 障害情報の公開先がある場合はそのリンク

実装上の注意:

- `session_id` やPaymentIntent IDを公開ページのURLへ埋め込まない。
- サポートメールを環境ごとに変える場合は、公開用の安全な設定値として管理する。
- 問い合わせフォームを後から追加する場合は、レート制限、CAPTCHA、CSRF対策、ログのPII削減を行う。

### 14.3 受け入れ条件

- 購入者が返金・誤購入・二重請求・権利未反映の連絡方法を確認できる。
- カード情報をメールで送らないよう明示されている。
- 返信不能な連絡先を掲載しない。

## 15. Presenterアプリ内の購入履歴・有効期限

### 15.1 配置

新しい外部Webアカウントページは作らず、`EventPassPanel` の購入済み状態を拡張する。

表示項目:

- 状態: 有効、期限切れ、返金済み／取り消し済み
- 対象ルーム名とコード
- 購入日時
- 有効期限
- レポート出力期限
- 金額と通貨
- 領収書を開く
- サポートを開く

### 15.2 データ

`entitlements` に既存の次の情報があるため、一覧表示だけならDB migrationは不要。

- `starts_at`
- `expires_at`
- `history_expires_at`
- `status`
- `amount_total`
- `currency`
- `stripe_checkout_session_id`
- `stripe_payment_intent_id`

### 15.3 領収書API

領収書URLが必要なときだけStripeから取得し、長期保存しない。

```text
POST /api/billing/receipt
Authorization: Bearer <presenter access token>
Content-Type: application/json

{ "entitlementId": "..." }
```

サーバー処理:

1. Presenterを認証する。
2. `entitlements.owner_id` が本人であることを確認する。
3. `stripe_payment_intent_id` を取得する。
4. StripeからPaymentIntentとChargeを取得する。
5. `receipt_url` のみ返す。

レスポンス:

```json
{ "url": "https://pay.stripe.com/receipts/..." }
```

エラー:

- `400`: entitlementId不正
- `401`: 未認証
- `404`: 他人の購入、Stripe購入でない、領収書なし
- `502`: Stripe取得失敗

### 15.4 受け入れ条件

- 他ユーザーの領収書URLを取得できない。
- 手動付与・プロモーション権利では領収書ボタンを表示しない。
- 期限切れでも履歴保持期間中は購入情報を確認できる。
- 金額は `amount_total` を通貨に合わせて整形し、固定文字列だけに依存しない。

## 16. 推奨ファイル構成

```text
apps/audience-web/src/
├── app/
│   ├── event-pass/
│   │   └── page.tsx
│   ├── legal/
│   │   ├── privacy/page.tsx
│   │   ├── terms/page.tsx
│   │   └── tokusho/page.tsx
│   ├── support/
│   │   └── page.tsx
│   ├── billing/
│   │   ├── success/page.tsx
│   │   └── cancelled/page.tsx
│   └── api/billing/
│       └── receipt/route.ts
├── components/public/
│   ├── legal-document.tsx
│   ├── public-footer.tsx
│   └── public-header.tsx
└── content/legal/
    ├── privacy.ts
    ├── terms.ts
    └── tokusho.ts

apps/presenter-app/src/components/
├── EventPassPanel.tsx
└── EventPassPurchaseSheet.tsx
```

法務本文をReactコンポーネントへ直接大量に書かず、`content/legal` に構造化しておくと、
表示コンポーネント、更新日、アンカー、テストを共通化しやすい。

## 17. セキュリティ要件

- Stripe Restricted API KeyはAudience Webのサーバー環境だけに置く。
- Webhook署名をraw bodyで検証する。
- エラー画面、APIレスポンス、ログへ環境変数を出力しない。
- Stripe API Key、Webhook Secret、Supabase Service Role Keyをクライアントへ返さない。
- テスト、本番で異なるStripeキー、Webhook endpoint、Price IDを使う。
- Checkout metadataの `owner_id` と `room_id` をそのまま信用せず、支払い内容とDB所有権を検証する。
- 領収書APIは本人所有のentitlementだけを扱う。
- APIエラーにはStripe内部エラー全文や個人情報を含めない。
- Stripe Dashboardのチームメンバーはパスキーまたは認証アプリによる2要素認証を使う。

## 18. アクセシビリティと表示品質

- 主見出しはページごとに1つの `h1`。
- 法務文書の見出し順を飛ばさない。
- リンク文言を `こちら` だけにしない。
- 支払い状態を色だけで表現しない。アイコンと文言を併用する。
- スピナーにはスクリーンリーダー向けの状態文言を付ける。
- キーボードだけで購入確認シートを開閉できる。
- シート表示中はフォーカストラップを行い、閉じたら購入ボタンへフォーカスを戻す。
- `prefers-reduced-motion` を尊重する。
- 日本語の日付はタイムゾーンを明示して整形する。購入・期限判定自体はUTCで扱う。

## 19. テスト計画

### 19.1 コンポーネント／ルート

- 各公開ページが認証なしで200を返す。
- フッターの全リンクが404にならない。
- 法務ページにプレースホルダーが残っていない。
- Event Passページに価格、税込、期間、対象ルーム数が表示される。
- 購入確認シートに現在のルーム名とコードが表示される。

### 19.2 Checkout

- テストモードの購入成功。
- Checkoutで利用規約への同意が必須になる。
- 決済キャンセル。
- Checkout Session期限切れ。
- 外部ブラウザを開けない場合の再試行。
- 購入ボタン連打で権利やSessionが重複しない。
- 既に有効なEvent Passがある場合は新規購入できない。
- 他人のroomIdでCheckout Sessionを作れない。

### 19.3 Webhook／成功ページ

- `checkout.session.completed` を再送しても権利が1件。
- Webhookより先に成功ページを開いても正しく有効化される。
- 成功ページを何度更新しても結果が変わらない。
- 偽または別商品のSessionで権利が付かない。
- 金額が2,980円、通貨がJPYでないSessionを拒否する。
- 非同期決済の成功、失敗、期限切れを表示できる。

### 19.4 返金／紛争

- 全額返金で今後の権利が取り消される。
- 発表中の権利スナップショットは発表終了まで維持される。
- 一部返金は自動失効せず、手動確認対象になる。
- `charge.dispute.created` で今後の利用を停止する。

### 19.5 領収書

- 本人だけが領収書URLを取得できる。
- 他ユーザーのentitlementIdは404になる。
- 手動付与には領収書ボタンが表示されない。
- Stripe API障害時に秘密情報を含まないエラーを表示する。

## 20. 実装順序

### PR 1: 公開ページと共通レイアウト

- `PublicHeader`、`PublicFooter`、`LegalDocument`
- `/event-pass`
- `/legal/tokusho`
- `/legal/terms`
- `/legal/privacy`
- `/support`
- メタデータ、リンク、モバイル表示テスト

### PR 2: 購入前確認とCheckout同意

- `EventPassPurchaseSheet`
- Event Passカードの購入ボタン差し替え
- Stripe DashboardのPublic details設定
- `consent_collection.terms_of_service`
- Checkout上の補足文
- 二重送信と外部ブラウザ失敗のテスト

### PR 3: 成功・キャンセル状態の改善

- `ready`、`processing`、`failed` 表示
- 再確認導線
- Presenterアプリ復帰時の権利更新
- サポートリンク
- 冪等性テスト

### PR 4: 購入履歴と領収書

- Presenterアプリの購入済み詳細
- `/api/billing/receipt`
- Stripe領収書メール設定
- 所有権・エラー系テスト

## 21. リリース判定

次をすべて満たすまで本番購入を有効にしない。

- [ ] 販売主体、住所、電話番号、責任者、サポートメールが確定している
- [ ] 返金・キャンセル方針が確定している
- [ ] 特商法表記、利用規約、プライバシーポリシーにプレースホルダーがない
- [ ] Stripe Dashboardに利用規約、プライバシー、サポートURLを登録した
- [ ] Stripeのメール領収書と返金通知を確認した
- [ ] Restricted API Keyの権限を最小化した
- [ ] Webhook署名検証と冪等処理を確認した
- [ ] テストモードで成功、キャンセル、期限切れ、全額返金、紛争を確認した
- [ ] 他ユーザーのルーム、購入履歴、領収書へアクセスできない
- [ ] `npm run typecheck`、`npm run lint`、両アプリのbuildが成功する
- [ ] モバイルとmacOS Presenterアプリから一連の購入導線を確認した

## 22. 参照資料

- Stripe Checkout: <https://docs.stripe.com/payments/checkout>
- Checkout Session作成API: <https://docs.stripe.com/api/checkout/sessions/create>
- Stripe領収書: <https://docs.stripe.com/receipts>
- Stripe Customer Portal: <https://docs.stripe.com/customer-management/integrate-customer-portal>
- Stripe Webhook署名検証: <https://docs.stripe.com/webhooks#verify-events>
- Restricted API Key: <https://docs.stripe.com/keys/restricted-api-keys>
- 消費者庁 特定商取引法ガイド（通信販売広告）: <https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html>
- 消費者庁 通信販売の最終確認画面: <https://www.no-trouble.caa.go.jp/pdf/20230628ac01.pdf>

