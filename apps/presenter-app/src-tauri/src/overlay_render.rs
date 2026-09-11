//! オーバーレイのネイティブ描画。
//!
//! # なぜ webview をやめるのか
//!
//! **macOS の WKWebView を透過させる公開 API は存在しない。** wry が透過を作っている実体は
//! `WKWebViewConfiguration` への `setValue:forKey:@"drawsBackground"`
//! （`wry-0.55.1/src/wkwebview/mod.rs:367-384`）という private な KVC キーで、これが
//! `macos-private-api` feature の中身そのもの。App Store の 2.5.1（公開 API のみ）に反するので、
//! **透過が要る窓からは webview を外し、ここで Core Animation を使って直接描く。**
//! iOS の `isOpaque = false` に相当するものは macOS に無い（WebKit bug 200528 は 2019 年から未解決）。
//!
//! 窓そのものは元から公開 API だけで作れている（`native_overlay` の `setOpaque(false)` +
//! `clearColor`）ので、変えるのは「窓の中身」だけで済む。
//!
//! # 描画モデル
//!
//! ホスト `NSView` を1枚置き、その `CALayer` に流れる文字を1件1レイヤで足していく。
//! アニメーションは Core Animation に任せる（レンダーサーバ側で回るので、
//! アプリのメインスレッドが詰まっても止まらない ＝ 罠 #1 の motion のような
//! 「duration が黙って捨てられる」事故が構造的に起きない）。
//!
//! # 座標系
//!
//! `NSView` の既定は**左下原点**。移植元（`FlowLayer.tsx`）は Web なので上下が逆になる。
//! flipped なサブクラスを `define_class!` で作るより、置くときに 1 回変換するほうが短い。
//! 変換は `top_to_bottom_origin` の 1 箇所だけに閉じてある。

#![cfg(target_os = "macos")]

use std::cell::RefCell;
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2::{AllocAnyThread, MainThreadMarker};
use objc2_app_kit::{
    NSAttributedStringNSExtendedStringDrawing, NSAttributedStringNSStringDrawing, NSColor, NSFont,
    NSFontWeightBold, NSLineBreakMode,
    NSMutableParagraphStyle, NSStringDrawingOptions, NSStrokeColorAttributeName,
    NSStrokeWidthAttributeName, NSTextAlignment, NSView,
};
use objc2_core_graphics::CGMutablePath;
use objc2_foundation::{
    ns_string, NSArray, NSAttributedString, NSMutableAttributedString, NSNumber, NSPoint, NSRect,
    NSSize, NSString,
};
// `setDuration` / `setFillMode` は CAAnimation 固有ではなく **CAMediaTiming プロトコル**の
// メソッドなので、トレイトを import しないと生えてこない。
use objc2_quartz_core::{
    kCAFillModeForwards, kCAMediaTimingFunctionEaseInEaseOut, kCAMediaTimingFunctionEaseOut,
    kCAMediaTimingFunctionLinear, CAAnimationGroup, CABasicAnimation, CACurrentMediaTime, CALayer,
    CAKeyframeAnimation, CAMediaTiming, CAMediaTimingFunction, CAShapeLayer, CATextLayer,
    CATransaction,
};

/// レーンの間隔(px)。**`FlowLayer.tsx` の `LANE_GAP_PX` と同じ値であること。**
const LANE_GAP_PX: f64 = 24.0;
const TOP_MARGIN_RATIO: f64 = 0.06;
const USABLE_HEIGHT_RATIO: f64 = 0.72;

/// 流れ終わったレイヤを抱えたままにしない上限。押しっぱなしでも増え続けないための保険。
const MAX_LIVE_LAYERS: usize = 400;

// ---------------------------------------------------------------- フキダシの定数
//
// **移植元は `BubbleLayer.tsx` と `theme.css` の `.lt-overlay-bubble`。値を勝手に動かさない。**

/// レーン数。`BubbleLayer.tsx` の `LANES`。
const BUBBLE_LANES: usize = 3;
/// 同時に生かす上限。`BubbleLayer.tsx` の `MAX_ITEMS`。
/// 横流し(400)よりずっと小さいのは、**不透明な板なので積み上がると背後が見えなくなる**ため。
const BUBBLE_MAX_ITEMS: usize = 18;
/// 先行するフキダシとの縦の間隔。`BubbleLayer.tsx` の `LANE_GAP_PX`。
/// **横流しの `LANE_GAP_PX`(24) とは別物。使い回さないこと。**
const BUBBLE_LANE_GAP_PX: f64 = 40.0;
/// `.lt-overlay-bubble` の `padding: 14px 22px`。
const BUBBLE_PAD_X: f64 = 22.0;
const BUBBLE_PAD_Y: f64 = 14.0;
/// ラッパーの `padding: 0 12px`。レーン幅から引く。
const BUBBLE_WRAPPER_PAD_X: f64 = 12.0;
/// `--radius-card`。
const BUBBLE_RADIUS: f64 = 20.0;
/// しっぽ。CSS は枠線の三角(`::before`)に塗りの三角(`::after`)を少し小さく重ねて、
/// はみ出した外周だけを枠線に見せている。`left:26px` / `border-width: 15px 13px` と
/// `bottom:-12px` / `border-width: 13px 11px`。
const BUBBLE_TAIL_LEFT: f64 = 26.0;
const BUBBLE_TAIL_BORDER_W: f64 = 13.0;
const BUBBLE_TAIL_BORDER_H: f64 = 15.0;
const BUBBLE_TAIL_FILL_W: f64 = 11.0;
const BUBBLE_TAIL_FILL_H: f64 = 13.0;
/// `::after` を 1px ぶん上へ食い込ませて、本体の下辺の枠線がしっぽの根元を横切るのを隠す。
const BUBBLE_TAIL_FILL_OVERLAP: f64 = 1.0;
// ---------------------------------------------------------------- スタンプの定数
//
// **移植元は `StampLayer.tsx`。係数を勝手に動かさない。**

/// 同時に生きられる粒の上限。`StampLayer.tsx` の `MAX_PARTICLES`。
/// 上昇が遅い＝1個あたりの寿命が長いぶん同時数は増える。**低すぎると画面の途中にいる粒が
/// 消えて「ちらつき」に見える**ので余裕を持たせてある。
const MAX_PARTICLES: usize = 200;
// ---------------------------------------------------------------- 常設レイヤの定数

/// 参加QR の左下からの距離。移植元は `bottom-8 left-8`（2rem）。
const QR_INSET: f64 = 32.0;
/// モニター確認カード。移植元は `inset-3` / `rounded-[28px]` / `border-[6px]` / `px-10 py-7`。
const PEEK_FRAME_INSET: f64 = 12.0;
const PEEK_RADIUS: f64 = 28.0;
const PEEK_BORDER_W: f64 = 6.0;
const PEEK_PAD_X: f64 = 40.0;
const PEEK_PAD_Y: f64 = 28.0;

/// 出現は下端の 64px 下から（CSS の `bottom: -64px`）。
const STAMP_START_BELOW: f64 = 64.0;

/// `line-height: 1.35`。
const BUBBLE_LINE_HEIGHT: f64 = 1.35;
/// 画面下から出て上へ抜けるまでの余白（`BubbleLayer.tsx` の `+36` / `-(height + 48)`）。
const BUBBLE_ENTER_MARGIN: f64 = 36.0;
const BUBBLE_EXIT_MARGIN: f64 = 48.0;

thread_local! {
    /// 描画状態はメインスレッド専用。`thread_local!` にしてあるのは、
    /// CALayer / NSView が `Send` でないため（`Mutex` に入れられない）。
    /// **メインスレッド以外から触らないこと** — 入口の `MainThreadMarker::new()` で弾いている。
    static STATE: RefCell<Option<RenderState>> = const { RefCell::new(None) };
}

struct LiveLayer {
    layer: Retained<CALayer>,
    /// これを過ぎたら外してよい時刻。
    expires_at: Instant,
}

