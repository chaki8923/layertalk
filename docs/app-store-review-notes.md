# App Store Review Notes（App Store Connect に貼る用）

`<...>` は提出前に埋める。埋めないまま貼らないこと — 空欄が1つでもあると
「デモアカウントが動かない」で差し戻される。

## 埋める値

| プレースホルダ | どこから取るか |
|---|---|
| `<REVIEW_EMAIL>` / `<REVIEW_PASSWORD>` | 審査用アカウント。`supabase.auth.admin` でパスワードを設定して作る（下記） |
| `<AUDIENCE_URL>` | `VITE_AUDIENCE_BASE_URL`（＝観客用 Web のデプロイ先） |
| `<PRODUCT_ID>` | App Store Connect の Non-Renewing Subscription の商品 ID |
| `<SUPPORT_EMAIL>` | Vercel の `LEGAL_SUPPORT_EMAIL`（サポートページに出ている窓口と同じ） |

### 審査用アカウントの作り方

アプリのサインインは**確認コード**と**パスワード**の2通りある（`PresenterAuth`）。
審査員にはメールの受信箱を渡せないので、パスワード側を使う。
Supabase のメール OTP には**テスト OTP が存在しない**（`auth.sms.test_otp` は SMS 専用で
ローカル限定）ので、この経路が唯一の現実解。

```bash
# サービスロールキーが要る（apps/audience-web/.env.local の SUPABASE_SECRET_KEY、
# または SUPABASE_SECRET_KEY=... を頭に付けて渡す）。
npm run create:review-account

# アドレスやパスワードを固定したいとき
LAYERTALK_REVIEW_EMAIL=appreview@example.com \
LAYERTALK_REVIEW_PASSWORD='...' npm run create:review-account
```

既にアカウントがあればパスワードだけ差し替える（ルームや権利は消えない）。
最後に、下の本文へ貼る Email / Password をそのまま出力する。

審査が通ったら消す:

```bash
npm run create:review-account -- --delete
```

アプリ内の「アカウントを削除」でも同じことができる。

---

## 本文

