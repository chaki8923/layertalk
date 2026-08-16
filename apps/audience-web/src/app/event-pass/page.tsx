import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, Check, Clock3, FileDown, KeyRound, ShieldCheck, Sparkles } from "lucide-react";

import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import { PublicShell } from "@/components/public/public-shell";
import { createEventPassStructuredData, createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Event Pass | LayerTalk",
  description: "1ルームで7日間使えるLayerTalk Event Passの機能、価格、購入方法をご案内します。",
  path: "/event-pass",
  keywords: ["LayerTalk Event Pass", "イベント運営", "プレゼンテーション", "コメント承認", "発表レポート"],
});

const features = [
  [ShieldCheck, "コメント承認制", "表示前に内容を確認し、本番の進行を守ります。"],
  [KeyRound, "NGワードと入室パスコード", "参加者と投稿の入口をイベントに合わせて整えます。"],
  [Clock3, "コメント・リアクションの一時停止", "必要な瞬間に会場からの表示をすぐ止められます。"],
  [FileDown, "発表レポート", "CSV／Markdownで反応と質問を振り返れます。"],
  [Sparkles, "ブランド設定", "ブランドカラー、ロゴ、LayerTalk表記を調整できます。"],
] as const;

const steps = [
  "Presenterアプリでログイン",
  "対象ルームを作成または再開",
  "Event Passカードで内容を確認",
  "Stripe Checkoutで支払い",
  "アプリへ戻って有効化を確認",
];

