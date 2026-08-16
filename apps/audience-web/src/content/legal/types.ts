export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalDocumentContent = {
  title: string;
  lead: string;
  effectiveDate: string;
  updatedDate: string;
  sections: LegalSection[];
};
