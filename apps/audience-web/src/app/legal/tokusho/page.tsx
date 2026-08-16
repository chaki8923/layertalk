import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";

export const metadata: Metadata = { title: "特定商取引法に基づく表記 | LayerTalk" };

const staticRows = [
  ["販売価格", "LayerTalk Event Pass 2,980円（税込）"],
  ["商品代金以外の必要料金", "インターネット接続料金その他の通信費は利用者の負担となります。"],
  ["支払方法", "Stripe Checkoutに表示される決済方法"],
  ["支払時期", "購入手続き完了時"],
  ["サービス提供時期", "決済確認後、通常は即時"],
  ["利用期間", "購入した1ルームで購入完了から7日間"],
  ["申込期限", "Stripe Checkout Sessionの有効期限まで"],
] as const;

export default function TokushoPage() {
  const rows = [
    ["販売事業者", legalConfig.sellerName], ["運営責任者", legalConfig.operatorName], ["所在地", legalConfig.address], ["電話番号", legalConfig.phone], ["メールアドレス", legalConfig.supportEmail], ...staticRows,
    ["キャンセル・返金", legalConfig.refundPolicy],
  ];
  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">Commerce disclosure</p>
        <h1 className="mt-3 text-[clamp(1.75rem,5vw,2.5rem)] font-bold tracking-[-.04em]">特定商取引法に基づく表記</h1>
        <p className="text-text-muted mt-4 text-[13px]">最終更新日: {legalConfig.updatedDate}</p>
        <dl className="border-border mt-10 overflow-hidden rounded-card border">
          {rows.map(([term, description]) => (
            <div id={term === "キャンセル・返金" ? "refunds" : undefined} key={term} className="border-border grid scroll-mt-24 gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:p-5">
              <dt className="text-[12px] font-bold">{term}</dt><dd className="text-text-muted text-[13px] leading-6">{description}</dd>
            </div>
          ))}
          <div className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr] sm:p-5"><dt className="text-[12px] font-bold">動作環境</dt><dd className="text-text-muted text-[13px] leading-6">{legalConfig.systemRequirementsUrl ? <a href={legalConfig.systemRequirementsUrl} className="text-brand">対応環境を確認する</a> : "macOS版Presenterアプリと、最新の主要ブラウザおよび安定したインターネット接続が必要です。"}</dd></div>
        </dl>
        <p className="text-text-muted mt-8 text-[13px]">詳しい条件は<Link href="/legal/terms" className="text-brand mx-1">利用規約</Link>と<Link href="/support#refunds" className="text-brand ml-1">返金案内</Link>をご確認ください。</p>
      </main>
    </PublicShell>
  );
}
