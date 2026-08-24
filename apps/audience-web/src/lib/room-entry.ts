import {
  findRoomByCode,
  joinRoom,
  resumeAudienceRoom,
  type LayerTalkClient,
  type PublicRoom,
} from "@layertalk/shared";

export type InitialRoomEntry =
  | { kind: "gate"; room: PublicRoom }
  | { kind: "ready"; room: PublicRoom }
  | { kind: "notfound" };

/**
 * URLからの初回表示とリロードを同じ順序で解決する。
 * 有効な入室権がある場合だけゲートより先に復帰し、期限は延長しない。
 */
export async function resolveInitialRoomEntry(
  client: LayerTalkClient,
  code: string,
  captchaRequired: boolean,
): Promise<InitialRoomEntry> {
  const found = await findRoomByCode(client, code);
  if (!found) return { kind: "notfound" };

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) {
    const resumed = await resumeAudienceRoom(client, found);
    if (resumed) return { kind: "ready", room: { ...found, ...resumed } };
  }

  if (found.requires_passcode || captchaRequired) {
    return { kind: "gate", room: found };
  }

  if (!sessionData.session) {
    const { error: authError } = await client.auth.signInAnonymously();
    if (authError) throw authError;
  }
  const joined = await joinRoom(client, code);
  return joined
    ? { kind: "ready", room: { ...found, ...joined } }
    : { kind: "notfound" };
}
