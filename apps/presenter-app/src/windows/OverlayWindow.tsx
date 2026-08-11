import { useComments, useStampChannel, type Comment } from "@layertalk/shared";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BubbleLayer } from "../components/BubbleLayer";
import { FlowLayer, type CommentLayerHandle } from "../components/FlowLayer";
import { StampLayer, type StampLayerHandle } from "../components/StampLayer";
import {
  loadSettings,
  onSettingsChanged,
  onTestStamp,
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

  // ディスプレイ構成が変わったらオーバーレイを貼り直す
  useEffect(() => {
    const handleResize = () => void refitOverlay(settings.monitorName);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [settings.monitorName]);

  const showComment = useCallback(
    (text: string) => {
      const target = settings.displayMode === "flow" ? flowRef : bubbleRef;
      target.current?.push(text);
    },
    [settings.displayMode],
  );

  const handleInsert = useCallback(
    (comment: Comment) => {
      if (settings.commentsEnabled) showComment(comment.content);
    },
    [settings.commentsEnabled, showComment],
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
      if (settings.stampsEnabled) stampRef.current?.burst(payload.emoji, payload.count);
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

  const monitorLabel = settings.monitorName ?? "主ディスプレイ";

  return (
    <div className="overlay-root relative h-screen w-screen overflow-hidden bg-transparent">
      {settings.displayMode === "flow" ? (
        <FlowLayer
          ref={flowRef}
          fontSize={settings.fontSize}
          opacity={settings.opacity}
          baseDurationSec={settings.flowDurationSec}
        />
      ) : (
        <BubbleLayer ref={bubbleRef} fontSize={settings.fontSize} opacity={settings.opacity} />
      )}

      <StampLayer
        ref={stampRef}
        opacity={settings.opacity}
        durationSec={settings.stampDurationSec}
      />

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
