import type { ReactNode } from "react";

import type { Locale } from "@layertalk/shared/i18n";

import { PublicFooter } from "./public-footer";
import { PublicHeader } from "./public-header";
import type { PublicAppearance } from "./appearance";
import { MascotMotionProvider } from "./mascot-motion";

export function PublicShell({ children, locale = "ja", appearance = "default" }: { children: ReactNode; locale?: Locale; appearance?: PublicAppearance }) {
  if (appearance === "mascot") {
    return (
      <MascotMotionProvider>
        <PublicHeader locale={locale} appearance={appearance} />
        {children}
        <PublicFooter locale={locale} appearance={appearance} />
      </MascotMotionProvider>
    );
  }
  return (
    <div className="lt-copy flex min-h-dvh flex-col">
      <PublicHeader locale={locale} />
      {children}
      <PublicFooter locale={locale} />
    </div>
  );
}
