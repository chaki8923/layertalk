# 2.1 Information Needed への返信（2026-09-23 の差し戻し）

新規デベロッパ向けの**定型の情報提供要求**で、バグの指摘ではない。
Apple の文面どおり「情報が足りないだけなら**再提出は不要**、App Review ページから返信すればよい」。
**ビルドは上げ直さない**（`tauri.mas.conf.json` の `bundleVersion` は `2` のまま。
新しいビルドを出すときだけ `3` にする）。

やることは 3 つ:

1. **実機の画面収録を撮る**（下の「撮影台本」）— 唯一の実作業
2. App Store Connect の **App Review ページ → 返信**に「返信欄に貼る本文」を貼り、**動画と PDF を添付**する
3. **Notes 欄**（こちらも 4,000 字上限）に 1 行だけ足す

> **返信欄も 4,000 字上限だった**（2026-09-23 に実測。全文 7,963 字を貼って `-3953` と出た）。
> 本文は 3,951 字に詰めた短縮版を貼り、全文は PDF
> （`output/app-review/LayerTalk-2.1-full-answers.pdf`。`cupsfilter -i text/plain` で作った 3 ページ）を
> 添付して渡す。Notes 欄は既存の審査メモ（`app-store-review-notes.md`、3,994 字）を残したまま、
> 末尾に下の 1 行だけ足す。

---

## 撮影台本（⇧⌘5 で画面収録、5分前後）

**Apple が必須と書いているのは 5 つだけ**: ①起動から始める ②典型的な利用フロー
③登録・ログイン・退会 ④ユーザー投稿と、その通報・ブロック ⑤有料機能にアクセスするところ。
画面収録の許可（● REC）・購入の復元・カスタムスタンプのアップロードは**入れなくてよい**
（入れて困るものでもない）。ナレーションも字幕も不要。

**準備**
- 使うのは `apps/presenter-app/src-tauri/target/dev-signed/LayerTalk.app`。
  **Sandbox の購入を映せるのはこれだけ**（アドホック署名版は価格が「—」のまま）。コードは提出したビルドと同じ
- 起動の場面を自然にするため、先に `/Applications` へ置く:
  `cp -R apps/presenter-app/src-tauri/target/dev-signed/LayerTalk.app /Applications/`
- Sandbox Apple Account にサインインしておく（システム設定 → デベロッパ）
- 観客役の端末を 1 つ（スマホでも、同じ Mac の別ブラウザでもよい）
- **審査用アカウント（`+appreview`）では退会しない。** 下の台本は使い捨てアカウントで通し、
  審査用アカウントは最後のログインを見せるだけに使う
- 画面に `.env.local`・Supabase のキー・Teams の Webhook URL を映さない

**撮る順番（7 つ）**

1. **起動** — `/Applications` の LayerTalk をダブルクリック。**Dock にアイコンが出ない**こと、
   メニューバーのアイコンとコントロール窓が出ることを見せる（見せないと「起動しない」と誤解される）
2. **新規登録** — 使い捨てのメールアドレスを入れて 6 桁コードを受け取り、受信箱ごと映してサインイン
   （＝登録。専用の登録画面は無い）
3. **典型フロー** — ルーム作成 → 「プレゼンを開始」 → Keynote か PowerPoint を全画面 →
   観客役の端末で参加してコメント・スタンプを投稿 → **スライドの上に流れるところ**
4. **通報** — 観客側のコメントの Report を押す → 発表者の通報キューに届く
5. **ブロック** — 「非表示 & ブロック」 → そのコメントが消え、その参加者が再入室できない
6. **有料機能** — Event Pass セクションで価格が出る → 「Buy pass」 → Sandbox の購入シート →
   承認制が使えるようになるところ
7. **退会** — アカウント → アカウントを削除 → 確認 → サインイン画面に戻る。
   そのまま**「パスワードでログイン」で審査用アカウントに入る**（審査員が通る経路を見せる）

**撮ったあと**: 審査用アカウントのパスワードがまだ通ることを確かめる。
消してしまったら `npm run create:review-account` で作り直し、**ASC のサインイン情報欄も更新する**。

**渡し方**: 返信に添付する。サイズが通らなければ**ログイン不要**で見られる限定公開リンク
（YouTube の限定公開 / Google Drive のリンク共有）を本文に書く。**審査員はアカウントを作れない**ので、
ログインを要求するリンクは不可。

---

## 返信欄に貼る本文（英語・3,951 字）

