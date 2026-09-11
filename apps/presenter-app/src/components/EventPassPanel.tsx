import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  LayerTalkError,
  fetchActiveEntitlement,
  fetchModerationRules,
  fetchPresentationReport,
  resolveErrorMessage,
  setRoomPasscode,
  updateModerationRules,
  type DisplayPreset,
  type Entitlement,
  type Locale,
  type ModerationRules,
  type PresentationSession,
  type PresentationReport,
  type RoomBranding,
} from "@layertalk/shared";

import { useMessages } from "../i18n";
import { patchRoomBranding, type BrandingState } from "../lib/branding";
import {
  loadQuestionCapturePreference,
  saveQuestionCapturePreference,
  screenCapturePermissionTargetName,
  shouldOpenScreenCaptureSettings,
} from "../lib/question-capture";
import { generatePresentationReportHtml, hasQuestionCapture } from "../lib/report-html";
import {
  getScreenCapturePermission,
  openScreenCaptureSettings,
  questionCaptureCount,
  readQuestionCapture,
  type ScreenCapturePermission,
} from "../lib/tauri";
import { EventPassPurchaseSheet } from "./EventPassPurchaseSheet";
import { SignInDialog } from "./SignInDialog";
import { DisplayPresetPicker } from "./DisplayPresetPicker";
import { loadCachedEntitlementLease, openAudiencePage, openEntitlementReceipt, refreshEntitlementLease } from "../lib/billing";
import { supabase } from "../lib/supabase";

type Props = {
  roomId: string;
  roomCode: string | null;
  roomTitle: string | null;
  locale: Locale;
  live: boolean;
  display: { displayMode: "flow" | "bubble"; showJoinQr: boolean; allowCustomStamps: boolean };
  onApplyPreset: (preset: DisplayPreset) => void;
  /**
   * ブランド設定。コントロール窓の `useRoomBranding` が持つ。
   *
   * ここで自前に持たないのは、同じ値をコントロール窓の参加QRカードも出すため。
   * 2箇所で別々に取ると、片方だけ古い値のまま、という食い違いが必ず起きる。
   */
  branding: BrandingState | null;
  onBrandingChange: (branding: BrandingState) => void;
  /**
   * このルームで有料機能が使えるかをコントロール窓へ返す。
   *
   * 判定を持っているのはここだけ（`load` が entitlement を取っている）で、
   * ルームカードのブランド操作を出し分けるのに要る。上でもう一度取りに行くと
   * 15秒ごとのポーリングが二重になるので、取った結果を報告する形にしてある。
   */
  onPaidChange: (paid: boolean) => void;
  /**
   * 本会員（匿名でない）か。**購入はサーバ側で匿名を弾く**（`requirePresenter`）ので、
   * 匿名のまま Checkout を開くと 401 で落ちる。押す前にサインインへ回す。
   */
  isPermanent: boolean;
};

