import type { LegalDocumentContent } from "./types";

/**
 * プライバシーポリシーの英語版（`?lang=en`）。**正は `privacy.ts`（日本語版）。**
 * 節の id と並びは日本語版と揃えること（アンカーを共有している。`legal-content.test.ts` が固定）。
 * 日本語版を直したら、ここも同じ内容に直す。チャネルで出し分けない点も日本語版と同じ。
 */
export function privacyContentEn(config: {
  supportEmail: string;
  effectiveDate: string;
  updatedDate: string;
}): LegalDocumentContent {
  return {
    title: "Privacy Policy",
    lead: "This policy explains what information LayerTalk collects, how it is used, how long it is kept, and your rights.",
    notice: "This English version is provided for convenience. If it differs from the Japanese version, the Japanese version prevails.",
    effectiveDate: config.effectiveDate,
    updatedDate: config.updatedDate,
    sections: [
      { id: "information", title: "1. Information we collect", items: ["Presenters’ email addresses, user IDs, and authentication records", "Rooms, settings, comments, questions, stamps, and presentation reports", "Purchase status and identifiers issued by payment providers (direct download version: Stripe Customer ID, Checkout Session ID, and PaymentIntent ID; Mac App Store version: Apple-signed transaction information, transaction IDs, and product IDs)", "IP addresses, device and browser information, access times, and error logs"] },
      { id: "purpose", title: "2. How we use it", items: ["Authenticating users and managing accounts", "Providing the service, including real-time comments, moderation, and reports", "Processing payments, confirming purchases, and granting and expiring paid entitlements", "Responding to inquiries, preventing misuse, investigating failures, and improving the service", "Creating and keeping records required by law"] },
      { id: "payments", title: "3. Payment information", paragraphs: ["In the direct download version, card details are collected directly by Stripe. In the Mac App Store version, payment is made through Apple’s App Store, and Apple is the seller. In either case, LayerTalk’s servers never obtain or store card numbers or security codes; they receive only the payment result and the identifiers issued by each provider. In the Mac App Store version, Apple-signed transaction information is verified and then stored."] },
      { id: "screen-capture", title: "4. Presentation slide images (macOS app)", paragraphs: ["Only when “Save slides when questions arrive” is turned on, LayerTalk captures an image of the presentation display at the moment a question arrives. LayerTalk’s own windows and the mouse cursor are excluded. Images are stored only on the presenter’s Mac and are never sent to LayerTalk’s servers or to third parties. They are deleted automatically 30 days after capture, and the feature can be turned off in the app at any time."] },
      { id: "providers", title: "5. External services and processors", items: ["Apple: payments, refunds, and purchase verification for the Mac App Store version", "Stripe: payments, receipts, and fraud prevention for the direct download version", "Supabase: authentication, database, real-time delivery, storage, and authentication email", "Cloudflare Turnstile: preventing abusive access and automated operations", "Vercel: hosting and delivery of the audience web pages"] },
      { id: "retention", title: "6. Retention periods", items: ["Event data for free use: generally 7 days", "Event data covered by an Event Pass: generally 30 days", "Records needed for payments, accounting, fraud prevention, and inquiries: for the period required by law or by a legitimate purpose"] },
      { id: "sharing", title: "7. Disclosure to third parties, processing, and international transfers", paragraphs: ["Except as required by law, LayerTalk does not sell personal information to third parties without consent. Processing may be entrusted to the external services listed above, whose servers may be located outside Japan. LayerTalk checks the security measures of these processors and puts the necessary contractual protections in place."] },
      { id: "storage", title: "8. Cookies and local storage", paragraphs: ["Cookies or local storage in the browser or app are used for authentication state, display settings, room information, offline entitlement checks, and similar purposes. Cookies are not used for advertising."] },
      { id: "security", title: "9. Security measures", paragraphs: ["LayerTalk uses encrypted communication, access control, separation of privileges, webhook signature verification, server-side management of secrets, and deletion according to retention periods. Complete security cannot be guaranteed, but these measures are reviewed continuously according to risk."] },
      { id: "requests", title: "10. Access, correction, deletion, and suspension of use", paragraphs: [`To request access to, correction or deletion of, or suspension of use of your information, contact ${config.supportEmail}. LayerTalk responds after verifying your identity and checking for information that must be kept by law.`] },
      { id: "children", title: "11. Use by minors", paragraphs: ["Minors who purchase as Presenters should obtain the consent of a parent or other legal guardian where required. Minors who join as audience members should follow the event organizer’s instructions."] },
      { id: "changes", title: "12. Changes to this policy", paragraphs: ["If this policy changes, the update date and the changes will be announced on this page or by other appropriate means. Significant changes will be notified in advance by reasonable means."] },
      { id: "contact", title: "13. Contact", paragraphs: [`Questions about how personal information is handled: ${config.supportEmail}`] },
    ],
  };
}