struct RenderState {
    host: Retained<NSView>,
    root: Retained<CALayer>,
    /// レーンごとの「次に空く時刻」。同じレーンでの追突を防ぐ唯一の状態。
    /// 移植元と同じく、空きレーンから**抽選**する（先頭詰めにすると疎なときに
    /// 全部が最上段を流れる）。
    lane_free_at: Vec<Instant>,
    live: Vec<LiveLayer>,
    /// フキダシは横流しと**別の**レーン状態を持つ。数(3)も間隔(40px)も選び方も違う。
    /// 混ぜると片方の予約でもう片方が待たされる。
    bubble_lane_free_at: Vec<Instant>,
    /// フキダシのレーンは抽選ではなく**ラウンドロビン**（移植元 `laneCursorRef`）。
    bubble_lane_cursor: usize,
    bubble_live: Vec<LiveLayer>,
    stamp_live: Vec<LiveLayer>,
    /// カスタムスタンプの復号済み画像。**id をキーに使い回す。**
    /// 200 粒のバーストで毎回復号すると間に合わないので、一覧が届いた時点で温めておく
    /// （移植元が `new Image()` でブラウザキャッシュを温めていたのと同じ役割）。
    stamp_images: std::collections::HashMap<String, Retained<objc2_core_graphics::CGImage>>,
    /// 参加QR とモニター確認カードは**常設レイヤ**。粒やコメントと違って寿命で消えないので、
    /// `sweep` には載せない。**消す責任は呼び出し側にある** —— 消し忘れるとスライドに残り続ける。
    qr_layer: Option<Retained<CALayer>>,
    /// QR の `CGImage` を生かしておく受け皿。
    ///
    /// スタンプ側は `stamp_images` が強参照を持つが、QR には持ち主が居なかった。
    /// `CALayer::setContents` は自分で保持するので**無くても描けるはず**だが、
    /// CF 型を `AnyObject` へ落として渡している経路なので、寿命を暗黙に頼らない。
    qr_image: Option<Retained<objc2_core_graphics::CGImage>>,
    peek_layer: Option<Retained<CALayer>>,
    scale: f64,
}

/// 全角/半角を雑に見分けて文字幅を見積もる。
///
/// **移植元（`FlowLayer.tsx` の `estimateTextWidth`）と同じ係数にしてあること。**
/// Core Text で実測すればもっと正確だが、1件ごとにレイアウトを走らせる価値は無い
/// （見積もりが要るのはレーンの占有時間の計算だけで、描画位置には使わない）。
fn estimate_text_width(text: &str, font_size: f64) -> f64 {
    let mut units = 0.0;
    for ch in text.chars() {
        // 半角英数記号・半角カナはおよそ 0.55em、それ以外（日本語・絵文字）は 1em 強
        let narrow = matches!(ch, '\u{20}'..='\u{7E}' | '\u{FF61}'..='\u{FF9F}');
        units += if narrow { 0.55 } else { 1.05 };
    }
    units * font_size
}

/// Web の `top`（上からの距離）を AppKit の下からの原点へ直す。**変換はここだけ。**
fn top_to_bottom_origin(host_height: f64, top: f64, item_height: f64) -> f64 {
    host_height - top - item_height
}

/// 縁取り文字の描き分け。**2 回描くのが要点**（`outlined_string` の説明を読むこと）。
#[derive(Copy, Clone, PartialEq, Eq)]
enum Pass {
    /// 黒縁だけ。塗らない。下に敷く。
    Stroke,
    /// 白い塗りだけ。縁を描かない。上に載せる。
    Fill,
}

/// 縁取り文字を組む。**1 枚では正しく描けない。**
///
/// 見本は `lt-overlay-text`（`theme.css:120-126`）で、白の塗り + 3px の黒縁（85%）。
/// そこには **`paint-order: stroke fill`** が付いていて、コメントが理由まで書いている
/// —— 「無いと縁取りが字面を侵食して細字が潰れる」。**縁を先に描いて、塗りを上に載せる**
/// という指定で、CSS の既定（塗り → 縁）をわざわざ打ち消している。
///
/// ところが AppKit の `NSStrokeWidthAttributeName` に**負値**を入れた場合の順序は
/// まさにその既定（塗り → 縁）で、`paint-order` に相当する属性が無い。縁は輪郭の
/// **中心**に引かれるので、幅の半分が字面を内側から食う。30pt に 3px の縁だと
/// 字面が黒で埋まりきる。
///
/// **実測（2026-09-08、セルフテストの全画面スクショを画素で確認）**: 1 枚で描いた文字は
/// 字面が `rgb(38,38,38)` だった。これは黒 85% を白背景に載せた値そのもの
/// （255 × 0.15 = 38.25）で、**白い塗りが 1 画素も見えていない**ことを意味する。
///
/// なので `Stroke` → `Fill` の順に 2 枚重ねて `paint-order: stroke fill` を作る。
/// AppKit の `NSStrokeWidthAttributeName` は
/// 0 = 縁なし / **正値 = 縁だけ（塗らない）** / 負値 = 塗りと縁の両方、なので
/// 下敷きは正値、上載せは属性ごと付けない。
///
/// **未移植の差分**: `text-shadow: 0 2px 8px rgb(0 0 0 / 0.6)`。白＋黒縁だけでも読めるので
/// 落としてある。入れるなら `CALayer` の shadow だが、流れている全レイヤに影を付けると
/// オフスクリーン描画が増えるので、実測してから入れること。
fn outlined_string(text: &str, font_size: f64, pass: Pass) -> Retained<NSAttributedString> {
    let ns_text = NSString::from_str(text);
    let attributed = NSMutableAttributedString::from_nsstring(&ns_text);
    let full_range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };

    unsafe {
        let font = NSFont::systemFontOfSize_weight(font_size, NSFontWeightBold);
        attributed.addAttribute_value_range(
            objc2_app_kit::NSFontAttributeName,
            &*font,
            full_range,
        );

        match pass {
            Pass::Stroke => {
                let stroke_color = NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.85);
                attributed.addAttribute_value_range(
                    NSStrokeColorAttributeName,
                    &*stroke_color,
                    full_range,
                );
                // 3px 相当を百分率へ。**正値 = 縁だけ**。
                let percent = (3.0 / font_size) * 100.0;
                attributed.addAttribute_value_range(
                    NSStrokeWidthAttributeName,
                    &*NSNumber::new_f64(percent),
                    full_range,
                );
            }
            Pass::Fill => {
                attributed.addAttribute_value_range(
                    objc2_app_kit::NSForegroundColorAttributeName,
                    &*NSColor::whiteColor(),
                    full_range,
                );
            }
        }
    }

    Retained::into_super(attributed)
}

/// ホストビューを作る（まだどの窓にも属さない）。
///
/// 呼び出し側（`native_overlay`）が窓の `contentView` に据える。webview を載せ替える
/// 既存の経路とは**排他**であること — `contentView` は 1 枚しか持てない。
pub fn make_host_view(mtm: MainThreadMarker, frame: NSRect, scale: f64) -> Retained<NSView> {
    let host = NSView::initWithFrame(mtm.alloc::<NSView>(), frame);
    host.setWantsLayer(true);

    let root = CALayer::layer();
    root.setFrame(frame);
    // 画面外へ抜けた文字を窓の外に描かせない。
    root.setMasksToBounds(true);
    // **Retina で文字がぼやけるのはここを忘れたとき。** 既定は 1.0。
    root.setContentsScale(scale);
    host.setLayer(Some(&root));

    STATE.with(|cell| {
        *cell.borrow_mut() = Some(RenderState {
            host: host.clone(),
            root,
            lane_free_at: Vec::new(),
            live: Vec::new(),
            bubble_lane_free_at: Vec::new(),
            bubble_lane_cursor: 0,
            bubble_live: Vec::new(),
            stamp_live: Vec::new(),
            stamp_images: std::collections::HashMap::new(),
            qr_layer: None,
            qr_image: None,
            peek_layer: None,
            scale,
        });
    });

    host
}

/// 窓のサイズが変わったときに追従させる。
pub fn resize(frame: NSRect, scale: f64) {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };
    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        state.host.setFrame(frame);
        state.root.setFrame(frame);
        state.root.setContentsScale(scale);
        state.scale = scale;
        // レーン構成は高さ依存なので作り直させる。
        state.lane_free_at.clear();
        state.bubble_lane_free_at.clear();
    });
}

