/**
 * 観客用 Web の文言（日本語）。**こちらが正**で、`en.ts` は `Messages` 型で
 * 縛ってあるので訳し忘れ・余分なキー・引数の取り違えは tsc で落ちる。
 *
 * 表示言語は**ルームが持つ**（発表者がコントロール窓のトグルで決める）。観客側に
 * 切り替え UI は出さない。ルームがまだ分からない「/」だけ Accept-Language で決める。
 */
export const ja = {
  meta: {
    description: "発表中のスライドに、あなたのコメントとスタンプを届ける",
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
