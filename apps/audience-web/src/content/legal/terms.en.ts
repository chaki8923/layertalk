import type { SalesChannel } from "./channel";
import type { LegalDocumentContent } from "./types";

/**
 * 利用規約の英語版（`?lang=en`）。**正は `terms.ts`（日本語版）。**
 * 節の id と並びは日本語版と揃えること（アンカーを共有している。`legal-content.test.ts` が固定）。
 * 日本語版を直したら、ここも同じ内容に直す。
 *
 * Stripe チャネルの返金条件（`LEGAL_REFUND_POLICY`）は日本語の文面なので埋め込まず、
 * サポートページを参照させる。
 */
export function termsContentEn(config: {
  supportEmail: string;
  effectiveDate: string;
  updatedDate: string;
}, channel: SalesChannel = "stripe"): LegalDocumentContent {
  const appStore = channel === "app-store";
  return {
    title: "LayerTalk Terms of Use",
    lead: "These Terms set out the conditions for using LayerTalk and for purchasing an Event Pass.",
    notice: "This English version is provided for convenience. If it differs from the Japanese version, the Japanese version prevails.",
    effectiveDate: config.effectiveDate,
    updatedDate: config.updatedDate,
    sections: [
      { id: "scope", title: "1. Scope", paragraphs: ["These Terms apply to the Presenter app, the audience web pages, and related features provided by LayerTalk. By using the service, you agree to these Terms."] },
      { id: "definitions", title: "2. Definitions", items: ["“Presenter” means a user who creates and runs a room.", "“Audience member” means a user who joins a room with a join code or similar.", appStore
        ? "“Event Pass” means a limited-time product that adds paid features to one purchased room for seven days. It is an App Store non-renewing subscription: it does not renew, and you are never charged again automatically when it ends."
        : "“Event Pass” means a one-time product that adds paid features to one purchased room for seven days."] },
      { id: "account", title: "3. Presenter accounts and credentials", paragraphs: ["Presenters are responsible for keeping their registered email address, verification codes, and other credentials secure, and must not let others use them. If you notice unauthorized use, contact Support promptly."] },
      { id: "rooms", title: "4. Rooms and anonymous audience participation", paragraphs: ["Presenters may create rooms for events they manage. Audience members can join with anonymous authentication, but must follow these Terms in what they post. Presenters must manage join codes and room passcodes appropriately."] },
      { id: "event-pass", title: "5. What the Event Pass covers, its room, and its period", items: [
        appStore
          ? "Each purchase applies only to the one room shown on the purchase screen."
          : "Each purchase applies only to the one room shown before checkout starts.",
        appStore
          ? "The pass is valid for seven days from the moment the App Store purchase is confirmed. It does not renew automatically."
          : "The pass is valid for seven days from the moment Stripe confirms the payment.",
        ...(appStore ? ["You can apply the pass on other Macs signed in to the same Apple ID with “Restore purchases” in the app."] : []),
        "For a presentation started while the pass is valid, the paid features are kept until that presentation ends.",
        "Presentation history can be exported for 30 days after the purchase is completed.",
        "The pass generally cannot be transferred to anyone else. Moving it to another room follows the refund policy.",
      ] },
      { id: "payment", title: "6. Price, payment, and refunds", paragraphs: appStore
        ? [
          "The Event Pass price is the amount shown on the purchase screen and in the App Store (it varies by region according to Apple’s price tiers and exchange rates). Payment is made through Apple’s App Store, and LayerTalk’s servers never obtain or store card numbers or security codes.",
          "Refunds are handled by Apple. Request one from Apple at reportaproblem.apple.com or from your App Store purchase history. LayerTalk cannot issue refunds itself, but Support will help if a pass is not applied correctly.",
        ]
        : [
          "The Event Pass costs ¥2,980 (tax included). Payment is made through Stripe Checkout, and LayerTalk’s servers do not store card numbers or security codes.",
          "Refund and cancellation conditions are described on the Support page (in Japanese).",
        ] },
      { id: "content", title: "7. Posted content and intellectual property", paragraphs: ["Posters warrant that they hold the rights needed for the comments, questions, images, and other content they post. LayerTalk processes posted content only as needed to provide and maintain the service. Intellectual property in the service belongs to its respective owners."] },
      { id: "moderation", title: "8. Moderation, handling reports, and the organizer’s responsibility", paragraphs: [
        "LayerTalk has zero tolerance for objectionable content or harassment of other users. Audience members can report a post with the Report button on a comment, or by long-pressing a custom stamp. Reports reach the presenter’s screen immediately, and the Presenter can hide the post and block its author on the spot.",
        "Presenters are responsible for running their rooms appropriately, including setting approval mode, blocked words, and posting limits to suit the event. These features do not guarantee that every inappropriate post is prevented.",
        `LayerTalk reviews reports of objectionable content sent to Support (${config.supportEmail}), in principle within 24 hours of receipt, removes posts that violate these Terms, and bars their authors from the room.`,
      ] },
      { id: "prohibited", title: "9. Prohibited conduct", items: ["Posting obscene, violent, discriminatory, threatening, or otherwise seriously offensive content (LayerTalk does not tolerate such posts)", "Harassing, stalking, or impersonating other users, or posting spam", "Conduct that violates laws or public order and morals", "Infringing the rights, privacy, or reputation of others", "Interfering with the service, placing an excessive load on it, or attempting unauthorized access", "Sharing or reselling join codes, credentials, or paid entitlements without authorization", "Attempting fraudulent payments, refunds, or chargebacks"] },
      { id: "retention", title: "10. Data retention and deletion", paragraphs: ["Event data for free use is generally kept for seven days, and event data covered by an Event Pass for 30 days. Information needed for legal, accounting, fraud-prevention, or dispute purposes may be kept longer."] },
      { id: "availability", title: "11. Changes, interruptions, and termination of the service", paragraphs: ["The service may be suspended temporarily without notice for maintenance, outages, security needs, or other unavoidable reasons. Significant changes or the end of the service will be announced by reasonable means."] },
      { id: "disclaimer", title: "12. Disclaimer and limitation of liability", paragraphs: ["LayerTalk does not guarantee that the service will always run without interruption, that every post can be detected and controlled, or that the service is fit for a particular purpose. To the extent permitted by law, LayerTalk is not liable for unforeseeable indirect damages."] },
      { id: "changes", title: "13. Changes to these Terms", paragraphs: ["If these Terms change, the changes and their effective date will be announced on this page or by other appropriate means. Changes that significantly affect users will be notified with a reasonable notice period."] },
      { id: "law", title: "14. Governing law and jurisdiction", paragraphs: ["These Terms are governed by the laws of Japan. To the extent permitted by law, the court with jurisdiction over the seller’s location has exclusive jurisdiction in the first instance over disputes about the service."] },
      { id: "contact", title: "15. Contact", paragraphs: [`Questions about these Terms or the service: ${config.supportEmail}`] },
    ],
  };
}
