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
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSAttributedStringNSStringDrawing, NSColor, NSFont, NSFontWeightBold,
    NSStrokeColorAttributeName, NSStrokeWidthAttributeName, NSView,
};
use objc2_foundation::{
    ns_string, NSAttributedString, NSMutableAttributedString, NSNumber, NSPoint, NSRect, NSSize,
    NSString,
};
// `setDuration` / `setFillMode` は CAAnimation 固有ではなく **CAMediaTiming プロトコル**の
// メソッドなので、トレイトを import しないと生えてこない。
use objc2_quartz_core::{
    kCAFillModeForwards, kCAMediaTimingFunctionLinear, CABasicAnimation, CALayer, CAMediaTiming,
    CAMediaTimingFunction, CATextLayer, CATransaction,
};

/// レーンの間隔(px)。**`FlowLayer.tsx` の `LANE_GAP_PX` と同じ値であること。**
const LANE_GAP_PX: f64 = 24.0;
const TOP_MARGIN_RATIO: f64 = 0.06;
const USABLE_HEIGHT_RATIO: f64 = 0.72;

/// 流れ終わったレイヤを抱えたままにしない上限。押しっぱなしでも増え続けないための保険。
const MAX_LIVE_LAYERS: usize = 400;

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

/// 縁取り文字を組む。
///
/// `lt-overlay-text`（`theme.css:121-126`）と同じ見た目にする:
/// 白の塗り + 3px の黒縁（85%）。CSS の `-webkit-text-stroke` は輪郭の**中心**に引かれ、
/// `NSStrokeWidthAttributeName` も同じく中心なので対応が付く。ただし後者は
/// **フォントサイズに対する百分率で、負値のときだけ「塗りと縁の両方」**になる
/// （正値にすると中抜きの縁だけになり、文字が読めなくなる）。
fn outlined_string(text: &str, font_size: f64) -> Retained<NSAttributedString> {
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
        attributed.addAttribute_value_range(
            objc2_app_kit::NSForegroundColorAttributeName,
            &*NSColor::whiteColor(),
            full_range,
        );

        let stroke_color = NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.85);
        attributed.addAttribute_value_range(NSStrokeColorAttributeName, &*stroke_color, full_range);

        // 3px 相当を百分率へ。負値 = 塗りと縁の両方を描く。
        let percent = -(3.0 / font_size) * 100.0;
        let width = NSNumber::new_f64(percent);
        attributed.addAttribute_value_range(NSStrokeWidthAttributeName, &*width, full_range);
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
        state.lane_free_at.clear();
    });
}

/// 期限切れのレイヤを外す。
///
/// 完了ブロックを使わないのは、レイヤ1枚ごとに Rust のクロージャを Objective-C の
/// ブロックとして生かし続けることになり、`STATE` への借用と寿命が絡むから
/// （`block2` 自体は CALayer が既に引き込んでいるので、依存の話ではない）。
/// 押されたときに掃くだけで足りる — 流れ終わったレイヤは画面外に居るので、
/// 残っていても見えない。
fn sweep(state: &mut RenderState) {
    let now = Instant::now();
    state.live.retain(|entry| {
        if entry.expires_at > now {
            return true;
        }
        entry.layer.removeFromSuperlayer();
        false
    });

    // それでも溢れるなら古いものから落とす。
    while state.live.len() > MAX_LIVE_LAYERS {
        let entry = state.live.remove(0);
        entry.layer.removeFromSuperlayer();
    }
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

        let layer = CATextLayer::layer();
        let attributed = outlined_string(text, font_size);
        unsafe {
            layer.setString(Some(&*attributed));
            layer.setContentsScale(state.scale);
            layer.setOpacity(opacity as f32);
            // 見積もり幅では足りないことがあるので、実際に要る幅を取る。
            // ここで切り詰めると末尾が消える（140文字でも省略しない方針）。
            let measured = attributed.size();
            let w = measured.width.max(width) + font_size; // 縁のぶん少し広く
            let h = lane_height.max(measured.height);
            let y = top_to_bottom_origin(viewport_h, top, h);
            layer.setFrame(NSRect::new(
                NSPoint::new(viewport_w, y),
                NSSize::new(w, h),
            ));

            let animation = CABasicAnimation::animationWithKeyPath(Some(ns_string!("position.x")));
            // anchorPoint は既定の (0.5, 0.5) なので position は中心を指す。
            let from = viewport_w + w / 2.0;
            let to = -(w / 2.0) - 40.0;
            animation.setFromValue(Some(&*NSNumber::new_f64(from)));
            animation.setToValue(Some(&*NSNumber::new_f64(to)));
            animation.setDuration(duration_sec);
            animation.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                kCAMediaTimingFunctionLinear,
            )));
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
                layer: Retained::into_super(layer),
                expires_at: now + Duration::from_secs_f64(duration_sec + 0.2),
            });
        }
    });
}

/// 乱数。抽選と揺らぎにしか使わないので、依存を足さず時刻から作る。
fn pseudo_random_unit() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    // 下位ビットのほうがよく散る。
    ((nanos.wrapping_mul(2654435761) >> 8) & 0xFFFF) as f64 / 65535.0
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
}
