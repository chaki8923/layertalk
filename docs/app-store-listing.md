# App Store Connect に入れる値（下書き）

Apple Developer Program の登録が済んだら、これを見ながら App Store Connect を埋める。
**文面は LP（`apps/audience-web/src/i18n/{ja,en}.ts` の `landing.*`）から起こしてある。**
LP と App Store で言っていることがずれると、審査員が「説明と違う」と読む余地を作るので、
どちらかを直したらもう一方も直すこと。

関連: 審査メモの本文は `docs/app-store-review-notes.md`、提出までの残作業は `docs/remaining-tasks.md`。

---

## 1. 基本情報

| 項目 | 値 |
|---|---|
| Bundle ID | `app.layertalk.presenter` |
| プラットフォーム | macOS のみ |
| 最低 OS | macOS 13.0（`tauri.conf.json` の `minimumSystemVersion`） |
| プライマリカテゴリ | Productivity（`tauri.conf.json` の `category`） |
| セカンダリカテゴリ | Business（任意） |
| 価格 | 無料（機能は App 内課金） |
| プライバシーポリシー URL | `https://www.layer-talk.com/legal/privacy` |
| プライバシーポリシー URL（英語ローカライズ） | `https://www.layer-talk.com/legal/privacy?lang=en` |
| サポート URL | `https://www.layer-talk.com/support?channel=app-store` |
| マーケティング URL | `https://www.layer-talk.com` |

> ⚠️ `https://www.layer-talk.com` は `VITE_AUDIENCE_BASE_URL` と同じホスト。`www` を付けること（`layer-talk.com` は 308 で転送される）。
> 公開ページは検索に出す。`noindex` は `/r/*`・`/billing/*`・`/api/*` だけ（`next.config.ts` と `privatePageRobots`）。
>
> サポート URL には `?channel=app-store` を付ける。付けないと Stripe 版の案内（「Stripeの領収書番号を送る」）が
> 出て、審査員に「同じ Pass を別の決済で売っている」と読ませる余地を作る（3.1.1）。

---

## 2. 名前・サブタイトル・キーワード

文字数上限: 名前 30／サブタイトル 30／キーワード 100（カンマ区切り、スペースは入れない）。

### 日本語

| 項目 | 案 | 文字数 |
|---|---|---|
| 名前 | `LayerTalk` | 9 |
| サブタイトル | `あらゆるスライドに観客の声を重ねる` | 17 |
| キーワード | `プレゼン,発表,スライド,コメント,質問,オーバーレイ,勉強会,セミナー,ウェビナー,登壇,双方向,QR` | 52 |

### English

| 項目 | 案 | 文字数 |
|---|---|---|
| Name | `LayerTalk` | 9 |
| Subtitle | `Audience comments on slides` | 27 |
| Keywords | `presentation,slides,audience,comments,questions,overlay,live,Q&A,meetup,webinar,speaker,feedback` | 96 |

> **キーワードに他社製品名（PowerPoint / Keynote / Canva / Notion）を入れないこと。**
> 説明文の中で「重ねて使える例」として挙げるのは問題ないが、キーワード欄に競合・他社の
> 商標を並べるのは 4.3 / メタデータの指摘を招く。説明文側には LP と同じ
> 商標の但し書き（`landing.worksWith.trademark`）を必ず添える。

---

## 3. 説明文

### 日本語

