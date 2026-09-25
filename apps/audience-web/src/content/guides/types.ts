export type GuideSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
};

/**
 * 「プレゼン 盛り上げる」のような、方法を探す検索に応える解説記事。日本語のみ。
 * 製品の宣伝ではなく、読んで役に立つ中身を先に置く（検索で上位に来るのはそういうページ）。
 * LayerTalk の紹介は、話の流れで道具が要る節と、末尾の CTA だけに留める。
 */
export type GuideArticle = {
  slug: string;
  /** `<title>` と H1。検索語（例: 「プレゼン」「盛り上げる」）を前の方に置く。 */
  title: string;
  /** 一覧のカードと記事の見出し下に出す短い要約。 */
  lead: string;
  /** meta description。120字前後。 */
  description: string;
  publishedDate: string;
  updatedDate: string;
  sections: GuideSection[];
};
