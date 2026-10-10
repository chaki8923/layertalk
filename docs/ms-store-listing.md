# Microsoft Store に入れる値（下書き）

最終更新: 2026-10-10

**Windows 版の提出先は Microsoft Store のみ。** 直接配布はしないので、コード署名証明書は
買わない（ストアが Microsoft の証明書で再署名する）。個人アカウントでは EV 証明書が取れず、
OV/IV を買っても SmartScreen の警告は消えないので、買う意味がそもそも無い。

関連:
- MSIX の作り方と罠 → `scripts/build-msix.ps1` のヘッダ
- マニフェストの各値の出どころ → `apps/presenter-app/src-tauri/msix/AppxManifest.template.xml` のコメント
- Windows 版の実装と実測 → `docs/windows-spike.md`
- App Store 版の文面（流用元）→ `docs/app-store-listing.md`

---

## 0. 手順（この順でないと進めない）

1. **開発者アカウントを登録**（**無料**。本人確認に1〜3営業日）
   **https://storedeveloper.microsoft.com/**
   - **ここが唯一の入口。** `partner.microsoft.com/dashboard/registration` は旧経路で、
     未登録のアカウントで開くと「Access restricted」になる（実際に踏んだ）
   - **個人（Individual）を選ぶ。** 法人登記は不要
   - **個人の Microsoft アカウントで入ること。** 職場・学校アカウント（組織の Entra ID）だと
     権限で弾かれることがある。迷ったらシークレットウィンドウで開く
   - 氏名・住所は本人確認書類どおりに。Apple Developer と揃えておくと後が楽
   - **登録料は無料。** 2025年9月に個人の登録料が、2026年5月に法人の $99 が撤廃された
     （古い情報では「$19 の買い切り」とある）
2. **「発行者の表示名」を控える**（アカウント設定 > アカウントの詳細）
   → `MSIX_PUBLISHER_DISPLAY_NAME`
   > **個人アカウントだとここは通常あなたの本名になる。** `tauri.conf.json` の
   > `bundle.publisher: "LayerTalk"` は引き継がれないし、ストアの発行者名を「LayerTalk」に
   > したいなら法人アカウントが要る（ポリシー 10.14）。先に決めておくこと —
   > 公開後の変更は面倒
3. **アプリ名「LayerTalk」を予約**（概要 > 新しいアプリを作成）
4. **製品 ID を控える**（(アプリ) > 製品の管理 > 製品 ID）
   - 「パッケージ/ID/名前」→ `MSIX_IDENTITY_NAME`
   - 「パッケージ/ID/発行者」→ `MSIX_PUBLISHER`（`CN=` で始まる）
5. **VM で `.msix` を作る**（`scripts/build-msix.ps1`）
6. **スクリーンショットを撮る**（下記）
7. **申請する**

---

## 1. 名前・説明文

App Store 版（`docs/app-store-listing.md`）から流用し、プラットフォームの記述だけ直す。

| 項目 | 値 |
|---|---|
| 製品名 | `LayerTalk` |
| カテゴリ | 仕事効率化（Productivity） |
| 価格 | 無料（Event Pass はアプリ内で Stripe 決済） |
| 対応言語 | 日本語（既定）・英語 |

### 簡単な説明（日本語・最大 1,000 字）

```
発表中のスライドの一番上に、観客のコメント・質問・スタンプをリアルタイムで重ねて表示します。
背景は透過し、クリックはすり抜けるので、スライドの操作をいっさい邪魔しません。

観客は参加QRを読むか6文字コードを入れるだけ。アプリのインストールも、アカウント登録も要りません。

PowerPoint、Google スライド、Canva、Notion など、全画面で表示できる発表ツールならそのまま使えます。
発表ツールを乗り換える必要はありません。

・コメントとスタンプがスライドの上を流れます
・質問は画面の右端に残るので、流れて消えても後から答えられます
・NGワード、承認制、ブロック、通報に対応しています
・質問が届いた瞬間のスライドを保存し、発表後にHTMLのレポートとして書き出せます（Event Pass）

Event Pass（買い切り）を購入すると、1つのルームで7日間、承認制・入室パスコード・
発表レポート・ブランド設定が使えます。自動更新はありません。
```

### Short description (English)

