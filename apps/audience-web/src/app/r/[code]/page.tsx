import { headers } from "next/headers";

import { localeFromAcceptLanguage } from "@/i18n";

import { RoomClient } from "./room-client";

// Next 16 では params は Promise。同期アクセスは削除されている。
export default async function RoomPage(props: PageProps<"/r/[code]">) {
  const { code } = await props.params;

  // 表示言語はルームが持つ（発表者が決める）。ルームはクライアント側で解決するので、
  // それが返るまでのあいだ（と、ルームが見つからなかったとき）の言語だけここで決めておく。
  const fallbackLocale = localeFromAcceptLanguage((await headers()).get("accept-language"));

  return <RoomClient code={code} fallbackLocale={fallbackLocale} />;
}
