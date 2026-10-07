import type { Messages } from "./index";

/**
 * 観客用 Web の文言（英語）。`Messages`（= `typeof ja`）で縛ってあるので、
 * キーの過不足も関数の引数違いも `npm run typecheck` で落ちる。
 */
export const en: Messages = {
  meta: {
    title: "LayerTalk | Live audience comments and Q&A on your slides, for Mac",
    description: "A Mac app that shows audience comments, questions, and reactions over your presentation slides in real time. The audience joins with a QR or 6-character code, no app or sign-up needed. Works with PowerPoint, Keynote, Canva, and more.",
    keywords: ["presentation software", "live audience engagement", "Q&A", "real-time comments", "event presentation", "slide overlay"],
  },

  public: {
    nav: {
      label: "Public pages",
      features: "Features",
      howItWorks: "How it works",
      eventPass: "Event Pass",
      join: "Join",
    },
    footer: {
      home: "About LayerTalk",
      eventPass: "Event Pass",
      terms: "Terms",
      privacy: "Privacy",
      commerce: "Seller information",
      support: "Support",
      label: "Site information, legal, and support",
      copyright: "© 2026 LayerTalk",
    },
    appStore: {
      cta: "Download on the Mac App Store",
      compact: "Get the app",
      note: "macOS 13 or later · Free download",
    },
    legal: {
      eyebrow: "LayerTalk legal",
      effective: "Effective",
      updated: "Last updated",
      toc: "Contents",
      tocLabel: "Contents of this document",
      switchLanguage: "日本語",
      privacyTitle: "Privacy Policy | LayerTalk",
      privacyDescription: "How LayerTalk handles personal information and usage data.",
      termsTitle: "Terms of Use | LayerTalk",
      termsDescription: "The terms that govern LayerTalk and the Event Pass.",
    },
  },

  landing: {
    eyebrow: "Live audience, on your slides",
    titleLead: "Bring the room ",
    titleHighlight: "onto your slides.",
    description: "LayerTalk is a participatory presentation tool for macOS that puts audience comments, questions, and reactions directly over your slides in real time.",
    secondaryCta: "Enter a join code",
    signals: ["No audience app", "Join by QR or 6-character code", "No audience limit"],
    stage: {
      label: "LIVE SLIDE",
      status: "Open for joining",
      slideTitle: "Ideas grow in the room.",
      slideBody: "Keep presenting while comments and questions arrive.",
      comments: ["That is a great point!", "I have a question", "👏👏👏"],
      audience: "128 joined",
    },
    features: {
      eyebrow: "From their phone to your slides",
      title: "From a thought on their phone to a comment on your slides.",
      description: "Your audience just opens the shared URL in their browser. No app to install. No account to create.",
      audienceLabel: "Their phone",
      screenLabel: "Your presentation",
      comment: "Love that idea!",
      question: "Could you share an example?",
      slideTitle: "Today's idea",
      diagramCaption: "Comments and reactions sent from a phone appear over your presentation slides in real time.",
      items: [
        { title: "Comments", description: "A quick “Love that idea!” moves across your slides." },
        { title: "Questions", description: "“Could you share an example?” stays in the question list." },
        { title: "Reactions", description: "Send applause or a thumbs-up with a single tap." },
      ],
    },
    worksWith: {
      eyebrow: "Works with anything",
      title: "Same PowerPoint. Same Keynote. Same slides.",
      description: "Open your usual slides in PowerPoint, Keynote, or another presentation tool. No conversions or plugins needed. Comments appear even when you present in full screen.",
      toolsLabel: "Presentation tools you can layer over",
      tools: ["PowerPoint", "Keynote", "Google Slides", "Canva", "Notion"],
      trademark: "Product names are trademarks of their respective owners.",
      featureName: "Overlays on any presentation tool, including PowerPoint, Keynote, Google Slides, Canva, and Notion",
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "Press start. Share the URL. That's it.",
      steps: [
        { title: "Click “Start presenting”", description: "Open LayerTalk on your Mac and click the start button. Then present as you normally would." },
        { title: "Share the URL", description: "Click “Copy audience URL” and send it to your audience in a chat. One URL is all you need to share." },
      ],
      setup: "Before your first presentation, sign in to the Mac app and create a room.",
      previewLabel: "How it looks",
      startButton: "Start presenting",
      copyButton: "Copy audience URL",
      displayLabel: "Display",
      displayValue: "Follow main display",
      chatLabel: "Event chat",
      invitation: "Send your comments here!",
    },
    eventPass: {
      eyebrow: "Optional",
      title: "Need moderation? Add an Event Pass.",
      description: "Add approval, blocked words, an entry passcode, presentation reports, and branding to one purchased room for seven days.",
      price: "¥2,980",
      tax: "tax included",
      duration: "1 room · 7 days",
      cta: "View Event Pass details",
      note: "Purchases start in the Presenter app. On the Mac App Store, the price shown by the App Store applies.",
    },
    finalCta: {
      title: "Try it at your next presentation.",
    },
  },

  join: {
    title: "Enter a join code",
    description: "Enter the 6-character code shared by the presenter. If you open a shared URL or scan a QR code, no code entry is needed.",
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
    consent: {
      before: "By posting, you agree to the ",
      link: "Terms",
      after: ". Objectionable posts are removed, and their authors may be blocked.",
    },
  },

  comment: {
    question: "Question",
    mine: "You",
    like: "Like",
    unlike: "Remove like",
  },

  report: {
    open: "Report this post",
    openStamp: "Report this stamp",
    title: "Why are you reporting this?",
    body: "The presenter is notified and will review it. Your identity is not shared.",
    reasons: {
      offensive: "Offensive or abusive",
      harassment: "Targeted harassment",
      spam: "Spam or advertising",
      other: "Something else",
    },
    cancel: "Cancel",
    done: "Reported",
    failed: "Could not send the report",
    contact: "Contact the operator",
    stampHint: "Press and hold a custom stamp to report it",
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