```
LayerTalkは、観客のコメント・質問・スタンプをプレゼン画面へリアルタイムに重ねる、
macOS向けの参加型プレゼンツールです。

観客はアプリのインストールも登録も不要。スライドに表示したQRコード、または6文字の
参加コードだけで参加できます。

■ 会場の反応が、スライドの上に見える
・コメントが流れる — 観客のひとことをスライドの最前面へ。発表を止めずに、その場の
  温度が伝わります。
・質問が残る — 質問として投稿された声を分けて表示。流れて消えたあとも画面の右端に
  残るので、見逃さず次の対話につなげられます。
・スタンプで応える — 言葉にしにくい瞬間も、絵文字やカスタムスタンプなら気軽に反応
  できます。

■ 重ねるだけだから、ツールを選ばない
LayerTalkはスライドを読み込みません。画面の一番上に透明な層を重ねるだけなので、
下がPowerPointでもKeynoteでも、ブラウザで開いたGoogle スライド、Canva、Notionでも
同じように使えます。書き出しも変換も、発表ツール側へのプラグイン導入も不要です。
スライドショーやブラウザのプレゼンテーションモードのままで重なります。

■ 使いかた
1. Presenterアプリで発表用ルームをつくる
2. スライド上のQR、または6文字コードを観客へ案内する
3. 「プレゼンを開始」を押すと、コメント・質問・スタンプがスライドの上へ届きます

発表中は ⇧⌘L で、スライドの上にコントロール画面を呼び出せます。

開始する前の投稿は表示しません。リハーサルや前の発表の反応が本番の画面に出ることは
ありません。オーバーレイはクリックスルーなので、重ねたままスライドを操作できます。

■ 安全に運営するために（無料）
・NGワード — 一致するコメントは保存も表示もされません
・通報 — 観客が不適切な投稿を通報できます
・ブロック — 発表者はそのルームから参加者を締め出せます（再入室もできません）
これらは購入の有無にかかわらず使えます。

■ Event Pass（App内課金・任意）
本番の運営に必要な機能を、購入した1ルームで7日間だけ使えます。自動更新はされません。
・承認したコメントだけ表示する承認制
・入室パスコード
・発表レポート（コメント・質問・反応のピーク、質問時のスライド画像）
・ブランド設定（ロゴ・色・LayerTalk表記の非表示）

■ 質問時のスライド保存について（Event Pass）
Event Passのルームでこの機能をオンにしたときだけ、発表中は発表用ディスプレイを
画面収録し、質問が届いた瞬間の1枚だけを保存します。LayerTalkの表示とマウスカーソルは
写りません。画像はこのMacの中だけに30日間保存され、サーバーへ送信されることは
ありません。オフのままでも発表はそのまま行えます。

※ 各製品名は各社の商標です。
```

### English

```
LayerTalk is a participatory presentation tool for macOS that puts audience
comments, questions, and reactions directly over your slides in real time.

Your audience needs no app and no account. They join with a QR code shown on your
slides, or a 6-character room code.

WHAT THE ROOM SEES
- Comments move with the talk. Put quick audience thoughts over the slides without
  interrupting the presenter or changing windows.
- Questions stay visible. Questions are separated from general comments and kept in
  a panel at the edge of the screen, so a useful prompt is still there after it has
  scrolled past.
- Reactions take one tap. Emoji and custom stamps let people respond in moments when
  a full comment would be too much.

IT ONLY OVERLAYS, SO ANY SLIDE TOOL WORKS
LayerTalk does not import your slides. It lays a transparent layer over the screen,
so it works the same whether PowerPoint, Keynote, or a browser tab with Google
Slides, Canva, or Notion is underneath. There is no export step, no conversion, and
nothing to install into your presentation tool. It layers over a slideshow or a
browser presentation mode.

HOW IT WORKS
1. Create a presentation room in the Presenter app.
2. Share the QR on your slides, or the 6-character code.
3. Press "Start presentation" and comments, questions, and stamps arrive on screen.

While presenting, press ⇧⌘L to bring up the controls over your slides.

Nothing posted before you start is shown, so rehearsal traffic never reaches a live
slide. The overlay is click-through, so you keep driving your slides underneath it.

SAFETY CONTROLS (FREE)
- Blocked words: matching comments are never stored or shown.
- Reporting: the audience can report content that does not belong.
- Blocking: the presenter can bar a participant from the room, including re-entry.
These work in every room, with or without a purchase.

EVENT PASS (OPTIONAL IN-APP PURCHASE)
Adds the controls a real event needs, for one purchased room, for seven days. It
does not renew automatically.
- Approval mode, so only approved comments reach the slides
- An entry passcode for the room
- Presentation reports, including the slide shown at each question
- Branding: your logo, your colour, and hiding the LayerTalk mark

ABOUT SAVING SLIDES AT QUESTIONS (EVENT PASS)
Only when you turn this on in an Event Pass room, LayerTalk records the selected
presentation display while you present and keeps a single frame each time a question
arrives. LayerTalk's own windows and the cursor are excluded. The images stay on your
Mac for 30 days and are never uploaded. Presenting works fine with the feature off.

Product names are trademarks of their respective owners.
```

