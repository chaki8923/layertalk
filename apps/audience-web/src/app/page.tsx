import { headers } from "next/headers";

import { JoinForm } from "@/components/join-form";
import { localeFromAcceptLanguage } from "@/i18n";

/**
 * 参加コードの入力画面。
 *
 * 表示言語は本来ルームが持つが、この画面にはまだルームが無い。ここだけ
 * `Accept-Language` で決める。クライアント側で `navigator.language` を見ると
 * SSR の出力と食い違ってハイドレーションで文字が入れ替わるので、サーバで決める。
 * （`headers()` を読むのでこのルートは動的レンダリングになる。文言 4 本の画面なので影響はない）
 */
export default async function HomePage() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  return <JoinForm locale={locale} />;
}
