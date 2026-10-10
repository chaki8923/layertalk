"use client";

import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";
import styles from "./mascot-public.module.css";

const MotionContext = createContext({
  enabled: true,
  paused: false,
  reduced: false,
  toggle: () => {},
});

export function MascotMotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() === true;
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const enabled = !paused && !reduced && !hidden;
  return (
    <MotionContext.Provider value={{ enabled, paused, reduced, toggle: () => setPaused((value) => !value) }}>
      <div className={`lt-home-theme lt-copy ${styles.shell}`} data-motion={reduced ? "reduced" : enabled ? "running" : "paused"}>
        {children}
      </div>
    </MotionContext.Provider>
  );
}

export const useMascotMotion = () => useContext(MotionContext);

export function MascotMotionControl({ locale }: { locale: Locale }) {
  const { paused, reduced, toggle } = useMascotMotion();
  const t = messages[locale].public.mascot;
  const Icon = paused ? Play : Pause;
  const label = reduced ? t.reducedMotion : paused ? t.startMotion : t.stopMotion;
  return (
    <button type="button" className={styles.motionControl} onClick={toggle} disabled={reduced} aria-pressed={paused}>
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
