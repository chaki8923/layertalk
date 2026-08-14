import type { Comment } from "@layertalk/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDocumentLang, useMessages } from "../i18n";
import {
  loadSettings,
  onQuestionReceived,
  onSettingsChanged,
  type PresenterSettings,
} from "../lib/settings";
import {
  getPresentationState,
  onPresentationStateChanged,
  setQuestionPanelExpanded,
} from "../lib/tauri";

const MAX_QUESTIONS = 5;

/** 右端だけ操作可能な質問専用ウィンドウ。 */
export function QuestionWindow() {
  const reduceMotion = useReducedMotion();
  const [questions, setQuestions] = useState<Comment[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);

  const t = useMessages(settings.language);
  useDocumentLang(settings.language);

  // この窓だけ設定を購読していなかった。言語トグルを反映するために要る。
  useEffect(() => {
    const unlisten = onSettingsChanged(setSettings);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  const liveRef = useRef(false);
  const expandedRef = useRef(true);
  const hasQuestionsRef = useRef(false);

  const applyExpanded = (next: boolean) => {
    expandedRef.current = next;
    setExpanded(next);
    setUnreadCount(0);
    void setQuestionPanelExpanded(next);
  };

  useEffect(() => {
    void getPresentationState().then((live) => {
      liveRef.current = live;
    });

    const unlisten = onPresentationStateChanged((live) => {
      liveRef.current = live;
      if (!live) {
        setQuestions([]);
        setUnreadCount(0);
        setExpanded(true);
        expandedRef.current = true;
        hasQuestionsRef.current = false;
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    const unlisten = onQuestionReceived((question) => {
      setQuestions((prev) => [
        question,
        ...prev.filter((item) => item.id !== question.id),
      ].slice(0, MAX_QUESTIONS));

      if (!hasQuestionsRef.current) {
        hasQuestionsRef.current = true;
        expandedRef.current = true;
        setExpanded(true);
        setUnreadCount(0);
        void setQuestionPanelExpanded(true);
      } else if (!expandedRef.current) {
        setUnreadCount((count) => count + 1);
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  if (!expanded) {
    return (
      <div className="relative h-screen w-screen bg-transparent">
        <button
          type="button"
          aria-label={t.questions.show(unreadCount)}
          onClick={() => applyExpanded(true)}
          className="lt-tap absolute top-[5vh] right-0 flex min-h-28 w-12 flex-col items-center justify-center gap-2 rounded-l-[18px] border border-r-0 border-white/18 bg-black/80 text-white shadow-[0_12px_34px_rgb(0_0_0/0.38)]"
        >
          <ChevronLeft size={17} aria-hidden />
          <span className="text-[15px] font-black">Q</span>
          {unreadCount > 0 && (
            <span className="lt-num bg-brand flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white">
              {Math.min(unreadCount, 99)}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <motion.aside
      aria-label={t.questions.title}
      className="absolute top-[5vh] right-3 bottom-[5vh] left-3 flex flex-col gap-3 overflow-hidden"
      initial={{ opacity: 0, x: reduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-end gap-2 pr-1 text-white">
        <span className="h-px flex-1 bg-white/18" />
        <span className="text-[13px] font-bold tracking-[0.16em]">{t.questions.title}</span>
        <button
          type="button"
          aria-label={t.questions.hide}
          onClick={() => applyExpanded(false)}
          className="lt-tap flex h-9 w-9 items-center justify-center rounded-full border border-white/18 bg-black/75 text-white transition-colors hover:bg-black/90"
        >
          <ChevronRight size={17} aria-hidden />
        </button>
      </div>

      <motion.ol layout className="flex min-h-0 flex-col gap-2.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {questions.map((question) => (
            <motion.li
              layout
              key={question.id}
              initial={{ opacity: 0, x: reduceMotion ? 0 : 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : 16, scale: 0.98 }}
              transition={{
                layout: { type: "spring", stiffness: 220, damping: 26 },
                opacity: { duration: 0.18 },
                x: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
                scale: { duration: 0.18 },
              }}
              className="flex min-h-0 items-start gap-3 rounded-[18px] border border-white/16 bg-black/78 px-4 py-3.5 shadow-[0_12px_34px_rgb(0_0_0/0.34)]"
            >
              <span className="bg-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-black text-white shadow-[0_4px_14px_rgb(107_138_255/0.4)]">
                Q
              </span>
              <p className="line-clamp-4 min-w-0 pt-0.5 text-[clamp(16px,1.35vw,21px)] leading-[1.45] font-bold tracking-[0.01em] text-white">
                {question.content}
              </p>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ol>
    </motion.aside>
  );
}
