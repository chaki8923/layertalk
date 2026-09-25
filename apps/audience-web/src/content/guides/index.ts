import { lightningTalkGuide } from "./lightning-talk";
import { meetingGuide } from "./meeting";
import { presentationGuide } from "./presentation";
import type { GuideArticle } from "./types";

export type { GuideArticle, GuideSection } from "./types";

/** 並びは LP の「盛り上げ方ガイド」とサイトマップの順。 */
export const guides: readonly GuideArticle[] = [presentationGuide, lightningTalkGuide, meetingGuide];

export function findGuide(slug: string): GuideArticle | undefined {
  return guides.find((guide) => guide.slug === slug);
}

/** 一覧ページとパンくずの2段目。 */
export const GUIDES_PATH = "/guides";
export const GUIDES_TITLE = "盛り上げ方ガイド";

export const guidePath = (slug: string) => `/guides/${slug}` as const;
