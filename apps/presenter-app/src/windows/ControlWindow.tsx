import {
  createRoom,
  findRoomByCode,
  normalizeRoomCode,
  ROOM_CODE_PATTERN,
  useComments,
} from "@layertalk/shared";
import { motion } from "motion/react";
import {
  Check,
  Copy,
  Loader2,
  MessageSquareText,
  Monitor,
  MousePointerClick,
  Play,
  Repeat,
  Sparkles,
  Square,
  Undo2,
} from "lucide-react";
import { STAMP_EMOJIS } from "@layertalk/shared";
import { useCallback, useEffect, useState } from "react";

import { JoinQrCard } from "../components/JoinQrCard";
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

  const { comments, status } = useComments({
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

  const handlePickMonitor = (name: string | null) => {
    update({ monitorName: name });
    void setOverlayMonitor(name);
    // 名前だけでは物理的にどの画面か分からないので、選んだ先に実物を出して確認させる
    void peekOverlay(name, PEEK_MS);
  };

  const handleToggleLive = () => {
    if (live) {
      void stopPresentation();
    } else {
      void startPresentation(settings.monitorName);
    }
  };

  const handleCreateRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(supabase);
      update({ roomId: room.id, roomCode: room.code, roomTitle: room.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ルームの作成に失敗しました");
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
      setError("ルームコードは6文字です");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const room = await findRoomByCode(supabase, code);
      if (!room) {
        setError("そのコードのルームは見つかりませんでした");
        return;
      }
      update({ roomId: room.id, roomCode: room.code, roomTitle: room.title });
      setJoinCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ルームの取得に失敗しました");
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

  const handleCopy = async () => {
    if (!audienceUrl) return;
    await navigator.clipboard.writeText(audienceUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleEmptyAreaMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button === 0 && event.target === event.currentTarget) {
      void startCurrentWindowDragging();
    }
  };

  return (
    <div className="bg-bg text-text flex h-screen flex-col overflow-hidden">
      {/* titleBarStyle: Overlay なので、信号機ボタンぶんの余白と
          ドラッグ領域を自前で用意する */}
      <div
        onMouseDown={(event) => {
          if (event.button === 0) void startCurrentWindowDragging();
        }}
        className="border-border flex h-11 shrink-0 items-center justify-center border-b"
      >
        <span className="text-text-muted pointer-events-none text-[13px] font-semibold">
          LayerTalk
        </span>
      </div>

      <div
        className="flex-1 space-y-5 overflow-y-auto p-4"
        onMouseDown={handleEmptyAreaMouseDown}
      >
        {/* ------------------------------------------------------ 開始 / 終了 */}
        <section className="space-y-2">
          <motion.button
            type="button"
            onClick={handleToggleLive}
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
            {live ? "プレゼンを終了" : "プレゼンを開始"}
          </motion.button>

          <p className="text-text-faint text-center text-[11px] leading-relaxed">
            {!settings.roomId
              ? "先にルームを作成してください"
              : live
                ? `${settings.monitorName ?? "主ディスプレイ"} に表示中。開始後に届いたコメントだけが流れます。`
                : "開始するまでオーバーレイはどこにも表示されません。"}
          </p>
        </section>

        {/* ---------------------------------------------------------- ルーム */}
        <section className="space-y-3">
          <SectionLabel>ルーム</SectionLabel>

          {settings.roomCode ? (
            <div className="border-border bg-bg-elev space-y-3 rounded-[20px] border p-4">
              <div>
                <div className="text-text-faint text-[11px] font-semibold tracking-wider">
                  参加コード
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
                    コピーしました
                  </>
                ) : (
                  <>
                    <Copy size={15} />
                    観客用URLをコピー
                  </>
                )}
              </button>

              <div className="text-text-faint truncate text-[11px]">{audienceUrl}</div>

              {audienceUrl && (
                <div className="border-border space-y-3 border-t pt-3">
                  <div className="flex justify-center">
                    <JoinQrCard url={audienceUrl} code={settings.roomCode} size={132} />
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
                    <span className="text-[13px] font-semibold">スライドに参加QRを表示</span>
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
                    {settings.showJoinQr
                      ? "発表中はスライド左下に出ます。"
                      : "オンにすると発表中もスライドの左下に QR を重ねます。"}
                  </p>
                </div>
              )}

              <div className="border-border flex items-center justify-between border-t pt-3">
                <StatusPill status={status} />
                <span className="text-text-muted lt-num text-[12px]">
                  コメント {comments.length} 件
                </span>
              </div>

              {/* 切り替えは押し間違えると参加コードが変わるので、その場で一段確認する。
                  ネイティブの confirm() は webview を止めてしまうので使わない。 */}
              <div className="border-border border-t pt-3">
                {confirmSwitch && !live ? (
                  <div className="space-y-2">
                    <p className="text-text-muted text-[12px] leading-relaxed">
                      切り替えると参加コードが変わります。このルームはコードで再開できます。
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmSwitch(false)}
                        className="lt-tap border-border hover:bg-surface-strong flex-1 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
                      >
                        やめる
                      </button>
                      <button
                        type="button"
                        onClick={handleSwitchRoom}
                        className="lt-tap flex-1 rounded-[14px] bg-[var(--lt-like)] px-3 py-2.5 text-[13px] font-semibold text-white transition-transform active:scale-[0.97]"
                      >
                        切り替える
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
                      ルームを切り替える
                    </button>
                    {live && (
                      <p className="text-text-faint mt-2 text-[11px] leading-relaxed">
                        発表中は切り替えられません。先に「プレゼンを終了」してください。
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
                新しいルームを作成
              </button>

              <div className="flex items-center gap-2">
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => event.key === "Enter" && handleJoin()}
                  placeholder="既存コードで再開"
                  maxLength={6}
                  className="border-border focus:border-border-strong lt-num placeholder:text-text-faint min-w-0 flex-1 rounded-[14px] border bg-transparent px-3 py-2.5 text-[14px] tracking-[0.12em] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleJoin()}
                  disabled={busy || joinCode.length < 6}
                  className="lt-tap border-border hover:bg-surface-strong shrink-0 rounded-[14px] border px-4 py-2.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  接続
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
                  直前のルーム
                  <span className="lt-num tracking-[0.12em]">{settings.previousRoomCode}</span>
                  に戻る
                </button>
              )}
            </div>
          )}

          {error && <p className="text-like text-[12px]">{error}</p>}
        </section>

        {/* ------------------------------------------------------ 表示モニター */}
        <section className="space-y-3">
          <SectionLabel>表示モニター</SectionLabel>

          <div className="border-border bg-bg-elev overflow-hidden rounded-[16px] border">
            <MonitorRow
              label="主ディスプレイに追従"
              sub="接続構成が変わっても自動でメイン画面へ"
              selected={settings.monitorName === null}
              onSelect={() => handlePickMonitor(null)}
            />
            {monitors.map((monitor) => (
              <MonitorRow
                key={monitor.name}
                label={monitor.name}
                sub={`${monitor.width}×${monitor.height}${monitor.is_primary ? " ・ 主ディスプレイ" : ""}`}
                selected={settings.monitorName === monitor.name}
                onSelect={() => handlePickMonitor(monitor.name)}
              />
            ))}
          </div>

          <p className="text-text-faint text-[11px] leading-relaxed">
            選ぶとその画面に確認用の枠が数秒表示されます。
            {monitors.length <= 1 && " 現在つながっているディスプレイは1台です。"}
          </p>
        </section>

        {/* ------------------------------------------------------ 表示スタイル */}
        <section className="space-y-3">
          <SectionLabel>表示スタイル</SectionLabel>

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
                    {mode === "flow" ? "横流れ" : "フキダシ"}
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
              void sendTestComment("コメントの表示テストです");
            }}
            className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
          >
            <MessageSquareText size={15} />
            コメントをテスト表示
          </button>
        </section>

        {/* ---------------------------------------------------------- スタンプ */}
        <section className="space-y-3">
          <SectionLabel>スタンプ</SectionLabel>

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
              void sendTestStamp({
                emoji: STAMP_EMOJIS[Math.floor(Math.random() * STAMP_EMOJIS.length)],
                count: 6,
              });
            }}
            className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
          >
            <Sparkles size={15} />
            スタンプをテスト送信
          </button>
          <p className="text-text-faint text-[11px] leading-relaxed">
            スマホを持ち出さずに、その場で速さを確かめられます。
            {!live && " 開始前でも、確認のあいだだけオーバーレイが出ます。"}
          </p>
        </section>

        {/* ------------------------------------------------------ オーバーレイ */}
        <section className="space-y-3">
          <SectionLabel>オーバーレイ</SectionLabel>

          <div className="border-border bg-bg-elev flex items-start gap-2 rounded-[16px] border px-4 py-3">
            <MousePointerClick size={14} className="text-online mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-medium">クリックスルー 有効</p>
              <p className="text-text-faint mt-0.5 text-[11px] leading-relaxed">
                コメントとスタンプはマウス操作を受け取りません。右端の質問パネルだけを
                展開・折りたたみできます。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              reloadMonitors();
              void refitOverlay(settings.monitorName);
            }}
            className="lt-tap border-border hover:bg-surface-strong flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[13px] font-semibold transition-colors"
          >
            <Monitor size={15} />
            画面サイズに合わせ直す
          </button>
          <p className="text-text-faint text-[11px] leading-relaxed">
            外部ディスプレイを繋いだ後や解像度を変えた後に押してください。
          </p>
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 部品

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

function StatusPill({ status }: { status: "connecting" | "connected" | "disconnected" }) {
  const map = {
    connecting: { text: "接続中…", color: "var(--lt-text-faint)" },
    connected: { text: "接続済み", color: "var(--lt-online)" },
    disconnected: { text: "切断", color: "var(--lt-like)" },
  } as const;

  const { text, color } = map[status];

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
