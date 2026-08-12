import { useComments, useStampChannel, type Comment } from "@layertalk/shared";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BubbleLayer } from "../components/BubbleLayer";
import { FlowLayer, type CommentLayerHandle } from "../components/FlowLayer";
import { JoinQrCard } from "../components/JoinQrCard";
import { StampLayer, type StampLayerHandle } from "../components/StampLayer";
import { audienceUrl } from "../lib/audience";
import {
  loadSettings,
  OVERLAY_DEFAULTS,
  onSettingsChanged,
  onTestComment,
  onTestStamp,
  sendQuestionToPanel,
  type PresenterSettings,
} from "../lib/settings";
import { clientId, supabase } from "../lib/supabase";
import {
  getPresentationState,
  onOverlayPeek,
  onPresentationStateChanged,
  refitOverlay,
} from "../lib/tauri";

export function OverlayWindow() {
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);
  const [live, setLive] = useState(false);
  const [peeking, setPeeking] = useState(false);

  const flowRef = useRef<CommentLayerHandle>(null);
  const bubbleRef = useRef<CommentLayerHandle>(null);
  const stampRef = useRef<StampLayerHandle>(null);

  // 設定変更をコントロール窓から受け取る
  useEffect(() => {
    const unlisten = onSettingsChanged(setSettings);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // 発表の開始・終了（トレイからの終了もここに届く）
  useEffect(() => {
    void getPresentationState().then(setLive);
    const unlisten = onPresentationStateChanged(setLive);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // モニター確認・プレビューのための一時表示
  useEffect(() => {
    let timer: number | undefined;
    const unlisten = onOverlayPeek((ms) => {
      setPeeking(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPeeking(false), ms);
    });
    return () => {
      window.clearTimeout(timer);
      void unlisten.then((off) => off());
    };
  }, []);

  // 発表が始まったら確認カードは引っ込める
  useEffect(() => {
    if (live) setPeeking(false);
  }, [live]);

  // ディスプレイ構成が変わったらオーバーレイを貼り直す。
  // 表示先モニターは渡さない（Rust が持っている。理由は refitOverlay のコメント）。
  useEffect(() => {
    const handleResize = () => void refitOverlay();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showComment = useCallback(
    (text: string) => {
      const target = settings.displayMode === "flow" ? flowRef : bubbleRef;
      target.current?.push(text);
    },
    [settings.displayMode],
  );

  const handleInsert = useCallback(
    (comment: Comment) => {
      // 質問は右端のパネルにも積む。流れる演出は通常コメントと同じにする
      // （質問だけ見た目を変えない）。
      if (comment.is_question) {
        void sendQuestionToPanel(comment);
      }
      showComment(comment.content);
    },
    [showComment],
  );

  // 発表中だけ購読する。client に null を渡すとフックは何もしない。
  const active = live && Boolean(settings.roomId);

  useComments({
    client: active ? supabase : null,
    roomId: settings.roomId,
    onInsert: handleInsert,
  });

  useStampChannel({
    client: active ? supabase : null,
    roomId: settings.roomId,
    clientId,
    onStamp: (payload) => {
      stampRef.current?.burst(payload.emoji, payload.count);
    },
  });

  // 表示モードを切り替えたら、いま流れているものは片付ける
  useEffect(() => {
    flowRef.current?.clear();
    bubbleRef.current?.clear();
  }, [settings.displayMode]);

  // 終了したら流れているものを全部消す（次に開始したとき残骸が出ない）
  useEffect(() => {
    if (!live) {
      flowRef.current?.clear();
      bubbleRef.current?.clear();
    }
  }, [live]);

  // コントロール窓の「テスト送信」からスタンプを受け取る
  useEffect(() => {
    const unlisten = onTestStamp(({ emoji, count }) => {
      stampRef.current?.burst(emoji, count);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Supabase を介さず、現在選択中のコメント表示スタイルを確認する。
  useEffect(() => {
    const unlisten = onTestComment((text) => {
      showComment(text);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [showComment]);

  const monitorLabel = settings.monitorName ?? "主ディスプレイ";

  // 右端は質問パネルの領域なので、QR は左下に逃がす。
  // peek 中にも出して、発表前でも置き場所を確認できるようにする。
  const joinUrl = audienceUrl(settings.roomCode);
  const showQr = settings.showJoinQr && Boolean(joinUrl) && (live || peeking);

  return (
    <div className="overlay-root relative h-screen w-screen overflow-hidden bg-transparent">
      {settings.displayMode === "flow" ? (
        <FlowLayer
          ref={flowRef}
          fontSize={OVERLAY_DEFAULTS.fontSize}
          opacity={OVERLAY_DEFAULTS.opacity}
          baseDurationSec={OVERLAY_DEFAULTS.flowDurationSec}
        />
      ) : (
        <BubbleLayer
          ref={bubbleRef}
          fontSize={OVERLAY_DEFAULTS.fontSize}
          opacity={OVERLAY_DEFAULTS.opacity}
          durationSec={OVERLAY_DEFAULTS.bubbleDurationSec}
        />
      )}

      <StampLayer
        ref={stampRef}
        opacity={OVERLAY_DEFAULTS.opacity}
        durationSec={OVERLAY_DEFAULTS.stampDurationSec}
      />

      <AnimatePresence>
        {showQr && joinUrl && settings.roomCode && (
          <motion.div
            className="pointer-events-none absolute bottom-8 left-8"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            <JoinQrCard url={joinUrl} code={settings.roomCode} size={220} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* モニター確認用。どの物理画面が選ばれているか一目で分かるようにする。 */}
      <AnimatePresence>
        {peeking && !live && (
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* 画面の縁をなぞる枠。範囲がそのまま見える。 */}
            <div className="absolute inset-3 rounded-[28px] border-[6px] border-[#6b8aff]" />

            <motion.div
              className="rounded-[28px] bg-black/70 px-10 py-7 text-center"
              initial={{ scale: 0.92, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <p className="text-[15px] font-semibold tracking-wider text-white/70">
                この画面に表示します
              </p>
              <p className="mt-2 text-[38px] leading-tight font-bold text-white">{monitorLabel}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
