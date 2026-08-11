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
  Monitor,
  MousePointerClick,
  Play,
  Sparkles,
  Square,
} from "lucide-react";
import { STAMP_EMOJIS } from "@layertalk/shared";
import { useCallback, useEffect, useState } from "react";

import {
  loadSettings,
  saveSettings,
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
  startPresentation,
  stopPresentation,
  type MonitorInfo,
} from "../lib/tauri";

const AUDIENCE_BASE_URL = "http://localhost:3000";
const PEEK_MS = 2600;

export function ControlWindow() {
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
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

  const handleJoin = async () => {
    const code = normalizeRoomCode(joinCode);
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

  const audienceUrl = settings.roomCode ? `${AUDIENCE_BASE_URL}/r/${settings.roomCode}` : null;

  const handleCopy = async () => {
    if (!audienceUrl) return;
    await navigator.clipboard.writeText(audienceUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="bg-bg text-text flex h-screen flex-col overflow-hidden">
      {/* titleBarStyle: Overlay なので、信号機ボタンぶんの余白と
          ドラッグ領域を自前で用意する */}
      <div
        data-tauri-drag-region
        className="border-border flex h-11 shrink-0 items-center justify-center border-b"
      >
        <span className="text-text-muted pointer-events-none text-[13px] font-semibold">
          LayerTalk
        </span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
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

              <div className="border-border flex items-center justify-between border-t pt-3">
                <StatusPill status={status} />
                <span className="text-text-muted lt-num text-[12px]">
                  コメント {comments.length} 件
                </span>
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
                  onClick={handleJoin}
                  disabled={busy || joinCode.length < 6}
                  className="lt-tap border-border hover:bg-surface-strong shrink-0 rounded-[14px] border px-4 py-2.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  接続
                </button>
              </div>
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

          <Slider
            label="文字サイズ"
            value={settings.fontSize}
            min={20}
            max={56}
            step={2}
            suffix="px"
            onChange={(fontSize) => update({ fontSize })}
          />

          <Slider
            label="不透明度"
            value={Math.round(settings.opacity * 100)}
            min={40}
            max={100}
            step={5}
            suffix="%"
            onChange={(value) => update({ opacity: value / 100 })}
          />

          {settings.displayMode === "flow" && (
            <Slider
              label="流れる速さ"
              value={settings.flowDurationSec}
              min={5}
              max={16}
              step={1}
              suffix="秒"
              hint="画面を横切るのにかかる時間。小さいほど速い。"
              onChange={(flowDurationSec) => update({ flowDurationSec })}
            />
          )}

          <Toggle
            label="コメントを表示"
            checked={settings.commentsEnabled}
            onChange={(commentsEnabled) => update({ commentsEnabled })}
          />
        </section>

        {/* ---------------------------------------------------------- スタンプ */}
        <section className="space-y-3">
          <SectionLabel>スタンプ</SectionLabel>

          <Toggle
            label="スタンプを表示"
            checked={settings.stampsEnabled}
            onChange={(stampsEnabled) => update({ stampsEnabled })}
          />

          <Slider
            label="上がる速さ"
            value={settings.stampDurationSec}
            min={4}
            max={24}
            step={1}
            suffix="秒"
            hint="画面下から上まで上がりきる時間。大きいほどゆっくり。"
            onChange={(stampDurationSec) => update({ stampDurationSec })}
          />

          <button
            type="button"
            onClick={() => {
              // 開始前はオーバーレイが隠れているので、確認のあいだだけ出す
              if (!live) {
                void peekOverlay(settings.monitorName, settings.stampDurationSec * 1000 + 1500);
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
                オーバーレイはマウス操作を一切受け取りません。クリックもスクロールも
                そのまま背面のスライドに届きます。
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

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hint?: string;
  onChange: (value: number) => void;
};

function Slider({ label, value, min, max, step, suffix, hint, onChange }: SliderProps) {
  return (
    <div className="border-border bg-bg-elev space-y-2 rounded-[16px] border px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="lt-num text-text-muted text-[12px]">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-brand h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--lt-border-strong)]"
      />
      {hint && <p className="text-text-faint text-[11px]">{hint}</p>}
    </div>
  );
}

type ToggleProps = {
  label: string;
  checked: boolean;
  hint?: string;
  icon?: React.ReactNode;
  onChange: (checked: boolean) => void;
};

function Toggle({ label, checked, hint, icon, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="lt-tap border-border bg-bg-elev flex w-full items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-left"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          {icon}
          {label}
        </span>
        {hint && <span className="text-text-faint mt-0.5 block text-[11px]">{hint}</span>}
      </span>

      <span
        className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
        style={{ background: checked ? "var(--lt-brand)" : "var(--lt-border-strong)" }}
      >
        <motion.span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm"
          animate={{ left: checked ? 21 : 3 }}
          transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
        />
      </span>
    </button>
  );
}
