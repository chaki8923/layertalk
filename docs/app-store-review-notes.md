# App Store Review Notes（App Store Connect に貼る用）

`<...>` は提出前に埋める。埋めないまま貼らないこと — 空欄が1つでもあると
「デモアカウントが動かない」で差し戻される。

## 埋める値

| プレースホルダ | どこから取るか |
|---|---|
| `<REVIEW_EMAIL>` / `<REVIEW_PASSWORD>` | 審査用アカウント。`supabase.auth.admin` でパスワードを設定して作る（下記） |
| `<AUDIENCE_URL>` | `VITE_AUDIENCE_BASE_URL`（＝観客用 Web のデプロイ先） |
| `<PRODUCT_ID>` | App Store Connect の Non-Renewing Subscription の商品 ID |

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
>
> **Demo account**
> Email: `<REVIEW_EMAIL>`
> Password: `<REVIEW_PASSWORD>`
> On the sign-in screen, tap "Sign in with a password" and use the credentials above.
> (The default method emails a six-digit code; the password option exists so you do
> not need access to a mailbox.)
>
> **The app has no Dock icon by design.** It uses the Accessory activation policy so
> the overlay never steals focus from the presentation app. Reach the control window
> from the LayerTalk menu bar icon, or press Shift-Command-L.
>
> **Steps to see the core feature**
> 1. Sign in with the demo account above.
> 2. Tap "Create room". A six-character join code and a QR code appear.
> 3. Open the audience URL shown under the code on any phone or second browser
>    (`<AUDIENCE_URL>/r/<CODE>`), then post a comment or tap a stamp.
> 4. Back in the control window, tap "Start presentation". Comments and stamps now
>    fly across the selected display. Nothing is drawn before you start — this is
>    intentional so rehearsal traffic never reaches a live slide.
> 5. To see it without a second device, use the test comment / test stamp buttons in
>    the control window.
>
> **In-app purchase — LayerTalk Event Pass (`<PRODUCT_ID>`, non-renewing subscription)**
> The pass unlocks approval mode, a room passcode, presentation reports, and branding
> **for one room, for seven days**. It does not renew automatically and is never
> charged again unless the presenter buys another pass.
> To test: create a room, open the Event Pass section, tap "Buy pass".
> **Restoring on another Mac**: sign in with the same account and tap
> "Restore purchases" in the Event Pass section. LayerTalk reads the customer's
> StoreKit transaction history, re-verifies each signed transaction on our server,
> and re-applies any pass that is still within its seven-day window.
>
> **Screen Recording permission (optional)**
> Only used by "Save slides when questions arrive". When a question arrives, the
> selected presentation display is captured so the image can be embedded in the
> exported report. LayerTalk's own windows and the cursor are excluded from the
> capture. Images stay on the user's Mac and are deleted after 30 days. Nothing is
> uploaded. The feature is off unless the user turns it on, and presenting works
> without granting the permission.
>
> **Guideline 1.2 — user-generated content**
> All four safeguards work in free rooms, without any purchase:
> filtering (a blocked-word list, applied before a comment is stored),
> reporting (in-line on every comment; long-press on a custom stamp),
> blocking ("Hide & block" removes the comment and bars that participant from
> re-entering the room), and published contact information (Account → Support).
> Approval mode is an additional paid convenience, not one of the four safeguards.
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
- [ ] 審査用アカウントでサインインでき、ルーム作成 → 発表開始まで通る
- [ ] 署名済み sandbox ビルドで、プライバシー／利用規約／サポート／画面収録設定の
      4つのボタンが**実際に開く**（`open_external_url` が効いているか）
- [ ] MAS ビルドから開いた法務ページに **Stripe の文字列が出ない**
      （`?channel=app-store` が付いているか）
- [ ] Vercel に `LEGAL_*` が入っていて、法務ページに `［…を公開前に設定］` が出ない
- [ ] Sandbox tester で購入・Ask to Buy・未完了復旧・返金・**別 Mac での復元**を確認した
- [ ] `npm run verify:mas-bundle` が緑（Ed25519 の鍵と Stripe の checkout が
      MAS バンドルに1件も無いこと）
- [ ] `./scripts/build-mas.sh` が `.pkg` を吐き、Transporter が受け付けた
- [ ] `docs/app-store-listing.md` のプレースホルダを全部埋めて ASC へ入れた
