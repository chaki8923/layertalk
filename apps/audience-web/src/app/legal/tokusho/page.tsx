import type { Metadata } from "next";
import Link from "next/link";

import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import { PublicShell } from "@/components/public/public-shell";
import { resolveSalesChannel, salesChannelQuery, type SalesChannel } from "@/content/legal/channel";
import { legalConfig } from "@/content/legal/config";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "特定商取引法に基づく表記 | LayerTalk",
  description: "LayerTalk Event Passの販売事業者、価格、支払方法、提供時期、返金条件などを掲載しています。",
  path: "/legal/tokusho",
});

/**
 * 販売条件のうち、決済経路で変わる行。
 *
 * App Store 版で Stripe の行（「Stripe Checkoutに表示される決済方法」「Stripe Checkout
 * Sessionの有効期限まで」「2,980円」）を出すと、App Store 決済のアプリ内から
 * **別の決済手段の販売条件**を見せることになる。価格も Apple の価格表で決まるので
 * 固定の円建て表記は嘘になる。
 */
function channelRows(channel: SalesChannel) {
  if (channel === "app-store") {
    return [
      ["販売価格", "LayerTalk Event Pass（App Storeおよびアプリの購入画面に表示される価格。Appleの価格表に基づき地域ごとに異なります）"],
      ["商品代金以外の必要料金", "インターネット接続料金その他の通信費は利用者の負担となります。"],
      ["支払方法", "AppleのApp Store決済（Appleが販売の当事者となります）"],
      ["支払時期", "App Storeでの購入確定時"],
      ["サービス提供時期", "購入確定後、通常は即時"],
      ["利用期間", "購入した1ルームで購入完了から7日間（自動更新はされません）"],
      ["申込期限", "App Storeで商品が提供されているあいだ"],
    ] as const;
  }
  return [
    ["販売価格", "LayerTalk Event Pass 2,980円（税込）"],
    ["商品代金以外の必要料金", "インターネット接続料金その他の通信費は利用者の負担となります。"],
    ["支払方法", "Stripe Checkoutに表示される決済方法"],
    ["支払時期", "購入手続き完了時"],
    ["サービス提供時期", "決済確認後、通常は即時"],
    ["利用期間", "購入した1ルームで購入完了から7日間"],
    ["申込期限", "Stripe Checkout Sessionの有効期限まで"],
  ] as const;
}

const APP_STORE_REFUND = "返金はAppleが受け付けます。reportaproblem.apple.com または App Store の購入履歴から、Apple宛にご申請ください。LayerTalkから返金処理を行うことはできません。権利が反映されない等の不具合については、サポート窓口で対応します。";

export default async function TokushoPage(props: PageProps<"/legal/tokusho">) {
  const channel = resolveSalesChannel((await props.searchParams).channel);
  const query = salesChannelQuery(channel);
  const rows = [
    ["販売事業者", legalConfig.sellerName], ["運営責任者", legalConfig.operatorName], ["所在地", legalConfig.address], ["電話番号", legalConfig.phone], ["メールアドレス", legalConfig.supportEmail], ...channelRows(channel),
    ["キャンセル・返金", channel === "app-store" ? APP_STORE_REFUND : legalConfig.refundPolicy],
  ];
  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">Commerce disclosure</p>
        <h1 className="mt-3 text-[clamp(1.5rem,5vw,2.5rem)] font-bold tracking-[-.04em]"><PhraseText phrases={["特定商取引法に", "基づく表記"]} /></h1>
        <p className="lt-nowrap text-text-muted mt-4 text-[13px]">最終更新日: {legalConfig.updatedDate}</p>
        <dl className="border-border mt-10 overflow-hidden rounded-card border">
          {rows.map(([term, description]) => (
            <div id={term === "キャンセル・返金" ? "refunds" : undefined} key={term} className="border-border grid scroll-mt-24 gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:p-5">
              <dt className="lt-nowrap text-[12px] font-bold">{term}</dt><dd className="text-text-muted text-[13px] leading-6"><ProtectedText text={description} terms={["1ルーム", "7日間", "Checkout Session"]} /></dd>
            </div>
          ))}
          <div className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr] sm:p-5"><dt className="lt-nowrap text-[12px] font-bold">動作環境</dt><dd className="text-text-muted text-[13px] leading-6">{legalConfig.systemRequirementsUrl ? <a href={legalConfig.systemRequirementsUrl} className="lt-nowrap text-brand">対応環境を確認する</a> : <ProtectedText text="macOS版Presenterアプリと、最新の主要ブラウザおよび安定したインターネット接続が必要です。" terms={["macOS版Presenterアプリ", "主要ブラウザ", "インターネット接続"]} />}</dd></div>
        </dl>
        <p className="text-text-muted mt-8 text-[13px]">詳しい条件は<Link href={`/legal/terms${query}`} className="lt-nowrap text-brand mx-1">利用規約</Link>と<Link href={`/support${query}#refunds`} className="lt-nowrap text-brand ml-1">返金案内</Link>をご確認ください。</p>
      </main>
    </PublicShell>
  );
}
