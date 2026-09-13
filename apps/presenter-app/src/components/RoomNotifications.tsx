import { useState } from "react";
import type { Locale } from "@layertalk/shared";
import { notificationMessage, notificationText, type Destination, type Notifications, type Provider } from "../lib/notifications";
import { openExternalUrl } from "../lib/tauri";

const HELP = {
  slack: "https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/",
  teams: "https://support.microsoft.com/en-us/workflows/send-messages-in-teams-using-incoming-webhooks",
};
const button = "lt-tap border-border hover:bg-surface-strong rounded-xl border px-3 py-2 text-[12px] font-semibold disabled:opacity-40";
const input = "border-border focus:border-brand w-full rounded-xl border bg-transparent px-3 py-2 text-[13px] outline-none disabled:opacity-40";

function DestinationForm({ provider, saved, notifications, locale, disabled }: {
  provider: Provider; saved?: Destination; notifications: Notifications; locale: Locale; disabled: boolean;
}) {
  const ja = locale === "ja";
  const [name, setName] = useState(saved?.name ?? "");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [savedNotice, setSavedNotice] = useState(false);
  const dirty = name !== (saved?.name ?? "") || Boolean(url) || enabled !== (saved?.enabled ?? false);
  const label = provider === "slack" ? "Slack" : "Teams";
  return <fieldset disabled={disabled} className="border-border space-y-2 rounded-xl border p-3">
    <legend className="px-1 text-[13px] font-semibold">{label}</legend>
    <label className="block space-y-1 text-[12px]">
      <span>{ja ? "送信先の表示名" : "Destination name"}</span>
      <input className={input} value={name} maxLength={80} placeholder={ja ? "例：営業チーム / 発表会" : "e.g. Sales team / Presentations"} onChange={e => { setName(e.target.value); setSavedNotice(false); }} />
    </label>
    <label className="block space-y-1 text-[12px]">
      <span>{saved ? (ja ? "Webhook URLを変更（空欄なら維持）" : "Replace webhook URL (leave blank to keep)") : "Webhook URL"}</span>
      <input className={input} type="password" autoComplete="off" spellCheck={false} value={url} onChange={e => { setUrl(e.target.value); setSavedNotice(false); }} />
    </label>
    <label className="flex items-center gap-2 text-[12px] font-semibold">
      <input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setSavedNotice(false); }} />
      {ja ? "開始時にこの送信先へ自動送信" : "Send here automatically on start"}
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={!name.trim() || (!saved && !url.trim()) || !dirty} onClick={() => {
        void notifications.save(provider, name, url, enabled).then(ok => { if (ok) { setUrl(""); setName(name.trim()); setSavedNotice(true); } });
      }}>{ja ? "保存" : "Save"}</button>
      {saved && <>
        <button type="button" className={button} disabled={dirty} onClick={() => void notifications.manual(provider, true)}>{ja ? "テスト送信" : "Send test"}</button>
        <button type="button" className={button} onClick={() => void notifications.remove(provider)}>{ja ? "削除" : "Delete"}</button>
      </>}
    </div>
    {savedNotice && <p role="status" className="text-online text-[12px]">{ja ? "保存しました" : "Saved"}</p>}
    {dirty && saved && <p className="text-text-muted text-[11px]">{ja ? "変更を保存してからテスト送信してください。" : "Save changes before sending a test."}</p>}
    <button type="button" className="text-brand text-left text-[12px] underline" onClick={() => void openExternalUrl(HELP[provider])}>{ja ? `${label}側の設定手順` : `Set up ${label}`}</button>
    <p className="text-text-muted text-[11px] leading-relaxed">{ja
      ? provider === "teams" ? "TeamsのWorkflowsで送信先を指定し、呼び出し元をAnyone（すべてのユーザー）に設定します。組織によっては管理者の許可が必要です。旧Connector URLは使えません。" : "Slack側で指定したチャンネルへ、登録したSlackアプリとして投稿します。表示名を変えても実際の送信先は変わりません。"
      : provider === "teams" ? "Choose a destination in Teams Workflows and allow Anyone to trigger it. Your organization may require admin permission. Legacy Connector URLs are not supported." : "Posts as your configured Slack app to the channel selected in Slack. Editing the name here does not change the actual channel."}</p>
  </fieldset>;
}

export function RoomNotifications({ notifications: n, locale, audienceUrl, disabled }: {
  notifications: Notifications; locale: Locale; audienceUrl: string | null; disabled: boolean;
}) {
  const ja = locale === "ja";
  return <div className="border-border bg-bg-elev space-y-3 rounded-[20px] border p-4">
    <div className="text-[13px] font-semibold">{ja ? "開始時に参加URLを送信" : "Send the join URL on start"}</div>
    <p className="text-text-muted text-[12px] leading-relaxed">{ja
      ? "このRoomで発表を開始するたび、有効にした送信先へ1回投稿します。URLを保存するだけでは自動送信されません。設定はこのMacのKeychainに保存されます。"
      : "Each presentation start posts once to enabled destinations for this room. Saving a URL alone does not enable automatic sending. Settings stay in this Mac’s Keychain."}</p>
    <details className="space-y-3">
    <summary className="cursor-pointer text-[12px] font-semibold text-brand">{ja ? "送信先と送信内容を設定" : "Configure destinations and message"}</summary>
    <div className="border-border space-y-1 rounded-xl border p-3 text-[12px]">
      <p className="text-text-muted">{ja ? "送信内容" : "Message preview"}</p>
      <p>{notificationText(locale)}</p><p className="break-all text-brand">{audienceUrl}</p>
      <p className="text-text-muted text-[11px]">{ja ? "テスト送信では「LayerTalkのテスト送信です」と明示します。送信先のメンバーが参加URLを閲覧できます。" : "Tests are labeled as LayerTalk test messages. Members of the destination channel can see the join URL."}</p>
    </div>
    {disabled && <p className="text-text-muted text-[11px]">{ja ? "送信先の変更は発表を終了してから行えます。" : "Stop the presentation before editing destinations."}</p>}
    {n.loaded ? (["slack", "teams"] as Provider[]).map(provider => <DestinationForm key={`${provider}:${Boolean(n.items.find(x => x.provider === provider))}`} provider={provider} saved={n.items.find(x => x.provider === provider)} notifications={n} locale={locale} disabled={disabled || n.working} />)
      : <button type="button" className={button} onClick={n.reload}>{ja ? "通知設定を読み込む" : "Load notification settings"}</button>}
    </details>
    {n.error && <p role="alert" className="text-like text-[12px]">{n.error}</p>}
    {n.working && <p role="status" className="text-text-muted text-[12px]">{ja ? "処理中…" : "Working…"}</p>}
    {n.results.map(result => <div key={result.provider} role="status" className="space-y-2 text-[12px]">
      <p>{result.name}: {notificationMessage(result.status, locale)}</p>
      <button type="button" className={button} disabled={n.working} onClick={() => void n.manual(result.provider, false)}>{ja ? "参加URLを再送" : "Resend join URL"}</button>
    </div>)}
    <p className="text-text-muted text-[11px]">{ja ? "自動送信をオフにして保存すると停止します。削除するとKeychainから設定とURLを消去します。投稿済みメッセージは各サービス側で管理してください。" : "Turn automatic sending off and save to disable it. Delete removes the settings and URL from Keychain. Manage already-posted messages in each service."}</p>
  </div>;
}
