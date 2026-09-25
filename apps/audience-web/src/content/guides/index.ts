import { lightningTalkGuide } from "./lightning-talk";
import { presentationGuide } from "./presentation";
import type { GuideArticle } from "./types";

export type { GuideArticle, GuideSection } from "./types";

/** 並びは LP の「盛り上げ方ガイド」とサイトマップの順。 */
export const guides: readonly GuideArticle[] = [presentationGuide, lightningTalkGuide];

export function findGuide(slug: string): GuideArticle | undefined {
  return guides.find((guide) => guide.slug === slug);
}

export const guidePath = (slug: string) => `/guides/${slug}` as const;
