import {
  createRoom,
  customStampKey,
  deleteRoomStamp,
  endPresentationSession,
  LOCALES,
  normalizeRoomCode,
  resolveErrorMessage,
  ROOM_CODE_PATTERN,
  roomStampUrl,
  resumeRoom,
  setRoomLanguage,
  startPresentationSession,
  useComments,
  useRoomStamps,
  type Locale,
  type RoomStamp,
} from "@layertalk/shared";
import { motion } from "motion/react";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  MessageSquareText,
  Monitor,
  MousePointerClick,
  Play,
  PauseCircle,
  Repeat,
  Sparkles,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { STAMP_EMOJIS } from "@layertalk/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { JoinQrCard } from "../components/JoinQrCard";
import { EventPassPanel } from "../components/EventPassPanel";
import { PresenterAuth } from "../components/PresenterAuth";
import { useDocumentLang, useMessages, type Messages } from "../i18n";
import { audienceUrl as buildAudienceUrl } from "../lib/audience";
import {
  loadSettings,
  OVERLAY_DEFAULTS,
  saveSettings,
  sendTestComment,
  sendTestStamp,
  type PresenterSettings,
} from "../lib/settings";
import { supabase } from "../lib/supabase";
import {
  getPresentationState,
  listMonitors,
  onPresentationStateChanged,
  peekOverlay,
  refitOverlay,
  setAppLanguage,
  setOverlayMonitor,
  startCurrentWindowDragging,
  startPresentation,
  stopPresentation,
  type MonitorInfo,
} from "../lib/tauri";

const PEEK_MS = 2600;

