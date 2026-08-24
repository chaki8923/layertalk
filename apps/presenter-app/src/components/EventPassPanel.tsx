import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  EyeOff,
  KeyRound,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  LayerTalkError,
  ROOM_LOGO_BUCKET,
  fetchActiveEntitlement,
  fetchModerationRules,
  fetchPresentationReport,
  moderateComment,
  resolveErrorMessage,
  setRoomPasscode,
  toLogoPng,
  updateModerationRules,
  type Comment,
  type DisplayPreset,
  type Entitlement,
  type Locale,
  type ModerationRules,
  type ModerationTerm,
  type PresentationSession,
  type PresentationReport,
  type RoomBranding,
} from "@layertalk/shared";

import { useMessages } from "../i18n";
import { audienceUrl as buildAudienceUrl } from "../lib/audience";
import { patchRoomBranding, type BrandingState } from "../lib/branding";
import { loadQuestionCapturePreference, saveQuestionCapturePreference, shouldOpenScreenCaptureSettings } from "../lib/question-capture";
import { generatePresentationReportHtml, hasQuestionCapture } from "../lib/report-html";
import {
  getScreenCapturePermission,
  openScreenCaptureSettings,
  questionCaptureCount,
  readQuestionCapture,
  type ScreenCapturePermission,
} from "../lib/tauri";
import { EventPassPurchaseSheet } from "./EventPassPurchaseSheet";
import { DisplayPresetPicker } from "./DisplayPresetPicker";
import { JoinQrCard } from "./JoinQrCard";
import { loadCachedEntitlementLease, openAudiencePage, openEntitlementReceipt, refreshEntitlementLease } from "../lib/billing";
import { supabase } from "../lib/supabase";

type Props = {
  roomId: string;
  roomCode: string | null;
  roomTitle: string | null;
  locale: Locale;
  live: boolean;
  comments: Comment[];
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
};