```
LayerTalk puts your audience's comments, questions, and stamps right on top of your slides,
in real time. The overlay is transparent and click-through, so it never gets in the way of
presenting.

Your audience just scans a QR code or types a six-character code. No app to install, no
account to create.

It works with anything you can show full screen - PowerPoint, Google Slides, Canva, Notion.
You don't have to change the tool you already use.

- Comments and stamps float across your slides
- Questions stay in a panel at the right edge, so you can answer them after they scroll away
- Word filters, approval mode, blocking, and reporting are built in
- Save the slide as it looked when each question arrived, and export an HTML report
  afterwards (Event Pass)

Event Pass is a one-time purchase that unlocks approval mode, a room passcode, presentation
reports, and branding for one room for seven days. It does not renew automatically.
```

> **他社製品名をキーワード欄に入れないこと。** 説明文で「重ねて使える例」として挙げるのは
> 問題ないが、検索語として並べるのは商標の指摘を招く。App Store 版と同じ判断。

### システム要件

| | |
|---|---|
| OS | Windows 10 バージョン2004（10.0.19041）以降 |
| その他 | Microsoft Edge WebView2 ランタイム（Windows 11 には同梱。無い場合はアプリが入手先を案内する） |

---

## 2. スクリーンショット

- **形式**: PNG、横向き、**1366×768 以上**（1920×1080 を推奨）、1枚あたり 50MB 以内
- **枚数**: 最低1枚、最大10枚。**4〜8枚が推奨**
- **言語ごとに別々にアップロードが必要**（同じ画像でも、日本語と英語の両方に入れる）
- 重要な要素は**上から 2/3 の範囲**に置く（下 1/3 にキャプションが重なる）
- **ロゴ・アイコン・宣伝文句を画像に足さないこと**

**App Store 版（`assets/*-appstore.png`、1440×900）のうち3枚はそのまま使える。**
寸法は 1366×768 以上を満たしている。

| 枚 | 流用 | 理由 |
|---|---|---|
| コメント表示 / 質問パネル / 参加QR | **可** | スライドとオーバーレイだけで、OS の要素が写っていない |
| コントロール窓 / 安全管理 / Event Pass | **不可** | macOS の信号機ボタン、「内蔵Retinaディスプレイ」、「このMacのKeychainに保存されます」が写っている。文言は Windows 版で直したので、画像のほうが古い |

> 流用する3枚の唯一の難点は、**絵文字が Apple のデザイン**であること
> （Windows では Segoe UI Emoji になる）。審査で問題になる水準ではないが、
> 気になるなら撮り直す。

### 用意できているもの（2026-10-10）

| アップロードするファイル | 出どころ | 寸法 |
|---|---|---|
| `assets/コメント表示-appstore.png` | App Store 版から流用 | 1440×900 |
| `assets/質問パネル-appstore.png` | 同上 | 1440×900 |
| `assets/参加QR-appstore.png` | 同上 | 1440×900 |
| `assets/コントロール窓_windows.png` | VM で撮影 | 1920×850 |
| `assets/安全管理_windows.png` | VM で撮影 | 1920×850 |
| `assets/イベントパス_windows.png` | VM で撮影 | 1920×850 |
| `assets/ms-store-tile-300.png` | `icons/icon.png` を縮小 | 300×300 |

最後の1枚は**スクリーンショットではなくアプリタイルアイコン**（1:1）。登録すると
ストアがパッケージ内のアイコンより優先して使う。

### VM で撮り直すとき

`scripts/take-screenshot.ps1` を使う。手でトリミングすると寸法を割る（最初の3枚が
1188×768 未満で撮れていた）。

```powershell
.\scripts\take-screenshot.ps1 -Name コントロール窓 -OutputDirectory "\\Mac\Home\Desktop\LayerTalk\assets"
```

撮るもの（App Store 版と同じ構図でよい。`docs/app-store-listing.md` の 7. 参照）:

1. スライドにコメントが流れている状態
2. 質問パネルが右端に出ている状態
3. 参加QRがスライドに出ている状態
4. コントロール窓（表示モニター＋参加コード）
5. 安全管理のパネル（NGワード・ブロック）
6. Event Pass のパネル（価格が出ている状態）

> **NGワードの既定値には罵倒語が入っている**（`bastard` を含む16語）。
> 撮影用のルームでは消すか、無害な語に差し替えてから撮ること。

---

## 3. 申請時に必ず答えるもの

### 3-1. 第三者決済の申告（ポリシー 10.8.1）— **忘れると差し戻し**

「プロパティ」ページの製品宣言で、次にチェックを入れる:

> **この製品はユーザーが購入できるが、Microsoft Store の商取引システムを使用しない**

