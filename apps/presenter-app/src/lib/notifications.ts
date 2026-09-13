import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@layertalk/shared";

export type Provider = "slack" | "teams";
export type Destination = { provider: Provider; name: string; enabled: boolean };
export type Delivery = { provider: Provider; name: string; status: string };
export type Scope = { accountId: string; roomId: string };
export const notificationText = (locale: Locale, test = false) => locale === "ja"
  ? test ? "LayerTalkのテスト送信です。参加URLをご確認ください。" : "プレゼンが始まりました。こちらから参加してください。"
  : test ? "This is a LayerTalk test message. Please check the join URL." : "The presentation has started. Join here.";

export function notificationMessage(code: unknown, locale: Locale): string {
  // Never display raw native/network errors, which could contain a secret URL.
  const messages: Record<string, [string, string]> = {
    sent: ["送信しました", "Message sent"],
    accepted: ["Teamsが受け付けました。投稿結果はチャンネルで確認してください。", "Teams accepted the request. Check the channel for the post."],
    unknown: ["送信結果を確認できません。再送すると重複する場合があります。", "Delivery could not be confirmed. Resending may create a duplicate."],
    offline: ["接続できませんでした。ネットワークを確認してください。", "Could not connect. Check your network."],
    rejected: ["送信先が利用できません。Webhookと権限を確認してください。", "Destination unavailable. Check the webhook and permissions."],
    rate_limited: ["送信回数が制限されています。時間をおいて再送してください。", "Rate limited. Wait before resending."],
    invalid_webhook: ["このサービスの有効なHTTPS Webhook URLを入力してください。", "Enter a valid HTTPS webhook URL for this service."],
    invalid_audience: ["公開されたHTTPSの参加URLが必要です。配信先の設定を確認してください。", "A public HTTPS join URL is required. Check the audience site configuration."],
    invalid_name: ["送信先の表示名を80文字以内で入力してください。", "Enter a destination name of up to 80 characters."],
    storage_error: ["Keychainにアクセスできませんでした。アクセス許可を確認して再試行してください。", "Could not access Keychain. Check access permissions and try again."],
    missing_webhook: ["Webhook URLを入力して保存してください。", "Enter and save a webhook URL."],
    expired_request: ["送信準備の有効時間を過ぎました。手動で再送してください。", "The prepared request expired. Resend manually."],
    unsupported: ["この機能はmacOSで利用できます。", "This feature is available on macOS."],
    failed: ["送信に失敗しました。送信先の設定を確認してください。", "Sending failed. Check the destination settings."],
  };
  return (messages[typeof code === "string" ? code : "failed"] ?? messages.failed)[locale === "ja" ? 0 : 1];
}

export function useNotifications(accountId: string | null, roomId: string | null, locale: Locale, audienceUrl: string | null) {
  const scope: Scope | null = accountId && roomId ? { accountId, roomId } : null;
  const key = `${accountId}:${roomId}`;
  const current = useRef({ key });
  if (current.current.key !== key) current.current = { key };
  const context = current.current;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [state, setState] = useState<{ key: string; items: Destination[]; loaded: boolean }>({ key, items: [], loaded: false });
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Delivery[]>([]);
  const [working, setWorking] = useState(false);
  const locked = useRef(false);
  const [revision, refresh] = useState(0);
  const valid = () => mounted.current && current.current === context;
  useEffect(() => {
    let cancelled = false;
    setError(null); setResults([]); setWorking(false); locked.current = false;
    if (!accountId || !roomId) return;
    void invoke<Destination[]>("notification_list", { scope: { accountId, roomId } }).then(items => {
      if (!cancelled) setState({ key, items, loaded: true });
    }).catch(code => { if (!cancelled) setError(notificationMessage(code, locale)); });
    return () => { cancelled = true; };
  }, [key, accountId, roomId, revision]);
  const items = state.key === key ? state.items : [];
  const loaded = state.key === key && state.loaded;

  async function save(provider: Provider, name: string, url: string, enabled: boolean) {
    if (!scope || locked.current) return false;
    locked.current = true; setWorking(true); setError(null);
    try {
      const item = await invoke<Destination>("notification_save", { scope, provider, input: { name, url: url.trim() || null, enabled } });
      if (valid()) setState(s => ({ ...s, items: [...s.items.filter(x => x.provider !== provider), item] }));
      return true;
    } catch (code) { if (valid()) setError(notificationMessage(code, locale)); return false; }
    finally { if (valid()) { locked.current = false; setWorking(false); } }
  }
  async function remove(provider: Provider) {
    if (!scope || locked.current) return;
    locked.current = true; setWorking(true); setError(null);
    try {
      await invoke("notification_delete", { scope, provider });
      if (valid()) { setState(s => ({ ...s, items: s.items.filter(x => x.provider !== provider) })); setResults(r => r.filter(x => x.provider !== provider)); }
    } catch (code) { if (valid()) setError(notificationMessage(code, locale)); }
    finally { if (valid()) { locked.current = false; setWorking(false); } }
  }

  // Only explicit start/test/resend actions prepare a request. Mounts and effects never send.
  function prepare(provider?: Provider, test = false) {
    const requestId = crypto.randomUUID();
    const pending = scope && audienceUrl
      ? invoke<number>("notification_prepare", { scope, requestId, audienceUrl, language: locale, provider: provider ?? null, test })
          .then(count => ({ count, error: null as unknown })).catch(error => ({ count: 0, error }))
      : Promise.resolve({ count: 0, error: null as unknown });
    const cancel = async () => {
      await pending;
      await invoke("notification_cancel", { requestId }).catch(() => undefined);
    };
    return {
      cancel,
      send: async () => {
        if (valid()) { setWorking(true); locked.current = true; setError(null); setResults([]); }
        try {
          const result = await pending;
          if (!valid()) { await cancel(); return; }
          if (result.error) throw result.error;
          if (!result.count) { await cancel(); return; }
          const deliveries = await invoke<Delivery[]>("notification_dispatch", { requestId });
          if (valid()) setResults(deliveries);
        } catch (code) { if (valid()) setError(notificationMessage(code, locale)); }
        finally { if (valid()) { setWorking(false); locked.current = false; } }
      },
    };
  }
  async function manual(provider: Provider, test: boolean) {
    if (locked.current) return;
    locked.current = true;
    await prepare(provider, test).send();
  }
  return { items, loaded, working, error, results, save, remove, prepare, manual, reload: () => refresh(n => n + 1) };
}
export type Notifications = ReturnType<typeof useNotifications>;
