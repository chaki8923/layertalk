import type { Messages } from "./index";

/**
 * 発表者用アプリの文言（英語）。
 *
 * `Messages`（= `typeof ja`）で縛ってあるので、キーの過不足も関数の引数違いも
 * `npm run typecheck` で落ちる。訳を足すときは必ず `ja.ts` を先に直すこと。
 */
export const en: Messages = {
  header: {
    language: "Language",
  },

  live: {
    start: "Start presenting",
    stop: "Stop presenting",
    needsRoom: "Create a room first",
    showingOn: (monitor: string) =>
      `Showing on ${monitor}. Only comments posted after you start will appear.`,
    hidden: "Nothing is shown anywhere until you start.",
  },

  room: {
    section: "Room",
    joinCode: "Join code",
    copied: "Copied",
    copyUrl: "Copy audience URL",
    showQr: "Show the join QR on the slide",
    qrOn: "It appears at the bottom left while you present.",
    qrOff: "Turn this on to overlay the QR at the bottom left while you present.",
    commentCount: (n: number) => (n === 1 ? "1 comment" : `${n} comments`),
    switchWarning: "Switching changes the join code. You can resume this room with its code.",
    cancel: "Cancel",
    switchConfirm: "Switch",
    switch: "Switch room",
    switchBlocked: (stop: string) => `You can't switch while presenting. Choose "${stop}" first.`,
    create: "Create a new room",
    joinPlaceholder: "Resume with a code",
    join: "Connect",
    backToPrevious: { before: "Back to room", after: "" },
    codeLength: "Join codes are 6 characters",
    notFound: "No room found for that code",
  },

  monitor: {
    section: "Display",
    primary: "the primary display",
    followPrimary: "Follow the primary display",
    followPrimarySub: "Moves to the main screen automatically when displays change",
    primarySuffix: " · primary",
    hint: "Picking one flashes a confirmation frame on that screen for a few seconds.",
    hintSingle: " Only one display is connected right now.",
    peek: "Comments will appear on this screen",
  },

  display: {
    section: "Style",
    flow: "Scrolling",
    bubble: "Bubbles",
    test: "Preview a comment",
    testText: "This is a preview comment",
  },

  stamp: {
    section: "Stamps",
    test: "Send a test stamp",
    hint: "Check the timing on the spot, without reaching for your phone.",
    hintPeek: " The overlay appears just for the preview, even before you start.",
  },

  customStamp: {
    section: "Custom stamps",
    allow: "Show images added by the audience",
    allowOn:
      "The audience can add images from ＋ in the stamp bar. You can turn this off instantly, even mid-talk.",
    allowOff:
      "While this is off, audience images never reach the slide (emoji still do).",
    needsRoom: "Available once you create a room.",
    empty: "Nothing yet. The audience can add images from ＋ in the stamp bar.",
    delete: "Delete this stamp",
    deleteHint: "Deleting with × also removes it from the audience's stamp bar.",
  },

  overlay: {
    section: "Overlay",
    clickThrough: "Click-through is on",
    clickThroughHint:
      "Comments and stamps never take mouse input. Only the question panel on the right can be expanded and collapsed.",
    refit: "Refit to the screen",
    refitHint: "Press this after connecting an external display or changing the resolution.",
  },

  status: {
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected",
  },

  questions: {
    title: "Questions",
    show: (unread: number) =>
      unread > 0 ? `Show questions, ${unread} unread` : "Show questions",
    hide: "Hide questions",
  },

  qr: {
    scan: "SCAN TO JOIN",
  },
};
