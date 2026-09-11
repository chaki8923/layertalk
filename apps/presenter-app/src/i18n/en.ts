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

  reorder: {
    handle: "Reorder section",
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
    brand: "Brand",
    brandHint: "The logo, colour and LayerTalk name apply to the join QR card above.",
    brandColor: "Brand colour",
    brandHideLayerTalk: "Hide the LayerTalk name",
    brandLogoAdd: "Add a logo",
    brandLogoReplace: "Replace the logo",
    brandLogoBusy: "Working…",
    brandLogoSaved: "Logo saved",
    brandLocked: "Editable while an Event Pass is active.",
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

  approval: {
    title: (n: number) =>
      n === 1 ? "1 comment awaiting approval" : `${n} comments awaiting approval`,
    approve: "Approve",
    hide: "Hide",
    question: "Question",
    hint: "Comments awaiting approval appear at the top of this window.",
    failed: "Could not apply that decision",
  },

  account: {
    title: "Account",
    signOut: "Sign out",
    signIn: "Sign in",
    signInHint: "An account is needed for purchases, presentation reports, and deleting your account. The rooms you already made stay yours.",
    offlineTitle: "Could not connect",
    offlineBody: "LayerTalk can’t reach its server, so rooms can’t be created. Check your connection and try again.",
    retry: "Try again",
    privacy: "Privacy",
    terms: "Terms",
    support: "Support",
    openFailed: "Could not open that page",
    delete: "Delete account",
    deleteTitle: "Delete your account?",
    deleteBody: "Your rooms, comments, questions, custom stamps, reports, and Event Pass entitlements will all be removed. This cannot be undone.",
    deleteKeeps: "Payment records stay with Stripe for accounting and fraud prevention.",
    deleteConfirmLabel: "Type DELETE to confirm",
    deleteConfirmWord: "DELETE",
    deleteCancel: "Cancel",
    deleteSubmit: "Permanently delete",
    deleteFailed: "Could not delete your account. Please try again in a moment",
    deleteExpired: "Your session expired. Sign in again before deleting your account",
    deleteOffline: "Could not delete your account. Check your connection",
  },

  reports: {
    title: (n: number) => (n === 1 ? "1 report" : `${n} reports`),
    reason: {
      offensive: "Offensive",
      harassment: "Harassment",
      spam: "Spam",
      other: "Other",
    },
    stampTarget: "Custom stamp",
    missingTarget: "Deleted post",
  },

  qr: {
    scan: "SCAN TO JOIN",
  },
};
