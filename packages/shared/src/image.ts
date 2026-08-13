import { ROOM_STAMP_SIZE } from "./constants";

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
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // iOS の HEIC は Safari が JPEG に変換して渡すことが多いが、
    // そのまま渡ってきた場合や壊れたファイルはここで落ちる。
    throw new Error("この画像は読み込めませんでした。別の画像を選んでください");
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = ROOM_STAMP_SIZE;
    canvas.height = ROOM_STAMP_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("この端末では画像を変換できませんでした");

    ctx.clearRect(0, 0, ROOM_STAMP_SIZE, ROOM_STAMP_SIZE);

    const scale = Math.min(ROOM_STAMP_SIZE / bitmap.width, ROOM_STAMP_SIZE / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (ROOM_STAMP_SIZE - width) / 2, (ROOM_STAMP_SIZE - height) / 2, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) throw new Error("画像の変換に失敗しました");

    return blob;
  } finally {
    bitmap.close();
  }
}