### プロモーションテキスト（170字以内、審査なしで差し替えられる欄）

- 日本語: `観客のコメント・質問・スタンプを、スライドの上へリアルタイムに。観客はQRか6文字コードだけ、アプリも登録も不要です。`
- English: `Audience comments, questions, and reactions, live on top of your slides. They join with a QR or a 6-character code. No app, no sign-up.`

---

## 4. App Privacy（栄養ラベル）の回答案

**トラッキングは「なし」。** 広告 SDK も三者解析も入っていない（`package.json` に無い）。
「Data Used to Track You」は空、「Data Not Linked to You」も基本は空にできる。

| データ種別 | 収集する | 目的 | 本人と紐づくか | 根拠 |
|---|---|---|---|---|
| Contact Info → Email Address | ✅ | App Functionality（アカウント管理） | 紐づく | 発表者のサインイン（`PresenterAuth`） |
| User Content → Other User Content | ✅ | App Functionality | 紐づく | コメント・質問・カスタムスタンプ画像（`comments` / `room_stamps`） |
| Identifiers → User ID | ✅ | App Functionality | 紐づく | `auth.uid()`（観客は匿名認証）、`client_id` |
| Purchases → Purchase History | ✅ | App Functionality | 紐づく | `entitlements` と Apple 署名の取引情報（`app_store_transactions`） |
| Diagnostics → Other Diagnostic Data | ✅ | App Functionality | 紐づく | サーバ側のエラーログ・アクセス記録（プライバシーポリシー1章に記載） |

**申告しないもの（理由つき）**

- **質問時のスライド画像**: 「収集」に当たらない。端末内（`app_data_dir()`）に30日置かれる
  だけで、サーバへ送っていない（`question_capture.rs` の `RETENTION`）。Apple の定義では
  デバイスから出ないデータは collection ではない。ただし審査員は画面収録の許可を見て
  身構えるので、**Review Notes 側で明示してある**
- **Slack / Teams への参加 URL 送信**（任意・無料）: 「収集」に当たらない。送るのは参加 URL と定型文だけで、
  発表者が自分で登録した送信先へ **Mac から直接**送る。Webhook URL と設定は Mac の Keychain に置き、
  LayerTalk のサーバへは送らない（`notifications.rs`、プライバシーポリシー8章）。質問票で迷ったら、
  審査メモ末尾の Slack / Teams の節と同じ説明にそろえること
- **位置情報・連絡先・写真ライブラリ・健康**: 一切触っていない

> 迷ったら「多めに申告」が安全側。ただし**実際より広く申告すると、それ自体が
> 説明責任の対象**になる（ポリシー本文と食い違う）。上の表はポリシー
> （`src/content/legal/privacy.ts`）と一致させてある。

---

## 5. 年齢レーティングの回答材料

**2026-09-21 に回答して 13+ で確定。** 上書きはしていない（「該当なし」のまま）。

このアプリは**ユーザー生成コンテンツを扱う**。質問票では事実を正確に答えること。
区分そのものは利用者の判断だが、答えの根拠になる実装は以下のとおり。

