"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import { mascotVariants, type MascotVariant } from "./mascot-data";
import { useMascotMotion } from "./mascot-motion";
import styles from "./mascot-backdrop.module.css";

// Stable phases keep several friends on screen from the first frame, without
// random values that change between server rendering and hydration.
const travelers: {
  variant: MascotVariant;
  size: "small" | "medium" | "large";
  duration: number;
  mobileDuration: number;
  phase: number;
  reverse: boolean;
}[] = [
  { variant: "neutral", size: "small", duration: 108, mobileDuration: 54, phase: .13, reverse: false },
  { variant: "round", size: "medium", duration: 96, mobileDuration: 48, phase: .68, reverse: true },
  { variant: "tall", size: "small", duration: 118, mobileDuration: 65, phase: .37, reverse: false },
  { variant: "long", size: "large", duration: 102, mobileDuration: 51, phase: .84, reverse: true },
  { variant: "flat", size: "medium", duration: 114, mobileDuration: 60, phase: .54, reverse: false },
  { variant: "lean", size: "small", duration: 90, mobileDuration: 45, phase: .23, reverse: true },
  { variant: "puff", size: "large", duration: 120, mobileDuration: 64, phase: .75, reverse: false },
  { variant: "round", size: "small", duration: 98, mobileDuration: 49, phase: .47, reverse: true },
  { variant: "long", size: "medium", duration: 110, mobileDuration: 57, phase: .92, reverse: false },
];

export function MascotBackdrop() {
  const { enabled, reduced } = useMascotMotion();

  return (
    <div className={styles.backdrop} aria-hidden="true" data-mascot-backdrop data-active={enabled} data-reduced={reduced}>
      {travelers.map((traveler, index) => {
        const style = {
          "--lane": `${7 + index * 10}%`,
          "--mobile-lane": `${8 + index * 18}%`,
          "--duration": `${traveler.duration}s`,
          "--delay": `${-traveler.duration * traveler.phase}s`,
          "--mobile-duration": `${traveler.mobileDuration}s`,
          "--mobile-delay": `${-traveler.mobileDuration * traveler.phase}s`,
          "--float-duration": `${10 + index % 5}s`,
          "--float-delay": `${-index * 1.7}s`,
        } as CSSProperties;

        return (
          <div key={index} className={styles.crossing} style={style} data-background-mascot={traveler.variant} data-size={traveler.size} data-reverse={traveler.reverse}>
            <div className={styles.float}>
              <Image
                src={mascotVariants[traveler.variant].src} alt="" width={1536} height={1024} draggable={false}
                sizes={traveler.size === "small" ? "(max-width: 767px) 48px, 64px" : traveler.size === "medium" ? "(max-width: 767px) 60px, 80px" : "(max-width: 767px) 72px, 96px"}
                className={styles.image}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