```
All seven items are answered below. The screen recording and a PDF with more detail are attached.

1. Screen recording
Attached, captured on a Mac running the latest macOS. It begins with launching the app, then covers registration with an emailed code, password sign-in, creating a room, an audience member joining from a phone browser and posting comments and stamps, the overlay over a full-screen presentation, the word filter, reporting, "Hide & block", purchase and restore, and account deletion.

2. Purpose and target audience
LayerTalk shows audience comments, stamps and questions on top of the presenter's slides, in a click-through, always-on-top overlay, so they appear over Keynote, PowerPoint, Google Slides, Canva or Notion in full screen. Audience feedback usually either does not happen or lives in a chat window the presenter cannot watch while presenting; here the audience joins from a QR code or a six-character code in any mobile browser, with no install and no account. For speakers at meetups, conferences, corporate training and webinars. Rated 13+.

3. Setup and main features
Demo presenter account: layertalk0816+appreview@gmail.com, password as provided in App Review Information; choose "Sign in with a password". There is no separate sign-up screen: a new email plus the emailed code creates the account. No sample files needed.
The app has no Dock icon by design (the Accessory activation policy keeps the overlay from stealing focus). The control window opens at launch and reopens from the menu bar icon or Shift-Command-L; its title bar has a JA/EN toggle.
Sign in, tap "Create room", then "Start presentation". Open the audience URL under the room code (https://www.layer-talk.com/r/CODE) on a phone or second browser and post a comment or a stamp: it flies over whatever is on screen. Without a second device, use the test comment and stamp buttons.
Account deletion: control window, bottom, "Delete account" (hidden while presenting).

4. External services
- Supabase (Postgres, Realtime, Auth, Storage; Tokyo): presenter accounts, anonymous auth for the audience, rooms, comments, reports, stamp images.
- Vercel: the audience web app (www.layer-talk.com) and our API (purchase verification, account deletion, cleanup).
- Apple StoreKit 2 with the App Store Server API and Server Notifications V2: the only payment path in the app.
- Optional, user-configured: a Slack or Teams webhook, off by default; only the join URL and a fixed invitation are sent, and it stays in the macOS Keychain.
- No AI services, ad networks, analytics or tracking SDKs, no data providers.

5. Regional differences
The app functions consistently across all regions: no region-locked features or content, one backend for everyone, pricing from Apple's price matrix. Japanese and English are chosen by the presenter in the app, not by region or locale.

6. Regulated industry and third-party material
Neither applies. All artwork and text are ours, system fonts only, no licensed content. Stamps are system emoji plus audience-uploaded images, i.e. user-generated content covered by the safeguards in 7.

7. In-App Purchase
One product: LayerTalk Event Pass (app.layertalk.presenter.event_pass), a non-renewing subscription giving one room seven days of paid features: approval mode, a room passcode, a post-presentation report, and branding. It never renews automatically.
Everything else is free, including all Guideline 1.2 safeguards: the blocked-word filter, a report button on every comment (long press on image stamps), "Hide & block" (removes the comment and bars that participant from the room), a switch that disables image stamps, our Terms, and layertalk0816@gmail.com. We act on reports within 24 hours.
To purchase: control window, sign in, open a room, then "Event Pass" and "Buy pass"; the StoreKit sheet opens there. "Restore purchases" is in the same section. The app has no other purchase path and never links to an external purchase.
```

---

## 添付 PDF の全文（`output/app-review/LayerTalk-2.1-full-answers.pdf`）

こちらは Stripe に触れた段落を含む長い版。返信欄には入らないので PDF で渡す。


