import { ROOM_LOGO_MAX_BYTES, ROOM_LOGO_MAX_EDGE, ROOM_STAMP_SIZE } from "./constants";
import { LayerTalkError } from "./errors";

/** decode に失敗するのはユーザーが選んだファイルの都合なので、原因を分けて投げる。 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // iOS の HEIC は Safari が JPEG に変換して渡すことが多いが、
    // そのまま渡ってきた場合や壊れたファイルはここで落ちる。
    throw new LayerTalkError("image_unreadable");
  }
}

/** 指定サイズの canvas に描いて PNG にする。呼び出し側で bitmap を close すること。 */
async function drawToPng(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new LayerTalkError("image_unsupported_device");

  ctx.clearRect(0, 0, width, height);
  draw(ctx);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new LayerTalkError("image_convert_failed");

  return blob;
}

/**
 * 任意の画像ファイルをスタンプ用の PNG にする。ブラウザ専用。
 *
 * 正規化する理由は2つ。会場の Wi-Fi で数MBを上げさせないためと、
 * Storage バケットが image/png しか受け付けないため（アニメーションGIFは対象外）。
 *
 * 正方形の canvas に contain で中央配置する。余白は透過のまま残すので、
 * 元画像が縦長でも横長でも、押したときの見た目の大きさが揃う。
 */
export async function toStampPng(file: File): Promise<Blob> {
  const bitmap = await decode(file);

  try {
    const scale = Math.min(ROOM_STAMP_SIZE / bitmap.width, ROOM_STAMP_SIZE / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    return await drawToPng(ROOM_STAMP_SIZE, ROOM_STAMP_SIZE, (ctx) => {
      ctx.drawImage(bitmap, (ROOM_STAMP_SIZE - width) / 2, (ROOM_STAMP_SIZE - height) / 2, width, height);
    });
  } finally {
    bitmap.close();
  }
}

/**
 * 任意の画像ファイルをブランドロゴ用の PNG にする。ブラウザ専用。
 *
 * スタンプと違い**縦横比はそのまま**で、長辺が上限を超えるときだけ縮める（拡大はしない）。
 * ロゴは横長が普通なので、正方形に収めると実寸が無駄に小さくなる。
 *
 * 必ず canvas を通して再エンコードするのが肝で、これで
 * 「PNG かどうか」「1MB を超えていないか」を発表者に気にさせなくて済む
 * （`room-branding` バケットは image/png・1,048,576 バイトしか受け取らない）。
 * ついでに、拡張子だけ .png にした JPEG がそのまま上がる穴も塞がる。
 */
export async function toLogoPng(file: File): Promise<Blob> {
  const bitmap = await decode(file);

  try {
    let edge = ROOM_LOGO_MAX_EDGE;
    // ロゴは平面的な絵が普通で1回で収まるが、写真を渡されると 512px でも
    // PNG が 1MB を超えることがある。バケットに弾かれて「1MB以下にしろ」と
    // 言い直す羽目にならないよう、収まるまでこちらで縮める。
    for (;;) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      // 1px 未満に潰れると toBlob が落ちるので、最低 1px は残す
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const blob = await drawToPng(width, height, (ctx) => {
        ctx.drawImage(bitmap, 0, 0, width, height);
      });
      // これ以上小さくしても意味が無いところまで来たら、そのまま返して
      // 上げ先の判断に委ねる（無限ループにしない）
      if (blob.size <= ROOM_LOGO_MAX_BYTES || width <= 64 || height <= 64) return blob;
      edge = Math.round(edge / 2);
    }
  } finally {
    bitmap.close();
  }
}
