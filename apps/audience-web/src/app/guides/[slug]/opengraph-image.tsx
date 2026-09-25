import {
  createGuideSocialCardImage,
  createSocialCardImage,
  socialCardContentType,
  socialCardSize,
} from "@/components/public/social-card-image";
import { findGuide, guides } from "@/content/guides";

export const size = socialCardSize;
export const contentType = socialCardContentType;
export const alt = "LayerTalk 盛り上げ方ガイド";

export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const guide = findGuide((await params).slug);
  return guide ? createGuideSocialCardImage(guide.title) : createSocialCardImage();
}
