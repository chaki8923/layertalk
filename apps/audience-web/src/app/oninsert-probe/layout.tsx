import type { Metadata } from "next";
import type { ReactNode } from "react";

import { privatePageRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Realtime probe | LayerTalk",
  robots: privatePageRobots,
};

export default function ProbeLayout({ children }: { children: ReactNode }) {
  return children;
}
