"use client";

import Image from "next/image";
import { useAnimationControls, useInView, useMotionValue, useSpring, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";
import { mascotVariants, type MascotVariant } from "./mascot-data";
import { useMascotMotion } from "./mascot-motion";
import styles from "./mascot.module.css";

export function Mascot({
  variant = "neutral", locale, className = "", preload = false,
  sizes = "(max-width: 767px) 80vw, 480px",
}: {
  variant?: MascotVariant;
  locale: Locale;
  className?: string;
  preload?: boolean;
  sizes?: string;
}) {
  const asset = mascotVariants[variant];
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: .05 });
  const { enabled } = useMascotMotion();
  const active = enabled && visible;
  const controls = useAnimationControls();
  const tiltValue = useMotionValue(0);
  const tilt = useSpring(tiltValue, { stiffness: 100, damping: 20 });
  const playing = useRef(false);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedback, setFeedback] = useState(false);

  useEffect(() => {
    if (!active) {
      sequence.current++;
      playing.current = false;
      controls.stop();
      controls.set({ scaleX: 1, scaleY: 1 });
      tiltValue.set(0);
      tilt.jump(0);
    }
  }, [active, controls, tilt, tiltValue]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    controls.stop();
  }, [controls]);

  const react = async (strong = false) => {
    if (!active) {
      setFeedback(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFeedback(false), 220);
      return;
    }
    const current = ++sequence.current;
    playing.current = true;
    controls.stop();
    const amount = strong ? .06 : .025;
    await controls.start({
      scaleX: [null, 1 + amount, 1 - amount * .45, 1],
      scaleY: [null, 1 - amount, 1 + amount * .45, 1],
      transition: { duration: strong ? .7 : .65, times: [0, .24, .57, 1], ease: "easeInOut" },
    });
    if (sequence.current === current) playing.current = false;
  };

  const point = (event: PointerEvent<HTMLButtonElement>) => {
    if (!active || event.pointerType === "touch") return;
    const box = event.currentTarget.getBoundingClientRect();
    tiltValue.set(Math.max(-2, Math.min(2, ((event.clientX - box.left) / box.width - .5) * 4)));
  };

  const leave = () => {
    tiltValue.set(0);
    if (active && !playing.current) {
      void controls.start({ scaleX: 1, scaleY: 1, transition: { duration: .6, ease: "easeOut" } });
    }
  };

  const cancel = () => {
    sequence.current++;
    playing.current = false;
    controls.stop();
    if (active) void controls.start({ scaleX: 1, scaleY: 1, transition: { duration: .6 } });
    else controls.set({ scaleX: 1, scaleY: 1 });
    tiltValue.set(0);
  };

  const style = {
    "--face-x": `${asset.face.x}%`, "--face-y": `${asset.face.y}%`,
    "--face-rx": `${asset.face.rx}%`, "--face-ry": `${asset.face.ry}%`,
    "--hit-area": `polygon(${asset.hit.map(([x, y]) => `${x}% ${y}%`).join(",")})`,
    "--drift-duration": `${20 + asset.index * .8}s`,
    "--drift-delay": `${-asset.index * 3.2}s`,
    "--float-duration": `${9 + asset.index * .45}s`,
    "--soft-duration": `${12 + asset.index * .6}s`,
    "--motion-delay": `${-asset.index * 1.3}s`,
  } as CSSProperties;
  const label = messages[locale].public.mascot;

  return (
    <div ref={ref} className={`${styles.mascot} ${className}`} style={style} data-mascot={variant} data-active={active} data-feedback={feedback}>
      <div className={styles.drift}>
        <div className={styles.float}>
          <motion.div className={styles.tilt} style={{ rotate: tilt }}>
            <div className={styles.body}>
              <motion.div className={styles.reaction} animate={controls} initial={{ scaleX: 1, scaleY: 1 }}>
                <Image src={asset.src} alt="" width={1536} height={1024} sizes={sizes} preload={preload} draggable={false} className={styles.image} />
              </motion.div>
            </div>
            <div className={styles.face} aria-hidden="true">
              <Image src={asset.src} alt="" width={1536} height={1024} sizes={sizes} preload={preload} draggable={false} className={styles.image} />
            </div>
            <svg className={styles.outline} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polygon points={asset.hit.map(([x, y]) => `${x},${y}`).join(" ")} vectorEffect="non-scaling-stroke" />
            </svg>
            <button
              type="button" className={styles.hitTarget}
              aria-label={label.interact(label.names[variant])}
              onClick={() => void react(true)}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch" && window.matchMedia("(hover: hover)").matches) {
                  point(event);
                  void react();
                }
              }}
              onPointerMove={point} onPointerLeave={leave} onPointerCancel={cancel}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