export function ControlWindow() {
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [live, setLive] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const t = useMessages(settings.language);
  useDocumentLang(settings.language);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session && !data.session.user.is_anonymous));
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session && !session.user.is_anonymous));
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const { comments, status } = useComments({
    client: settings.roomId ? supabase : null,
    roomId: settings.roomId,
    includeModerated: true,
  });

  const { stamps, removeLocal: removeStampLocal, addLocal: addStampLocal } = useRoomStamps({
    client: settings.roomId ? supabase : null,
    roomId: settings.roomId,
  });

  // 発表状態（トレイからの終了もここに届く）
  useEffect(() => {
    void getPresentationState().then(setLive);
    const unlisten = onPresentationStateChanged(setLive);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // トレイのラベルは Rust 側が起動時に組み立てる。Rust は言語を永続化しないので、
  // localStorage に残っている選択を起動のたびに渡し直す。
  useEffect(() => {
    void setAppLanguage(settings.language);
    // 変更時は handleChangeLanguage が呼ぶので、ここは起動時の 1 回だけでよい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadMonitors = useCallback(() => {
    void listMonitors().then(setMonitors);
  }, []);

  // 起動時と、ディスプレイの抜き差しで変わるのでウィンドウが前面に来たときにも取り直す
  useEffect(() => {
    reloadMonitors();
    window.addEventListener("focus", reloadMonitors);
    return () => window.removeEventListener("focus", reloadMonitors);
  }, [reloadMonitors]);

  const update = useCallback((patch: Partial<PresenterSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  /**
   * localStorage に残っているルームが DB にまだ在るかを、サインイン後に 1 度だけ確かめる。
   *
   * `loadSettings` は前回のルームをそのまま返すだけで、行が実在するかは見ていない。
   * マイグレーションで `rooms` を消したあとなどは、画面にはコードが出ているのに
   * 何も繋がらない幽霊状態になる（Event Pass の購入も 404 で弾かれ、
   * 「購入画面を開けませんでした」としか出ない）。無いと分かったときだけ手元の記憶を捨てる。
   */
  const verifiedRoomCode = useRef<string | null>(null);
  useEffect(() => {
    const code = settings.roomCode;
    // 発表中は照合しない。ここでルームを外すとコメントが流れなくなる。
    if (!authReady || !signedIn || !code || live) return;
    if (verifiedRoomCode.current === code) return;
    verifiedRoomCode.current = code;

    void resumeRoom(supabase, code)
      // タイトルの変更もここで拾い直せる。
      .then((room) => update({ roomId: room.id, roomCode: room.code, roomTitle: room.title }))
      .catch((err: unknown) => {
        // instanceof はバンドルをまたぐと壊れることがあるので形で見る（errors.ts と同じ判定）。
        const gone = typeof err === "object" && err !== null
          && (err as { code?: unknown }).code === "room_not_found";
        if (!gone) {
          // 通信失敗でルームを捨てない。次の起動でやり直す。
          verifiedRoomCode.current = null;
          return;
        }
        update({
          roomId: null,
          roomCode: null,
          roomTitle: null,
          presentationSessionId: null,
          // 消えたルームへ「1タップで戻る」ボタンを出しても踏めないので残さない。
          previousRoomCode: null,
        });
        setError(resolveErrorMessage(err, settings.language));
      });
  }, [authReady, signedIn, settings.roomCode, settings.language, live, update]);

  // The tray can stop a presentation without going through the main button.
  // Close the database session as the native state transitions to stopped so
  // report windows and paid-feature snapshots do not remain open indefinitely.
  const previousLive = useRef(false);
  useEffect(() => {
    if (previousLive.current && !live && settings.presentationSessionId) {
      void endPresentationSession(supabase, settings.presentationSessionId).catch(() => undefined);
      update({ presentationSessionId: null, emergencyPaused: false });
    }
    previousLive.current = live;
  }, [live, settings.presentationSessionId, update]);

  const handlePickMonitor = (name: string | null) => {
    update({ monitorName: name });
    void setOverlayMonitor(name);
    // 名前だけでは物理的にどの画面か分からないので、選んだ先に実物を出して確認させる
    void peekOverlay(name, PEEK_MS);
  };

  const handleToggleLive = async () => {
    if (live) {
      await stopPresentation();
      if (settings.presentationSessionId) {
        void endPresentationSession(supabase, settings.presentationSessionId).catch(() => undefined);
      }
      update({ presentationSessionId: null, emergencyPaused: false });
    } else {
      if (settings.roomId) {
        try {
          const session = await startPresentationSession(supabase, settings.roomId);
          update({ presentationSessionId: session.id, emergencyPaused: false });
        } catch {
          // 通信障害で本番開始そのものを止めない。ローカルオーバーレイは開始できる。
          update({ presentationSessionId: crypto.randomUUID(), emergencyPaused: false });
        }
      }
      await startPresentation(settings.monitorName);
    }
  };

  const handleCreateRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(supabase, { language: settings.language });
      update({ roomId: room.id, roomCode: room.code, roomTitle: room.title });
    } catch (err) {
      setError(resolveErrorMessage(err, settings.language));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 入力欄の代わりにコードを渡せる。setJoinCode してから state を読む書き方は
   * 更新が同期実行されないので成立しない。
   */
  const handleJoin = async (codeArg?: string) => {
    const code = normalizeRoomCode(codeArg ?? joinCode);
    if (!ROOM_CODE_PATTERN.test(code)) {
      setError(t.room.codeLength);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const room = await resumeRoom(supabase, code);
      update({ roomId: room.id, roomCode: room.code, roomTitle: room.title });
      setJoinCode("");
      // 発表者の設定を正とする。ルーム側の値を読み込むと、ルームを繋ぎ直すたびに
      // トグルが独りでに動いたように見えてしまう。
      if (room.language !== settings.language) {
        void setRoomLanguage(supabase, room.id, settings.language).catch(() => {
          // 観客側の言語が揃わないだけなので、発表の妨げにはしない。
        });
      }
    } catch (err) {
      setError(resolveErrorMessage(err, settings.language));
    } finally {
      setBusy(false);
    }
  };

  /**
   * ルームの接続を外して、作成／参加のカードに戻す。
   * ルーム自体は DB に残すので、コードを入れればいつでも再開できる。
   */
  const handleSwitchRoom = () => {
    // 発表中に外すとコメントが流れなくなる。開始ボタンの側から live になった場合も塞ぐ。
    if (live) {
      setConfirmSwitch(false);
      return;
    }
    update({
      roomId: null,
      roomCode: null,
      roomTitle: null,
      previousRoomCode: settings.roomCode,
    });
    setConfirmSwitch(false);
    setError(null);
  };

  const audienceUrl = buildAudienceUrl(settings.roomCode);

  /**
   * スライドの上の QR を出し入れする。発表前は ON にしても何も見えないので、
   * モニター選択と同じように peek で置き場所を実物で見せる。
   */
  const handleToggleJoinQr = () => {
    const next = !settings.showJoinQr;
    update({ showJoinQr: next });
    if (next && !live) void peekOverlay(settings.monitorName, PEEK_MS);
  };

  /**
   * カスタムスタンプを消す。先に画面から消して、失敗したら戻す。
   * 不適切な画像を消す操作なので、通信の往復を待たせない。
   */
  const handleDeleteStamp = (stamp: RoomStamp) => {
    removeStampLocal(stamp.id);
    void deleteRoomStamp(supabase, stamp).catch((err) => {
      addStampLocal(stamp);
      setError(resolveErrorMessage(err, settings.language));
    });
  };

  const handleCopy = async () => {
    if (!audienceUrl) return;
    await navigator.clipboard.writeText(audienceUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  /**
   * 表示言語を変える。手元の 3 つの窓・トレイ・ルームの 3 方向へ配る。
   *
   * 手元は即座に切り替え、DB とトレイは追いかけさせる。ルームへの保存に失敗しても
   * 発表者の画面は英語のまま使えるべきなので、エラーは出すだけで巻き戻さない。
   */
  const handleChangeLanguage = (language: Locale) => {
    if (language === settings.language) return;
    update({ language });
    void setAppLanguage(language);
    if (settings.roomId) {
      void setRoomLanguage(supabase, settings.roomId, language).catch((err) => {
        // 切り替えた後の言語で見せる。手元はもう切り替わっているので混ざらない。
        setError(resolveErrorMessage(err, language));
      });
    }
  };

  const handleEmptyAreaMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button === 0 && event.target === event.currentTarget) {
      void startCurrentWindowDragging();
    }
  };

  if (!authReady) {
    return <div className="bg-bg text-text flex h-screen items-center justify-center"><Loader2 size={20} className="animate-spin" /></div>;
  }

  if (!signedIn) {
    return (
      <div className="bg-bg text-text h-screen overflow-y-auto">
        <PresenterAuth locale={settings.language} onSignedIn={() => setSignedIn(true)} />
      </div>
    );
  }

  return (
    <div className="bg-bg text-text flex h-screen flex-col overflow-hidden">
      {/* titleBarStyle: Overlay なので、信号機ボタンぶんの余白と
          ドラッグ領域を自前で用意する */}
      <div
        onMouseDown={(event) => {
          if (event.button === 0) void startCurrentWindowDragging();
        }}
        className="border-border relative flex h-11 shrink-0 items-center justify-center border-b"
      >
        <span className="text-text-muted pointer-events-none text-[13px] font-semibold">
          LayerTalk
        </span>
        <LanguageToggle
          label={t.header.language}
          value={settings.language}
          onChange={handleChangeLanguage}
        />
      </div>

      <div
        className="flex-1 space-y-5 overflow-y-auto p-4"
        onMouseDown={handleEmptyAreaMouseDown}
      >
        {/* ------------------------------------------------------ 開始 / 終了 */}
        <section className="space-y-2">
          <motion.button
            type="button"
            onClick={() => void handleToggleLive()}
            disabled={!settings.roomId}
            whileTap={settings.roomId ? { scale: 0.98 } : undefined}
            transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
            className={`lt-tap flex w-full items-center justify-center gap-2.5 rounded-[18px] px-4 py-4 text-[15px] font-bold text-white disabled:opacity-35 ${
              live
                ? "bg-[var(--lt-like)]"
                : "bg-[linear-gradient(135deg,#6b8aff,#b47cff)] shadow-[var(--lt-shadow-glow)]"
            }`}
          >
            {live ? <Square size={16} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            {live ? t.live.stop : t.live.start}
          </motion.button>

          <p className="text-text-faint text-center text-[11px] leading-relaxed">
            {!settings.roomId
              ? t.live.needsRoom
              : live
                ? t.live.showingOn(settings.monitorName ?? t.monitor.primary)
                : t.live.hidden}
          </p>
        </section>

        {live && (
          <section>
            <button
              type="button"
              onClick={() => update({ emergencyPaused: !settings.emergencyPaused })}
              className={`lt-tap flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-3 text-[13px] font-bold ${
                settings.emergencyPaused ? "border-online/40 bg-online/10 text-online" : "border-like/35 bg-like/8 text-like"
              }`}
            >
              <PauseCircle size={16} />
              {settings.emergencyPaused ? (settings.language === "ja" ? "リアクションを再開" : "Resume reactions") : (settings.language === "ja" ? "リアクションを緊急停止" : "Stop all reactions")}
            </button>
          </section>
        )}

        {/* ---------------------------------------------------------- ルーム */}
        <section className="space-y-3">
          <SectionLabel>{t.room.section}</SectionLabel>

          {settings.roomCode ? (
            <div className="border-border bg-bg-elev space-y-3 rounded-[20px] border p-4">
              <div>
                <div className="text-text-faint text-[11px] font-semibold tracking-wider">
                  {t.room.joinCode}
                </div>
                <div className="lt-num mt-1 text-[34px] leading-none font-bold tracking-[0.14em]">
                  {settings.roomCode}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={15} className="text-online" />
                    {t.room.copied}
                  </>
                ) : (
                  <>
                    <Copy size={15} />
                    {t.room.copyUrl}
                  </>
                )}
              </button>

              <div className="text-text-faint truncate text-[11px]">{audienceUrl}</div>

              {audienceUrl && (
                <div className="border-border space-y-3 border-t pt-3">
                  <div className="flex justify-center">
                    <JoinQrCard
                      url={audienceUrl}
                      code={settings.roomCode}
                      size={132}
                      label={t.qr.scan}
                    />
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showJoinQr}
                    onClick={handleToggleJoinQr}
                    className={`lt-tap flex w-full items-center justify-between rounded-[14px] border px-3 py-2.5 text-left transition-colors ${
                      settings.showJoinQr
                        ? "border-brand/40 bg-brand/12"
                        : "border-border hover:bg-surface-strong"
                    }`}
                  >
                    <span className="text-[13px] font-semibold">{t.room.showQr}</span>
                    <span
                      aria-hidden
                      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
                      style={{
                        background: settings.showJoinQr
                          ? "var(--lt-brand)"
                          : "var(--lt-border-strong)",
                      }}
                    >
                      <motion.span
                        className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm"
                        animate={{ left: settings.showJoinQr ? 19 : 3 }}
                        transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
                      />
                    </span>
                  </button>

                  <p className="text-text-faint text-[11px] leading-relaxed">
                    {settings.showJoinQr ? t.room.qrOn : t.room.qrOff}
                  </p>
                </div>
              )}

              <div className="border-border flex items-center justify-between border-t pt-3">
                <StatusPill status={status} labels={t.status} />
                <span className="text-text-muted lt-num text-[12px]">
                  {t.room.commentCount(comments.length)}
                </span>
              </div>

              {/* 切り替えは押し間違えると参加コードが変わるので、その場で一段確認する。
                  ネイティブの confirm() は webview を止めてしまうので使わない。 */}
              <div className="border-border border-t pt-3">
                {confirmSwitch && !live ? (
                  <div className="space-y-2">
                    <p className="text-text-muted text-[12px] leading-relaxed">
                      {t.room.switchWarning}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmSwitch(false)}
                        className="lt-tap border-border hover:bg-surface-strong flex-1 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
                      >
                        {t.room.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={handleSwitchRoom}
                        className="lt-tap flex-1 rounded-[14px] bg-[var(--lt-like)] px-3 py-2.5 text-[13px] font-semibold text-white transition-transform active:scale-[0.97]"
                      >
                        {t.room.switchConfirm}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmSwitch(true)}
                      disabled={live}
                      className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40"
                    >
                      <Repeat size={15} />
                      {t.room.switch}
                    </button>
                    {live && (
                      <p className="text-text-faint mt-2 text-[11px] leading-relaxed">
                        {t.room.switchBlocked(t.live.stop)}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="border-border bg-bg-elev space-y-3 rounded-[20px] border p-4">
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={busy}
                className="lt-tap flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(135deg,#6b8aff,#b47cff)] px-3 py-3 text-[14px] font-semibold text-white shadow-[var(--lt-shadow-glow)] transition-transform active:scale-[0.97] disabled:opacity-60"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {t.room.create}
              </button>

              <div className="flex items-center gap-2">
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => event.key === "Enter" && handleJoin()}
                  placeholder={t.room.joinPlaceholder}
                  maxLength={6}
                  className="border-border focus:border-border-strong lt-num placeholder:text-text-faint min-w-0 flex-1 rounded-[14px] border bg-transparent px-3 py-2.5 text-[14px] tracking-[0.12em] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleJoin()}
                  disabled={busy || joinCode.length < 6}
                  className="lt-tap border-border hover:bg-surface-strong shrink-0 rounded-[14px] border px-4 py-2.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  {t.room.join}
                </button>
              </div>

              {settings.previousRoomCode && (
                <button
                  type="button"
                  onClick={() => handleJoin(settings.previousRoomCode ?? undefined)}
                  disabled={busy}
                  className="lt-tap text-text-muted hover:text-text flex w-full items-center justify-center gap-1.5 text-[12px] font-medium transition-colors disabled:opacity-40"
                >
                  <Undo2 size={13} />
                  {t.room.backToPrevious.before}
                  <span className="lt-num tracking-[0.12em]">{settings.previousRoomCode}</span>
                  {t.room.backToPrevious.after}
                </button>
              )}
            </div>
          )}

          {error && <p className="text-like text-[12px]">{error}</p>}
        </section>

        {settings.roomId && (
          <EventPassPanel
            roomId={settings.roomId}
            roomCode={settings.roomCode}
            roomTitle={settings.roomTitle}
            locale={settings.language}
            live={live}
            comments={comments}
            display={{ displayMode: settings.displayMode, showJoinQr: settings.showJoinQr, allowCustomStamps: settings.allowCustomStamps }}
            onApplyPreset={(preset) => update({
              displayMode: preset.display_mode,
              showJoinQr: preset.show_join_qr,
              allowCustomStamps: preset.allow_custom_stamps,
            })}
          />
        )}

        {/* ------------------------------------------------------ 表示モニター */}
        <section className="space-y-3">
          <SectionLabel>{t.monitor.section}</SectionLabel>

          <div className="border-border bg-bg-elev overflow-hidden rounded-[16px] border">
            <MonitorRow
              label={t.monitor.followPrimary}
              sub={t.monitor.followPrimarySub}
              selected={settings.monitorName === null}
              onSelect={() => handlePickMonitor(null)}
            />
            {monitors.map((monitor) => (
              <MonitorRow
                key={monitor.name}
                label={monitor.name}
                sub={`${monitor.width}×${monitor.height}${monitor.is_primary ? t.monitor.primarySuffix : ""}`}
                selected={settings.monitorName === monitor.name}
                onSelect={() => handlePickMonitor(monitor.name)}
              />
            ))}
          </div>

          <p className="text-text-faint text-[11px] leading-relaxed">
            {t.monitor.hint}
            {monitors.length <= 1 && t.monitor.hintSingle}
          </p>
        </section>

        {!live && (
          <button type="button" onClick={() => void supabase.auth.signOut()} className="text-text-faint hover:text-text flex w-full items-center justify-center gap-1.5 py-2 text-[11px]">
            <LogOut size={12} />{settings.language === "ja" ? "ログアウト" : "Sign out"}
          </button>
        )}

        {/* ------------------------------------------------------ 表示スタイル */}
        <section className="space-y-3">
          <SectionLabel>{t.display.section}</SectionLabel>

          <div className="border-border bg-bg-elev relative grid grid-cols-2 gap-1 rounded-[16px] border p-1">
            {(["flow", "bubble"] as const).map((mode) => {
              const active = settings.displayMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update({ displayMode: mode })}
                  className="lt-tap relative rounded-[12px] px-3 py-2.5 text-[13px] font-semibold"
                >
                  {active && (
                    <motion.span
                      layoutId="display-mode-indicator"
                      className="absolute inset-0 rounded-[12px] bg-[linear-gradient(135deg,#6b8aff,#b47cff)]"
                      transition={{ type: "spring", stiffness: 220, damping: 26 }}
                    />
                  )}
                  <span className={`relative ${active ? "text-white" : "text-text-muted"}`}>
                    {mode === "flow" ? t.display.flow : t.display.bubble}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const previewMs =
                settings.displayMode === "bubble"
                  ? OVERLAY_DEFAULTS.bubbleDurationSec * 1000 + 1200
                  : OVERLAY_DEFAULTS.flowDurationSec * 1000 + 2200;
              if (!live) void peekOverlay(settings.monitorName, previewMs);
              void sendTestComment(t.display.testText);
            }}
            className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
          >
            <MessageSquareText size={15} />
            {t.display.test}
          </button>
        </section>

        {/* ---------------------------------------------------------- スタンプ */}
        <section className="space-y-3">
          <SectionLabel>{t.stamp.section}</SectionLabel>

          <button
            type="button"
            onClick={() => {
              // 開始前はオーバーレイが隠れているので、確認のあいだだけ出す
              if (!live) {
                void peekOverlay(
                  settings.monitorName,
                  OVERLAY_DEFAULTS.stampDurationSec * 1000 + 1500,
                );
              }
              // カスタムがあれば、それも混ぜて実物の見え方を確かめられるようにする
              const custom = settings.allowCustomStamps ? stamps : [];
              const pool = [
                ...STAMP_EMOJIS,
                ...custom.map((stamp) => customStampKey(stamp.id)),
              ];
              void sendTestStamp({
                emoji: pool[Math.floor(Math.random() * pool.length)],
                count: 6,
              });
            }}
            className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
          >
            <Sparkles size={15} />
            {t.stamp.test}
          </button>
          <p className="text-text-faint text-[11px] leading-relaxed">
            {t.stamp.hint}
            {!live && t.stamp.hintPeek}
          </p>
        </section>

        {/* -------------------------------------------- カスタムスタンプ */}
        <section className="space-y-3">
          <SectionLabel>{t.customStamp.section}</SectionLabel>

          <div className="border-border bg-bg-elev space-y-3 rounded-[20px] border p-4">
            <button
              type="button"
              role="switch"
              aria-checked={settings.allowCustomStamps}
              onClick={() => update({ allowCustomStamps: !settings.allowCustomStamps })}
              className={`lt-tap flex w-full items-center justify-between rounded-[14px] border px-3 py-2.5 text-left transition-colors ${
                settings.allowCustomStamps
                  ? "border-brand/40 bg-brand/12"
                  : "border-border hover:bg-surface-strong"
              }`}
            >
              <span className="text-[13px] font-semibold">{t.customStamp.allow}</span>
              <span
                aria-hidden
                className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
                style={{
                  background: settings.allowCustomStamps
                    ? "var(--lt-brand)"
                    : "var(--lt-border-strong)",
                }}
              >
                <motion.span
                  className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm"
                  animate={{ left: settings.allowCustomStamps ? 19 : 3 }}
                  transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
                />
              </span>
            </button>

            <p className="text-text-faint text-[11px] leading-relaxed">
              {settings.allowCustomStamps ? t.customStamp.allowOn : t.customStamp.allowOff}
            </p>

            {!settings.roomId ? (
              <p className="text-text-faint text-[11px]">{t.customStamp.needsRoom}</p>
            ) : stamps.length === 0 ? (
              <p className="text-text-faint border-border border-t pt-3 text-[11px] leading-relaxed">
                {t.customStamp.empty}
              </p>
            ) : (
              <div className="border-border space-y-2 border-t pt-3">
                <div className="grid grid-cols-5 gap-2">
                  {stamps.map((stamp) => (
                    <div key={stamp.id} className="relative">
                      <div className="border-border bg-surface-strong flex aspect-square items-center justify-center rounded-[12px] border p-1.5">
                        <img
                          src={roomStampUrl(supabase, stamp.path)}
                          alt=""
                          draggable={false}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={t.customStamp.delete}
                        onClick={() => handleDeleteStamp(stamp)}
                        className="lt-tap bg-bg-elev border-border text-text-muted hover:border-like hover:text-like absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-text-faint text-[11px] leading-relaxed">
                  {t.customStamp.deleteHint}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------ オーバーレイ */}
        <section className="space-y-3">
          <SectionLabel>{t.overlay.section}</SectionLabel>

          <div className="border-border bg-bg-elev flex items-start gap-2 rounded-[16px] border px-4 py-3">
            <MousePointerClick size={14} className="text-online mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-medium">{t.overlay.clickThrough}</p>
              <p className="text-text-faint mt-0.5 text-[11px] leading-relaxed">
                {t.overlay.clickThroughHint}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              reloadMonitors();
              void refitOverlay();
            }}
            className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
          >
            <Monitor size={15} />
            {t.overlay.refit}
          </button>
          <p className="text-text-faint text-[11px] leading-relaxed">
            {t.overlay.refitHint}
          </p>
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 部品

/** 各言語は**その言語自身の名前**で出す。ここだけは翻訳しない。 */
const LOCALE_NAMES: Record<Locale, string> = { ja: "日本語", en: "English" };
const LOCALE_SHORT: Record<Locale, string> = { ja: "JA", en: "EN" };

type LanguageToggleProps = {
  label: string;
  value: Locale;
  onChange: (locale: Locale) => void;
};

/**
 * タイトルバー右端の JA/EN トグル。
 *
 * セクションの中ではなくタイトルバーに置いてあるのは、本文がスクロールしても
 * 常に見えている場所がここだけだから（発表の直前に一発で切り替えたい）。
 * 親はドラッグ領域なので、`onMouseDown` を止めないと押すたびに窓が動く。
 */
function LanguageToggle({ label, value, onChange }: LanguageToggleProps) {
  return (
    <div
      role="group"
      aria-label={label}
      onMouseDown={(event) => event.stopPropagation()}
      className="border-border bg-bg-elev absolute right-2 flex gap-0.5 rounded-full border p-0.5"
    >
      {LOCALES.map((locale) => {
        const active = value === locale;
        return (
          <button
            key={locale}
            type="button"
            aria-label={LOCALE_NAMES[locale]}
            aria-pressed={active}
            onClick={() => onChange(locale)}
            className="lt-tap relative rounded-full px-2 py-0.5 text-[11px] font-bold"
          >
            {active && (
              <motion.span
                // display-mode-indicator と共有してはいけない。同じ id の要素が
                // 2 つ生きていると、ピルが互いのあいだを飛ぶ。
                layoutId="language-indicator"
                className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#6b8aff,#b47cff)]"
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
              />
            )}
            <span className={`relative ${active ? "text-white" : "text-text-faint"}`}>
              {LOCALE_SHORT[locale]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type MonitorRowProps = {
  label: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
};

function MonitorRow({ label, sub, selected, onSelect }: MonitorRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="lt-tap border-border hover:bg-surface-strong flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0"
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-brand" : "border-border-strong"
        }`}
      >
        {selected && (
          <motion.span
            layoutId="monitor-dot"
            className="bg-brand h-[9px] w-[9px] rounded-full"
            transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
          />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="text-text-faint lt-num block text-[11px]">{sub}</span>
      </span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-text-faint text-[11px] font-bold tracking-[0.12em] uppercase">
      {children}
    </h2>
  );
}

type StatusPillProps = {
  status: "connecting" | "connected" | "disconnected";
  labels: Messages["status"];
};

function StatusPill({ status, labels }: StatusPillProps) {
  const color = {
    connecting: "var(--lt-text-faint)",
    connected: "var(--lt-online)",
    disconnected: "var(--lt-like)",
  }[status];

  const text = labels[status];

  return (
    <span className="text-text-muted flex items-center gap-1.5 text-[12px] font-medium">
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        animate={status === "connecting" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={status === "connecting" ? { duration: 1.2, repeat: Infinity } : undefined}
      />
      {text}
    </span>
  );
}
