import { RoomClient } from "./room-client";

// Next 16 では params は Promise。同期アクセスは削除されている。
export default async function RoomPage(props: PageProps<"/r/[code]">) {
  const { code } = await props.params;
  return <RoomClient code={code} />;
}
