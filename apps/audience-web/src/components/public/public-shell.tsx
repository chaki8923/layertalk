import type { ReactNode } from "react";

import type { Locale } from "@layertalk/shared/i18n";

import { PublicFooter } from "./public-footer";
import { PublicHeader } from "./public-header";

export function PublicShell({ children, locale = "ja" }: { children: ReactNode; locale?: Locale }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader locale={locale} />
      {children}
      <PublicFooter locale={locale} />
    </div>
  );
}
