import { headers } from "next/headers";
import Link from "next/link";
import { BadgeHelp, Check, MessageCircleMore, PartyPopper } from "lucide-react";

import { AppStoreButton } from "@/components/public/app-store-button";
import { GuideCards } from "@/components/public/guide-cards";
import { LiveSlideDemo } from "@/components/public/live-slide-demo";
import { Mascot } from "@/components/public/mascot";
import { MascotMotionControl } from "@/components/public/mascot-motion";
import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import { AudienceFlow, PresentationSteps } from "@/components/public/presentation-walkthrough";
import { PublicShell } from "@/components/public/public-shell";
import publicStyles from "@/components/public/mascot-public.module.css";
import { localeFromAcceptLanguage, messages } from "@/i18n";
import { createHomeStructuredData, createPageMetadata, serializeJsonLd } from "@/lib/seo";
import styles from "./home.module.css";

const featureIcons = [MessageCircleMore, BadgeHelp, PartyPopper] as const;

export async function generateMetadata() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const meta = messages[locale].meta;
  return createPageMetadata({ title: meta.title, description: meta.description, path: "/", locale, keywords: [...meta.keywords] });
}

export default async function HomePage() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const t = messages[locale].landing;
  const structuredData = createHomeStructuredData({
    locale,
    description: messages[locale].meta.description,
    featureNames: [...t.features.items.map(({ title }) => title), t.worksWith.featureName],
  });

  return (
    <PublicShell locale={locale} appearance="mascot">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <main className={styles.main}>
        <section className={styles.container + " " + styles.hero}>
          <div className={styles.heroCopy}>
            <h1 className={styles.title}>
              <span className={styles.titleLine}>{locale === "ja" ? <PhraseText phrases={["会場の声を、"]} /> : t.titleLead}</span>
              <span className={styles.titleLine}>{locale === "ja" ? <PhraseText phrases={["スライド", "の上へ。"]} /> : t.titleHighlight}</span>
            </h1>
            <p className={styles.description}><ProtectedText text={t.description} /></p>
            <div className={styles.actions}>
              <AppStoreButton locale={locale} appearance="mascot" />
              <Link href="/join" className={"lt-tap lt-nowrap inline-flex items-center justify-center " + publicStyles.secondaryButton}>{t.secondaryCta}</Link>
            </div>
            <p className={styles.note}>{messages[locale].public.appStore.note}</p>
            <ul className={styles.signals} aria-label="LayerTalk highlights">
              {t.signals.map((signal) => <li key={signal}><Check size={13} strokeWidth={2} aria-hidden="true" /><span>{signal}</span></li>)}
            </ul>
          </div>
          <div className={styles.scene}>
            <Mascot locale={locale} variant="neutral" className={styles.heroMascot} preload sizes="(max-width: 767px) 110vw, 650px" />
            <div className={styles.demo}><LiveSlideDemo locale={locale} appearance="mascot" /></div>
            <div className={styles.sceneCaption}><p>{t.eyebrow}</p><MascotMotionControl locale={locale} /></div>
          </div>
        </section>

        <section id="how-it-works" className={styles.container + " " + styles.section}>
          <h2 className={styles.heading}>{locale === "ja" ? <PhraseText phrases={["開始を押して、", "URLを共有。", "それだけ。"]} /> : t.howItWorks.title}</h2>
          <p className={styles.meta}>{t.howItWorks.eyebrow}</p>
          <div className={styles.walkthrough}><PresentationSteps locale={locale} /></div>
          <p className={styles.note}>{t.howItWorks.setup}</p>
        </section>

        <section id="features" className={styles.container + " " + styles.section}>
          <div className={styles.featureHeader}>
            <div>
              <h2 className={styles.heading}>{locale === "ja" ? <PhraseText phrases={["スマホからの", "ひとことが、", "スライドに届く。"]} /> : t.features.title}</h2>
              <p className={styles.meta}>{t.features.eyebrow}</p>
              <p className={styles.body}><ProtectedText text={t.features.description} /></p>
            </div>
            <Mascot locale={locale} variant="long" className={styles.featureMascot} sizes="(max-width: 767px) 170px, 280px" />
          </div>
          <div className={styles.walkthrough}><AudienceFlow locale={locale} /></div>
          <div className={styles.featureList}>
            {t.features.items.map((feature, index) => {
              const Icon = featureIcons[index]!;
              return <article key={feature.title} className={styles.feature}>
                <Icon size={27} strokeWidth={1.6} className={styles.featureIcon} aria-hidden="true" />
                <h3><ProtectedText text={feature.title} terms={[feature.title]} /></h3>
                <p><ProtectedText text={feature.description} /></p>
              </article>;
            })}
          </div>
        </section>

        <section id="works-with" className={styles.section + " " + styles.works}>
          <div className={styles.container}>
            <div className={styles.worksGrid}>
              <div>
                <h2 className={styles.heading}>{locale === "ja" ? <PhraseText phrases={["PowerPointも", "Keynoteも、", "そのまま。"]} /> : t.worksWith.title}</h2>
                <p className={styles.meta}>{t.worksWith.eyebrow}</p>
                <p className={styles.body}><ProtectedText text={t.worksWith.description} terms={t.worksWith.tools} /></p>
              </div>
              <div>
                <div className={styles.toolLayers}>
                  <span className={styles.layerLabel} aria-hidden="true">LayerTalk</span>
                  <ul className={styles.tools} aria-label={t.worksWith.toolsLabel}>{t.worksWith.tools.map((tool) => <li key={tool} className="lt-nowrap">{tool}</li>)}</ul>
                </div>
                <p className={styles.trademark}>{t.worksWith.trademark}</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.container + " " + styles.passSection}>
          <div className={styles.pass}>
            <div>
              <h2 className={styles.heading}><ProtectedText text={t.eventPass.title} /></h2>
              <p className={styles.meta}>{t.eventPass.eyebrow}</p>
              <p className={styles.body}><ProtectedText text={t.eventPass.description} /></p>
              <div className={styles.actions}><Link href="/event-pass" className={"lt-tap lt-nowrap inline-flex items-center justify-center " + publicStyles.primaryButton}>{t.eventPass.cta}</Link></div>
              <p className={styles.note}><ProtectedText text={t.eventPass.note} /></p>
            </div>
            <div className={styles.passPrice}>
              <p className={styles.price}>{t.eventPass.price}</p>
              <p className={styles.tax}>{t.eventPass.tax}</p>
              <p className={"lt-nowrap " + styles.duration}>{t.eventPass.duration}</p>
            </div>
          </div>
        </section>

        {locale === "ja" && <section id="guides" className={styles.container + " " + styles.section + " " + styles.guides}>
          <h2 className={styles.heading}><PhraseText phrases={["プレゼン・LT・会議を", "盛り上げるヒント"]} /></h2>
          <p className={styles.meta}>Guides</p>
          <GuideCards appearance="mascot" className={styles.guideList} />
        </section>}

        <section className={styles.container + " " + styles.final}>
          <div>
            <h2 className={styles.heading}>{locale === "ja" ? <PhraseText phrases={["次のプレゼンで、", "試してみよう。"]} /> : t.finalCta.title}</h2>
            <div className={styles.actions}>
              <AppStoreButton locale={locale} appearance="mascot" />
              <Link href="/join" className={"lt-tap lt-nowrap inline-flex items-center justify-center " + publicStyles.secondaryButton}>{messages[locale].public.nav.join}</Link>
            </div>
          </div>
          <Mascot locale={locale} variant="lean" className={styles.finalMascot} sizes="(max-width: 767px) 280px, 470px" />
        </section>
      </main>
    </PublicShell>
  );
}