| 聞かれること | 事実 |
|---|---|
| UGC があるか | ある。観客がテキスト（140文字まで）と画像スタンプを投稿できる |
| **ソーシャルメディアか** | **はい**。観客用 Web が全コメントを一覧表示し（`room-client.tsx` の `sorted.map`）、人気順／新着順で並べ替え（`sort-tabs.tsx`）、いいねを付けられる（`like-button.tsx`）。「UGC の再配布とインタラクション」に当たるので「いいえ」は事実と違う。これが 13+ の主因 |
| 13歳未満のソーシャルメディア利用不可 | **いいえ**。Declared Age Range API を実装していない。「はい」は実装の保証になる |
| メッセージとチャット | ない。1対1の直接連絡手段は持たない（投稿はルームの共有フィードに出るだけ） |
| フィルタがあるか | ある。NG ワードで**保存前に拒否**する（`post_comment`）。**無料ルームでも動く** |
| 通報手段があるか | ある。コメントは行内ボタン、カスタムスタンプは長押し（`report_content` RPC） |
| ブロックできるか | できる。発表者がルーム単位で締め出し、再入室も拒否（`ban_room_participant`） |
| 連絡先を公開しているか | している。アプリ内の Account → サポート、および `/support` |
| 無制限のWebアクセス | ない。アプリ内ブラウザは持たない |
| ギャンブル・暴力・性的表現 | アプリ自体には無い |

---

## 6. App 内課金

**2026-09-21 に作成済み。** 以下は実際に入れた値。

| 項目 | 値 |
|---|---|
| タイプ | **Non-Renewing Subscription**（消耗型にしないこと） |
| 参照名 | `LayerTalk Event Pass` |
| 商品 ID | `app.layertalk.presenter.event_pass` — サーバの `APPLE_EVENT_PASS_PRODUCT_ID` の既定値、presenter の `.env.local` の `VITE_APPLE_EVENT_PASS_PRODUCT_ID` と同じ。変えるなら3か所とも |
| IAP の Apple ID | `6814322365` |
| 価格 | 日本（JPY）¥2,980 を基準に、他国は Apple の自動換算（米国 $19.99）。Stripe 版と同額 |
| 配信可否 | すべての国または地域 |
| 表示名（日本語） | `Event Pass（1ルーム・7日間）` |
| 表示名（English） | `Event Pass (1 room, 7 days)` |
| 説明（日本語） | `1ルームで承認制・パスコード・レポート・ブランド設定` |
| 説明（English） | `Approval, passcode, reports, branding: 1 room` |

> **非更新サブスクリプションは「アプリ内購入」ページには無い。** サイドバーの
> **「サブスクリプション」ページの下部**に専用セクションがある。「アプリ内購入」の＋から作ろうとすると、
> 種類のプルダウンに**消耗型と非消耗型しか出ない**ので「Apple が NRS を廃止した」と読み違えやすい。
> `app-store-validation.ts` が `Type.NON_RENEWING_SUBSCRIPTION` を必須にしているので、
> ここで消耗型を作ると購入も復元も全件落ちる。

> **説明は 45 文字（表示名は 30 文字）が上限。** 元の下書き
> （「購入した1つのルームで、承認制・入室パスコード・発表レポート・ブランド設定を7日間利用できます。自動更新はされません。」）は
> 上限を超えるので入らない。上の短縮版が実際に入れた文面。
> **表示名から「1ルーム」を落とさないこと** — Event Pass は購入した1ルームだけで有効なので、
> 落とすと「全ルームで使える」と読める。

> **タイプは後から変えられない。商品 ID も再利用できない。** 消耗型で作ってしまったら
> 新しい ID を採ること。7日間の期間限定アクセスを消耗型で出すと Purchasability Type で
> 差し戻される。

---

## 7. スクリーンショット

macOS は 1280×800 / 1440×900 / 2560×1600 / 2880×1800 のいずれか。最低1枚、最大10枚。

