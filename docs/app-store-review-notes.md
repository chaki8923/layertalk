# App Store Review Notes（App Store Connect に貼る用）

残っている空欄は `<REVIEW_PASSWORD>` だけ。アカウントを作ったときに決まる値なので、
App Store Connect に直接貼る（**リポジトリには書かない**）。空欄のまま貼ると
「デモアカウントが動かない」で差し戻される。

## 記入済みの値と、残りの空欄

| 項目 | 値 |
|---|---|
| 観客用 Web（`VITE_AUDIENCE_BASE_URL`） | `https://www.layer-talk.com` |
| Event Pass の商品 ID | `app.layertalk.presenter.event_pass`（サーバの既定値、presenter の `.env.local` と同じ。変えるなら App Store Connect と3か所とも） |
| サポート窓口（Vercel の `LEGAL_SUPPORT_EMAIL`） | `layertalk0816@gmail.com` |
| 審査用アカウントのメール | `layertalk0816+appreview@gmail.com`（`create:review-account` の既定値。サポート窓口と同じ受信箱に届く） |
| `<REVIEW_PASSWORD>` | **空欄のまま。** `npm run create:review-account` の出力を App Store Connect に直接貼る |

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
既定のアドレスは `layertalk0816+appreview@gmail.com`。

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
> Email: `layertalk0816+appreview@gmail.com`
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
>    (`https://www.layer-talk.com/r/<CODE>`), then post a comment or tap a stamp.
> 3. Back in the control window, tap "Start presentation". Comments and stamps now
>    fly across the selected display. Nothing posted before you start is shown — this
>    is intentional so rehearsal traffic never reaches a live slide.
> 4. To see it without a second device, use the test comment / test stamp buttons in
>    the control window.
>
> **In-app purchase — LayerTalk Event Pass (`app.layertalk.presenter.event_pass`, non-renewing subscription)**
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
> in the exported report. While recording, LayerTalk shows "● REC" in the menu bar and a
> recording notice in the control window, in addition to macOS's own indicator.
> Images stay on the user's Mac, are deleted after 30 days, and are never uploaded.
> Presenting works without granting the permission.
>
> **Guideline 1.2 — user-generated content**
> All of these work in free rooms, without any purchase:
> - Terms: presenters agree to our Terms when they sign in, and audience members when
>   they post. The Terms do not tolerate objectionable content or abusive users:
>   `https://www.layer-talk.com/legal/terms?channel=app-store&lang=en`
> - Filtering: comments matching the room's blocked-word list are rejected before they
>   are stored.
> - Reporting: every comment has a Report button; custom stamps are reported with a
>   long press. Reports reach the presenter's report queue immediately.
> - Blocking: "Hide & block" removes the comment and bars that participant from
>   re-entering the room. The presenter can also switch off custom image stamps at any
>   time.
> - Our response: reports can also be sent to `layertalk0816@gmail.com`. We review reports of
>   objectionable content within 24 hours, remove content that breaks the Terms, and
>   bar the user who posted it.
> - Contact: Account → Support in the app, and
>   `https://www.layer-talk.com/support?channel=app-store`.
> Approval mode is an additional paid convenience, not one of these safeguards.
>
> **Account deletion**
> Control window → bottom → "Delete account". It is hidden while a presentation is
> running so the dialog cannot open in front of a live slide.
>
> **Privacy policy**: `https://www.layer-talk.com/legal/privacy?lang=en` (also reachable in the app from
> the sign-in screen and from Account at the bottom of the control window).

---

## 提出までの残作業

チェックリストは `docs/remaining-tasks.md` にまとめた。このファイルは App Store Connect に貼る本文と、審査用アカウントの作り方だけを持つ。

## Optional Slack / Microsoft Teams invitation posting

The Mac app includes an optional, free room invitation integration. It is off by default and does not require granting access to contacts, screen content, or channel history. In Room → Send the join URL on start, the presenter can register their own Slack Incoming Webhook or Teams Workflows webhook, inspect the fixed message, and explicitly enable sending on presentation start. The selected destination is also shown next to the start control. Each new room starts unconfigured.

Only the participation URL and a fixed invitation are sent directly from the Mac. Webhook URLs and settings stay in macOS Keychain, separated by LayerTalk account and room; they are not uploaded to LayerTalk servers or included in diagnostic logs. The user can disable sending or delete the destination in the app. Existing channel posts are managed in the destination service. The app works normally without this integration or when delivery fails.

Testing: register a designated review/test destination using the setup steps in `docs/channel-notifications.md`, then use Send test to post a labeled test, or enable automatic sending and start a presentation. Teams may acknowledge the HTTP request before its workflow posts the message. Test destination credentials must be supplied privately in App Review notes when submitting; do not commit credentials to the repository. Verify save, relaunch, send, and deletion in the signed sandbox build before submission.
