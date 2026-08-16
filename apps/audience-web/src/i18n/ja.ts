/**
 * 観客用 Web の文言（日本語）。**こちらが正**で、`en.ts` は `Messages` 型で
 * 縛ってあるので訳し忘れ・余分なキー・引数の取り違えは tsc で落ちる。
 *
 * 表示言語は**ルームが持つ**（発表者がコントロール窓のトグルで決める）。観客側に
 * 切り替え UI は出さない。ルームがまだ分からない「/」だけ Accept-Language で決める。
 */
export const ja = {
  meta: {
    title: "LayerTalk | 会場の声を、スライドの上へ。",
    description: "観客のコメント、質問、スタンプを発表中のスライドへリアルタイムに届ける",
    keywords: ["プレゼンテーション", "リアルタイムコメント", "質疑応答", "観客参加", "イベント運営", "スライドオーバーレイ"],
  },

  public: {
    nav: {
      label: "公開ページ",
      features: "機能",
      howItWorks: "使い方",
      eventPass: "Event Pass",
      join: "参加する",
    },
    footer: {
      home: "LayerTalkについて",
      eventPass: "Event Pass",
      terms: "利用規約",
      privacy: "プライバシー",
      commerce: "特定商取引法に基づく表記",
      support: "お問い合わせ",
      label: "サイト情報・法務・サポート",
      copyright: "© 2026 LayerTalk",
    },
  },

  landing: {
    eyebrow: "Live audience, on your slides",
    titleLead: "会場の声を、",
    titleHighlight: "スライドの上へ。",
    description: "LayerTalkは、観客のコメント・質問・スタンプをプレゼン画面へリアルタイムに重ねる、macOS向けの参加型プレゼンツールです。",
    primaryCta: "Event Passを見る",
    secondaryCta: "参加コードを入力",
    signals: ["観客アプリ不要", "QR・6桁コード参加", "観客数の制限なし"],
    stage: {
      label: "LIVE SLIDE",
      status: "参加受付中",
      slideTitle: "アイデアは、会場で育つ。",
      slideBody: "コメントも質問も、プレゼンを止めずに。",
      comments: ["その視点、面白い！", "質問があります", "👏👏👏"],
      audience: "128 joined",
    },
    join: {
      eyebrow: "Join a room",
      title: "観客として参加する",
      description: "発表者から共有された6桁の参加コードを入力してください。QRコードから開いた場合は入力不要です。",
    },
    features: {
      eyebrow: "In the room",
      title: "反応が見えると、発表は一方通行ではなくなる",
      items: [
        { title: "コメントが流れる", description: "観客のひとことをスライドの最前面へ。発表を止めずに、その場の温度が伝わります。" },
        { title: "質問が残る", description: "質問として投稿された声を分けて表示。見逃さず、次の対話につなげられます。" },
        { title: "スタンプで応える", description: "言葉にしにくい瞬間も、絵文字やカスタムスタンプなら気軽に反応できます。" },
      ],
    },
    worksWith: {
      eyebrow: "Works with anything",
      title: "重ねるだけだから、ツールは選ばない",
      description: "LayerTalkはスライドを読み込みません。画面の一番上に透明な層を重ねるだけなので、下がPowerPointでもKeynoteでも、ブラウザで開いたCanvaやNotionでも同じように使えます。",
      toolsLabel: "重ねて使える発表ツールの例",
      tools: ["PowerPoint", "Keynote", "Google スライド", "Canva", "Notion"],
      trademark: "※ 各製品名は各社の商標です。",
      points: [
        { title: "取り込みは不要", description: "スライドを書き出したり、変換したりする手順はありません。" },
        { title: "プラグインは不要", description: "発表ツール側にインストールするものはありません。" },
        { title: "全画面のままでいい", description: "スライドショーでも、ブラウザのプレゼンモードでも重なります。" },
      ],
      /** JSON-LD の `featureList` 専用。画面には出ない。 */
      featureName: "PowerPoint、Keynote、Google スライド、Canva、Notionなど、どの発表ツールの画面にも重ねて表示",
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "共有するのは、ひとつのコードだけ",
      steps: [
        { title: "ルームをつくる", description: "Presenterアプリで発表用ルームを作成します。" },
        { title: "QRかコードを共有", description: "スライド上のQR、または6桁コードを観客へ案内します。" },
        { title: "会場の反応を映す", description: "コメント、質問、スタンプがスライドの上へ届きます。" },
      ],
    },
    eventPass: {
      eyebrow: "For the main event",
      title: "本番を安全に運営するためのEvent Pass",
      description: "承認制、NGワード、入室パスコード、発表レポート、ブランド設定を、購入した1ルームで7日間利用できます。",
      price: "2,980円",
      tax: "税込",
      duration: "1ルーム・7日間",
      cta: "Event Passの詳細を見る",
      note: "購入はPresenterアプリから開始します。",
    },
    finalCta: {
      title: "次の発表を、会場との対話に変える。",
      presenter: "Event Passを見る",
      audience: "観客として参加",
    },
  },

  join: {
    prompt: "発表者から共有された参加コードを入力してください",
    codeLabel: "参加コード",
    codeLength: (length: number) => `参加コードは${length}文字です`,
    submit: "参加する",
  },

  room: {
    notFound: "ルームが見つかりません",
    notFoundBody: (code: string) => `コード「${code}」のルームは存在しないか、終了しています。`,
    retype: "コードを入力し直す",
    connectFailed: "接続できませんでした",
    emptyTitle: "まだコメントがありません",
    emptyBody: "最初のひとことを送ってみましょう",
  },

  status: {
    connecting: "接続中",
    connected: "接続済み",
    disconnected: "切断",
  },

  sort: {
    label: "コメントの並び順",
    popular: "人気順",
    latest: "最新順",
  },

  composer: {
    asQuestion: "質問として投稿する",
    placeholderQuestion: "質問を入力",
    placeholderComment: "コメントを入力",
    sendQuestion: "質問を送信",
    sendComment: "コメントを送信",
    enterHint: "Enter で送信・Shift+Enter で改行",
  },

  comment: {
    question: "質問",
    mine: "あなた",
    like: "いいね",
    unlike: "いいねを取り消す",
  },

  stamp: {
    added: "スタンプを追加しました",
    confirmTitle: "この画像をスタンプにする",
    confirmBody: "このルームにいる全員が押せるようになります",
    cancel: "やめる",
    add: "追加する",
    send: (emoji: string) => `${emoji} を送る`,
    sendCustom: "カスタムスタンプを送る",
    addFromImage: "画像からスタンプを追加",
    roomFull: "カスタムスタンプは上限です",
  },
};