根拠: ポリシー 10.8.1 は「PC 向けの**非ゲーム**製品は、アプリ内のデジタル商品の購入に
**安全な第三者の購入 API** または Microsoft Store の購入 API の**いずれか**を使用できる」と
定めている。LayerTalk は非ゲームで、Event Pass は Stripe Checkout で売る。

10.8.2 が課す義務との対応:
- 取引時に決済事業者を明示 → 購入シートに「Stripe Checkout に表示される方法」と出している
- 利用者の認証 → Supabase のサインインが前提
- 購入の確認 → Stripe Checkout の画面
- PCI DSS → Stripe Checkout が担う（カード情報はこちらに来ない）
- **「インストール時に登録や決済を求めないこと。インストール後にブラウザへ誘導するのは可」**
  → `billing.direct.ts` は購入ボタンを押したときに既定のブラウザで Checkout を開く。
  **インストーラに決済の手順を足さないこと**

### 3-2. restricted capability（`runFullTrust`）の理由

**宣言しているのは2つだけで、記入を求められるのは `runFullTrust` の方だけ。**
もう1つの `graphicsCaptureWithoutBorder` は Microsoft の表で **general-use** に
分類されていて restricted ではないので、正当性の説明も審査の追加日数もいらない
（`graphicsCapture` と `graphicsCaptureProgrammatic` も同じ扱いだが、どちらも使っていないので
宣言していない）。パッケージをアップロードすると restricted だけが自動検出され、
「申請オプション」のページに記入欄が出る。

> **ここに書いたものが実際の宣言と食い違わないこと。** マニフェストの
> `<Capabilities>` を足したり削ったりしたら、この節も直す。認証担当者は
> 宣言を見てこの説明を読む。

「申請オプション」で記入を求められる。そのまま貼れる文面:

```
LayerTalk is a Win32 desktop application (Rust + WebView2) packaged with the Desktop Bridge.
It declares runFullTrust because the package contains a full-trust application
(uap10:TrustLevel="mediumIL"), which is required for the package to install.

Full trust is needed for three Win32 APIs that have no AppContainer equivalent:

1. SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) - so the app's own transparent overlay
   is excluded from the slide screenshot it takes when an audience question arrives.
2. SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE) with WS_EX_TOOLWINDOW - so the comment overlay
   stays above a full-screen slideshow without stealing keyboard focus from it.
3. Windows.Graphics.Capture via IGraphicsCaptureItemInterop::CreateForMonitor - to capture
   the presented slide when an audience question arrives.

The app does not elevate, does not install drivers or services, and does not register COM
servers.
```

### 3-3. 年齢レーティング（IARC）

- **ユーザー生成コンテンツ: あり**（観客のコメント・質問・スタンプ）
- **アプリ内購入: あり**（Event Pass）

> **ポリシー 11.11 に備えること。** 「レーティングより高い年齢向けになりうる内容を
> 提供する場合、コンテンツフィルタまたは既存アカウントでのサインインで利用者が
> opt-in できるようにすること」とある。LayerTalk は任意の文字列を投影面に出すので、
> ここを聞かれる。**答えられる材料はある**: NGワード（既定で罵倒語16語）、承認制、
> ブロック、通報。App Store 1.2 の4点（フィルタ／通報／ブロック／連絡先）は
> **すべて無料ルームで動く**ので、そのまま説明に使える。

### 3-4. 認証担当者向けのメモ（必ず書く）

**書かないと審査が進まない。** コントロール窓はサインインしないと何も出ないし、
「プレゼンを開始」はルームを作らないと押せない。トレイ常駐なので、窓を閉じると
壊れたように見える。

```
Test account: <メール> / <パスワード>（`npm run create:review-account` の出力）

How to try it:
1. Sign in with the test account above.
2. Press "ルームを作成" (Create room). A six-character code and a QR code appear.
3. Press "プレゼンを開始" (Start presenting). A transparent overlay covers the selected display.
4. On a phone or a second browser, open https://www.layer-talk.com and enter the code.
   Post a comment - it scrolls across the presenter's screen.
5. Press Ctrl+Shift+L to bring the control window back. The app lives in the notification
   area while presenting, so the control window is hidden on purpose.

Event Pass is optional. The core experience (comments, stamps, questions on the slide) is
free. Payment uses Stripe Checkout, opened in the default browser after install, per
Store Policy 10.8.1 / 10.8.2.
```

### 3-5. プライバシーポリシー URL（必須）

```
https://www.layer-talk.com/legal/privacy
```

