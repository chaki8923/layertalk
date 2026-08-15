import { QRCodeSVG } from "qrcode.react";

type Props = {
  url: string;
  code: string;
  /** QR 本体の一辺（px）。コントロール窓は小さめ、スライドの上は大きめ。 */
  size: number;
  /**
   * 「スマホで参加」の見出し。
   *
   * スライドに重なって**観客が読む**ので、発表者が選んだ言語＝ルームの言語で出す。
   * 手元だけ英語で観客のスマホと食い違うと、ここが一番目立つ継ぎ目になる。
   */
  label: string;
  brandColor?: string;
  logoUrl?: string | null;
  hideLayerTalk?: boolean;
};

/**
 * 参加用 QR。透過オーバーレイの上でも読み取れるように、必ず白い紙のカードに載せる。
 * 読み取れない人が手入力できるよう、下に参加コードも出す。
 */
export function JoinQrCard({ url, code, size, label, brandColor = "#6B8AFF", logoUrl, hideLayerTalk = false }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] bg-white px-4 py-3.5 shadow-[0_12px_34px_rgb(0_0_0/0.34)]">
      <QRCodeSVG
        value={url}
        size={size}
        // クワイエットゾーン。これが無いと読み取り率が落ちる。
        marginSize={2}
        level="M"
        bgColor="#ffffff"
        fgColor="#0b0d12"
      />
      <div className="flex items-center gap-2 text-center">
        {logoUrl && <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />}
        <div>
        <div className="text-[10px] font-bold tracking-[0.14em] text-black/45">{label}</div>
        <div
          className="lt-num font-bold tracking-[0.14em] text-black/85"
          style={{ fontSize: Math.max(14, Math.round(size * 0.14)) }}
        >
          {code}
        </div>
        {!hideLayerTalk && <div className="mt-0.5 text-[8px] font-bold tracking-[0.12em]" style={{ color: brandColor }}>LayerTalk</div>}
        </div>
      </div>
    </div>
  );
}
