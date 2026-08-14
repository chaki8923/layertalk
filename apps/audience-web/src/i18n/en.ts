import type { Messages } from "./index";

/**
 * 観客用 Web の文言（英語）。`Messages`（= `typeof ja`）で縛ってあるので、
 * キーの過不足も関数の引数違いも `npm run typecheck` で落ちる。
 */
export const en: Messages = {
  meta: {
    description: "Send your comments and stamps to the slides on screen",
  },

  join: {
    prompt: "Enter the join code shared by the presenter",
    codeLabel: "Join code",
    codeLength: (length: number) => `Join codes are ${length} characters`,
    submit: "Join",
  },

  room: {
    notFound: "Room not found",
    notFoundBody: (code: string) => `No room with the code "${code}" exists, or it has ended.`,
    retype: "Enter the code again",
    connectFailed: "Could not connect",
    emptyTitle: "No comments yet",
    emptyBody: "Be the first to say something",
  },

  status: {
    connecting: "Connecting",
    connected: "Connected",
    disconnected: "Disconnected",
  },

  sort: {
    label: "Sort comments",
    popular: "Top",
    latest: "Newest",
  },

  composer: {
    asQuestion: "Post as a question",
    placeholderQuestion: "Ask a question",
    placeholderComment: "Write a comment",
    sendQuestion: "Send question",
    sendComment: "Send comment",
    enterHint: "Enter to send · Shift+Enter for a new line",
  },

  comment: {
    question: "Question",
    mine: "You",
    like: "Like",
    unlike: "Remove like",
  },

  stamp: {
    added: "Stamp added",
    confirmTitle: "Turn this image into a stamp",
    confirmBody: "Everyone in this room will be able to send it",
    cancel: "Cancel",
    add: "Add",
    send: (emoji: string) => `Send ${emoji}`,
    sendCustom: "Send custom stamp",
    addFromImage: "Add a stamp from an image",
    roomFull: "Custom stamps are at their limit",
  },
};