export function EventPassPanel({ roomId, roomCode, roomTitle, locale, live, comments, display, onApplyPreset, branding, onBrandingChange }: Props) {
  const ja = locale === "ja";
  const t = useMessages(locale);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [historyEntitlement, setHistoryEntitlement] = useState<Entitlement | null>(null);
  const [offlineActive, setOfflineActive] = useState(() => Boolean(loadCachedEntitlementLease(roomId)));
  const [rules, setRules] = useState<ModerationRules | null>(() => {
    try { return JSON.parse(localStorage.getItem(`layertalk:event-controls:${roomId}`) ?? "null") as ModerationRules | null; }
    catch { return null; }
  });
  const [terms, setTerms] = useState<ModerationTerm[]>([]);
  const [presets, setPresets] = useState<DisplayPreset[]>([]);
  const [sessions, setSessions] = useState<PresentationSession[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const [termMode, setTermMode] = useState<"contains" | "exact">("contains");
  const [presetName, setPresetName] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoDone, setLogoDone] = useState(false);
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);
  const [captureEnabled, setCaptureEnabled] = useState(() => loadQuestionCapturePreference(roomId));
  const [capturePermission, setCapturePermission] = useState<ScreenCapturePermission | null>(null);

  // 署名 URL の解決は `useRoomBranding` が済ませている（バケットが private なので
  // オーバーレイ側にも同じものが要る）。ここで作り直さない。
  const logoUrl = branding?.logoUrl ?? null;
  const appliedPreset = presets.find((preset) => preset.id === appliedPresetId) ?? null;

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
      const [nextRules, termResult, presetResult] = await Promise.all([
        fetchModerationRules(supabase, roomId),
        supabase.from("moderation_terms").select("*").eq("room_id", roomId).order("created_at"),
        supabase.from("display_presets").select("*").order("created_at"),
      ]);
      setRules(nextRules);
      localStorage.setItem(`layertalk:event-controls:${roomId}`, JSON.stringify(nextRules));
      setTerms(termResult.data ?? []);
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

  /**
   * ロゴを上げる。
   *
   * **必ず `toLogoPng` を通してから上げる。** 生ファイルをそのまま渡すと
   * `room-branding` バケットの image/png・1MB 制限にユーザーが自分で合わせる羽目になり、
   * 「1MB以下のPNGを選べ」としか言えない行き止まりを作ってしまう。
   * 再エンコードすれば JPEG も HEIC も 5MB の PNG も数十KB の PNG になって必ず通る。
   */
  const uploadLogo = async (file: File) => {
    if (!branding) return;
    // ここで消さないと、一度出したエラーがこの画面から二度と消えない
    setError(null);
    setLogoDone(false);
    setLogoBusy(true);
    try {
      const png = await toLogoPng(file);
      const path = `${roomId}/logo.png`;
      const { error: uploadError } = await supabase.storage.from(ROOM_LOGO_BUCKET).upload(path, png, {
        // パスが固定で upsert するので、CDN に抱えさせない。
        // 版付きの名前にすると display_presets が指す旧ファイルを retention が消してしまう。
        contentType: "image/png", cacheControl: "0", upsert: true,
      });
      if (uploadError) throw new LayerTalkError("logo_upload_failed", uploadError.message);
      // updated_at も進めること（`patchRoomBranding` がやる）。差し替えではパスが変わらないので、
      // これが無いとプレビューの <img src> が同一のままで古いロゴが残る。
      onBrandingChange(await patchRoomBranding(roomId, { logo_path: path }));
      setLogoDone(true);
    } catch (err) {
      setError(resolveErrorMessage(err, locale));
    } finally {
      setLogoBusy(false);
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
                  {ja ? "承認制、NGワード、入室パスコード、レポート、ブランド設定をこのルームで7日間使えます。" : "Approval, blocked words, a room passcode, reports, and branding for this room for seven days."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div><span className="lt-num text-[24px] font-bold">¥2,980</span><span className="text-text-faint ml-1 text-[11px]">{ja ? "税込" : "tax included"}</span></div>
              <button type="button" disabled={live} onClick={() => { setError(null); setPurchaseOpen(true); }} className="lt-tap bg-brand rounded-[13px] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40">
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
            <ToggleRow label={ja ? "コメントを一時停止" : "Pause comments"} value={rules?.comments_paused ?? false} onChange={(value) => void updateRule({ comments_paused: value })} />
            <ToggleRow label={ja ? "承認したコメントだけ表示" : "Require approval"} value={rules?.approval_mode ?? false} onChange={(value) => void updateRule({ approval_mode: value })} />
            {/* 承認キューはこのパネルではなく窓の最上部に出る。毎回ここで知らせる。 */}
            {rules?.approval_mode && <p className="text-text-faint pb-1 text-[10px] leading-relaxed">{t.approval.hint}</p>}
            <ToggleRow label={ja ? "質問だけスライドに表示" : "Questions only on slides"} value={rules?.question_only ?? false} onChange={(value) => void updateRule({ question_only: value })} />
            <ToggleRow label={ja ? "カスタムスタンプを無効化" : "Disable custom stamps"} value={!(rules?.custom_stamps_enabled ?? true)} onChange={(value) => void updateRule({ custom_stamps_enabled: !value })} />
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
          <p className="text-[13px] font-bold">{ja ? "NGワード" : "Blocked words"}</p>
          <div className="mt-2 flex gap-2">
            <input value={newTerm} onChange={(event) => setNewTerm(event.target.value)} className="border-border min-w-0 flex-1 rounded-[12px] border bg-transparent px-3 py-2 text-[12px] outline-none" />
            <select aria-label={ja ? "一致方法" : "Match mode"} value={termMode} onChange={(event) => setTermMode(event.target.value as "contains" | "exact")} className="border-border rounded-[12px] border bg-transparent px-2 text-[10px] outline-none">
              <option value="contains">{ja ? "部分" : "Contains"}</option>
              <option value="exact">{ja ? "完全" : "Exact"}</option>
            </select>
            <button type="button" disabled={!newTerm.trim()} onClick={() => {
              setError(null);
              void supabase.from("moderation_terms").insert({ room_id: roomId, term: newTerm.trim(), match_mode: termMode }).select().single().then(({ data, error: insertError }) => {
                if (insertError) { setError(resolveErrorMessage(new LayerTalkError("moderation_failed", insertError.message), locale)); return; }
                if (data) setTerms((current) => [...current, data]);
                setNewTerm("");
              });
            }} className="border-border rounded-[12px] border px-3"><Plus size={14} /></button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((term) => <button key={term.id} type="button" onClick={() => {
              setError(null);
              void supabase.from("moderation_terms").delete().eq("id", term.id).then(({ error: deleteError }) => {
                if (deleteError) { setError(resolveErrorMessage(new LayerTalkError("moderation_failed", deleteError.message), locale)); return; }
                setTerms((current) => current.filter((item) => item.id !== term.id));
              });
            }} className="bg-surface-strong text-text-muted flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]">{term.term}<Trash2 size={10} /></button>)}
          </div>
        </div>

        {/* 承認待ちのキューは PendingApprovalQueue（コントロール窓の最上部）が持つ。
            発表中はこのパネルまでスクロールしていられないので、ここには置かない。 */}

        {comments.some((comment) => comment.status === "approved") && (
          <div className="border-border border-t pt-4">
            <p className="text-[13px] font-bold">{ja ? "最近のコメント" : "Recent comments"}</p>
            <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
              {comments.filter((comment) => comment.status === "approved").slice(0, 8).map((comment) => (
                <div key={comment.id} className="bg-surface-strong flex items-start gap-2 rounded-[11px] px-2.5 py-2">
                  <p className="min-w-0 flex-1 text-[10px] leading-relaxed">{comment.content}</p>
                  {comment.is_question && <button type="button" onClick={() => void moderateComment(supabase, comment.id, comment.question_status === "answered" ? "mark_open" : "mark_answered")} className={comment.question_status === "answered" ? "text-online text-[9px] font-bold" : "text-text-faint text-[9px] font-bold"}>{comment.question_status === "answered" ? (ja ? "回答済" : "Answered") : (ja ? "未回答" : "Open")}</button>}
                  <button type="button" aria-label={ja ? "非表示" : "Hide"} onClick={() => void moderateComment(supabase, comment.id, "hide")} className="text-text-faint hover:text-like shrink-0"><EyeOff size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {branding && (
          <div className="border-border border-t pt-4">
            <p className="flex items-center gap-2 text-[13px] font-bold"><Sparkles size={14} />{ja ? "ブランド" : "Brand"}</p>
            {/* ブランド設定が効くのは参加QRカードの中だけ。しかもスライドに出るのは
                発表中に「参加QRを表示」を ON にしたときだけなので、ここで実物を見せる。 */}
            <p className="text-text-faint mt-1 text-[10px] leading-relaxed">
              {ja
                ? "ロゴ・色・LayerTalk表記は、スライドに出る参加QRカードに反映されます。実物は下のプレビューのとおりです。"
                : "The logo, colour and LayerTalk name apply to the join QR card shown on your slides. The preview below is the real thing."}
            </p>
            <div className="mt-2 flex justify-center">
              <JoinQrCard
                url={buildAudienceUrl(roomCode) || "https://layertalk.app"}
                code={roomCode ?? "------"}
                size={112}
                label={t.qr.scan}
                brandColor={branding.brand_color}
                logoUrl={logoUrl}
                hideLayerTalk={branding.hide_layertalk_branding}
              />
            </div>
            <p className="text-text-faint mt-2 text-[10px] leading-relaxed">
              {display.showJoinQr
                ? (ja ? "「スライドに参加QRを表示」はオンです。発表中は左下に出ます。" : "“Show join QR on slides” is on. It appears at the bottom-left while presenting.")
                : (ja ? "「スライドに参加QRを表示」がオフのあいだは、スライドには出ません。" : "While “Show join QR on slides” is off, it never appears on the slides.")}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <input type="color" value={branding.brand_color} onChange={(event) =>
                void patchBranding({ brand_color: event.target.value.toUpperCase() })
              } className="h-9 w-12 rounded border-0 bg-transparent" />
              <ToggleRow label={ja ? "LayerTalk表記を隠す" : "Hide LayerTalk name"} value={branding.hide_layertalk_branding} onChange={(value) =>
                void patchBranding({ hide_layertalk_branding: value })
              } />
            </div>
            <label className={`border-border mt-3 flex items-center justify-center rounded-[12px] border px-3 py-2 text-[10px] font-bold ${logoBusy ? "opacity-50" : "hover:bg-surface-strong cursor-pointer"}`}>
              {logoBusy
                ? (ja ? "処理中…" : "Working…")
                : branding.logo_path ? (ja ? "ロゴを変更" : "Replace logo") : (ja ? "ロゴを追加" : "Add a logo")}
              {/* accept を PNG に絞らない。toLogoPng が何を渡されても PNG に焼き直すので、
                  ここで絞ると「変換できるのに選べない」だけになる。 */}
              <input type="file" accept="image/*" disabled={logoBusy} className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                // 同じファイルを選び直せるように必ず空にする。残すと2回目の onChange が飛ばない。
                event.target.value = "";
                if (file) void uploadLogo(file);
              }} />
            </label>
            {logoDone && <p className="text-online mt-2 text-[10px]">{ja ? "ロゴを保存しました" : "Logo saved"}</p>}
          </div>
        )}

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
            <p className="text-like mt-1 text-[10px]">{ja ? "LayerTalkの画面収録をオンにして、LayerTalkを再起動してください。" : "Turn on Screen Recording for LayerTalk, then restart LayerTalk."}</p>
          )}
          {captureEnabled && capturePermission?.supported && !capturePermission.granted && !capturePermission.restartRequired && (
            <p className="text-like mt-1 text-[10px]">{ja ? "システム設定 → プライバシーとセキュリティ → 画面収録でLayerTalkをオンにしてください。発表自体はそのまま開始できます。" : "In System Settings, open Privacy & Security → Screen Recording and turn on LayerTalk. Presenting still works without it."}</p>
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

  return (
    <div className="mt-2 space-y-2">
      {finished.map((session) => {
        const captureCount = captureCounts[session.id];
        return <div key={session.id} className="border-border flex items-center gap-2 rounded-[12px] border px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px]">{new Date(session.started_at).toLocaleString(ja ? "ja-JP" : "en-US")}</span>
          {captureCount === undefined && <span className="text-text-faint text-[9px]">{ja ? "画像を確認中…" : "Checking images…"}</span>}
          {captureCount === "error" && <span className="text-like max-w-36 text-right text-[9px]">{ja ? "画像を確認できません" : "Could not check images"}</span>}
          {captureCount === 0 && <span className="text-text-faint max-w-40 text-right text-[9px] leading-snug">{ja ? "スライド画像がないため出力できません" : "No slide images; report unavailable"}</span>}
          {typeof captureCount === "number" && captureCount > 0 && (
            <button type="button" disabled={busy !== null} onClick={() => void run(session)}
              className={`flex items-center gap-1 text-[9px] font-bold disabled:opacity-40 ${saved === session.id ? "text-online" : "text-text-muted"}`}>
              {saved === session.id ? <Check size={11} /> : <Download size={11} />}
              HTML
            </button>
          )}
        </div>;
      })}
      {finished.length === 0 && <p className="text-text-faint text-[10px]">{ja ? "発表を終了するとここに表示されます。" : "Reports appear after a presentation ends."}</p>}
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
