/**
 * どの販売経路の条件を表示するか。
 *
 * LayerTalk は同じ法務ページを2つの配布チャネルから開かせている:
 * 直接配布版（Stripe Checkout）と Mac App Store 版（App Store 決済）。
 * 支払方法・返金の窓口・価格の決まり方がまるごと違うので、Stripe 前提の文面を
 * App Store 版のアプリ内から開かせると、**別の決済手段の販売条件へ誘導している**
 * 形になり App Store 3.1.1 の指摘対象になる。価格も食い違う
 * （規約に ¥2,980 と書いてあっても、App Store の実売価格は Apple の価格表で決まる）。
 *
 * 既定は `stripe`。Web から直に開いた人には、これまでどおりの表示になる。
 */
export const SALES_CHANNELS = ["stripe", "app-store"] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const SALES_CHANNEL_PARAM = "channel";

/** クエリ文字列から解決する。知らない値は既定へ倒す。 */
export function resolveSalesChannel(value: string | string[] | undefined): SalesChannel {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "app-store" ? "app-store" : "stripe";
}

/** 同じチャネルのまま別の法務ページへ渡すためのクエリ。既定チャネルでは付けない。 */
export function salesChannelQuery(channel: SalesChannel): string {
  return channel === "app-store" ? `?${SALES_CHANNEL_PARAM}=app-store` : "";
}
