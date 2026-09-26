/**
 * Windows スパイク専用のダミーオーバーレイ。
 *
 * 答えたい問いは1つだけ: **WebView2 の透過窓が、PowerPoint のスライドショー全画面の上に、
 * クリックスルーのまま、ちらつかずに出るか。** そのために必要な最小の見た目だけを描く。
 * Supabase にも `@layertalk/shared` にも繋がない（透過がダメだったときの無駄を減らすため）。
 *
 * 透過が確認できたら、このファイルごと捨てて本物の `OverlayWindow` に差し替える。
 *
 * 置いてあるもの:
 * - **縁取り文字**（本番の `.lt-overlay-text` と同じ「白字＋黒縁」）… スライドの地の色に
 *   かかわらず読めるかを見る
 * - **不透明な板**（フキダシ相当）… 透過の地の上で不透明な要素が正しく出るか
 * - **横に流れる要素**… スライド送りのタイミングでちらつかないか
 * - **右下の HUD**… 毎秒カウントアップする。**止まったら webview が凍っている**
 *   （macOS の罠 #20 が Windows でも起きるかの判定に使う）
 */

const root = document.getElementById("root");
if (!root) throw new Error("#root が見つかりません");

/** 本番の `.lt-overlay-text` と同じ見た目。縁を塗りの下に敷く（`paint-order`）。 */
const OUTLINE = `
  color: #fff;
  -webkit-text-stroke: 3px rgba(0, 0, 0, 0.85);
  paint-order: stroke fill;
  font-weight: 700;
`;

function el(tag: string, style: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

// 1. 縁取り文字を数行。位置は画面の上・中・下に散らす（どこでも読めるかを見る）。
const lines = [
  "透過テスト: この文字の後ろにスライドが見えていれば成功",
  "クリックスルー: この文字の上をクリックしてページが送れるか",
  "縁取り: 白い背景でも黒い背景でも読めるか",
];
lines.forEach((text, index) => {
  root.append(
    el(
      "div",
      `position: absolute; left: 4vw; top: ${12 + index * 12}vh;
       font-size: 34px; ${OUTLINE}`,
      text,
    ),
  );
});

// 2. 不透明な板（本番のフキダシ相当）。透過の地の上で、不透明が不透明に見えるか。
root.append(
  el(
    "div",
    `position: absolute; left: 4vw; top: 52vh; max-width: 40vw;
     background: #fff; color: #111; border-radius: 16px;
     padding: 14px 18px; font-size: 22px; font-weight: 600;
     box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);`,
    "不透明な板。ここだけスライドが透けなければ正しい。",
  ),
);

// 3. 横に流れる要素。スライドを送ったときにちらつく／残像が出ないかを見る。
const style = document.createElement("style");
style.textContent = `
  @keyframes lt-spike-flow {
    from { transform: translateX(100vw); }
    to   { transform: translateX(-60vw); }
  }
  .lt-spike-flow {
    position: absolute;
    top: 72vh;
    white-space: nowrap;
    font-size: 40px;
    animation: lt-spike-flow 12s linear infinite;
  }
`;
document.head.append(style);

const flowing = el("div", OUTLINE, "流れるコメントの代わり ＞＞＞");
flowing.className = "lt-spike-flow";
root.append(flowing);

// 4. HUD。**カウントが止まったら webview が凍っている。**
const hud = el(
  "div",
  `position: absolute; right: 16px; bottom: 16px;
   background: rgba(0, 0, 0, 0.72); color: #0f0;
   font-family: ui-monospace, "Cascadia Mono", Menlo, monospace;
   font-size: 13px; line-height: 1.5; padding: 8px 12px; border-radius: 8px;`,
);
root.append(hud);

let ticks = 0;
function renderHud() {
  ticks += 1;
  hud.textContent = [
    `tick   ${ticks}`,
    `time   ${new Date().toLocaleTimeString()}`,
    `size   ${window.innerWidth}x${window.innerHeight}`,
    `dpr    ${window.devicePixelRatio}`,
    `hidden ${document.visibilityState}`,
  ].join("\n");
  hud.style.whiteSpace = "pre";
}
renderHud();
window.setInterval(renderHud, 1000);