> Thank you for the review. Below are the answers to all seven items. The same
> summary has been added to the Notes field in App Review Information.
>
> **1. Screen recording**
> A screen recording captured on a physical Mac running the latest macOS is
> attached. It starts with launching the app and shows, in order: launch (the app
> intentionally has no Dock icon), account registration with an emailed code,
> sign-in with a password, creating a room, an audience member joining from a
> phone browser and posting comments, stamps and an uploaded image stamp, the
> overlay running on top of a full-screen presentation, the content filter,
> reporting, "Hide & block", removing a reported image stamp, the in-app purchase
> and restore flow, the optional Screen Recording permission with the "● REC"
> indicator, and account deletion.
>
> **2. Purpose and target audience**
> LayerTalk lets an audience react to a live presentation, and shows those
> reactions on top of the presenter's slides. Comments, stamps and questions fly
> across the presentation display in a click-through, always-on-top overlay, so
> they appear over Keynote, PowerPoint, Google Slides, Canva or Notion in full
> screen without any plug-in for those apps.
> The problem it solves: at meetups, lectures, training sessions and webinars,
> audience feedback either does not happen at all or lives in a separate chat
> window that the presenter cannot watch while presenting, and that the audience
> must install an app or create an account to use. With LayerTalk the audience
> opens a URL from a QR code or a six-character code in any mobile browser, with
> no installation and no account, and the presenter never has to leave the slides.
> Target audience: speakers and organizers at technical meetups and conferences,
> in-house study sessions and corporate training, university lecturers, and
> webinar hosts. The age rating is 13+.
>
> **3. Setting up and accessing the main features**
> Demo account (presenter):
> Email: layertalk0816+appreview@gmail.com
> Password: (see the Notes field in App Review Information)
> On the sign-in screen, choose "Sign in with a password" and use the credentials
> above. The default method emails a six-digit code; the password option exists so
> that you do not need access to a mailbox. There is no separate sign-up screen:
> entering a new email address and confirming the code creates the account.
> No sample files are required.
> Steps:
> 1. Launch LayerTalk. It uses the Accessory activation policy so the overlay never
>    steals focus from the presentation app, so there is no Dock icon. The control
>    window opens at launch; you can reopen it from the LayerTalk menu bar icon or
>    with Shift-Command-L.
> 2. Sign in with the demo account, then tap "Create room" to create a new room.
>    New rooms start with a default blocked-word list.
> 3. On a phone or a second browser, open the audience URL shown under the room
>    code (https://www.layer-talk.com/r/<CODE>), then post a comment or tap a stamp.
> 4. In the control window, tap "Start presentation". Comments and stamps now fly
>    across the selected display, over whatever is on screen. Anything posted
>    before you start is intentionally not shown, so rehearsal traffic never
>    reaches a live slide.
> 5. If you do not have a second device, use the test comment and test stamp
>    buttons in the control window.
> The interface is available in Japanese and English; use the JA/EN toggle in the
> control window title bar.
> Account deletion: control window, bottom, "Delete account". It is hidden while a
> presentation is running so the dialog cannot open in front of a live slide.
>
> **4. External services used for core functionality**
> - Supabase (hosted Postgres, Realtime, Authentication and Storage; Tokyo region)
>   — presenter accounts (email one-time code or password), anonymous
>   authentication for audience members, rooms, comments, questions, reports, and
>   storage of audience-uploaded stamp images.
> - Vercel — hosts the audience web app at https://www.layer-talk.com and our
>   server API (purchase verification, account deletion, scheduled data cleanup).
> - Apple — StoreKit 2 for the in-app purchase, and the App Store Server API and
>   App Store Server Notifications V2 for verifying and revoking it. This is the
>   only payment path in this app.
> - Optional, configured by the user: Slack Incoming Webhooks and Microsoft Teams
>   Workflows. This is off by default and only active if the presenter enters
>   their own webhook URL. Only the room's join URL and a fixed invitation text
>   are sent, directly from the Mac. Webhook URLs are stored in the macOS Keychain
>   and are never uploaded to our servers.
> - We use no AI services, no advertising networks, no analytics or tracking SDKs,
>   and no third-party data providers.
> Stripe also appears on our website, because a separately distributed
> direct-download version of LayerTalk sells the pass there. The App Store build
> never reaches it: purchases go through StoreKit only, and the legal pages opened
> from the App Store build are served in an App Store variant that contains no
> Stripe or other external purchase information. We verify this for every build we
> submit.
>
> **5. Regional differences**
> The app functions consistently across all regions. There are no region-locked
> features, no region-specific content, and no regional pricing differences beyond
> Apple's own price matrix (the Event Pass is based on JPY 2,980 in Japan). All
> users are served by the same backend in Supabase's Tokyo region. The interface
> and the legal pages are available in Japanese and English; the language is chosen
> by the presenter inside the app, not by region or device locale, and the audience
> web app follows the language of the room they join. Our DSA trader information
> was submitted on 2026-09-21 and is still under review.
>
> **6. Regulated industry and third-party material**
> LayerTalk does not operate in a regulated industry and includes no protected
> third-party material. All artwork, the app icon and the text are ours; the app
> uses system fonts only and bundles no licensed content. Stamps are system emoji
> plus images uploaded by the audience, which are user-generated content covered
> by the safeguards below. The names of other presentation apps appear in our
> description only to say which apps LayerTalk can be used over, with a trademark
> notice.
>
> **7. In-App Purchase**
> There is one product: LayerTalk Event Pass
> (app.layertalk.presenter.event_pass), a non-renewing subscription that gives one
> room seven days of the paid features. It does not renew automatically and is
> never charged again unless the presenter buys another pass.
> It unlocks: approval mode (questions are held until the presenter approves them),
> a room passcode, a post-presentation report, and branding (own logo, and hiding
> the LayerTalk mark).
> Everything else is free and unlimited, including all of the Guideline 1.2
> safeguards: the blocked-word filter, the report button on every comment (a long
> press on custom image stamps), "Hide & block", which removes the comment and bars
> that participant from re-entering the room, a switch that turns off custom image
> stamps entirely, our Terms, and the contact address layertalk0816@gmail.com. We
> review reports of objectionable content within 24 hours, remove content that
> breaks the Terms, and bar the user who posted it.
> How to reach the purchase: control window, sign in, create or open a room, then
> the "Event Pass" section, and tap "Buy pass". The StoreKit sheet opens there. To
> restore, tap "Restore purchases" in the same section; the app reads the
> customer's StoreKit transaction history, re-verifies each signed transaction on
> our server, and re-applies any pass still within its seven-day window. The app
> contains no other purchase path and never links to an external purchase.
>
> Privacy policy: https://www.layer-talk.com/legal/privacy?lang=en
> Terms: https://www.layer-talk.com/legal/terms?channel=app-store&lang=en
> Support: https://www.layer-talk.com/support?channel=app-store

---

## Notes 欄に足す 1 行

> A full answer to the 2.1 information request (purpose, setup, external services,
> regional availability, and In-App Purchase) was sent in Resolution Center on
> 2026-09-23, with a screen recording.
