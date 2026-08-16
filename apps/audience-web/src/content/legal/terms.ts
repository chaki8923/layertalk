import type { LegalDocumentContent } from "./types";

export function termsContent(config: {
  supportEmail: string;
  refundPolicy: string;
  effectiveDate: string;
  updatedDate: string;
}): LegalDocumentContent {
  return {
    title: "LayerTalk利用規約",
    lead: "本規約は、LayerTalkの利用条件と、Event Passをご購入いただく際の条件を定めるものです。",
    effectiveDate: config.effectiveDate,
    updatedDate: config.updatedDate,
    sections: [
      { id: "scope", title: "1. 適用", paragraphs: ["本規約は、LayerTalkが提供するPresenterアプリ、観客向けWebページおよび関連機能の利用に適用されます。利用者は、本サービスを利用することで本規約に同意したものとみなされます。"] },
      { id: "definitions", title: "2. 用語の定義", items: ["「Presenter」とは、ルームを作成・運営する利用者をいいます。", "「観客」とは、参加コード等を使ってルームへ参加する利用者をいいます。", "「Event Pass」とは、購入対象の1ルームに有料機能を7日間付与する単発商品をいいます。"] },
      { id: "account", title: "3. Presenterアカウントと認証情報の管理", paragraphs: ["Presenterは、登録メールアドレス、認証コードその他の認証情報を自己の責任で管理し、第三者に利用させないものとします。不正利用を認識した場合は、速やかにサポートへ連絡してください。"] },
      { id: "rooms", title: "4. ルームの作成と観客の匿名利用", paragraphs: ["Presenterは自己が管理するイベントのためにルームを作成できます。観客は匿名認証で参加できますが、投稿内容について本規約を遵守する必要があります。Presenterは参加コードや入室パスコードを適切に管理してください。"] },
      { id: "event-pass", title: "5. Event Passの内容、対象ルーム、期間", items: ["1回の購入は、Checkout開始前に表示された1ルームだけに紐づきます。", "有効期間はStripeによる決済確認後から7日間です。", "有効期間中に開始した発表では、発表終了まで有料機能の権利スナップショットを維持します。", "発表履歴の出力期間は購入完了後30日間です。", "権利は原則として第三者へ譲渡できず、別ルームへの移動は返金方針に従います。"] },
      { id: "payment", title: "6. 料金、決済、返金", paragraphs: ["Event Passの販売価格は2,980円（税込）です。支払いはStripe Checkoutを通じて行い、LayerTalkのサーバーはカード番号やセキュリティコードを保持しません。", `返金・キャンセル条件: ${config.refundPolicy}`] },
      { id: "content", title: "7. 投稿コンテンツと知的財産権", paragraphs: ["投稿者は、投稿するコメント、質問、画像等について必要な権利を有していることを保証します。LayerTalkは、サービスの提供・保守に必要な範囲で投稿コンテンツを処理します。サービス自体に関する知的財産権は各権利者に帰属します。"] },
      { id: "moderation", title: "8. モデレーションと主催者の責任", paragraphs: ["Presenterは、イベントの性質に応じて承認制、NGワード、投稿停止等を設定し、ルームを適切に運営する責任を負います。これらの機能は不適切な投稿を完全に防止することを保証するものではありません。"] },
      { id: "prohibited", title: "9. 禁止事項", items: ["法令または公序良俗に反する行為", "第三者の権利、プライバシーまたは名誉を侵害する行為", "サービスの運営を妨害し、過度な負荷を与え、または不正アクセスを試みる行為", "参加コード、認証情報または有料権利を不正に共有・転売する行為", "不正な決済、返金またはチャージバックを試みる行為"] },
      { id: "retention", title: "10. データ保持と削除", paragraphs: ["Free利用のイベントデータは原則7日間、Event Pass対象のイベントデータは原則30日間保持します。法令、会計、不正対策または紛争対応のため必要な情報は、これより長く保持する場合があります。"] },
      { id: "availability", title: "11. サービスの変更、中断、終了", paragraphs: ["保守、障害、セキュリティ上の必要その他やむを得ない事情により、事前の通知なくサービスを一時中断する場合があります。重要な仕様変更やサービス終了については、合理的な方法で案内します。"] },
      { id: "disclaimer", title: "12. 保証の否認と責任制限", paragraphs: ["LayerTalkは、サービスが常に中断なく動作すること、すべての投稿を検出・制御できること、または特定目的に完全に適合することを保証しません。法令で認められる範囲で、予見できない間接損害について責任を負いません。"] },
      { id: "changes", title: "13. 規約変更", paragraphs: ["本規約を変更する場合は、変更内容と施行日を本ページその他適切な方法で案内します。利用者に重大な影響がある変更は、合理的な予告期間を設けて通知します。"] },
      { id: "law", title: "14. 準拠法と管轄", paragraphs: ["本規約は日本法に準拠します。本サービスに関する紛争については、法令上認められる範囲で販売事業者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。"] },
      { id: "contact", title: "15. 問い合わせ", paragraphs: [`本規約またはサービスに関するお問い合わせ先: ${config.supportEmail}`] },
    ],
  };
}