/// 流れているものを全部消す。発表の開始・終了で呼ぶ。
pub fn clear() {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };
    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        for entry in state.live.drain(..) {
            entry.layer.removeFromSuperlayer();
        }
        for entry in state.bubble_live.drain(..) {
            entry.layer.removeFromSuperlayer();
        }
        for entry in state.stamp_live.drain(..) {
            entry.layer.removeFromSuperlayer();
        }
        // 常設レイヤも落とす。発表を終えたのに QR が残っている、を防ぐ。
        if let Some(layer) = state.qr_layer.take() {
            layer.removeFromSuperlayer();
        }
        state.qr_image = None;
        if let Some(layer) = state.peek_layer.take() {
            layer.removeFromSuperlayer();
        }
        // **画像キャッシュは消さない。** 発表の開始・終了で `clear()` が呼ばれるが、
        // 復号し直す理由が無い（ルームを切り替えたら一覧ごと入れ替わる）。
        state.lane_free_at.clear();
        // 戻し忘れると、再開直後の数件が前回の予約時刻ぶん遅れて出てくる（移植元と同じ）。
        state.bubble_lane_free_at.clear();
    });
}

/// 期限切れのレイヤを外す。
///
/// 完了ブロックを使わないのは、レイヤ1枚ごとに Rust のクロージャを Objective-C の
/// ブロックとして生かし続けることになり、`STATE` への借用と寿命が絡むから
/// （`block2` 自体は CALayer が既に引き込んでいるので、依存の話ではない）。
/// 押されたときに掃くだけで足りる — 流れ終わったレイヤは画面外に居るので、
/// 残っていても見えない。
fn sweep_list(list: &mut Vec<LiveLayer>, now: Instant, max: usize) {
    list.retain(|entry| {
        if entry.expires_at > now {
            return true;
        }
        entry.layer.removeFromSuperlayer();
        false
    });

    // それでも溢れるなら古いものから落とす。
    while list.len() > max {
        let entry = list.remove(0);
        entry.layer.removeFromSuperlayer();
    }
}

fn sweep(state: &mut RenderState) {
    let now = Instant::now();
    sweep_list(&mut state.live, now, MAX_LIVE_LAYERS);
    // フキダシの上限は移植元の `MAX_ITEMS`。横流しよりずっと小さい（不透明な板なので
    // 積み上がると背後が見えなくなる）。
    sweep_list(&mut state.bubble_live, now, BUBBLE_MAX_ITEMS);
    // スタンプは移植元の `MAX_PARTICLES`。上限が低すぎると、まだ画面の途中にいる粒が
    // 消えて「ちらつき」に見えるので余裕を持たせてある。
    sweep_list(&mut state.stamp_live, now, MAX_PARTICLES);
}

/// コメントを1件、右から左へ流す。
///
/// レーンの決め方は `FlowLayer.tsx` の移植。**速度は全コメントで一定**にすること
/// （可変にすると長文が短文を追い越して重なる）。
pub fn push_comment(text: &str, font_size: f64, opacity: f64, base_duration_sec: f64) {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };
    if text.is_empty() {
        return;
    }

    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        sweep(state);

        let bounds = state.root.bounds();
        let viewport_w = bounds.size.width;
        let viewport_h = bounds.size.height;
        if viewport_w <= 0.0 || viewport_h <= 0.0 {
            return;
        }

        let lane_height = (font_size * 1.55).round();
        let usable_top = (viewport_h * TOP_MARGIN_RATIO).round();
        let usable_height = viewport_h * USABLE_HEIGHT_RATIO;
        let lane_count = ((usable_height / (lane_height + LANE_GAP_PX)).floor() as usize).max(1);

        let now = Instant::now();
        if state.lane_free_at.len() != lane_count {
            state.lane_free_at.resize(lane_count, now);
        }

        let width = estimate_text_width(text, font_size);
        // 速度を全コメントで一定にする。
        let px_per_sec = viewport_w / base_duration_sec;
        let duration_sec = (viewport_w + width) / px_per_sec;
        // 文字列の末尾が右端を抜けきるまで。これを過ぎたらレーンを再利用できる。
        let clear_after = Duration::from_secs_f64(((width + LANE_GAP_PX) / px_per_sec).max(0.0));

        // 空きレーンから抽選する。先頭詰めだと疎なときに全部が最上段を流れる。
        let free: Vec<usize> = (0..lane_count)
            .filter(|&i| state.lane_free_at[i] <= now)
            .collect();
        let lane = if free.is_empty() {
            // 全部埋まっている → 最も早く空くレーンに重ねる（出さないよりはまし）。
            let mut best = 0;
            for i in 1..lane_count {
                if state.lane_free_at[i] < state.lane_free_at[best] {
                    best = i;
                }
            }
            best
        } else {
            free[pseudo_random_index(free.len())]
        };
        state.lane_free_at[lane] = now + clear_after;

        // レーン内でさらに揺らしてグリッド感を消す。
        // **振れ幅は隙間の半分まで。これ以上広げると隣のレーンの文字と重なる。**
        let jitter = (pseudo_random_unit() * 2.0 - 1.0) * (LANE_GAP_PX / 2.0);
        let top = usable_top + lane as f64 * (lane_height + LANE_GAP_PX) + jitter;

        // `paint-order: stroke fill` を作るため、縁と塗りを別レイヤにして重ねる。
        // 動かすのは入れ物のほうだけ —— 2 枚に別々のアニメーションを当てると、
        // わずかでもずれた瞬間に縁と字面が分離して見える。
        let layer = CALayer::layer();
        let stroke_layer = CATextLayer::layer();
        let fill_layer = CATextLayer::layer();
        let stroke_text = outlined_string(text, font_size, Pass::Stroke);
        let fill_text = outlined_string(text, font_size, Pass::Fill);
        unsafe {
            stroke_layer.setString(Some(&*stroke_text));
            fill_layer.setString(Some(&*fill_text));
            // **両方に要る。** 入れ物に付けても子には降りてこないので、
            // 付け忘れた側だけ Retina でぼやける。
            stroke_layer.setContentsScale(state.scale);
            fill_layer.setContentsScale(state.scale);
            layer.setOpacity(opacity as f32);
            // 見積もり幅では足りないことがあるので、実際に要る幅を取る。
            // ここで切り詰めると末尾が消える（140文字でも省略しない方針）。
            let measured = fill_text.size();
            let w = measured.width.max(width) + font_size; // 縁のぶん少し広く
            let h = lane_height.max(measured.height);
            let y = top_to_bottom_origin(viewport_h, top, h);
            layer.setFrame(NSRect::new(
                NSPoint::new(viewport_w, y),
                NSSize::new(w, h),
            ));
            // 子は入れ物いっぱい。順序がそのまま重ね順（先に足したものが下）。
            let inner = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(w, h));
            stroke_layer.setFrame(inner);
            fill_layer.setFrame(inner);
            layer.addSublayer(&stroke_layer);
            layer.addSublayer(&fill_layer);

            let animation = CABasicAnimation::animationWithKeyPath(Some(ns_string!("position.x")));
            // anchorPoint は既定の (0.5, 0.5) なので position は中心を指す。
            let from = viewport_w + w / 2.0;
            let to = -(w / 2.0) - 40.0;
            animation.setFromValue(Some(&*NSNumber::new_f64(from)));
            animation.setToValue(Some(&*NSNumber::new_f64(to)));
            animation.setDuration(duration_sec);
            animation.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionLinear)));
            // 終わった位置（画面外）に留める。既定だと開始位置へ戻って再表示される。
            animation.setRemovedOnCompletion(false);
            animation.setFillMode(kCAFillModeForwards);

            // 追加とアニメーションを 1 トランザクションにまとめ、暗黙アニメーションを切る。
            // 切らないと、レイヤ追加時のフェードが縁取りの見た目を濁らせる。
            CATransaction::begin();
            CATransaction::setDisableActions(true);
            state.root.addSublayer(&layer);
            layer.addAnimation_forKey(&animation, Some(ns_string!("flow")));
            CATransaction::commit();

            state.live.push(LiveLayer {
                layer,
                expires_at: now + Duration::from_secs_f64(duration_sec + 0.2),
            });
        }
    });
}

// ---------------------------------------------------------------- フキダシ