> LayerTalk overlays live audience comments, stamps, and questions on top of the
> presenter's slides. The overlay is click-through and always on top, so it works
> over Keynote, PowerPoint, Google Slides, Canva, and Notion in full screen.
> Audience members join from a browser with a QR code or a six-character code; they
> never install an app or create an account.
>
> **Demo account**
> Email: `<REVIEW_EMAIL>`
> Password: `<REVIEW_PASSWORD>`
> On the sign-in screen, tap "Sign in with a password" and use the credentials above.
> (The default method emails a six-digit code; the password option exists so you do
> not need access to a mailbox.)
>
> **Why presenters sign in**: rooms, their safety settings, and Event Pass purchases
> belong to the presenter's account, so they can be reopened and restored on any of
> the presenter's Macs. Event Pass is a non-renewing subscription, which we deliver to
> all of the customer's devices through this account.
>
> **The app has no Dock icon by design.** It uses the Accessory activation policy so
> the overlay never steals focus from the presentation app. The control window opens
> at launch; reopen it from the LayerTalk menu bar icon, or press Shift-Command-L.
>
> **Steps to see the core feature**
> 1. Sign in with the demo account above, then tap "Create room" to make a **new**
>    room. New rooms start with a default blocked-word list.
> 2. Open the audience URL shown under the code on any phone or second browser
>    (`<AUDIENCE_URL>/r/<CODE>`), then post a comment or tap a stamp.
> 3. Back in the control window, tap "Start presentation". Comments and stamps now
>    fly across the selected display. Nothing posted before you start is shown — this
>    is intentional so rehearsal traffic never reaches a live slide.
> 4. To see it without a second device, use the test comment / test stamp buttons in
>    the control window.
>
> **In-app purchase — LayerTalk Event Pass (`<PRODUCT_ID>`, non-renewing subscription)**
> The pass unlocks approval mode, a room passcode, presentation reports, and branding
> **for one room, for seven days**. It does not renew automatically and is never
> charged again unless the presenter buys another pass.
> To test: create a room, open the Event Pass section, tap "Buy pass". Our server
> verifies the Apple-signed transaction, including sandbox transactions.
> **Restoring on another Mac**: sign in with the same account and tap
> "Restore purchases" in the Event Pass section. LayerTalk reads the customer's
> StoreKit transaction history, re-verifies each signed transaction on our server,
> and re-applies any pass that is still within its seven-day window.
>
> **Screen Recording permission (optional, Event Pass rooms only)**
> Requested only after the presenter turns on "Save slides when questions arrive" in
> a room with an active Event Pass. While a presentation runs with that option on,
> LayerTalk keeps a ScreenCaptureKit stream of the selected presentation display
> (2 frames per second; LayerTalk's own windows and the cursor are excluded) and saves
> a single frame only when an audience question arrives, so the slide can be embedded
> in the exported report. macOS shows its screen-recording indicator during this time.
> Images stay on the user's Mac, are deleted after 30 days, and are never uploaded.
> Presenting works without granting the permission.
>
> **Guideline 1.2 — user-generated content**
> All of these work in free rooms, without any purchase:
> - Terms: presenters agree to our Terms when they sign in, and audience members when
>   they post. The Terms do not tolerate objectionable content or abusive users:
>   `<AUDIENCE_URL>/legal/terms?channel=app-store`
> - Filtering: comments matching the room's blocked-word list are rejected before they
>   are stored.
> - Reporting: every comment has a Report button; custom stamps are reported with a
>   long press. Reports reach the presenter's report queue immediately.
> - Blocking: "Hide & block" removes the comment and bars that participant from
>   re-entering the room. The presenter can also switch off custom image stamps at any
>   time.
> - Our response: reports can also be sent to `<SUPPORT_EMAIL>`. We review reports of
>   objectionable content within 24 hours, remove content that breaks the Terms, and
>   bar the user who posted it.
> - Contact: Account → Support in the app, and
>   `<AUDIENCE_URL>/support?channel=app-store`.
> Approval mode is an additional paid convenience, not one of these safeguards.
>
> **Account deletion**
> Control window → bottom → "Delete account". It is hidden while a presentation is
> running so the dialog cannot open in front of a live slide.
>
> **Privacy policy**: `<AUDIENCE_URL>/legal/privacy` (also reachable in the app from
> the sign-in screen and from Account at the bottom of the control window).

---

## 提出前チェック

- [ ] 上のプレースホルダを全部埋めた
- [ ] 本番 DB に `20260911041638_restore_post_comment_authors_and_presenter_gate` を適用し、
      ファイル末尾の確認 SQL が3つとも true になった。**未適用だとコメントからのブロックが全件失敗し、
      NG ワードも拒否ではなく保留になる** — 上の 1.2 の説明と実挙動が食い違う
- [ ] 審査用アカウントで**新しいルームを作った**（既定の NG ワードは作成時にしか入らない。
      適用より前に投稿されたコメントは、投稿者の記録が無いのでブロックできない）
- [ ] Vercel の Production に数値の `APPLE_APP_ID` が入っている（無いと審査の Sandbox は通るのに、
      公開後の実購入が検証できない。`lib/server/app-store.ts` の `verifiers`）
- [ ] `icon.icns` に 512@2x（`ic10` チャンク）が入っている（無いと ITMS-90236 でアップロードが止まる）
- [ ] 審査用アカウントでサインインでき、ルーム作成 → 発表開始まで通る
- [ ] 署名済み sandbox ビルドで、プライバシー／利用規約／サポート／画面収録設定の
      4つのボタンが**実際に開く**（`open_external_url` が効いているか）
- [ ] MAS ビルドから開いた法務ページに **Stripe の文字列が出ない**
      （`?channel=app-store` が付いているか）
- [ ] Vercel に `LEGAL_*` が入っていて、法務ページに `［…を公開前に設定］` が出ない
- [ ] Sandbox tester で購入・Ask to Buy・未完了復旧・返金・**別 Mac での復元**を確認した
      （Distribution 署名の `.app` は手元で起動できないので、開発署名のビルドか TestFlight で行う）
- [ ] `npm run verify:mas-bundle` が緑（Ed25519 の鍵と Stripe の checkout が
      MAS バンドルに1件も無いこと）
- [ ] `./scripts/build-mas.sh` が `.pkg` を吐き、Transporter が受け付けた
- [ ] `docs/app-store-listing.md` のプレースホルダを全部埋めて ASC へ入れた
