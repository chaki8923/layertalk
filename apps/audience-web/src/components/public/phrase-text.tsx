import { Fragment } from "react";

const DEFAULT_PROTECTED_TERMS = [
  "LayerTalk",
  "Event Pass",
  "Presenterアプリ",
  "Presenter",
  "Audience Web",
  "Stripe Checkout",
  "Stripe",
  "Cloudflare Turnstile",
  "Vercel",
  "Webhook",
  "PaymentIntent ID",
  "Checkout Session ID",
  "Stripe Customer ID",
  "Supabase Access Token",
  "Stripe API Key",
  "QRコード",
  "6桁コード",
  "IPアドレス",
  "メールアドレス",
  "セキュリティコード",
  "ローカルストレージ",
  "プライバシーポリシー",
  "特定商取引法",
] as const;

type PhraseTextProps = {
  phrases: readonly string[];
};

type ProtectedTextProps = {
  text: string;
  terms?: readonly string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 見出しなどの短いコピーを、意味のまとまりを壊さずに折り返す。
 * wbr は phrase 間だけを明示的な改行候補にする。
 */
export function PhraseText({ phrases }: PhraseTextProps) {
  return phrases.map((phrase, index) => (
    <Fragment key={`${phrase}-${index}`}>
      <span className="lt-nowrap">{phrase}</span>
      {index < phrases.length - 1 && <wbr />}
    </Fragment>
  ));
}

/** 長文の自然な折り返しは保ち、製品名や技術用語だけを分割させない。 */
export function ProtectedText({ text, terms = [] }: ProtectedTextProps) {
  const protectedTerms = [...new Set([...DEFAULT_PROTECTED_TERMS, ...terms])]
    .filter((term) => text.includes(term))
    .sort((a, b) => b.length - a.length);

  if (protectedTerms.length === 0) return text;

  const matcher = new RegExp(`(${protectedTerms.map(escapeRegExp).join("|")})`, "g");
  const protectedSet = new Set(protectedTerms);

  return text.split(matcher).map((part, index) =>
    protectedSet.has(part)
      ? <span key={`${part}-${index}`} className="lt-nowrap">{part}</span>
      : part,
  );
}
