"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { mascotVariants, type MascotVariant } from "./mascot-data";
import { useMascotMotion } from "./mascot-motion";
import styles from "./mascot-backdrop.module.css";

// Stable phases avoid randomness between server rendering and hydration.
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

function SwimmingBand({ index, height }: { index: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index === 0);

  useEffect(() => {
    const band = ref.current;
    if (!band || typeof IntersectionObserver === "undefined") return;
    // Observe the stationary document area, never a horizontally moving image.
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: `${height}px 0px`,
    });
    observer.observe(band);
    return () => observer.disconnect();
  }, [height]);

  return (
    <div ref={ref} className={styles.band} style={{ "--band-index": index } as CSSProperties} data-swimming-band={index} data-near={near}>
      {Array.from({ length: 5 }, (_, lane) => {
        const traveler = travelers[(index * 5 + lane) % travelers.length];
        const phase = (traveler.phase + index * .137) % 1;
        const style = {
          "--lane": `${(lane + .5) * 20}%`,
          "--duration": `${traveler.duration}s`,
          "--delay": `${-traveler.duration * phase}s`,
          "--mobile-duration": `${traveler.mobileDuration}s`,
          "--mobile-delay": `${-traveler.mobileDuration * phase}s`,
          "--float-duration": `${10 + (index + lane) % 5}s`,
          "--float-delay": `${-(index * 5 + lane) * 1.7}s`,
        } as CSSProperties;

        return (
          <div key={lane} className={styles.crossing} style={style} data-background-mascot={traveler.variant} data-size={traveler.size} data-reverse={traveler.reverse}>
            {[0, 1].map((copy) => (
              <div key={copy} className={styles.copy} data-copy={copy}>
                <div className={styles.float}>
                  <Image
                    src={mascotVariants[traveler.variant].src} alt="" width={1536} height={1024} draggable={false}
                    sizes={traveler.size === "small" ? "(max-width: 767px) 48px, 64px" : traveler.size === "medium" ? "(max-width: 767px) 60px, 80px" : "(max-width: 767px) 72px, 96px"}
                    className={styles.image}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function MascotBackdrop() {
  const { enabled, reduced } = useMascotMotion();
  const ref = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ count: 1, height: 0 });

  useEffect(() => {
    const backdrop = ref.current;
    const measure = measureRef.current;
    if (!backdrop || !measure || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const height = measure.getBoundingClientRect().height;
      const pageHeight = backdrop.getBoundingClientRect().height;
      if (height <= 0 || pageHeight <= 0) return;
      const count = Math.ceil(pageHeight / height);
      setLayout((previous) => previous.count === count && previous.height === height ? previous : { count, height });
    });
    observer.observe(backdrop);
    observer.observe(measure);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.backdrop} aria-hidden="true" data-mascot-backdrop data-active={enabled} data-reduced={reduced}>
      <div ref={measureRef} className={styles.measure} data-band-measure />
      {Array.from({ length: layout.count }, (_, index) => <SwimmingBand key={index} index={index} height={layout.height} />)}
    </div>
  );
}