export function EventPassPanel({ roomId, roomCode, roomTitle, locale, live, display, onApplyPreset, branding, onBrandingChange, onPaidChange, isPermanent }: Props) {
  const ja = locale === "ja";
  const t = useMessages(locale);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [historyEntitlement, setHistoryEntitlement] = useState<Entitlement | null>(null);
  const [offlineActive, setOfflineActive] = useState(() => Boolean(loadCachedEntitlementLease(roomId)));
  const [rules, setRules] = useState<ModerationRules | null>(() => {
    try { return JSON.parse(localStorage.getItem(`layertalk:event-controls:${roomId}`) ?? "null") as ModerationRules | null; }
    catch { return null; }
  });
  const [presets, setPresets] = useState<DisplayPreset[]>([]);
  const [sessions, setSessions] = useState<PresentationSession[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [presetName, setPresetName] = useState("");
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);
  const [captureEnabled, setCaptureEnabled] = useState(() => loadQuestionCapturePreference(roomId));
  const [capturePermission, setCapturePermission] = useState<ScreenCapturePermission | null>(null);

  const appliedPreset = presets.find((preset) => preset.id === appliedPresetId) ?? null;
  const captureTargetName = capturePermission
    ? screenCapturePermissionTargetName(capturePermission.permissionTarget, locale)
    : "LayerTalk";
  const captureRestartName = capturePermission?.permissionTarget === "launchingApp"
    ? ja ? "開発プロセス" : "the development process"
    : "LayerTalk";

  useEffect(() => {
    setCaptureEnabled(loadQuestionCapturePreference(roomId));
    setCapturePermission(null);
    void getScreenCapturePermission().then(setCapturePermission).catch(() => setCapturePermission(null));
    const refreshPermission = () => {
      void getScreenCapturePermission().then((next) => {
        // 許可直後の「再起動待ち」は、preflight=falseだけでは再判別できない。
        // 実際に利用可能になるまでは一度得た状態を消さない。
        setCapturePermission((current) => current?.restartRequired && !next.granted ? current : next);
      }).catch(() => undefined);
    };
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  }, [roomId]);

  const openCaptureSettings = async () => {
    try {
      await openScreenCaptureSettings();
    } catch {
      setError(ja
        ? "システム設定を開けませんでした。プライバシーとセキュリティから画面収録を開いてください。"
        : "Could not open System Settings. Open Screen Recording under Privacy & Security.");
    }
  };

  const changeCaptureEnabled = async (enabled: boolean) => {
    setCaptureEnabled(enabled);
    saveQuestionCapturePreference(roomId, enabled);
    if (!enabled) return;
    try {
      const permission = await getScreenCapturePermission(true);
      setCapturePermission(permission);
      if (shouldOpenScreenCaptureSettings(permission)) {
        await openCaptureSettings();
      }
    } catch {
      // 許可取得に失敗しても設定は保持する。次の起動で再確認でき、発表開始も妨げない。
      setCapturePermission(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const [active, historyResult, sessionResult] = await Promise.all([
        fetchActiveEntitlement(supabase, roomId),
        supabase.from("entitlements").select("*").eq("room_id", roomId)
          .gt("history_expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("presentation_sessions").select("*").eq("room_id", roomId).order("started_at", { ascending: false }),
      ]);
      setEntitlement(active);
      setHistoryEntitlement(historyResult.data);
      setSessions(sessionResult.data ?? []);
      const ongoingPaid = Boolean(sessionResult.data?.some((session) =>
        !session.ended_at && typeof session.entitlement_snapshot === "object" && session.entitlement_snapshot !== null
        && !Array.isArray(session.entitlement_snapshot) && session.entitlement_snapshot.paid === true));
      setOfflineActive(Boolean(active) || ongoingPaid);
      if (!active && !ongoingPaid) return;
      void refreshEntitlementLease(roomId).catch(() => undefined);
      const [nextRules, presetResult] = await Promise.all([
        fetchModerationRules(supabase, roomId),
        supabase.from("display_presets").select("*").order("created_at"),
      ]);
      setRules(nextRules);
      localStorage.setItem(`layertalk:event-controls:${roomId}`, JSON.stringify(nextRules));
      setPresets(presetResult.data ?? []);
    } catch {
      setError(ja ? "Event Passの状態を読み込めませんでした" : "Could not load Event Pass");
    }
  }, [ja, roomId]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [load]);

  // 有料判定はここでしか取っていないので、ルームカードのブランド操作のために上へ返す。
  // 早期 return より前に置くこと。無料のときも false が届かないと、あちらが開いたままになる。
  useEffect(() => {
    onPaidChange(Boolean(entitlement) || offlineActive);
  }, [entitlement, offlineActive, onPaidChange]);

  const updateRule = async (patch: Parameters<typeof updateModerationRules>[2]) => {
    if (!rules) return;
    const previous = rules;
    setError(null);
    setRules({ ...rules, ...patch });
    try {
      const saved = await updateModerationRules(supabase, roomId, patch);
      setRules(saved);
      localStorage.setItem(`layertalk:event-controls:${roomId}`, JSON.stringify(saved));
    }
    catch { setRules(previous); setError(ja ? "設定を保存できませんでした" : "Could not save the setting"); }
  };

  /**
   * ブランド設定の 1 列だけを書き換える。
   *
   * 実体は `patchRoomBranding`。**返ってきた行を正として反映する**のが肝で、
   * 楽観更新のまま放置すると「画面は ON・DB は false・スライドには LayerTalk が出たまま」
   * になる（`room_branding` の UPDATE は `has_paid_room_features` を要求し、
   * パスが切れると RLS が 0 行更新で黙って弾く）。
   */
  const patchBranding = async (patch: Partial<RoomBranding>) => {
    if (!branding) return;
    const previous = branding;
    setError(null);
    onBrandingChange({ ...branding, ...patch });
    try {
      onBrandingChange(await patchRoomBranding(roomId, patch));
    } catch (err) {
      onBrandingChange(previous);
      setError(resolveErrorMessage(err, locale));
    }
  };

  const deletePreset = async (preset: DisplayPreset) => {
    setError(null);
    const { error: deleteError } = await supabase.from("display_presets").delete().eq("id", preset.id);
    if (deleteError) {
      const wrapped = new LayerTalkError("moderation_failed", deleteError.message);
      setError(resolveErrorMessage(wrapped, locale));
      throw wrapped;
    }
    setPresets((current) => current.filter((item) => item.id !== preset.id));
    setAppliedPresetId((current) => current === preset.id ? null : current);
  };

  if (!entitlement && !offlineActive) {
    return (
      <section className="space-y-3">
        <p className="text-text-faint text-[11px] font-bold tracking-wider uppercase">Event Pass</p>
        <div className="border-brand/35 bg-brand/8 overflow-hidden rounded-[22px] border">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="bg-brand/15 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"><ShieldCheck size={18} /></div>
              <div>
                <h2 className="text-[15px] font-bold">{ja ? "本番を安全に運営" : "Run the room safely"}</h2>
                <p className="text-text-muted mt-1 text-[11px] leading-relaxed">
                  {ja ? "承認制、入室パスコード、表示ディレイ、発表レポート、ブランド設定をこのルームで7日間使えます。" : "Approval mode, a room passcode, display delay, presentation reports, and branding for this room for seven days."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div><span className="lt-num text-[24px] font-bold">¥2,980</span><span className="text-text-faint ml-1 text-[11px]">{ja ? "税込" : "tax included"}</span></div>
              <button type="button" disabled={live} onClick={() => { setError(null); if (isPermanent) setPurchaseOpen(true); else setSignInOpen(true); }} className="lt-tap bg-brand rounded-[13px] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40">
                {ja ? "購入する" : "Buy pass"}
              </button>
            </div>
            {live && <p className="text-text-faint mt-2 text-[10px]">{ja ? "発表中は購入画面を開きません。終了後に購入できます。" : "Checkout stays out of the way while presenting."}</p>}
            {error && <p className="text-like mt-2 text-[11px]">{error}</p>}
          </div>
        </div>
        <FreeSummary session={sessions.find((session) => session.ended_at) ?? null} ja={ja} />
        {historyEntitlement && <EntitlementDetails entitlement={historyEntitlement} roomTitle={roomTitle} roomCode={roomCode} ja={ja} onError={setError} />}
        {historyEntitlement && historyEntitlement.status !== "revoked" && (
          <div className="border-border bg-bg-elev rounded-[22px] border p-4">
            <p className="text-[13px] font-bold">{ja ? "過去の発表レポート" : "Past presentation reports"}</p>
            <p className="text-text-faint mt-1 text-[10px]">
              {ja ? `${new Date(historyEntitlement.history_expires_at).toLocaleDateString("ja-JP")}まで出力できます。` : `Exports available until ${new Date(historyEntitlement.history_expires_at).toLocaleDateString("en-US")}.`}
            </p>
            <ReportList sessions={sessions} locale={locale} roomTitle={roomTitle} roomCode={roomCode} />
          </div>
        )}
        <EventPassPurchaseSheet open={purchaseOpen} roomId={roomId} roomTitle={roomTitle} roomCode={roomCode} locale={locale} onClose={() => setPurchaseOpen(false)} />
        {/* サインインしたらそのまま購入へ進ませる。もう一度ボタンを探させない。 */}
        <SignInDialog open={signInOpen} locale={locale} onClose={() => setSignInOpen(false)} onSignedIn={() => setPurchaseOpen(true)} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-text-faint text-[11px] font-bold tracking-wider uppercase">Event Pass</p>
        <span className="text-online flex items-center gap-1 text-[10px] font-bold"><CheckCircle2 size={12} />{ja ? "有効" : "Active"}</span>
      </div>
      {(entitlement ?? historyEntitlement) && <EntitlementDetails entitlement={(entitlement ?? historyEntitlement)!} roomTitle={roomTitle} roomCode={roomCode} ja={ja} onError={setError} />}
      <div className="border-border bg-bg-elev space-y-4 rounded-[22px] border p-4">
        <div>
          <p className="text-[13px] font-bold">{ja ? "コメント運営" : "Comment controls"}</p>
          <div className="mt-3 space-y-2">
            <ToggleRow label={ja ? "承認したコメントだけ表示" : "Require approval"} value={rules?.approval_mode ?? false} onChange={(value) => void updateRule({ approval_mode: value })} />
            {/* 承認キューはこのパネルではなく窓の最上部に出る。毎回ここで知らせる。 */}
            {rules?.approval_mode && <p className="text-text-faint pb-1 text-[10px] leading-relaxed">{t.approval.hint}</p>}
            <ToggleRow label={ja ? "質問だけスライドに表示" : "Questions only on slides"} value={rules?.question_only ?? false} onChange={(value) => void updateRule({ question_only: value })} />
          </div>
          <label className="text-text-muted mt-3 flex items-center justify-between text-[11px]">
            <span>{ja ? "表示ディレイ" : "Display delay"}</span><span className="lt-num">{rules?.display_delay_seconds ?? 0}s</span>
          </label>
          <input type="range" min={0} max={5} value={rules?.display_delay_seconds ?? 0} onChange={(event) => void updateRule({ display_delay_seconds: Number(event.target.value) })} className="accent-brand mt-1 w-full" />
        </div>

        <div className="border-border border-t pt-4">
          <p className="flex items-center gap-2 text-[13px] font-bold"><KeyRound size={14} />{ja ? "入室パスコード" : "Room passcode"}</p>
          <div className="mt-2 flex gap-2">
            <input disabled={!entitlement} value={passcode} onChange={(event) => setPasscode(event.target.value)} minLength={4} maxLength={12} placeholder={ja ? "4〜12文字、空欄で解除" : "4–12 characters"} className="border-border min-w-0 flex-1 rounded-[12px] border bg-transparent px-3 py-2 text-[12px] outline-none disabled:opacity-40" />
            <button type="button" disabled={!entitlement} onClick={() => {
              setError(null);
              void setRoomPasscode(supabase, roomId, passcode)
                .then(() => setPasscode(""))
                .catch((err: unknown) => setError(resolveErrorMessage(err, locale)));
            }} className="border-border rounded-[12px] border px-3 text-[11px] font-bold disabled:opacity-40">{ja ? "保存" : "Save"}</button>
          </div>
          {!entitlement && <p className="text-text-faint mt-1.5 text-[10px] leading-relaxed">{ja ? "Event Passの期限切れ後は、新しく参加する人にパスコードを求めません。" : "After the Event Pass expires, new participants are not asked for a passcode."}</p>}
        </div>

        <div className="border-border border-t pt-4">
          <p className="text-[13px] font-bold">{ja ? "表示プリセット" : "Display presets"}</p>
          {/* 「名前を付けて保存」だけ見えていて、何が保存されるのか分からない画面だった。
              まとめて戻せる項目をそのまま並べる。 */}
          <p className="text-text-faint mt-1 text-[10px] leading-relaxed">
            {ja
              ? `いまの表示設定に名前を付けて保存し、次の発表で1タップで戻します。入るのは、表示スタイル（${display.displayMode === "flow" ? "横流れ" : "フキダシ"}）・参加QR（${display.showJoinQr ? "オン" : "オフ"}）・カスタムスタンプ（${display.allowCustomStamps ? "許可" : "不許可"}）・ブランド色・LayerTalk表記・ロゴの6つです。`
              : `Save the current look under a name and restore it in one tap at your next talk. A preset holds six things: display style (${display.displayMode === "flow" ? "flow" : "bubble"}), join QR (${display.showJoinQr ? "on" : "off"}), custom stamps (${display.allowCustomStamps ? "allowed" : "blocked"}), brand colour, the LayerTalk name, and the logo.`}
          </p>
          <div className="mt-2 flex gap-2">
            <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={ja ? "プリセット名（例: 社内向け）" : "Preset name (e.g. Internal)"} className="border-border min-w-0 flex-1 rounded-[12px] border bg-transparent px-3 py-2 text-[12px] outline-none" />
            <button type="button" disabled={!entitlement || !presetName.trim() || presets.length >= 10} onClick={() => {
              if (!entitlement) return;
              setError(null);
              void supabase.from("display_presets").insert({ owner_id: entitlement.owner_id, name: presetName.trim(), display_mode: display.displayMode, show_join_qr: display.showJoinQr, allow_custom_stamps: display.allowCustomStamps, hide_layertalk_branding: branding?.hide_layertalk_branding ?? false, brand_color: branding?.brand_color ?? "#6B8AFF", logo_path: branding?.logo_path ?? null }).select().single().then(({ data, error: insertError }) => {
                if (insertError) { setError(resolveErrorMessage(new LayerTalkError("moderation_failed", insertError.message), locale)); return; }
                if (data) setPresets((current) => [...current, data]);
                setPresetName("");
              });
            }} className="border-border rounded-[12px] border px-3 text-[11px] font-bold">{ja ? "保存" : "Save"}</button>
          </div>
          {presets.length > 0 && (
            <>
              <DisplayPresetPicker
                presets={presets}
                selectedPresetId={appliedPresetId}
                locale={locale}
                onSelect={(preset) => {
                  onApplyPreset(preset);
                  void patchBranding({ brand_color: preset.brand_color, hide_layertalk_branding: preset.hide_layertalk_branding, logo_path: preset.logo_path });
                  setAppliedPresetId(preset.id);
                }}
                onClear={() => setAppliedPresetId(null)}
                onDelete={deletePreset}
              />
              {/* 押しても画面のどこが変わったのか分からなかったので、適用したことを明示する */}
              {appliedPreset && <p className="text-online mt-2 text-[10px]">{ja ? `「${appliedPreset.name}」を適用しました` : `Applied “${appliedPreset.name}”`}</p>}
            </>
          )}
        </div>

        <div className="border-border border-t pt-4">
          <p className="text-[13px] font-bold">{ja ? "質問時のスライドを保存" : "Save slides when questions arrive"}</p>
          <div className="mt-2">
            <ToggleRow
              label={ja ? "質問が届いた瞬間の画面をレポートに入れる" : "Include the screen at each question in reports"}
              value={captureEnabled}
              disabled={live}
              onChange={(value) => void changeCaptureEnabled(value)}
            />
          </div>
          <p className="text-text-faint mt-2 text-[10px] leading-relaxed">
            {ja
              ? "選択中の発表用ディスプレイだけを保存します。LayerTalkの表示とカーソルは写りません。画像はこのMacだけに30日間保存されます。"
              : "Only the selected presentation display is saved. LayerTalk and the cursor are excluded. Images stay on this Mac for 30 days."}
          </p>
          {live && <p className="text-text-faint mt-1 text-[10px]">{ja ? "この設定は発表を終了してから変更できます。" : "Change this setting after the presentation ends."}</p>}
          {captureEnabled && capturePermission && !capturePermission.supported && (
            <p className="text-like mt-1 text-[10px]">{ja ? "この機能はmacOSでのみ利用できます。" : "This feature is available on macOS only."}</p>
          )}
          {captureEnabled && capturePermission?.restartRequired && (
            <p className="text-like mt-1 text-[10px]">
              {ja
                ? `${captureTargetName}の画面収録をオンにして、${captureRestartName}を再起動してください。`
                : `Turn on Screen Recording for ${captureTargetName}, then restart ${captureRestartName}.`}
            </p>
          )}
          {captureEnabled && capturePermission?.supported && !capturePermission.granted && !capturePermission.restartRequired && (
            <p className="text-like mt-1 text-[10px]">
              {ja
                ? `システム設定 → プライバシーとセキュリティ → 画面収録で${captureTargetName}をオンにしてください。発表自体はそのまま開始できます。`
                : `In System Settings, open Privacy & Security → Screen Recording and turn on ${captureTargetName}. Presenting still works without it.`}
            </p>
          )}
          {captureEnabled && capturePermission?.supported && !capturePermission.granted && (
            <button type="button" onClick={() => void openCaptureSettings()} className="border-border text-text-muted mt-2 flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[9px] font-bold">
              {ja ? "画面収録の設定を開く" : "Open Screen Recording settings"}<ExternalLink size={10} />
            </button>
          )}
        </div>

        <div className="border-border border-t pt-4">
          <p className="text-[13px] font-bold">{ja ? "発表レポート" : "Presentation reports"}</p>
          <ReportList sessions={sessions} locale={locale} roomTitle={roomTitle} roomCode={roomCode} />
        </div>
      </div>
      {error && <p className="text-like text-[11px]">{error}</p>}
    </section>
  );
}

function EntitlementDetails({ entitlement, roomTitle, roomCode, ja, onError }: {
  entitlement: Entitlement;
  roomTitle: string | null;
  roomCode: string | null;
  ja: boolean;
  onError: (message: string | null) => void;
}) {
  const [receiptBusy, setReceiptBusy] = useState(false);
  const expired = new Date(entitlement.expires_at).getTime() <= Date.now();
  const status = entitlement.status === "revoked"
    ? entitlement.revoked_reason === "full_refund" ? (ja ? "返金済み" : "Refunded") : (ja ? "取り消し済み" : "Revoked")
    : expired ? (ja ? "期限切れ" : "Expired") : (ja ? "有効" : "Active");
  const statusClass = entitlement.status === "revoked" ? "text-like" : expired ? "text-text-muted" : "text-online";
  const canOpenReceipt = entitlement.source === "stripe" && Boolean(entitlement.stripe_payment_intent_id);
  const amount = entitlement.amount_total === null || !entitlement.currency
    ? "—"
    : new Intl.NumberFormat(ja ? "ja-JP" : "en-US", { style: "currency", currency: entitlement.currency.toUpperCase() })
      .format(entitlement.amount_total / (entitlement.currency.toLowerCase() === "jpy" ? 1 : 100));

  const openReceipt = async () => {
    setReceiptBusy(true);
    onError(null);
    try { await openEntitlementReceipt(entitlement.id); }
    catch { onError(ja ? "領収書を開けませんでした" : "Could not open the receipt"); }
    finally { setReceiptBusy(false); }
  };

  return (
    <div className="border-border bg-bg-elev rounded-[22px] border p-4">
      <div className="flex items-center justify-between gap-3"><p className="text-[13px] font-bold">{ja ? "購入情報" : "Purchase details"}</p><span className={`${statusClass} text-[10px] font-bold`}>{status}</span></div>
      <dl className="mt-3 space-y-2 text-[10px]">
        <div className="flex justify-between gap-3"><dt className="text-text-faint">{ja ? "対象ルーム" : "Room"}</dt><dd className="text-right font-semibold">{roomTitle || (ja ? "無題のルーム" : "Untitled room")}（{roomCode || "------"}）</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-faint">{ja ? "購入日時" : "Purchased"}</dt><dd className="lt-num text-right">{formatBillingDate(entitlement.starts_at, ja)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-faint">{ja ? "有効期限" : "Pass expires"}</dt><dd className="lt-num text-right">{formatBillingDate(entitlement.expires_at, ja)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-faint">{ja ? "レポート期限" : "Report access"}</dt><dd className="lt-num text-right">{formatBillingDate(entitlement.history_expires_at, ja)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-faint">{ja ? "支払額" : "Amount"}</dt><dd className="lt-num text-right font-semibold">{amount}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {canOpenReceipt && <button type="button" disabled={receiptBusy} onClick={() => void openReceipt()} className="border-border text-text-muted flex items-center gap-1.5 rounded-control border px-3 py-2 text-[9px] font-bold disabled:opacity-40"><ReceiptText size={12} />{receiptBusy ? (ja ? "取得中" : "Loading") : (ja ? "領収書を開く" : "Open receipt")}</button>}
        <button type="button" onClick={() => void openAudiencePage("/support").catch(() => onError(ja ? "サポートページを開けませんでした" : "Could not open support"))} className="border-border text-text-muted flex items-center gap-1.5 rounded-control border px-3 py-2 text-[9px] font-bold">{ja ? "サポート" : "Support"}<ExternalLink size={11} /></button>
      </div>
    </div>
  );
}

function formatBillingDate(value: string, ja: boolean) {
  return `${new Intl.DateTimeFormat(ja ? "ja-JP" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value))}${ja ? " JST" : " (JST)"}`;
}

function FreeSummary({ session, ja }: { session: PresentationSession | null; ja: boolean }) {
  const [report, setReport] = useState<PresentationReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!session) { setReport(null); return; }
    void fetchPresentationReport(supabase, session).then((next) => {
      if (!cancelled) setReport(next);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [session]);
  if (!report) return null;
  return (
    <div className="border-border bg-bg-elev rounded-[22px] border p-4">
      <p className="text-[13px] font-bold">{ja ? "直近の発表サマリー" : "Latest presentation summary"}</p>
      <p className="text-text-muted mt-2 text-[11px]">
        {ja
          ? `コメント ${report.totals.comments}件・質問 ${report.totals.questions}件・反応ピーク ${report.peakMinute === null ? "—" : `${report.peakMinute}分`}`
          : `${report.totals.comments} comments · ${report.totals.questions} questions · peak ${report.peakMinute === null ? "—" : `${report.peakMinute} min`}`}
      </p>
    </div>
  );
}

export function ReportList({ sessions, locale, roomTitle, roomCode }: {
  sessions: PresentationSession[];
  locale: Locale;
  roomTitle: string | null;
  roomCode: string | null;
}) {
  const ja = locale === "ja";
  const finished = sessions.filter((session) => session.ended_at).slice(0, 5);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureCounts, setCaptureCounts] = useState<Record<string, number | "error">>({});
  const finishedKey = finished.map((session) => session.id).join(":");

  useEffect(() => {
    let cancelled = false;
    setCaptureCounts({});
    void Promise.all(finished.map(async (session) => {
      try { return [session.id, await questionCaptureCount(session.id)] as const; }
      catch { return [session.id, "error"] as const; }
    })).then((entries) => {
      if (!cancelled) setCaptureCounts(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
    // finished は毎レンダーで新しい配列になるため、対象IDが変わったときだけ再確認する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey]);

  const run = async (session: PresentationSession) => {
    const key = session.id;
    setBusy(key);
    setSaved(null);
    setError(null);
    try {
      // 押しても無反応だった原因はここを握り潰していたこと。必ず結果を見せる。
      const result = await exportReport(session, locale, roomTitle, roomCode);
      if (result === "saved") setSaved(key);
      if (result === "no-captures") {
        setCaptureCounts((current) => ({ ...current, [session.id]: 0 }));
      }
    } catch (err) {
      setError(resolveErrorMessage(err, locale));
    } finally {
      setBusy(null);
    }
  };

  // 枚数が確定するまでは何も並べない。先に全部出してから消えると行が点滅するし、
  // 「まだありません」が一瞬出てしまう。
  const counting = finished.some((session) => captureCounts[session.id] === undefined);
  // 出力できるものと、確認そのものに失敗したものだけ並べる。
  // 画像が 0 枚の発表は出力しようがないので、行ごと出さない（キャプチャを
  // OFF にして発表していれば全部これになり、一覧が読めなくなる）。
  const exportable = counting
    ? []
    : finished.filter((session) => {
      const count = captureCounts[session.id];
      return count === "error" || (typeof count === "number" && count > 0);
    });

  return (
    <div className="mt-2 space-y-2">
      {exportable.map((session) => {
        const captureCount = captureCounts[session.id];
        return <div key={session.id} className="border-border flex items-center gap-2 rounded-[12px] border px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px]">{new Date(session.started_at).toLocaleString(ja ? "ja-JP" : "en-US")}</span>
          {captureCount === "error" && <span className="text-like max-w-36 text-right text-[9px]">{ja ? "画像を確認できません" : "Could not check images"}</span>}
          {typeof captureCount === "number" && captureCount > 0 && (
            <button type="button" disabled={busy !== null} onClick={() => void run(session)}
              className={`flex items-center gap-1 text-[9px] font-bold disabled:opacity-40 ${saved === session.id ? "text-online" : "text-text-muted"}`}>
              {saved === session.id ? <Check size={11} /> : <Download size={11} />}
              HTML
            </button>
          )}
        </div>;
      })}
      {counting && <p className="text-text-faint text-[10px]">{ja ? "画像を確認中…" : "Checking images…"}</p>}
      {finished.length === 0 && <p className="text-text-faint text-[10px]">{ja ? "発表を終了するとここに表示されます。" : "Reports appear after a presentation ends."}</p>}
      {/* 終わった発表はあるのに1つも出せない、はキャプチャが OFF のときの通常の状態。
          すぐ上の「質問時のスライドを保存」に繋がるよう、原因の方を書く。 */}
      {!counting && finished.length > 0 && exportable.length === 0 && (
        <p className="text-text-faint text-[10px]">
          {ja ? "スライド画像を保存した発表がまだありません。" : "No presentations with saved slide images yet."}
        </p>
      )}
      {saved && <p className="text-online text-[10px]">{ja ? "保存しました" : "Saved"}</p>}
      {error && <p className="text-like text-[10px]">{error}</p>}
    </div>
  );
}

function ToggleRow({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-3 text-left text-[11px] disabled:opacity-45">
      <span>{label}</span><span className={`relative h-5 w-9 shrink-0 rounded-full ${value ? "bg-brand" : "bg-[var(--lt-border-strong)]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-[18px]" : "translate-x-0.5"}`} /></span>
    </button>
  );
}

type ExportReportResult = "saved" | "cancelled" | "no-captures";

async function exportReport(session: PresentationSession, locale: Locale, roomTitle: string | null, roomCode: string | null): Promise<ExportReportResult> {
  const report = await fetchPresentationReport(supabase, session);
  const questions = report.comments.filter((comment) => comment.is_question);
  const entries = await Promise.all(questions.map(async (question) => [
    question.id,
    await readQuestionCapture(session.id, question.id).catch(() => null),
  ] as const));
  const captures = Object.fromEntries(entries);
  // 一覧表示後に30日削除が走った場合などにも、空のHTMLを保存しない。
  if (!hasQuestionCapture(captures)) return "no-captures";
  const contents = generatePresentationReportHtml({
    report,
    roomTitle,
    roomCode,
    locale,
    captures,
  });
  const name = `layertalk-${session.started_at.slice(0, 10)}.html`;

  // \u26A0\uFE0F Blob + <a download> \u306B\u3057\u306A\u3044\u3053\u3068\u3002WKWebView \u306F download \u3092\u51E6\u7406\u3057\u306A\u3044\u306E\u3067\u3001
  // \u30D6\u30E9\u30A6\u30B6\u3067\u306F\u52D5\u304F\u30B3\u30FC\u30C9\u304C\u3053\u3053\u3067\u306F**\u30A8\u30E9\u30FC\u3082\u51FA\u3055\u305A\u306B\u4F55\u3082\u4FDD\u5B58\u3057\u306A\u3044**\u3002
  const path = await save({
    defaultPath: name,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (path === null) return "cancelled"; // \u4FDD\u5B58\u30C0\u30A4\u30A2\u30ED\u30B0\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u305F
  await writeTextFile(path, contents);
  return "saved";
}
