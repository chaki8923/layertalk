/**
 * 参加QR カードを `<canvas>` に描いて PNG（base64）にする。
 *
 * # なぜ Rust で描かないのか
 *
 * **QR は1ピクセル狂うと読み取れない。** Rust で描くと Core Image の
 * `CIQRCodeGenerator` を使うことになり、`qrcode.react` が出すものとは別実装になる。
 * 「壊れても気付きにくい」読み取り率のところで差が出るのは割に合わない。
 * カード全体をここで焼いて、Rust は `CALayer.contents` に載せるだけにする。
 *
 * 見本は `components/JoinQrCard.tsx`。**値を変えたら両方を揃えること。**
 * 影だけはここで焼かない —— 焼くと画像の縁が透明で膨らみ、Rust 側の位置合わせが狂う。
 * `CALayer` の影で出している。
 */

/** `JoinQrCard.tsx` のカード。`rounded-[20px]` / `px-4 py-3.5` / `gap-2`。 */
const CARD_RADIUS = 20;
const CARD_PAD_X = 16;
const CARD_PAD_Y = 14;
const CARD_GAP = 8;
/** ロゴは `h-8 w-8 rounded-lg`。 */
const LOGO_SIZE = 32;
const LOGO_RADIUS = 8;
/** `LayerTalk` 表記の上マージン（`mt-0.5`）。 */
const BRAND_GAP = 2;
/** 見本の `tracking-[0.14em]` / `tracking-[0.12em]`。 */
const TRACKING = 0.14;
const BRAND_TRACKING = 0.12;

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

type Options = {
  /** `qrcode.react` の `QRCodeCanvas` が描いたもの。これをそのまま貼る。 */
  qr: HTMLCanvasElement;
  /** QR の一辺（CSS ピクセル）。`JoinQrCard` の `size` と同じ値。 */
  qrSize: number;
  code: string;
  label: string;
  brandColor: string;
  /**
   * ロゴ。**`<img>` ではなく `ImageBitmap` を渡すこと。**
   * 署名 URL の `<img>` を canvas に描くとキャンバスが汚染され、
   * `toDataURL` が SecurityError で落ちる（blob 経由なら汚染しない）。
   */
  logo: ImageBitmap | null;
  hideLayerTalk: boolean;
  /** Retina 用の倍率。`window.devicePixelRatio` を渡す。 */
  scale: number;
};

type Line = { text: string; size: number; tracking: number; color: string };

/** トラッキング込みの幅。 */
function trackedWidth(ctx: CanvasRenderingContext2D, line: Line): number {
  ctx.font = `700 ${line.size}px ${FONT_STACK}`;
  const chars = [...line.text];
  const glyphs = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  return glyphs + line.size * line.tracking * Math.max(0, chars.length - 1);
}

/**
 * トラッキング付きで1行を中央揃えに描く。
 *
 * **`ctx.letterSpacing` に頼らない。** macOS 13 世代の WKWebView で使えるか怪しく、
 * 効かないと字が詰まって読みにくくなる。
 */
function drawTracked(ctx: CanvasRenderingContext2D, line: Line, centerX: number, baselineY: number) {
  ctx.font = `700 ${line.size}px ${FONT_STACK}`;
  ctx.fillStyle = line.color;
  const tracking = line.size * line.tracking;
  const chars = [...line.text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  // 最後の字の後ろにトラッキングを付けない（付けると中央がずれる）。
  const total = widths.reduce((sum, w) => sum + w, 0) + tracking * Math.max(0, chars.length - 1);
  let x = centerX - total / 2;
  for (const [index, ch] of chars.entries()) {
    ctx.fillText(ch, x, baselineY);
    x += widths[index] + tracking;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** カードを描いて base64 の PNG を返す。描けなければ null。 */
export function renderJoinQrBitmap(options: Options): string | null {
  const { qr, qrSize, code, label, brandColor, logo, hideLayerTalk, scale } = options;
  if (qrSize <= 0) return null;

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;

  const lines: Line[] = [
    { text: label, size: 10, tracking: TRACKING, color: "rgba(0,0,0,0.45)" },
    // 見本の `Math.max(14, Math.round(size * 0.14))`
    { text: code, size: Math.max(14, Math.round(qrSize * 0.14)), tracking: TRACKING, color: "rgba(0,0,0,0.85)" },
  ];
  if (!hideLayerTalk) {
    lines.push({ text: "LayerTalk", size: 8, tracking: BRAND_TRACKING, color: brandColor });
  }

  // 下段は [ロゴ] [文字の列] を横に並べて中央寄せ（見本の flex row + items-center）。
  const textW = Math.max(...lines.map((line) => trackedWidth(measure, line)));
  const textH = lines.reduce((sum, line, index) => {
    const lead = line.size * 1.3;
    return sum + lead + (index === lines.length - 1 && !hideLayerTalk ? BRAND_GAP : 0);
  }, 0);
  const groupW = (logo ? LOGO_SIZE + CARD_GAP : 0) + textW;
  const bottomH = Math.max(textH, logo ? LOGO_SIZE : 0);

  const cardW = Math.max(qrSize, groupW) + CARD_PAD_X * 2;
  const cardH = CARD_PAD_Y * 2 + qrSize + CARD_GAP + bottomH;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(cardW * scale);
  canvas.height = Math.ceil(cardH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  // 白い紙のカード。**透過オーバーレイの上でも読み取れるよう必ず不透明にする。**
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 0, 0, cardW, cardH, CARD_RADIUS);
  ctx.fill();

  ctx.drawImage(qr, (cardW - qrSize) / 2, CARD_PAD_Y, qrSize, qrSize);

  const bottomTop = CARD_PAD_Y + qrSize + CARD_GAP;
  const groupLeft = (cardW - groupW) / 2;

  if (logo) {
    const ly = bottomTop + (bottomH - LOGO_SIZE) / 2;
    ctx.save();
    roundedRect(ctx, groupLeft, ly, LOGO_SIZE, LOGO_SIZE, LOGO_RADIUS);
    ctx.clip();
    ctx.drawImage(logo, groupLeft, ly, LOGO_SIZE, LOGO_SIZE);
    ctx.restore();
  }

  const textCenter = groupLeft + (logo ? LOGO_SIZE + CARD_GAP : 0) + textW / 2;
  let y = bottomTop + (bottomH - textH) / 2;
  for (const [index, line] of lines.entries()) {
    if (index === lines.length - 1 && !hideLayerTalk) y += BRAND_GAP;
    y += line.size;
    drawTracked(ctx, line, textCenter, y);
    y += line.size * 0.3;
  }

  const dataUrl = canvas.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? null : dataUrl.slice(comma + 1);
}