export default function EventPassPage() {
  const structuredData = createEventPassStructuredData();

  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:py-28">
          <div>
            <p className="text-brand text-[11px] font-bold tracking-[0.2em] uppercase">LayerTalk Event Pass</p>
            <h1 className="mt-4 max-w-2xl text-[clamp(2.35rem,8vw,4.75rem)] leading-[1.02] font-bold tracking-[-0.065em]">
              <PhraseText phrases={["本番を安全に", "運営するための、"]} />
              <wbr /><span className="text-brand lt-nowrap">1イベント用</span><wbr /><span className="lt-nowrap">パス</span>
            </h1>
            <div className="mt-8 flex flex-wrap items-end gap-x-5 gap-y-2">
              <p className="lt-nowrap"><span className="lt-num text-[32px] font-bold tracking-[-0.04em]">2,980円</span><span className="text-text-muted ml-2 text-[12px]">税込</span></p>
              <p className="lt-nowrap text-text-muted pb-1 text-[13px]">購入した1ルームで7日間</p>
            </div>
            <a href="#how-to-buy" className="lt-tap lt-nowrap bg-gradient-brand shadow-glow mt-8 inline-flex min-h-12 items-center gap-2 rounded-control px-5 text-[14px] font-bold text-white transition-transform active:scale-[.94]">
              LayerTalkアプリで購入する <ArrowDown size={16} aria-hidden="true" />
            </a>
            <p className="text-text-faint mt-3 text-[11px]"><ProtectedText text="購入は対象ルームを開いたPresenterアプリから開始します。" /></p>
          </div>

          <div aria-label="Event Passの利用範囲" className="border-border bg-bg-elev shadow-card overflow-hidden rounded-sheet border p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <span className="text-text-faint text-[10px] font-bold tracking-[0.18em] uppercase">Pass boundary</span>
              <span className="bg-online/15 text-online rounded-full px-2.5 py-1 text-[10px] font-bold">決済後すぐ有効</span>
            </div>
            <div className="mt-10 grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <div className="bg-brand text-bg flex h-11 w-11 items-center justify-center rounded-control text-[11px] font-bold">ROOM</div>
              <div className="relative h-px bg-border"><span className="bg-brand absolute inset-y-[-2px] left-0 w-1/2 rounded-full" /></div>
              <div className="lt-num text-right"><strong className="block text-[28px] leading-none">7</strong><span className="text-text-muted text-[10px] font-bold tracking-wider">DAYS</span></div>
            </div>
            <div className="border-border mt-9 grid grid-cols-2 border-t pt-5">
              <div className="border-border border-r pr-4"><p className="text-text-faint text-[10px]">準備</p><p className="mt-1 text-[13px] font-bold">リハーサル</p></div>
              <div className="pl-4"><p className="text-text-faint text-[10px]">当日</p><p className="mt-1 text-[13px] font-bold">本番</p></div>
            </div>
            <p className="text-text-muted mt-5 text-[11px] leading-5"><ProtectedText text="同じルームなら準備から本番まで利用可能。発表中に期限へ達しても、その発表が終わるまでは有料機能を維持します。" terms={["同じルーム", "有料機能"]} /></p>
          </div>
        </section>

        <section id="features" className="border-border border-y">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-xl"><p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">What is included</p><h2 className="mt-3 text-[28px] font-bold tracking-[-.04em]"><PhraseText phrases={["会場の反応を止めずに、", "運営の主導権を保つ"]} /></h2></div>
            <div className="mt-10 grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {features.map(([Icon, title, description]) => (
                <article key={title} className="border-border bg-surface rounded-card border p-5">
                  <Icon className="text-brand" size={20} aria-hidden="true" />
                  <h3 className="mt-5 text-[15px] font-bold"><ProtectedText text={title} terms={[title]} /></h3>
                  <p className="text-text-muted mt-2 text-[12px] leading-6"><ProtectedText text={description} /></p>
                </article>
              ))}
              <article className="border-brand/30 bg-brand/8 rounded-card border p-5">
                <p className="lt-nowrap text-brand text-[10px] font-bold tracking-wider uppercase">Freeとの違い</p>
                <p className="mt-5 text-[15px] font-bold"><ProtectedText text="Free版は参加・コメント・スタンプの基本機能を利用できます。" terms={["Free版", "基本機能"]} /></p>
                <p className="text-text-muted mt-2 text-[12px] leading-6"><ProtectedText text="Event Passは、運営管理、レポート、ブランド設定を対象ルームへ追加します。" /></p>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-.035em]">利用条件</h2>
            <ul className="mt-6 space-y-4">
              {["購入時に確認した1ルームだけに適用", "購入完了後から7日間有効", "同じルームでリハーサルと本番に利用可能", "発表中は権利スナップショットを終了まで維持", "発表履歴は購入後30日間出力可能"].map((item) => <li key={item} className="text-text-muted flex gap-3 text-[13px] leading-6"><Check className="text-online mt-0.5 shrink-0" size={16} aria-hidden="true" /><ProtectedText text={item} terms={["1ルーム", "7日間", "同じルーム", "権利スナップショット", "30日間"]} /></li>)}
            </ul>
          </div>
          <div id="how-to-buy" className="scroll-mt-24">
            <h2 className="text-[24px] font-bold tracking-[-.035em]">購入方法</h2>
            <ol className="mt-6 space-y-3">
              {steps.map((step, index) => <li key={step} className="border-border flex items-center gap-4 border-b pb-3"><span className="lt-num text-brand text-[11px] font-bold">{String(index + 1).padStart(2, "0")}</span><span className="text-[13px] font-semibold"><ProtectedText text={step} terms={[step]} /></span></li>)}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="border-border bg-bg-elev rounded-sheet border p-6 sm:p-8">
            <h2 className="text-[18px] font-bold">決済前にご確認ください</h2>
            <p className="text-text-muted mt-3 text-[13px] leading-6"><ProtectedText text="決済にはStripeを使用します。カード情報はLayerTalkでは保持しません。購入前に返金条件と各文書をご確認ください。" /></p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-[12px] font-semibold">
              <Link className="lt-nowrap text-brand" href="/support#refunds">返金・キャンセル条件</Link><Link className="lt-nowrap" href="/legal/terms">利用規約</Link><Link className="lt-nowrap" href="/legal/privacy">プライバシーポリシー</Link><Link className="lt-nowrap" href="/legal/tokusho">特定商取引法に基づく表記</Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