/// 板の上に載せる文字。**`outlined_string` の縁取りは使わない。**
/// `theme.css:128-129` が「`lt-overlay-text` と併用しない — 白い板の上に白文字＋黒縁は
/// 読めない」と書いているとおり、ここは濃い色の素の塗りだけ。
fn bubble_string(text: &str, font_size: f64) -> Retained<NSAttributedString> {
    let ns_text = NSString::from_str(text);
    let attributed = NSMutableAttributedString::from_nsstring(&ns_text);
    let full_range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };

    unsafe {
        let font = NSFont::systemFontOfSize_weight(font_size, NSFontWeightBold);
        attributed.addAttribute_value_range(objc2_app_kit::NSFontAttributeName, &*font, full_range);
        // --lt-bubble-text: #12161f
        let color = NSColor::colorWithSRGBRed_green_blue_alpha(
            18.0 / 255.0,
            22.0 / 255.0,
            31.0 / 255.0,
            1.0,
        );
        attributed.addAttribute_value_range(
            objc2_app_kit::NSForegroundColorAttributeName,
            &*color,
            full_range,
        );

        // 中央揃え・単語折り返し。**折り返しが要る**ので `CATextLayer::setWrapped(true)` と対で使う。
        let para = NSMutableParagraphStyle::new();
        para.setAlignment(NSTextAlignment::Center);
        para.setLineBreakMode(NSLineBreakMode::ByWordWrapping);
        para.setLineHeightMultiple(BUBBLE_LINE_HEIGHT);
        attributed.addAttribute_value_range(
            objc2_app_kit::NSParagraphStyleAttributeName,
            &*para,
            full_range,
        );
    }

    Retained::into_super(attributed)
}

/// `setValues` は型なしの `NSArray` を取るので、`AnyObject` に落として組む。
fn number_values(values: &[f64]) -> Retained<NSArray> {
    let numbers: Vec<Retained<NSNumber>> = values.iter().map(|v| NSNumber::new_f64(*v)).collect();
    let refs: Vec<&objc2::runtime::AnyObject> = numbers
        .iter()
        .map(|n| AsRef::<objc2::runtime::AnyObject>::as_ref(&**n))
        .collect();
    NSArray::from_slice(&refs)
}

/// `setKeyTimes` は `NSArray<NSNumber>` を取るのでこちらは型付きのまま。
fn number_times(values: &[f64]) -> Retained<NSArray<NSNumber>> {
    let numbers: Vec<Retained<NSNumber>> = values.iter().map(|v| NSNumber::new_f64(*v)).collect();
    NSArray::from_retained_slice(&numbers)
}

/// しっぽの三角。`(x, y)` は入れ物の左下を原点にした AppKit 座標。
fn tail_layer(left: f64, top_y: f64, width: f64, height: f64, color: &NSColor) -> Retained<CAShapeLayer> {
    let layer = CAShapeLayer::layer();
    let path = CGMutablePath::new();
    unsafe {
        // CSS の三角（border-width: H W 0 0 / border-top-color だけ着色）は、
        // 左上・右上・左下を結ぶ直角三角形になる。
        CGMutablePath::move_to_point(Some(&path), std::ptr::null(), left, top_y);
        CGMutablePath::add_line_to_point(Some(&path), std::ptr::null(), left + width, top_y);
        CGMutablePath::add_line_to_point(Some(&path), std::ptr::null(), left, top_y - height);
        CGMutablePath::close_subpath(Some(&path));
        layer.setPath(Some(&path));
        layer.setFillColor(Some(&color.CGColor()));
    }
    layer
}

/// フキダシを 1 件流す。下から上へ、揺れながら。
///
/// **`push_comment`（横流し）とはレーンの数も間隔も選び方も違う。** あちらは抽選、
/// こちらはラウンドロビン。不透明な板なので、同じレーンで重ねると後発が先発を完全に隠す
/// —— だから先行が `BUBBLE_LANE_GAP_PX` ぶん抜けるまで発射を待つ。
pub fn push_bubble(text: &str, font_size: f64, opacity: f64, base_duration_sec: f64) {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };
    if text.is_empty() {
        return;
    }

    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        sweep(state);

        let bounds = state.root.bounds();
        let viewport_w = bounds.size.width;
        let viewport_h = bounds.size.height;
        if viewport_w <= 0.0 || viewport_h <= 0.0 {
            return;
        }

        let now = Instant::now();
        if state.bubble_lane_free_at.len() != BUBBLE_LANES {
            state.bubble_lane_free_at.resize(BUBBLE_LANES, now);
        }

        // レーンは抽選せず順番に回す（移植元 `laneCursorRef`）。
        let lane = state.bubble_lane_cursor % BUBBLE_LANES;
        state.bubble_lane_cursor = (state.bubble_lane_cursor + 1) % BUBBLE_LANES;

        // 幅は「短文は文字に吸い付き、長文はレーン幅まで伸びてから折り返す」。
        let lane_w = viewport_w / BUBBLE_LANES as f64;
        let max_text_w = (lane_w - BUBBLE_WRAPPER_PAD_X * 2.0 - BUBBLE_PAD_X * 2.0).max(1.0);
        let attributed = bubble_string(text, font_size);
        // **`boundingRectWithSize:options:`（2引数）は deprecated カテゴリのほう。**
        // objc2 は非推奨版と現行版の両方を生やすので、名前が短いほうを掴むと
        // そのまま非推奨 API を使うことになる（2.5.1 は排除も求める）。context を取る現行版が正。
        let measured = attributed.boundingRectWithSize_options_context(
            NSSize::new(max_text_w, 1.0e5),
            NSStringDrawingOptions::UsesLineFragmentOrigin,
            None,
        );
        let text_w = measured.size.width.ceil().min(max_text_w);
        let text_h = measured.size.height.ceil();
        // min-width: 2.5em（1〜2文字でも棒にならない）
        let body_w = (text_w + BUBBLE_PAD_X * 2.0).max(font_size * 2.5);
        let body_h = text_h + BUBBLE_PAD_Y * 2.0;
        // 入れ物はしっぽのぶんだけ下に伸ばす。
        let total_h = body_h + BUBBLE_TAIL_BORDER_H;

        let reduce_motion = reduce_motion();
        let duration = if reduce_motion { 6.0 } else { base_duration_sec };

        // Web は上原点。AppKit は下原点で、しかも position は**中心**を指す。
        let start_top = if reduce_motion {
            viewport_h * (0.18 + lane as f64 * 0.2)
        } else {
            viewport_h + BUBBLE_ENTER_MARGIN
        };
        let end_top = if reduce_motion {
            start_top
        } else {
            -(total_h + BUBBLE_EXIT_MARGIN)
        };
        let start_y = top_to_bottom_origin(viewport_h, start_top, total_h) + total_h / 2.0;
        let end_y = top_to_bottom_origin(viewport_h, end_top, total_h) + total_h / 2.0;

        let center_x = lane_w * lane as f64 + lane_w / 2.0;
        let sway = if reduce_motion {
            0.0
        } else {
            (18.0 + pseudo_random_unit() * 36.0) * if pseudo_random_unit() < 0.5 { -1.0 } else { 1.0 }
        };

        // 先行が抜けるまで待つ。静止表示のときはレーンを空けようがないので待たない。
        let mut delay = 0.0;
        if !reduce_motion {
            let px_per_sec = (start_top - end_top) / duration;
            delay = state.bubble_lane_free_at[lane]
                .saturating_duration_since(now)
                .as_secs_f64();
            state.bubble_lane_free_at[lane] = now
                + Duration::from_secs_f64(delay + (total_h + BUBBLE_LANE_GAP_PX) / px_per_sec);
        }

        let layer = CALayer::layer();
        let body = CALayer::layer();
        let label = CATextLayer::layer();

        unsafe {
            let bg = NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 1.0);
            // --lt-bubble-border: rgb(15 20 32 / 0.14)
            let border = NSColor::colorWithSRGBRed_green_blue_alpha(
                15.0 / 255.0,
                20.0 / 255.0,
                32.0 / 255.0,
                0.14,
            );

            layer.setFrame(NSRect::new(
                NSPoint::new(center_x - body_w / 2.0, start_y - total_h / 2.0),
                NSSize::new(body_w, total_h),
            ));
            layer.setOpacity(0.0);

            body.setFrame(NSRect::new(
                NSPoint::new(0.0, BUBBLE_TAIL_BORDER_H),
                NSSize::new(body_w, body_h),
            ));
            body.setCornerRadius(BUBBLE_RADIUS);
            body.setBackgroundColor(Some(&bg.CGColor()));
            body.setBorderWidth(1.0);
            body.setBorderColor(Some(&border.CGColor()));
            body.setContentsScale(state.scale);
            // **影は 1 枚しか持てない。** CSS は 2 枚重ねているので、大きいほうだけ近似する
            // （`0 14px 34px -10px rgb(0 0 0 / .45)`。spread に相当するものは無い）。
            body.setShadowColor(Some(&NSColor::blackColor().CGColor()));
            body.setShadowOpacity(0.45);
            body.setShadowOffset(NSSize::new(0.0, -14.0));
            body.setShadowRadius(17.0);

            label.setString(Some(&*attributed));
            label.setWrapped(true);
            label.setContentsScale(state.scale);
            label.setFrame(NSRect::new(
                NSPoint::new(BUBBLE_PAD_X, BUBBLE_TAIL_BORDER_H + BUBBLE_PAD_Y),
                NSSize::new(body_w - BUBBLE_PAD_X * 2.0, text_h),
            ));

            // しっぽ。枠線の三角を先に、塗りの三角を上に。
            let tail_border = tail_layer(
                BUBBLE_TAIL_LEFT,
                BUBBLE_TAIL_BORDER_H,
                BUBBLE_TAIL_BORDER_W,
                BUBBLE_TAIL_BORDER_H,
                &border,
            );
            let tail_fill = tail_layer(
                BUBBLE_TAIL_LEFT,
                BUBBLE_TAIL_BORDER_H + BUBBLE_TAIL_FILL_OVERLAP,
                BUBBLE_TAIL_FILL_W,
                BUBBLE_TAIL_FILL_H,
                &bg,
            );
            tail_border.setContentsScale(state.scale);
            tail_fill.setContentsScale(state.scale);

            CATransaction::begin();
            CATransaction::setDisableActions(true);
            layer.addSublayer(&tail_border);
            layer.addSublayer(&body);
            layer.addSublayer(&tail_fill);
            layer.addSublayer(&label);
            state.root.addSublayer(&layer);

            let group = CAAnimationGroup::animation();
            let mut tracks: Vec<Retained<objc2_quartz_core::CAAnimation>> = Vec::new();

            // y: 下から上へ。終盤だけ緩やかに減速する（RISE_EASE）。
            let rise = CABasicAnimation::animationWithKeyPath(Some(ns_string!("position.y")));
            rise.setFromValue(Some(&*NSNumber::new_f64(start_y)));
            rise.setToValue(Some(&*NSNumber::new_f64(end_y)));
            rise.setDuration(duration);
            let rise_timing = if reduce_motion {
                CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionLinear)
            } else {
                // 移植元の RISE_EASE（`BubbleLayer` / `StampLayer` が使っていた制御点）。
                CAMediaTimingFunction::functionWithControlPoints(0.33, 0.33, 0.7, 0.92)
            };
            rise.setTimingFunction(Some(&rise_timing));
            tracks.push(Retained::into_super(Retained::into_super(rise)));

            if !reduce_motion {
                // x: 左右にひと揺れ。
                let sway_anim =
                    CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!("position.x")));
                let xs = number_values(&[
                    center_x,
                    center_x + sway,
                    center_x - sway * 0.55,
                    center_x,
                ]);
                sway_anim.setValues(Some(&xs));
                sway_anim.setDuration(duration);
                sway_anim.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionEaseInEaseOut)));
                tracks.push(Retained::into_super(Retained::into_super(sway_anim)));

                // scale: 出際に少しふくらむ。**times は移植元と 1 対 1。**
                let scale = CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!(
                    "transform.scale"
                )));
                let vs = number_values(&[0.9, 1.03, 1.0, 0.96]);
                let ts = number_times(&[0.0, 0.06, 0.82, 1.0]);
                scale.setValues(Some(&vs));
                scale.setKeyTimes(Some(&ts));
                scale.setDuration(duration);
                scale.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionEaseOut)));
                tracks.push(Retained::into_super(Retained::into_super(scale)));
            }

            // opacity: 入りと抜けだけフェード。
            let alpha = opacity;
            let fade = CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!("opacity")));
            let (vs, ts) = if reduce_motion {
                (
                    vec![0.0, alpha, alpha, 0.0],
                    vec![0.0, 0.04, 0.84, 1.0],
                )
            } else {
                (
                    vec![0.0, alpha, alpha, alpha, 0.0],
                    vec![0.0, 0.04, 0.72, 0.88, 1.0],
                )
            };
            let vs = number_values(&vs);
            let ts = number_times(&ts);
            fade.setValues(Some(&vs));
            fade.setKeyTimes(Some(&ts));
            fade.setDuration(duration);
            fade.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionLinear)));
            tracks.push(Retained::into_super(Retained::into_super(fade)));

            let tracks = NSArray::from_retained_slice(&tracks);
            group.setAnimations(Some(&tracks));
            group.setDuration(duration);
            // 遅延は絶対時刻で。`beginTime` を入れないと、待っている間 0 番目の値が
            // 適用されず、素の状態（opacity 0 で置いた位置）のまま出る。
            if delay > 0.0 {
                group.setBeginTime(CACurrentMediaTime() + delay);
            }
            group.setRemovedOnCompletion(false);
            group.setFillMode(kCAFillModeForwards);
            layer.addAnimation_forKey(&group, Some(ns_string!("bubble")));
            CATransaction::commit();

            state.bubble_live.push(LiveLayer {
                layer,
                expires_at: now + Duration::from_secs_f64(delay + duration + 0.2),
            });
        }
    });
}

