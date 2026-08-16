import type { LegalDocumentContent } from "./types";

export function privacyContent(config: {
  supportEmail: string;
  effectiveDate: string;
  updatedDate: string;
}): LegalDocumentContent {
  return {
    title: "プライバシーポリシー",
    lead: "LayerTalkが取得する情報、その利用目的、保存期間および利用者の権利について説明します。",
    effectiveDate: config.effectiveDate,
    updatedDate: config.updatedDate,
    sections: [
      { id: "information", title: "1. 取得する情報", items: ["Presenterのメールアドレス、ユーザーIDおよび認証記録", "ルーム、設定、コメント、質問、スタンプ、発表レポート", "購入状態、Stripe Customer ID、Checkout Session ID、PaymentIntent ID", "IPアドレス、端末・ブラウザ情報、アクセス時刻、エラーログ"] },
      { id: "purpose", title: "2. 利用目的", items: ["本人認証とアカウント管理", "リアルタイムコメント、モデレーション、レポート等のサービス提供", "決済処理、購入確認、有料権利の付与と失効", "問い合わせ対応、不正利用の防止、障害調査とサービス改善", "法令上必要な記録の作成と保存"] },
      { id: "payments", title: "3. 決済情報", paragraphs: ["カード情報はStripeが直接収集します。LayerTalkのサーバーはカード番号やセキュリティコードを取得・保持せず、決済結果とStripeが発行する識別子だけを受け取ります。"] },
      { id: "providers", title: "4. 外部サービスと委託先", items: ["Stripe: 決済、領収書、不正利用対策", "Supabase: 認証、データベース、リアルタイム配信、ストレージ、認証メール", "Cloudflare Turnstile: 不正なアクセスや自動化された操作の防止", "Vercel: Audience Webのホスティングと配信"] },
      { id: "retention", title: "5. 保存期間", items: ["Freeのイベントデータ: 原則7日間", "Event Passのイベントデータ: 原則30日間", "決済、会計、不正対策、問い合わせ対応に必要な記録: 法令または正当な目的に応じた期間"] },
      { id: "sharing", title: "6. 第三者提供、委託、越境移転", paragraphs: ["法令に基づく場合を除き、本人の同意なく個人情報を第三者へ販売しません。上記の外部サービスへ処理を委託することがあり、そのサーバーが日本国外に所在する場合があります。委託先の安全管理措置を確認し、必要な契約上の保護を行います。"] },
      { id: "storage", title: "7. Cookieとローカルストレージ", paragraphs: ["認証状態、表示設定、ルーム情報、オフライン権利確認等のため、Cookieまたはブラウザ・アプリ内のローカルストレージを利用します。広告目的のCookieは使用していません。"] },
      { id: "security", title: "8. 安全管理措置", paragraphs: ["通信の暗号化、アクセス制御、権限の分離、Webhook署名検証、秘密情報のサーバー側管理、保存期間に応じた削除等を行います。安全性を完全に保証するものではありませんが、リスクに応じて継続的に見直します。"] },
      { id: "requests", title: "9. 開示、訂正、削除、利用停止", paragraphs: [`本人の情報に関する開示、訂正、削除または利用停止の請求は、${config.supportEmail} へご連絡ください。本人確認と、法令上保存が必要な情報の確認を行ったうえで対応します。`] },
      { id: "children", title: "10. 未成年者の利用", paragraphs: ["未成年者がPresenterとして購入する場合は、必要に応じて親権者等の法定代理人の同意を得てください。観客として参加する場合も、イベント主催者の案内に従ってください。"] },
      { id: "changes", title: "11. 改定", paragraphs: ["本ポリシーを改定した場合は、更新日と変更内容を本ページその他適切な方法で案内します。重要な変更については、合理的な方法で事前に通知します。"] },
      { id: "contact", title: "12. 問い合わせ", paragraphs: [`個人情報の取り扱いに関するお問い合わせ先: ${config.supportEmail}`] },
    ],
  };
}
