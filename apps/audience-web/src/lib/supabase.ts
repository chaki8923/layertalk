"use client";

import { createLayerTalkClient } from "@layertalk/shared";

export const supabase = createLayerTalkClient({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
});
