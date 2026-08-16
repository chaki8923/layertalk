import type { Metadata } from "next";
import type { ReactNode } from "react";

import { privatePageRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "ルームに参加 | LayerTalk",
  robots: privatePageRobots,
};

export default function RoomLayout({ children }: { children: ReactNode }) {
  return children;
}