// ---------------------------------------------------------------- スタンプ

/// 何を撒くか。演出は共通なので、違うのは中身の作り方だけ
/// （移植元の `spawn(count, makeParticle)` に対応する）。
enum BurstKind<'a> {
    Emoji(&'a str),
    /// カスタムスタンプの id。実体は `RenderState::stamp_images` から引く。
    Image(&'a str),
}

/// カスタムスタンプの PNG を復号して id ごとに覚える。
///
/// **Rust に HTTP クライアントは足さない。** 署名 URL を取りに行かせると `reqwest` 一式と
/// Supabase のセッションが Rust 側にも要る。JS が bytes を取って base64 で渡し、
/// 復号は AppKit の `NSImage` に任せる（画像デコーダも増えない）。
///
/// 同じ id が来たら何もしない。200 粒のバーストで毎回復号すると間に合わないので、
/// 一覧が届いた時点で温めておく前提（移植元の `new Image()` と同じ役割）。
pub fn cache_stamp_image(id: &str, png_base64: &str) -> bool {
    let Some(_mtm) = MainThreadMarker::new() else {
        return false;
    };

    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return false;
        };
        if state.stamp_images.contains_key(id) {
            return true;
        }
        let Some(cg) = decode_png(png_base64) else {
            return false;
        };
        state.stamp_images.insert(id.to_string(), cg);
        true
    })
}

/// base64 の PNG を `CGImage` にする。**画像デコーダは足さない** —— `NSImage` に任せる。
fn decode_png(png_base64: &str) -> Option<Retained<objc2_core_graphics::CGImage>> {
    use base64::Engine as _;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .ok()?;
    let data = objc2_foundation::NSData::with_bytes(&bytes);
    let image = objc2_app_kit::NSImage::initWithData(objc2_app_kit::NSImage::alloc(), &data)?;
    // `proposed_dest_rect` は null で「元の大きさのまま」。
    unsafe { image.CGImageForProposedRect_context_hints(std::ptr::null_mut(), None, None) }
}

/// 絵文字を `count` 個ぶん舞い上げる。
pub fn burst_emoji(emoji: &str, count: usize, opacity: f64, base_duration_sec: f64) {
    if emoji.is_empty() {
        return;
    }
    burst(BurstKind::Emoji(emoji), count, opacity, base_duration_sec);
}

/// カスタムスタンプを `count` 個ぶん舞い上げる。**知らない id は黙って捨てる**
/// （削除済みも同じ扱い。`playStamp` の既存方針そのまま）。
pub fn burst_image(id: &str, count: usize, opacity: f64, base_duration_sec: f64) {
    burst(BurstKind::Image(id), count, opacity, base_duration_sec);
}

