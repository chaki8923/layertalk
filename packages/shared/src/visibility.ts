/**
 * ページが見えるようになった瞬間に `handler` を呼ぶ。戻り値で解除する。
 *
 * 見えていないページは止められる。発表者アプリの隠れた窓は約 6 秒でページごと凍り
 * （実測。外から届いたソケットのデータでは起きない）、スマホのブラウザは
 * バックグラウンドのタブを止める。そのあいだの Realtime のイベントは起きるまで届かないので、
 * 戻ってきたときに取り直す合図に使う。**`hidden` への遷移では呼ばない。**
 *
 * `document` が無い環境（SSR）では何もしない。
 */
export function onPageVisible(handler: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const listener = () => {
    if (document.visibilityState === "visible") handler();
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