観客のコメントを送受信し、画面の内容を取得するので、**「個人情報を取得・送信する」に
「はい」**。URL が無いと認証に落ちる。

---

## 4. ローカルで試す（提出前）

**提出するファイルには絶対に署名しないこと。** 署名も証明書も要らない方法で試せる:

```powershell
# 開発者モードを有効にしておく（設定 > システム > 開発者向け）
Add-AppxPackage -Register "...\src-tauri\target\msix\staging\AppxManifest.xml"

# 消すとき
Get-AppxPackage -Name '*LayerTalk*' | Remove-AppxPackage
```

これで**提出するものと同じマニフェスト**のまま、パッケージ ID 付き（AppData の
リダイレクトあり）で動かせる。

確認すること:
- 質問スライドの保存先が
  `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalCache\Roaming\app.layertalk.presenter\`
  に移っていて、**保存とレポート出力が通る**こと
  （`%APPDATA%` を直接見ると空に見えるが、それはリダイレクトであってバグではない）
- `Ctrl+Shift+L` が効くこと
- 法務リンク4つがブラウザで開くこと
- 撮影が通り、**オーバーレイが写り込んでいない**こと
- **保存されたスライド画像に黄色い枠が入っていないこと**
  → **2026-10-10 に確認済み。出なかった。** ここは **MSIX にしたときだけ壊れる**
  唯一の箇所なので、素のビルドでの検証は根拠にならない（`docs/windows-spike.md` の
  「Windows 固有の注意」参照）。マニフェストの `graphicsCaptureWithoutBorder` だけで足りた

> **起動はスタートメニューから。** `LayerTalk.exe` を直接叩くとパッケージ ID が付かず、
> 上の検査（特に黄枠とリダイレクト先）が意味を持たなくなる。

> **開発者モードが要る**（設定 > システム > 開発者向け）。無いと
> `Add-AppxPackage` が `0x80073CFF` で落ちる。未署名パッケージのローカル登録にだけ
> 必要なもので、ストア版は署名されて配られるので利用者には要らない。

---

## 4b. 審査に通ったあとの公開手順（2026-10-10 に提出）

**「申請オプション > 公開の保留オプション」で「[今すぐ公開] を選択するまで、この提出物を
公開しない」を選んである。** 認定に通っても自動では公開されない。

理由: `feature/windows-spike` を merge すると audience-web が Vercel へデプロイされて
サイトに「Windows 対応」が出る。認定と同時に自動公開されると、**サイトに載る前に
ストアにアプリだけ並ぶ**か、逆に merge が早すぎると**ストアに無いのにサイトが対応を
うたう**ことになる。公開の瞬間を自分で握るためにこうしてある。

認定に通ったらこの順でやる:

1. `feature/windows-spike` を `main` に merge して push
2. Vercel のデプロイが終わり、`layer-talk.com` に Windows 版の記述が出たことを確認
3. Partner Center の認定の状態ページで **「今すぐ公開」** を押す

---

## 5. 記入済みの値

| 項目 | 値 |
|---|---|
| 観客用 Web | `https://www.layer-talk.com` |
| プライバシーポリシー | `https://www.layer-talk.com/legal/privacy` |
| 利用規約 | `https://www.layer-talk.com/legal/terms` |
| 特商法 | `https://www.layer-talk.com/legal/tokusho` |
| サポート | `https://www.layer-talk.com/support` |
| 最低 OS | Windows 10 バージョン2004（10.0.19041） |
| アーキテクチャ | x64 のみ |
| `MSIX_IDENTITY_NAME` | `9655B530.LayerTalk` |
| `MSIX_PUBLISHER` | `CN=D8960943-1293-42F0-91F9-5404066BF9C6` |
| `MSIX_PUBLISHER_DISPLAY_NAME` | `茶木涼` |

3つとも Partner Center が発行した値で、**推測で書き換えないこと**（不一致だと提出が弾かれる）。
`MSIX_IDENTITY_NAME` と `MSIX_PUBLISHER` は公開される MSIX の中に入るもので、
`MSIX_PUBLISHER_DISPLAY_NAME` はストアのページに発行者として出る。秘密ではない。

ビルドのたびに環境変数で渡す:

```powershell
$env:MSIX_IDENTITY_NAME          = "9655B530.LayerTalk"
$env:MSIX_PUBLISHER              = "CN=D8960943-1293-42F0-91F9-5404066BF9C6"
$env:MSIX_PUBLISHER_DISPLAY_NAME = "茶木涼"
.\scripts\build-msix.ps1
```