/// 粒を撒く。中身の作り方だけが違うので、演出はここに1本化してある
/// （移植元の `spawn` と同じ構造）。
fn burst(kind: BurstKind, count: usize, opacity: f64, base_duration_sec: f64) {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };

    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        sweep(state);

        let bounds = state.root.bounds();
        let viewport_w = bounds.size.width;
        let viewport_h = bounds.size.height;
        if viewport_w <= 0.0 || viewport_h <= 0.0 {
            return;
        }

        // 画像は**ループの前に1回だけ**取り出す（`Retained` の clone は retain だけなので安い）。
        // ループ内で `state.stamp_images` を借りたままだと `addSublayer` で二重借用になる。
        // **知らない id は黙って捨てる**（削除済みも同じ扱い）。
        let image = match kind {
            BurstKind::Image(id) => match state.stamp_images.get(id) {
                Some(found) => Some(found.clone()),
                None => return,
            },
            BurstKind::Emoji(_) => None,
        };

        let spawn_count = count.min(MAX_PARTICLES);
        // 上限を超えるぶんは最も古いものから消す。
        let overflow = (state.stamp_live.len() + spawn_count).saturating_sub(MAX_PARTICLES);
        for _ in 0..overflow {
            if state.stamp_live.is_empty() {
                break;
            }
            let entry = state.stamp_live.remove(0);
            entry.layer.removeFromSuperlayer();
        }

        let reduce_motion = reduce_motion();
        let now = Instant::now();
        let mut spawned: Vec<LiveLayer> = Vec::with_capacity(spawn_count);

        unsafe {
            CATransaction::begin();
            CATransaction::setDisableActions(true);

            for _ in 0..spawn_count {
                // **1粒ごとに引き直す。** ここが揃うと全粒が同じ位置・同じ揺れで出る
                // （時刻ベースの乱数だった頃の症状）。
                let left = (0.04 + pseudo_random_unit() * 0.92) * viewport_w;
                let rise = (0.55 + pseudo_random_unit() * 0.40) * viewport_h + 80.0;
                let sway = (30.0 + pseudo_random_unit() * 60.0)
                    * if pseudo_random_unit() < 0.5 { -1.0 } else { 1.0 };
                // 移植元の `rotate` は**度**。`transform.rotation` は**ラジアン**。
                let spin_deg = -45.0 + pseudo_random_unit() * 90.0;
                let spin = spin_deg * std::f64::consts::PI / 180.0;
                let duration = base_duration_sec * (0.85 + pseudo_random_unit() * 0.30);
                // 1回のバッチが団子にならないよう散らす。
                let delay = pseudo_random_unit() * 0.6;

                let (layer, size) = match (&kind, &image) {
                    (BurstKind::Emoji(text), _) => {
                        let font_size = 28.0 + pseudo_random_unit() * 24.0;
                        let text_layer = CATextLayer::layer();
                        let attributed = plain_string(text, font_size);
                        text_layer.setString(Some(&*attributed));
                        text_layer.setContentsScale(state.scale);
                        let measured = attributed.size();
                        let size = NSSize::new(measured.width.max(font_size), measured.height.max(font_size));
                        (Retained::into_super(text_layer), size)
                    }
                    (_, Some(image)) => {
                        // img に font-size は効かない。**絵文字は字面に余白があるが PNG には
                        // 無いので、移植元は画像側を少し大きく取っている。** この差を潰さないこと。
                        let width = 40.0 + pseudo_random_unit() * 32.0;
                        let layer = CALayer::layer();
                        // 高さは元画像の比率で（移植元の `height: auto`）。
                        let iw = objc2_core_graphics::CGImage::width(Some(image)) as f64;
                        let ih = objc2_core_graphics::CGImage::height(Some(image)) as f64;
                        let height = if iw > 0.0 { width * ih / iw } else { width };
                        // CGImage は CF 型だが、`contents` は CGImageRef を受け付ける
                        // （macOS の公開仕様）。objc2 の型としては AnyObject へ落とす。
                        layer.setContents(Some(&*(&**image as *const objc2_core_graphics::CGImage
                            as *const objc2::runtime::AnyObject)));
                        layer.setContentsScale(state.scale);
                        (layer, NSSize::new(width, height))
                    }
                    // 画像の id は来たがキャッシュに無い —— 上で return しているので届かない。
                    (BurstKind::Image(_), None) => unreachable!("キャッシュ確認済み"),
                };

                // 出現は下端の下。`position` は中心を指す。
                let start_y = -STAMP_START_BELOW + size.height / 2.0;
                layer.setFrame(NSRect::new(
                    NSPoint::new(left - size.width / 2.0, start_y - size.height / 2.0),
                    size,
                ));
                layer.setOpacity(0.0);
                state.root.addSublayer(&layer);

                let mut tracks: Vec<Retained<objc2_quartz_core::CAAnimation>> = Vec::new();

                let up = CABasicAnimation::animationWithKeyPath(Some(ns_string!("position.y")));
                up.setFromValue(Some(&*NSNumber::new_f64(start_y)));
                // AppKit は上が正。移植元の `y: [0, -rise]`（Web は下が正）と符号が逆。
                up.setToValue(Some(&*NSNumber::new_f64(start_y + rise)));
                up.setDuration(duration);
                let rise_timing = if reduce_motion {
                    CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionLinear)
                } else {
                    CAMediaTimingFunction::functionWithControlPoints(0.33, 0.33, 0.7, 0.92)
                };
                up.setTimingFunction(Some(&rise_timing));
                tracks.push(Retained::into_super(Retained::into_super(up)));

                if !reduce_motion {
                    let drift =
                        CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!("position.x")));
                    let xs = number_values(&[
                        left,
                        left + sway,
                        left - sway * 0.7,
                        left + sway * 0.35,
                        left,
                    ]);
                    drift.setValues(Some(&xs));
                    drift.setDuration(duration);
                    drift.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                        kCAMediaTimingFunctionEaseInEaseOut,
                    )));
                    tracks.push(Retained::into_super(Retained::into_super(drift)));

                    let turn = CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!(
                        "transform.rotation"
                    )));
                    turn.setValues(Some(&number_values(&[0.0, spin])));
                    turn.setDuration(duration);
                    turn.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                        kCAMediaTimingFunctionLinear,
                    )));
                    tracks.push(Retained::into_super(Retained::into_super(turn)));
                }

                // 出現のポップだけは総時間に引きずられないよう、前半のごく短い割合で終わらせる。
                let pop =
                    CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!("transform.scale")));
                pop.setValues(Some(&number_values(&[0.5, 1.15, 1.0, 1.0, 0.85])));
                pop.setKeyTimes(Some(&number_times(&[0.0, 0.04, 0.1, 0.85, 1.0])));
                pop.setDuration(duration);
                pop.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                    kCAMediaTimingFunctionEaseOut,
                )));
                tracks.push(Retained::into_super(Retained::into_super(pop)));

                let fade = CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!("opacity")));
                fade.setValues(Some(&number_values(&[0.0, opacity, opacity, opacity, 0.0])));
                fade.setKeyTimes(Some(&number_times(&[0.0, 0.03, 0.7, 0.82, 1.0])));
                fade.setDuration(duration);
                fade.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                    kCAMediaTimingFunctionLinear,
                )));
                tracks.push(Retained::into_super(Retained::into_super(fade)));

                let group = CAAnimationGroup::animation();
                let tracks = NSArray::from_retained_slice(&tracks);
                group.setAnimations(Some(&tracks));
                group.setDuration(duration);
                if delay > 0.0 {
                    group.setBeginTime(CACurrentMediaTime() + delay);
                }
                group.setRemovedOnCompletion(false);
                group.setFillMode(kCAFillModeForwards);
                layer.addAnimation_forKey(&group, Some(ns_string!("stamp")));

                spawned.push(LiveLayer {
                    layer,
                    expires_at: now + Duration::from_secs_f64(delay + duration + 0.2),
                });
            }

            CATransaction::commit();
        }

        state.stamp_live.extend(spawned);
    });
}

// ---------------------------------------------------------------- 常設レイヤ

