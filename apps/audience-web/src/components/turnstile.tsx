"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!sitekey || !ref.current) { onToken(""); return; }
    let widgetId: string | undefined;
    const render = () => {
      if (!ref.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey,
        theme: "auto",
        size: "flexible",
        callback: onToken,
        "expired-callback": () => onToken(""),
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-layertalk-turnstile]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.layertalkTurnstile = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    render();
    return () => {
      script?.removeEventListener("load", render);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [onToken]);
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? <div ref={ref} className="mt-4" /> : null;
}
