export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalDocumentContent = {
  title: string;
  lead: string;
  /** 翻訳版の注記（「相違があれば日本語版が優先」）。日本語版には無い。 */
  notice?: string;
  effectiveDate: string;
  updatedDate: string;
  sections: LegalSection[];
};