/// 参加QR を左下に出す。`None` で消す。
///
/// **カードは JS が `<canvas>` に描いて PNG にしたものをそのまま載せる。**
/// QR は1ピクセル狂うと読み取れないので、`qrcode.react` が出したものを再実装しない。
/// 文字のトラッキングもロゴの合成も JS 側で済んでいるので、ここは板を置くだけ。
///
/// **常設レイヤなので、消すのは呼び出し側の責任。** `showQr` が false になったら
/// `None` で呼ぶこと（`clear()` でも落ちるが、そこに頼ると発表中に残る）。
pub fn set_join_qr(png_base64: Option<&str>) {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };

    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };

        if let Some(existing) = state.qr_layer.take() {
            existing.removeFromSuperlayer();
        }
        state.qr_image = None;
        let Some(png) = png_base64 else {
            crate::debug_log("qr: 消されました（None で呼ばれた）");
            return;
        };
        let Some(image) = decode_png(png) else {
            crate::debug_log("qr: PNG を復号できません");
            return;
        };

        let width = objc2_core_graphics::CGImage::width(Some(&image)) as f64;
        let height = objc2_core_graphics::CGImage::height(Some(&image)) as f64;
        if width <= 0.0 || height <= 0.0 {
            return;
        }
        // JS は Retina を見越して 2 倍で焼く。ポイント単位へ戻す。
        let w = width / state.scale;
        let h = height / state.scale;

        let layer = CALayer::layer();
        unsafe {
            layer.setContents(Some(&*(&*image as *const objc2_core_graphics::CGImage
                as *const objc2::runtime::AnyObject)));
            layer.setContentsScale(state.scale);
            layer.setFrame(NSRect::new(
                NSPoint::new(QR_INSET, QR_INSET),
                NSSize::new(w, h),
            ));
            // 影はキャンバスに焼かず、ここで出す（焼くと画像の縁が透明で膨らみ位置合わせが狂う）。
            layer.setShadowColor(Some(&NSColor::blackColor().CGColor()));
            layer.setShadowOpacity(0.34);
            layer.setShadowOffset(NSSize::new(0.0, -12.0));
            layer.setShadowRadius(17.0);

            CATransaction::begin();
            CATransaction::setDisableActions(true);
            state.root.addSublayer(&layer);
            CATransaction::commit();

            // 出入りは移植元がばねだったが、厳密な再現に意味は無い。短いフェード。
            let fade = CABasicAnimation::animationWithKeyPath(Some(ns_string!("opacity")));
            fade.setFromValue(Some(&*NSNumber::new_f64(0.0)));
            fade.setToValue(Some(&*NSNumber::new_f64(1.0)));
            fade.setDuration(0.22);
            layer.addAnimation_forKey(&fade, Some(ns_string!("qr-in")));
        }
        crate::debug_log(&format!("qr: 置きました {w:.0}x{h:.0}"));
        state.qr_layer = Some(layer);
        state.qr_image = Some(image);
    });
}

/// モニター確認カードを出す。`peeking && !live` のときだけ呼ばれる。
///
/// **`monitor` は訳さないこと**（罠 #12）。`ディスプレイ N` は文言ではなく
/// `settings.monitorName` に保存されて文字列一致で照合される ID なので、
/// JS が組み立てたものをそのまま出す。
pub fn show_peek_card(caption: &str, monitor: &str) {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };

    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        if let Some(existing) = state.peek_layer.take() {
            existing.removeFromSuperlayer();
        }

        let bounds = state.root.bounds();
        let viewport_w = bounds.size.width;
        let viewport_h = bounds.size.height;
        if viewport_w <= 0.0 || viewport_h <= 0.0 {
            return;
        }

        let container = CALayer::layer();
        container.setFrame(bounds);

        unsafe {
            // 画面の縁をなぞる枠。選ばれている範囲がそのまま見える。
            let frame = CALayer::layer();
            frame.setFrame(NSRect::new(
                NSPoint::new(PEEK_FRAME_INSET, PEEK_FRAME_INSET),
                NSSize::new(
                    viewport_w - PEEK_FRAME_INSET * 2.0,
                    viewport_h - PEEK_FRAME_INSET * 2.0,
                ),
            ));
            frame.setCornerRadius(PEEK_RADIUS);
            frame.setBorderWidth(PEEK_BORDER_W);
            // #6b8aff
            let brand = NSColor::colorWithSRGBRed_green_blue_alpha(
                0x6b as f64 / 255.0,
                0x8a as f64 / 255.0,
                1.0,
                1.0,
            );
            frame.setBorderColor(Some(&brand.CGColor()));
            frame.setContentsScale(state.scale);
            container.addSublayer(&frame);

            // 中央のパネル。2行だけなので Canvas は挟まず素直に組む。
            let caption_text = styled_string(caption, 15.0, true, 1.0, 1.0, 1.0, 0.7);
            let monitor_text = styled_string(monitor, 38.0, true, 1.0, 1.0, 1.0, 1.0);
            let caption_size = caption_text.size();
            let monitor_size = monitor_text.size();
            let gap = 8.0;
            let inner_w = caption_size.width.max(monitor_size.width);
            let inner_h = caption_size.height + gap + monitor_size.height;
            let panel_w = inner_w + PEEK_PAD_X * 2.0;
            let panel_h = inner_h + PEEK_PAD_Y * 2.0;

            let panel = CALayer::layer();
            panel.setFrame(NSRect::new(
                NSPoint::new(
                    (viewport_w - panel_w) / 2.0,
                    (viewport_h - panel_h) / 2.0,
                ),
                NSSize::new(panel_w, panel_h),
            ));
            panel.setCornerRadius(PEEK_RADIUS);
            panel.setBackgroundColor(Some(
                &NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.7).CGColor(),
            ));
            panel.setContentsScale(state.scale);

            // AppKit は下原点。移植元は caption が上、monitor が下。
            let caption_layer = CATextLayer::layer();
            caption_layer.setString(Some(&*caption_text));
            caption_layer.setContentsScale(state.scale);
            caption_layer.setAlignmentMode(objc2_quartz_core::kCAAlignmentCenter);
            caption_layer.setFrame(NSRect::new(
                NSPoint::new(PEEK_PAD_X, PEEK_PAD_Y + monitor_size.height + gap),
                NSSize::new(inner_w, caption_size.height),
            ));
            panel.addSublayer(&caption_layer);

            let monitor_layer = CATextLayer::layer();
            monitor_layer.setString(Some(&*monitor_text));
            monitor_layer.setContentsScale(state.scale);
            monitor_layer.setAlignmentMode(objc2_quartz_core::kCAAlignmentCenter);
            monitor_layer.setFrame(NSRect::new(
                NSPoint::new(PEEK_PAD_X, PEEK_PAD_Y),
                NSSize::new(inner_w, monitor_size.height),
            ));
            panel.addSublayer(&monitor_layer);

            container.addSublayer(&panel);

            CATransaction::begin();
            CATransaction::setDisableActions(true);
            state.root.addSublayer(&container);
            CATransaction::commit();

            let fade = CABasicAnimation::animationWithKeyPath(Some(ns_string!("opacity")));
            fade.setFromValue(Some(&*NSNumber::new_f64(0.0)));
            fade.setToValue(Some(&*NSNumber::new_f64(1.0)));
            fade.setDuration(0.2);
            container.addAnimation_forKey(&fade, Some(ns_string!("peek-in")));
        }
        state.peek_layer = Some(container);
    });
}

/// モニター確認カードを消す。**呼び忘れるとスライドに残り続ける。**
pub fn hide_peek_card() {
    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };
    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        if let Some(layer) = state.peek_layer.take() {
            layer.removeFromSuperlayer();
        }
    });
}

/// 色と太さを指定できる素の文字。
#[allow(clippy::too_many_arguments)]
fn styled_string(
    text: &str,
    font_size: f64,
    bold: bool,
    r: f64,
    g: f64,
    b: f64,
    a: f64,
) -> Retained<NSAttributedString> {
    let ns_text = NSString::from_str(text);
    let attributed = NSMutableAttributedString::from_nsstring(&ns_text);
    let full_range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };
    unsafe {
        let font = if bold {
            NSFont::systemFontOfSize_weight(font_size, NSFontWeightBold)
        } else {
            NSFont::systemFontOfSize(font_size)
        };
        attributed.addAttribute_value_range(objc2_app_kit::NSFontAttributeName, &*font, full_range);
        attributed.addAttribute_value_range(
            objc2_app_kit::NSForegroundColorAttributeName,
            &*NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, a),
            full_range,
        );
    }
    Retained::into_super(attributed)
}

/// 縁取りも板も無い素の文字（絵文字用）。
fn plain_string(text: &str, font_size: f64) -> Retained<NSAttributedString> {
    let ns_text = NSString::from_str(text);
    let attributed = NSMutableAttributedString::from_nsstring(&ns_text);
    let full_range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };
    unsafe {
        let font = NSFont::systemFontOfSize(font_size);
        attributed.addAttribute_value_range(objc2_app_kit::NSFontAttributeName, &*font, full_range);
    }
    Retained::into_super(attributed)
}

/// `prefers-reduced-motion` 相当。移植元は `window.matchMedia` で見ている。
fn reduce_motion() -> bool {
    objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
}

