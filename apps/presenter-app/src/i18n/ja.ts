import type { Split } from "@layertalk/shared";

/**
 * 発表者用アプリの文言（日本語）。**こちらが正**で、`en.ts` は
 * `Messages` 型で縛ってあるので訳し忘れ・余分なキー・引数の取り違えは tsc で落ちる。
 *
 * 値を埋める文はテンプレート文字列ではなく**関数**にしてある。プレースホルダ方式だと
 * 引数の付け忘れが実行時まで分からないうえ、英語の複数形（1 comment / 5 comments）を
 * 表現できない。
 *
 * ここに **`ディスプレイ N`（Rust の `screen_name` が作る文字列）を足さないこと。**
 * あれは `settings.monitorName` に保存されて文字列一致で照合される ID であって、文言ではない。
 */
export const ja = {
  header: {
    /** 言語トグルの読み上げ用。ラベル自体（日本語 / English）は訳さない。 */
    language: "表示言語",
  },

  live: {
    start: "プレゼンを開始",
    stop: "プレゼンを終了",
    needsRoom: "先にルームを作成してください",
    showingOn: (monitor: string) =>
      `${monitor} に表示中。開始後に届いたコメントだけが流れます。`,
    hidden: "開始するまでオーバーレイはどこにも表示されません。",
  },

  room: {
    section: "ルーム",
    joinCode: "参加コード",
    copied: "コピーしました",
    copyUrl: "観客用URLをコピー",
    showQr: "スライドに参加QRを表示",
    qrOn: "発表中はスライド左下に出ます。",
    qrOff: "オンにすると発表中もスライドの左下に QR を重ねます。",
    commentCount: (n: number) => `コメント ${n} 件`,
    switchWarning: "切り替えると参加コードが変わります。このルームはコードで再開できます。",
    cancel: "やめる",
    switchConfirm: "切り替える",
    switch: "ルームを切り替える",
    switchBlocked: (stop: string) => `発表中は切り替えられません。先に「${stop}」してください。`,
    create: "新しいルームを作成",
    joinPlaceholder: "既存コードで再開",
    join: "接続",
    /** 「直前のルーム <コード> に戻る」。コードだけ字送りを変えて挟む。 */
    backToPrevious: { before: "直前のルーム", after: "に戻る" } satisfies Split,
    codeLength: "ルームコードは6文字です",
    notFound: "そのコードのルームは見つかりませんでした",
  },

  monitor: {
    section: "表示モニター",
    /** モニター未選択のときの表示名。Rust が作る `ディスプレイ N` とは別物。 */
    primary: "主ディスプレイ",
    followPrimary: "主ディスプレイに追従",
    followPrimarySub: "接続構成が変わっても自動でメイン画面へ",
    primarySuffix: " ・ 主ディスプレイ",
    hint: "選ぶとその画面に確認用の枠が数秒表示されます。",
    hintSingle: " 現在つながっているディスプレイは1台です。",
    peek: "この画面に表示します",
  },

  display: {
    section: "表示スタイル",
    flow: "横流れ",
    bubble: "フキダシ",
    test: "コメントをテスト表示",
    /** オーバーレイ側に描画される文字列。発表者が選んだ言語で出す。 */
    testText: "コメントの表示テストです",
  },

  stamp: {
    section: "スタンプ",
    test: "スタンプをテスト送信",
    hint: "スマホを持ち出さずに、その場で速さを確かめられます。",
    hintPeek: " 開始前でも、確認のあいだだけオーバーレイが出ます。",
  },

  customStamp: {
    section: "カスタムスタンプ",
    allow: "観客が追加した画像を流す",
    allowOn: "観客はスタンプバーの ＋ から画像を追加できます。発表中でも即座にオフにできます。",
    allowOff: "オフのあいだは、観客が押しても画像はスライドに出ません（絵文字は出ます）。",
    needsRoom: "ルームを作成すると使えます。",
    empty: "まだありません。観客がスタンプバーの ＋ から追加できます。",
    delete: "このスタンプを削除",
    deleteHint: "× で消すと観客のスタンプバーからも消えます。",
  },

  overlay: {
    section: "オーバーレイ",
    clickThrough: "クリックスルー 有効",
    clickThroughHint:
      "コメントとスタンプはマウス操作を受け取りません。右端の質問パネルだけを展開・折りたたみできます。",
    refit: "画面サイズに合わせ直す",
    refitHint: "外部ディスプレイを繋いだ後や解像度を変えた後に押してください。",
  },

  status: {
    connecting: "接続中…",
    connected: "接続済み",
    disconnected: "切断",
  },

  questions: {
    title: "質問",
    show: (unread: number) => (unread > 0 ? `質問を表示、未読${unread}件` : "質問を表示"),
    hide: "質問を隠す",
  },

  /** 承認制（Event Pass）。壇上で捌くので、この窓のいちばん上に出す。 */
  approval: {
    title: (n: number) => `承認待ち ${n} 件`,
    approve: "承認",
    hide: "非表示",
    question: "質問",
    /** 承認モードのトグルの下に出す。どこに出るのかを毎回思い出させるため。 */
    hint: "承認待ちのコメントは、この窓のいちばん上に出ます。",
    failed: "承認を反映できませんでした",
  },

  /** スライドに重ねて**観客が読む**文字列。ルームの言語＝発表者の設定なのでここも連動する。 */
  qr: {
    scan: "スマホで参加",
  },
};
