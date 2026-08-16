import type { Messages } from "./index";

/**
 * 観客用 Web の文言（英語）。`Messages`（= `typeof ja`）で縛ってあるので、
 * キーの過不足も関数の引数違いも `npm run typecheck` で落ちる。
 */
export const en: Messages = {
  meta: {
    title: "LayerTalk | Bring the room onto your slides.",
    description: "Bring audience comments, questions, and reactions onto presentation slides in real time",
    keywords: ["presentation software", "live audience engagement", "Q&A", "real-time comments", "event presentation"],
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
  },

  landing: {
    eyebrow: "Live audience, on your slides",
    titleLead: "Bring the room ",
    titleHighlight: "onto your slides.",
    description: "LayerTalk is a participatory presentation tool for macOS that puts audience comments, questions, and reactions directly over your slides in real time.",
    primaryCta: "Explore Event Pass",
    secondaryCta: "Enter a join code",
    signals: ["No audience app", "Join by QR or 6-digit code", "No audience limit"],
    stage: {
      label: "LIVE SLIDE",
      status: "Open for joining",
      slideTitle: "Ideas grow in the room.",
      slideBody: "Keep presenting while comments and questions arrive.",
      comments: ["That is a great point!", "I have a question", "👏👏👏"],
      audience: "128 joined",
    },
    join: {
      eyebrow: "Join a room",
      title: "Join as an audience member",
      description: "Enter the 6-digit code shared by the presenter. If you opened a QR link, there is nothing else to enter.",
    },
    features: {
      eyebrow: "In the room",
      title: "When reactions are visible, a talk stops being one-way",
      items: [
        { title: "Comments move with the talk", description: "Put quick audience thoughts over the slides without interrupting the presenter or changing windows." },
        { title: "Questions stay visible", description: "Separate questions from general comments so useful prompts are ready for the next conversation." },
        { title: "Reactions take one tap", description: "Emoji and custom stamps let people respond in moments when a full comment would be too much." },
      ],
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "All you share is one room code",
      steps: [
        { title: "Create a room", description: "Start a presentation room in the Presenter app." },
        { title: "Share a QR or code", description: "Show the QR on your slides or share the 6-digit code." },
        { title: "Bring reactions on screen", description: "Comments, questions, and stamps appear over your slides." },
      ],
    },
    eventPass: {
      eyebrow: "For the main event",
      title: "Event Pass keeps the live room under control",
      description: "Add approval, blocked words, an entry passcode, presentation reports, and branding to one purchased room for seven days.",
      price: "¥2,980",
      tax: "tax included",
      duration: "1 room · 7 days",
      cta: "View Event Pass details",
      note: "Purchases start in the Presenter app.",
    },
    finalCta: {
      title: "Turn your next presentation into a conversation.",
      presenter: "Explore Event Pass",
      audience: "Join as audience",
    },
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