**この Mac の画面はどちらも 16:10 ではない**（内蔵 2560×1664、外部 1920×1080）ので、撮ったままでは受け付けられない。
撮影は **⌘⇧3（画面全体）** で、`⌘⇧4` の窓だけ切り抜きにしないこと（縦長になって規定サイズに直せない）。

仕上げは必ず **`--pad`** で:

```bash
./scripts/app-store-screenshot.sh --pad --pad-color F3F2F2 <画像...>
```

> **中央クロップ（既定）を使わないこと。** LayerTalk はオーバーレイなので UI が画面の端にあり、
> 1920×1080 を 16:10 に切ると幅 192px が削られて端が黙って欠ける。実測で、流れるコメントの
> `おおおお〜〜〜！！` が `おお〜〜〜！！` になり、コントロール窓の「参加コード」ラベルが消えた。
> `--pad-color` はスライドの地の色（白なら `FFFFFF`、薄いグレーなら `F3F2F2`）。

撮るもの（この順で並べると、審査員が機能を追える）:

1. **スライドにコメントが流れている状態** — このアプリの一言目。下に敷くスライドは
   自作のものにすること（他社テンプレートや実在企業の資料を写さない）
2. **質問パネルが右端に出ている状態** — 「流れて消えても残る」が伝わる
3. **参加QRがスライドに出ている状態** — 観客の参加方法が1枚で分かる
4. **コントロール窓** — 表示モニター＋参加コード＋参加QR
5. **安全管理（無料）のパネル** — NGワード・ブロック。1.2 の説明にもなる
6. **Event Pass のパネル** — 課金で何が増えるか。**価格が出ている状態**で撮る

> **4 に「プレゼンを開始」ボタンは入らない。** 開始ボタンはコントロール窓の固定部にあり、
> その下に並べ替え不可の安全管理パネル（NGワード＋ブロック）が挟まるので、参加コードや
> 表示モニターと同時には画面に収まらない。4 と 5 で上下を分担させる。
> 並べ替えできるのは `settings.ts` の `SECTION_IDS`（monitor / room / display / stamp / customStamp / eventPass）だけ。

> **NGワードの既定値には差別語が入っている。** 撮影用のルームでは消してから撮ること
> （スクリーンショットは審査対象のメタデータで、13+ のレーティングに照らすとリスクになる）。
> 機能としては「NGワードを登録できる」ことが伝わればよいので、無害な語を数個残す。

**IAP の審査用スクリーンショット**（商品ごとに1枚必須）は、購入シートか
Event Pass パネルを撮る。**6 とこの 1 枚は StoreKit が動くビルドでないと撮れない**
（アドホック署名では価格が「—」になる）。`scripts/build-dev.sh` の開発署名版を使う
— 手順は `docs/remaining-tasks.md` の「開発署名でローカル起動する」。

避けること: 実在の個人が特定できるコメント、他社ロゴ、Apple のUI要素の切り貼り。

---

## 8. 記入済みの値

| 項目 | 値 |
|---|---|
| 観客用 Web | `https://www.layer-talk.com`（`VITE_AUDIENCE_BASE_URL` と同じ） |
| **チーム ID** | `GU7UV62R2R` |
| **アプリの Apple ID** | `6814319511` — Vercel の `APPLE_APP_ID` に入れた値（2026-09-21 に投入・再デプロイ済み） |
| **SKU** | `layertalk-presenter`（公開されない。変更不可） |
| IAP の商品 ID | `app.layertalk.presenter.event_pass` |
| **年齢制限指定** | **13+**（2026-09-21 確定。上書きなし） |
| **プライマリ／セカンダリカテゴリ** | 仕事効率化 / ビジネス |
| 審査用アカウント | メールは `layertalk0816+appreview@gmail.com`。パスワードは `npm run create:review-account` の出力を ASC に直接入れる（リポジトリには書かない） |