/// 乱数。抽選と揺らぎにしか使わないので、依存は足さない。
///
/// **時刻を毎回引かないこと。** 以前は呼ぶたびに `SystemTime::subsec_nanos()` を
/// 種にしていた。1 件ずつなら散るが、**1 回の push で複数回引くと同じナノ秒に落ちて
/// 値が強く相関する** —— フキダシは揺れ幅と符号で 2 回、スタンプは 200 粒 × 5 個で
/// 1,000 回引くので、全部がほぼ同じ位置・同じ揺れで出てしまう。
/// 種を 1 回だけ取り、あとは xorshift で進める。
fn pseudo_random_unit() -> f64 {
    use std::cell::Cell;
    use std::time::{SystemTime, UNIX_EPOCH};

    thread_local! {
        static SEED: Cell<u64> = Cell::new(0);
    }

    SEED.with(|cell| {
        let mut x = cell.get();
        if x == 0 {
            // 初回だけ時刻から。0 は xorshift の不動点なので必ず避ける。
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0);
            x = nanos | 1;
        }
        // xorshift64。周期も分布もこの用途には十分。
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        cell.set(x);
        // 上位ビットを使う（下位は xorshift だと偏りやすい）。
        ((x >> 40) & 0xFFFF) as f64 / 65535.0
    })
}

fn pseudo_random_index(len: usize) -> usize {
    if len == 0 {
        return 0;
    }
    ((pseudo_random_unit() * len as f64) as usize).min(len - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn narrow_and_wide_characters_are_weighted_differently() {
        // 移植元（FlowLayer.tsx の estimateTextWidth）と同じ係数であること。
        assert!((estimate_text_width("abcd", 10.0) - 22.0).abs() < 0.001);
        assert!((estimate_text_width("あいうえ", 10.0) - 42.0).abs() < 0.001);
    }

    #[test]
    fn top_origin_is_flipped_into_appkit_coordinates() {
        // 上から 100px、高さ 40px のものは、高さ 1000px の中では下から 860px。
        assert_eq!(top_to_bottom_origin(1000.0, 100.0, 40.0), 860.0);
    }

    #[test]
    fn random_index_stays_in_range() {
        for len in 1..8usize {
            for _ in 0..50 {
                assert!(pseudo_random_index(len) < len);
            }
        }
    }

    /// **連続して引いた値が相関しないこと。**
    ///
    /// 以前は呼ぶたびに `SystemTime::subsec_nanos()` を種にしていたので、
    /// 1 回の push で複数回引くと同じナノ秒に落ちて値がほぼ揃った。
    /// フキダシは 2 回、スタンプは 1 回のバーストで千回単位で引くので、
    /// ここが壊れると「全部が同じ位置・同じ揺れで出る」形で表に出る。
    #[test]
    fn consecutive_random_draws_are_not_correlated() {
        let draws: Vec<f64> = (0..64).map(|_| pseudo_random_unit()).collect();
        for value in &draws {
            assert!((0.0..=1.0).contains(value), "範囲外: {value}");
        }
        // 時刻ベースだと隣り合う値がほぼ同じになる。相異なる値が大半を占めるはず。
        let mut sorted = draws.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted.dedup();
        assert!(sorted.len() > 50, "散らばりが足りない: {} 種類", sorted.len());
        // 全体が片側へ寄っていないこと（xorshift の上位ビットを使えている確認）。
        let mean = draws.iter().sum::<f64>() / draws.len() as f64;
        assert!((0.3..0.7).contains(&mean), "偏っている: mean={mean}");
    }

    /// 移植元（`BubbleLayer.tsx` / `theme.css`）と同じ値であること。
    /// **横流しの定数と取り違えていないこと**も同時に見る。
    #[test]
    fn bubble_constants_match_the_web_source() {
        assert_eq!(BUBBLE_LANES, 3, "BubbleLayer.tsx の LANES");
        assert_eq!(BUBBLE_MAX_ITEMS, 18, "BubbleLayer.tsx の MAX_ITEMS");
        assert_eq!(BUBBLE_LANE_GAP_PX, 40.0, "BubbleLayer.tsx の LANE_GAP_PX");
        // 横流しは 24px。**同じ名前だが別の値**なので、使い回すと詰まり方が変わる。
        assert_ne!(
            BUBBLE_LANE_GAP_PX, LANE_GAP_PX,
            "フキダシと横流しのレーン間隔は別物"
        );
        // .lt-overlay-bubble の padding: 14px 22px / --radius-card: 20px
        assert_eq!(BUBBLE_PAD_X, 22.0);
        assert_eq!(BUBBLE_PAD_Y, 14.0);
        assert_eq!(BUBBLE_RADIUS, 20.0);
        // しっぽ: ::before は 15px 13px、::after は 13px 11px
        assert_eq!(BUBBLE_TAIL_BORDER_H, 15.0);
        assert_eq!(BUBBLE_TAIL_BORDER_W, 13.0);
        assert_eq!(BUBBLE_TAIL_FILL_H, 13.0);
        assert_eq!(BUBBLE_TAIL_FILL_W, 11.0);
        // 塗りの三角は枠線の三角より内側に収まること（外周だけが枠線に見える条件）。
        assert!(BUBBLE_TAIL_FILL_W < BUBBLE_TAIL_BORDER_W);
        assert!(BUBBLE_TAIL_FILL_H < BUBBLE_TAIL_BORDER_H);
    }

    /// 移植元（`StampLayer.tsx`）と同じ値であること。
    #[test]
    fn stamp_constants_match_the_web_source() {
        assert_eq!(MAX_PARTICLES, 200, "StampLayer.tsx の MAX_PARTICLES");
        // CSS の `bottom: -64px`
        assert_eq!(STAMP_START_BELOW, 64.0);
        // フキダシの上限(18)と取り違えていないこと。粒は寿命が長いぶん同時数が多い。
        assert!(MAX_PARTICLES > BUBBLE_MAX_ITEMS);
    }

    /// **回転は度ではなくラジアン。**
    ///
    /// 移植元の `rotate: [0, spin]` は度（`random(-45, 45)`）だが、Core Animation の
    /// `transform.rotation` はラジアン。そのまま入れると 45 度のつもりが 45 ラジアン
    /// （≒ 7 回転）になり、**粒が高速で回り続ける**という形で表に出る。
    #[test]
    fn spin_is_converted_from_degrees_to_radians() {
        let to_radians = |deg: f64| deg * std::f64::consts::PI / 180.0;
        assert!((to_radians(45.0) - std::f64::consts::FRAC_PI_4).abs() < 1e-12);
        assert!((to_radians(-45.0) + std::f64::consts::FRAC_PI_4).abs() < 1e-12);
        // 移植元の振れ幅（±45度）が 1 ラジアンに満たないこと＝取り違えの検知。
        assert!(to_radians(45.0).abs() < 1.0);
    }

    /// 常設レイヤの寸法が移植元と同じであること。
    #[test]
    fn persistent_layer_metrics_match_the_web_source() {
        // JoinQrCard は `bottom-8 left-8`（2rem）
        assert_eq!(QR_INSET, 32.0);
        // モニター確認カード: inset-3 / rounded-[28px] / border-[6px] / px-10 py-7
        assert_eq!(PEEK_FRAME_INSET, 12.0);
        assert_eq!(PEEK_RADIUS, 28.0);
        assert_eq!(PEEK_BORDER_W, 6.0);
        assert_eq!(PEEK_PAD_X, 40.0);
        assert_eq!(PEEK_PAD_Y, 28.0);
        // 枠は画面の内側に収まること（inset より太い枠を引くとはみ出す）。
        assert!(PEEK_BORDER_W < PEEK_FRAME_INSET);
    }

    /// バーストのたびに引く乱数が粒ごとに散ること。
    ///
    /// 1 粒につき 6 回以上引くので、200 粒だと 1,200 回を超える。時刻ベースの乱数だった頃は
    /// ここが揃い、**全粒が同じ位置・同じ揺れ・同じ回転で出る**という形で表に出た。
    #[test]
    fn a_full_burst_worth_of_draws_stays_varied() {
        let draws: Vec<f64> = (0..MAX_PARTICLES * 6).map(|_| pseudo_random_unit()).collect();
        let mut sorted = draws.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted.dedup();
        // 65536 段階しか無いので完全な重複ゼロにはならないが、大半は相異なるはず。
        assert!(
            sorted.len() > draws.len() * 9 / 10,
            "散らばりが足りない: {} / {}",
            sorted.len(),
            draws.len()
        );
        // 出現 x に使う 0.04..0.96 の範囲が全体に散ること（片側に寄っていない）。
        let left_half = draws.iter().filter(|v| **v < 0.5).count();
        let ratio = left_half as f64 / draws.len() as f64;
        assert!((0.42..0.58).contains(&ratio), "左右に偏っている: {ratio}");
    }
}
