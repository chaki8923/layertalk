import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Mail, ShieldAlert } from "lucide-react";

import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import { PublicShell } from "@/components/public/public-shell";
import { resolveSalesChannel, salesChannelQuery } from "@/content/legal/channel";
import { legalConfig, supportMailto } from "@/content/legal/config";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "お問い合わせ・返金案内 | LayerTalk",
  description: "LayerTalkの購入トラブル、Event Passの返金・キャンセル、不適切な投稿の報告、その他のお問い合わせ窓口です。",
  path: "/support",
});

export default async function SupportPage(props: PageProps<"/support">) {
  const channel = resolveSalesChannel((await props.searchParams).channel);
  const appStore = channel === "app-store";
  const query = salesChannelQuery(channel);
  const mailto = supportMailto();
  // 購入トラブルの手がかりは決済経路で変わる。App Store 版の人に
  // 「Stripeの領収書番号を送ってください」と言っても、そんなものは存在しない。
  const purchaseFacts = appStore
    ? ["Presenterのメールアドレス", "ルームコード", "購入日時", "App Storeの領収書メール（Appleから届くもの）", "発生している状況"]
    : ["Presenterのメールアドレス", "ルームコード", "購入日時と金額", "Stripeの領収書番号または領収書メール", "発生している状況"];
  // 送ってはいけない情報も同じ。App Store 版で Stripe の鍵に触れても、別の決済手段を匂わせるだけになる（3.1.1）。
  const secretItems = appStore
    ? ["カード番号の全文", "セキュリティコード", "LayerTalkのパスワードや確認コード"]
    : ["カード番号の全文", "セキュリティコード", "Stripe API Key", "Supabase Access Token"];
  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">Support</p>
        <h1 className="mt-3 text-[clamp(1.8rem,6vw,2.75rem)] font-bold tracking-[-.045em]"><PhraseText phrases={["お問い合わせ・", "返金案内"]} /></h1>
        <p className="text-text-muted mt-4 text-[14px] leading-7"><ProtectedText text={appStore ? "購入したルームへ権利が反映されない、誤購入、二重請求については、次の窓口へご連絡ください。返金のお申し込み先はAppleです。" : "購入したルームへ権利が反映されない、誤購入、二重請求、返金については、次の窓口へご連絡ください。"} terms={["二重請求"]} /></p>

        <section className="border-border bg-bg-elev mt-10 rounded-sheet border p-6">
          <Mail className="text-brand" size={22} aria-hidden="true" />
          <h2 className="mt-4 text-[17px] font-bold">サポート窓口</h2>
          {mailto ? <a href={mailto} className="lt-nowrap text-brand mt-2 inline-block text-[15px] font-semibold">{legalConfig.supportEmail}</a> : <p className="lt-nowrap text-like mt-2 text-[13px] font-semibold">{legalConfig.supportEmail}</p>}
          <p className="lt-nowrap text-text-muted mt-2 text-[12px]">返信目安: {legalConfig.responseTime}</p>
        </section>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          <section><h2 className="text-[17px] font-bold"><PhraseText phrases={["購入トラブル時に", "送る情報"]} /></h2><ul className="text-text-muted mt-4 space-y-2 pl-5 text-[13px] leading-6">{purchaseFacts.map((item) => <li key={item} className="list-disc"><ProtectedText text={item} terms={["メールアドレス", "ルームコード", "購入日時", "領収書番号", "領収書メール"]} /></li>)}</ul></section>
          <section><h2 className="flex items-center gap-2 text-[17px] font-bold"><ShieldAlert className="text-like shrink-0" size={18} /><span className="lt-nowrap">送ってはいけない情報</span></h2><ul className="text-text-muted mt-4 space-y-2 pl-5 text-[13px] leading-6">{secretItems.map((item) => <li key={item} className="list-disc"><ProtectedText text={item} terms={[item]} /></li>)}</ul></section>
        </div>

        <section id="reports" className="border-border mt-12 scroll-mt-24 border-t pt-10">
          <h2 className="text-[20px] font-bold"><PhraseText phrases={["不適切な投稿の", "報告"]} /></h2>
          <p className="text-text-muted mt-4 text-[13px] leading-7"><ProtectedText text="観客は、コメントの「通報」ボタンまたはカスタムスタンプの長押しから通報できます。通報は発表者の画面に直ちに届き、発表者はその場で投稿の非表示と投稿者のブロックを行えます。" terms={["「通報」ボタン", "カスタムスタンプ", "長押し"]} /></p>
          <p className="text-text-muted mt-3 text-[13px] leading-7"><ProtectedText text="発表者が対応できない場合は、ルームコードと投稿の内容を添えて上記のサポート窓口へご連絡ください。LayerTalkは、不適切な投稿の報告を原則として受領から24時間以内に確認し、利用規約に違反する投稿の削除と投稿者の締め出しを行います。" terms={["ルームコード", "サポート窓口", "24時間以内"]} /></p>
          <p className="mt-5 text-[12px]"><Link href={`/legal/terms${query}#moderation`} className="lt-nowrap text-brand font-semibold">利用規約の該当箇所を確認する</Link></p>
        </section>

        <section id="refunds" className="border-border mt-12 scroll-mt-24 border-t pt-10">
          <h2 className="text-[20px] font-bold"><PhraseText phrases={["返金・", "キャンセル条件"]} /></h2>
          <div className="border-border bg-surface mt-5 rounded-card border p-5"><p className="text-text-muted text-[13px] leading-7"><ProtectedText text={appStore ? "App Store経由でご購入いただいたEvent Passの返金は、Appleが受け付けます。reportaproblem.apple.com もしくは App Store の購入履歴から、Apple宛にご申請ください。LayerTalkから返金処理を行うことはできません。" : legalConfig.refundPolicy} terms={["reportaproblem.apple.com"]} /></p></div>
          <p className="text-text-muted mt-4 flex gap-2 text-[12px] leading-6"><AlertTriangle className="text-brand mt-0.5 shrink-0" size={15} /><span><ProtectedText text={appStore ? "Appleの判断で返金が行われた場合、そのルームのEvent Passは自動的に無効になります。権利が反映されないだけの場合は返金ではなく、サポート窓口へご連絡ください。" : "返金処理後、カード会社や金融機関への反映には時間がかかる場合があります。お問い合わせ前にStripeの領収書メールもご確認ください。"} terms={["返金処理後", "カード会社", "金融機関", "領収書メール"]} /></span></p>
          <p className="mt-5 text-[12px]"><Link href={`/legal/tokusho${query}#refunds`} className="lt-nowrap text-brand font-semibold">特定商取引法に基づく表記も確認する</Link></p>
        </section>
      </main>
    </PublicShell>
  );
}
