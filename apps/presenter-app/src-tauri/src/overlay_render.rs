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
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSAttributedStringNSStringDrawing, NSColor, NSFont, NSFontWeightBold, NSImage,
    NSStrokeColorAttributeName, NSStrokeWidthAttributeName, NSView,
};
use objc2_foundation::{
    ns_string, NSArray, NSAttributedString, NSData, NSMutableAttributedString, NSNumber, NSPoint,
    NSRect, NSSize, NSString,
};
// `setDuration` / `setFillMode` は CAAnimation 固有ではなく **CAMediaTiming プロトコル**の
// メソッドなので、トレイトを import しないと生えてこない。
use objc2_quartz_core::{
    kCAFillModeForwards, kCAMediaTimingFunctionLinear, CABasicAnimation, CAKeyframeAnimation, CALayer,
    CAMediaTiming, CAMediaTimingFunction, CATextLayer, CATransaction,
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
    join_card: Option<Retained<CALayer>>,
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

/// 縁の太さ（px）。`lt-overlay-text`（`packages/shared/styles/theme.css`）の `-webkit-text-stroke` と同じ。
const OUTLINE_PX: f64 = 3.0;

/// 縁の太さを `NSStrokeWidthAttributeName` の値（フォントサイズに対する百分率）へ直す。
///
/// **正値にすること。** 正値は「縁だけ」、負値は「塗りと縁の両方」だが、負値では AppKit が
/// 塗りの上に輪郭の中心で縁を引くので、白い塗りが潰れて黒い字になる（罠 #21）。
fn outline_stroke_percent(font_size: f64) -> f64 {
    OUTLINE_PX / font_size * 100.0
}

/// 縁取り文字の「縁だけ」を組む（塗りは透明）。白い塗りは `plain_string` で別のレイヤに組み、
/// 上に重ねる — CSS の `paint-order: stroke fill`（縁を下に敷く）と同じ見え方になる。
fn outline_only_string(text: &str, font_size: f64) -> Retained<NSAttributedString> {
    let ns_text = NSString::from_str(text);
    let attributed = NSMutableAttributedString::from_nsstring(&ns_text);
    let full_range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };

    unsafe {
        let font = NSFont::systemFontOfSize_weight(font_size, NSFontWeightBold);
        attributed.addAttribute_value_range(objc2_app_kit::NSFontAttributeName, &*font, full_range);
        attributed.addAttribute_value_range(
            objc2_app_kit::NSForegroundColorAttributeName,
            &*NSColor::clearColor(),
            full_range,
        );
        let stroke_color = NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.85);
        attributed.addAttribute_value_range(NSStrokeColorAttributeName, &*stroke_color, full_range);
        let width = NSNumber::new_f64(outline_stroke_percent(font_size));
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
            join_card: None,
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
/// 押されたときに加えて、発表中はウォッチドッグからも 1 秒ごとに掃く（`sweep_expired`）。
/// 押されたときだけだと、画面の中で止まるスタンプが次の投稿まで残る（罠 #22）。
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

/// 期限切れのレイヤを外す。発表中は `start_front_watchdog` が 1 秒ごとに呼ぶ。
pub fn sweep_expired() {
    if MainThreadMarker::new().is_none() {
        return;
    }
    STATE.with(|cell| {
        if let Some(state) = cell.borrow_mut().as_mut() {
            sweep(state);
        }
    });
}

/// コメントを1件、右から左へ流す。
///
/// レーンの決め方は `FlowLayer.tsx` の移植。**速度は全コメントで一定**にすること
/// （可変にすると長文が短文を追い越して重なる）。
fn push_flow_comment(
    text: &str,
    font_size: f64,
    opacity: f64,
    base_duration_sec: f64,
    reduced_motion: bool,
) {
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
        let clear_after = if reduced_motion {
            Duration::from_secs(6)
        } else {
            Duration::from_secs_f64(((width + LANE_GAP_PX) / px_per_sec).max(0.0))
        };

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

        let fill_text = plain_string(text, font_size, &NSColor::whiteColor());
        let outline_text = outline_only_string(text, font_size);
        // 見積もり幅では足りないことがあるので、実際に要る幅を取る。
        // ここで切り詰めると末尾が消える（140文字でも省略しない方針）。
        let measured = fill_text.size();
        let w = measured.width.max(width) + font_size; // 縁と影のぶん少し広く
        let h = lane_height.max(measured.height);
        let y = top_to_bottom_origin(viewport_h, top, h);
        let x = if reduced_motion {
            24.0 + pseudo_random_unit() * (viewport_w - w - 48.0).max(0.0)
        } else {
            viewport_w
        };

        // 縁（下）と塗り（上）を別のレイヤに分け、入れ物ごと動かす（罠 #21）。
        // 影は入れ物に付けて、縁と塗りを合わせた字面に落とす（CSS の text-shadow と同じ）。
        let container = CALayer::layer();
        container.setFrame(NSRect::new(NSPoint::new(x, y), NSSize::new(w, h)));
        container.setOpacity(opacity as f32);
        container.setShadowColor(Some(&NSColor::blackColor().CGColor()));
        container.setShadowOpacity(0.6);
        container.setShadowRadius(4.0);
        container.setShadowOffset(NSSize::new(0.0, -2.0));
        let inner = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(w, h));
        for attributed in [&outline_text, &fill_text] {
            let layer = CATextLayer::layer();
            unsafe {
                layer.setString(Some(&**attributed));
            }
            layer.setContentsScale(state.scale);
            layer.setFrame(inner);
            container.addSublayer(&layer);
        }

        let key_path = if reduced_motion {
            "opacity"
        } else {
            "position.x"
        };
        let key_path = NSString::from_str(key_path);
        let animation = CABasicAnimation::animationWithKeyPath(Some(&key_path));
        // SAFETY: position.x and opacity are scalar properties, so NSNumber values have the required type.
        unsafe {
            if reduced_motion {
                animation.setFromValue(Some(&*NSNumber::new_f64(opacity)));
                animation.setToValue(Some(&*NSNumber::new_f64(0.0)));
            } else {
                // anchorPoint は既定の (0.5, 0.5) なので position は中心を指す。
                let from = viewport_w + w / 2.0;
                let to = -(w / 2.0) - 40.0;
                animation.setFromValue(Some(&*NSNumber::new_f64(from)));
                animation.setToValue(Some(&*NSNumber::new_f64(to)));
            }
        }
        let effective_duration = if reduced_motion { 6.0 } else { duration_sec };
        animation.setDuration(effective_duration);
        // SAFETY: These immutable constants are provided by the linked QuartzCore framework.
        unsafe {
            animation.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                kCAMediaTimingFunctionLinear,
            )));
            // 終わった位置（画面外）に留める。既定だと開始位置へ戻って再表示される。
            animation.setFillMode(kCAFillModeForwards);
        }
        animation.setRemovedOnCompletion(false);

        // 追加とアニメーションを 1 トランザクションにまとめ、暗黙アニメーションを切る。
        // 切らないと、レイヤ追加時のフェードが縁取りの見た目を濁らせる。
        CATransaction::begin();
        CATransaction::setDisableActions(true);
        state.root.addSublayer(&container);
        container.addAnimation_forKey(&animation, Some(ns_string!("flow")));
        CATransaction::commit();

        state.live.push(LiveLayer {
            layer: container,
            expires_at: now + Duration::from_secs_f64(effective_duration + 0.2),
        });
    });
}

fn plain_string(text: &str, font_size: f64, color: &NSColor) -> Retained<NSAttributedString> {
    let ns_text = NSString::from_str(text);
    let attributed = NSMutableAttributedString::from_nsstring(&ns_text);
    let range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };
    unsafe {
        let font = NSFont::systemFontOfSize_weight(font_size, NSFontWeightBold);
        attributed.addAttribute_value_range(objc2_app_kit::NSFontAttributeName, &*font, range);
        attributed.addAttribute_value_range(
            objc2_app_kit::NSForegroundColorAttributeName,
            color,
            range,
        );
    }
    Retained::into_super(attributed)
}

fn as_object(value: &NSNumber) -> &AnyObject {
    value
}

/// 出現と消滅の opacity。`StampLayer.tsx` / `BubbleLayer.tsx` と同じく、出だしで現れて終盤で消える
/// （keyTimes も同じ値）。位置のアニメーションと同じ長さで並べて付ける。
fn fade_in_out(opacity: f64, duration: f64) -> Retained<CAKeyframeAnimation> {
    let animation = CAKeyframeAnimation::animationWithKeyPath(Some(ns_string!("opacity")));
    let values = [0.0, opacity, opacity, opacity, 0.0].map(NSNumber::new_f64);
    let objects: Vec<&AnyObject> = values.iter().map(|value| as_object(value)).collect();
    // SAFETY: opacity is a scalar property, so an array of NSNumber has the required type.
    unsafe { animation.setValues(Some(&NSArray::from_slice(&objects))) };
    let key_times = [0.0, 0.03, 0.7, 0.82, 1.0].map(NSNumber::new_f64);
    animation.setKeyTimes(Some(&NSArray::from_retained_slice(&key_times)));
    animation.setDuration(duration);
    animation.setRemovedOnCompletion(false);
    // SAFETY: The linked QuartzCore framework provides this immutable constant.
    unsafe { animation.setFillMode(kCAFillModeForwards) };
    animation
}

fn push_bubble_comment(
    text: &str,
    font_size: f64,
    opacity: f64,
    duration_sec: f64,
    reduced_motion: bool,
) {
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
        let width = (estimate_text_width(text, font_size) + 40.0)
            .clamp(180.0, bounds.size.width / 3.0 - 24.0);
        let lines = (estimate_text_width(text, font_size) / (width - 32.0))
            .ceil()
            .max(1.0);
        let height = (font_size * 1.35 * lines + 30.0).clamp(70.0, 190.0);
        let lane = pseudo_random_index(3);
        let x = lane as f64 * bounds.size.width / 3.0 + 12.0;
        let start_y = if reduced_motion {
            bounds.size.height * (0.2 + lane as f64 * 0.2)
        } else {
            -height - 30.0
        };
        let end_y = if reduced_motion {
            start_y
        } else {
            bounds.size.height + height + 40.0
        };

        let bubble = CALayer::layer();
        bubble.setCornerRadius(18.0);
        bubble.setBackgroundColor(Some(
            &NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.94).CGColor(),
        ));
        bubble.setOpacity(opacity as f32);
        bubble.setFrame(NSRect::new(
            NSPoint::new(x, start_y),
            NSSize::new(width, height),
        ));
        let label = CATextLayer::layer();
        let value = plain_string(
            text,
            font_size,
            &NSColor::colorWithSRGBRed_green_blue_alpha(0.05, 0.06, 0.09, 1.0),
        );
        unsafe {
            label.setString(Some(&*value));
        }
        label.setWrapped(true);
        label.setContentsScale(state.scale);
        label.setFrame(NSRect::new(
            NSPoint::new(16.0, 12.0),
            NSSize::new(width - 32.0, height - 24.0),
        ));
        bubble.addSublayer(&label);

        let effective_duration = if reduced_motion { 6.0 } else { duration_sec };
        let animation = CABasicAnimation::animationWithKeyPath(Some(ns_string!("position.y")));
        // SAFETY: position.y is a scalar property, so both values have the required NSNumber type.
        unsafe {
            animation.setFromValue(Some(&*NSNumber::new_f64(start_y + height / 2.0)));
            animation.setToValue(Some(&*NSNumber::new_f64(end_y + height / 2.0)));
        }
        animation.setDuration(effective_duration);
        // SAFETY: These immutable constants are provided by the linked QuartzCore framework.
        unsafe {
            animation.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                kCAMediaTimingFunctionLinear,
            )));
            animation.setFillMode(kCAFillModeForwards);
        }
        animation.setRemovedOnCompletion(false);
        let fade = fade_in_out(opacity, effective_duration);
        CATransaction::begin();
        CATransaction::setDisableActions(true);
        state.root.addSublayer(&bubble);
        bubble.addAnimation_forKey(&animation, Some(ns_string!("bubble")));
        bubble.addAnimation_forKey(&fade, Some(ns_string!("fade")));
        // 終わった状態で見えないように、レイヤ自体の opacity も 0 にしておく（罠 #22）。
        bubble.setOpacity(0.0);
        CATransaction::commit();
        state.live.push(LiveLayer {
            layer: bubble,
            expires_at: Instant::now() + Duration::from_secs_f64(effective_duration + 0.2),
        });
    });
}

pub fn push_comment(
    text: &str,
    mode: &str,
    font_size: f64,
    opacity: f64,
    duration_sec: f64,
    reduced_motion: bool,
) {
    if mode == "bubble" {
        push_bubble_comment(text, font_size, opacity, duration_sec, reduced_motion);
    } else {
        push_flow_comment(text, font_size, opacity, duration_sec, reduced_motion);
    }
}

/// 絵文字のレイヤの枠。**フォントサイズ四方にしないこと** — 絵文字の字面はフォントサイズより背が高く、
/// `CATextLayer` は枠の外を描かないので下が切れる（罠 #23）。組んだ文字列の実寸に、
/// アンチエイリアスのぶんの余白を足す。
fn glyph_frame_size(measured: NSSize, font_size: f64) -> NSSize {
    NSSize::new(
        measured.width.max(font_size).ceil() + 4.0,
        measured.height.max(font_size).ceil() + 4.0,
    )
}

pub fn push_stamp(
    emoji: Option<&str>,
    image_png: Option<&[u8]>,
    count: usize,
    opacity: f64,
    duration_sec: f64,
    reduced_motion: bool,
) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    if emoji.is_none() && image_png.is_none() {
        return;
    }
    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        sweep(state);
        let bounds = state.root.bounds();
        for _ in 0..count.min(200) {
            let size = 34.0 + pseudo_random_unit() * 38.0;
            let x = bounds.size.width * (0.04 + pseudo_random_unit() * 0.92);
            let (layer, frame_size): (Retained<CALayer>, NSSize) = if let Some(bytes) = image_png {
                let data =
                    unsafe { NSData::dataWithBytes_length(bytes.as_ptr().cast(), bytes.len()) };
                let Some(image) = NSImage::initWithData(mtm.alloc::<NSImage>(), &data) else {
                    continue;
                };
                let layer = CALayer::layer();
                unsafe {
                    layer.setContents(Some(&*image));
                }
                (layer, NSSize::new(size, size))
            } else {
                let text_layer = CATextLayer::layer();
                let value = plain_string(emoji.unwrap_or(""), size, &NSColor::whiteColor());
                let frame_size = glyph_frame_size(value.size(), size);
                unsafe {
                    text_layer.setString(Some(&*value));
                }
                // SAFETY: The linked QuartzCore framework provides this immutable alignment constant.
                text_layer.setAlignmentMode(unsafe { objc2_quartz_core::kCAAlignmentCenter });
                text_layer.setContentsScale(state.scale);
                (Retained::into_super(text_layer), frame_size)
            };
            // 枠の高さで出発点を決める。size で決めると、背の高い絵文字が画面の下端から覗く。
            let start_y = if reduced_motion {
                bounds.size.height * (0.18 + pseudo_random_unit() * 0.55)
            } else {
                -frame_size.height - 12.0
            };
            let end_y = if reduced_motion {
                start_y
            } else {
                bounds.size.height * (0.62 + pseudo_random_unit() * 0.34)
            };
            layer.setOpacity(opacity as f32);
            layer.setFrame(NSRect::new(NSPoint::new(x, start_y), frame_size));
            let effective_duration = if reduced_motion {
                4.0
            } else {
                duration_sec * (0.85 + pseudo_random_unit() * 0.3)
            };
            let animation = CABasicAnimation::animationWithKeyPath(Some(ns_string!("position.y")));
            // SAFETY: position.y is a scalar property, so both values have the required NSNumber type.
            unsafe {
                animation.setFromValue(Some(&*NSNumber::new_f64(start_y + frame_size.height / 2.0)));
                animation.setToValue(Some(&*NSNumber::new_f64(end_y + frame_size.height / 2.0)));
            }
            animation.setDuration(effective_duration);
            // SAFETY: These immutable constants are provided by the linked QuartzCore framework.
            unsafe {
                animation.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                    kCAMediaTimingFunctionLinear,
                )));
                animation.setFillMode(kCAFillModeForwards);
            }
            animation.setRemovedOnCompletion(false);
            let fade = fade_in_out(opacity, effective_duration);
            CATransaction::begin();
            CATransaction::setDisableActions(true);
            state.root.addSublayer(&layer);
            layer.addAnimation_forKey(&animation, Some(ns_string!("stamp")));
            layer.addAnimation_forKey(&fade, Some(ns_string!("fade")));
            // 画面の中で止まるので、最後は必ず見えなくしておく（罠 #22）。
            layer.setOpacity(0.0);
            CATransaction::commit();
            state.live.push(LiveLayer {
                layer,
                expires_at: Instant::now() + Duration::from_secs_f64(effective_duration + 0.2),
            });
        }
    });
}

fn image_sublayer(mtm: MainThreadMarker, bytes: &[u8], frame: NSRect) -> Option<Retained<CALayer>> {
    let data = unsafe { NSData::dataWithBytes_length(bytes.as_ptr().cast(), bytes.len()) };
    let image = NSImage::initWithData(mtm.alloc::<NSImage>(), &data)?;
    let layer = CALayer::layer();
    unsafe {
        layer.setContents(Some(&*image));
    }
    layer.setFrame(frame);
    Some(layer)
}

pub fn set_join_card(
    visible: bool,
    qr_png: &[u8],
    logo_png: Option<&[u8]>,
    code: &str,
    label: &str,
    brand_color: &str,
    hide_layertalk: bool,
) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        if let Some(card) = state.join_card.take() {
            card.removeFromSuperlayer();
        }
        if !visible {
            return;
        }
        let card = CALayer::layer();
        card.setCornerRadius(20.0);
        card.setBackgroundColor(Some(&NSColor::whiteColor().CGColor()));
        card.setFrame(NSRect::new(
            NSPoint::new(34.0, 34.0),
            NSSize::new(224.0, 274.0),
        ));
        if let Some(qr) = image_sublayer(
            mtm,
            qr_png,
            NSRect::new(NSPoint::new(20.0, 78.0), NSSize::new(184.0, 184.0)),
        ) {
            card.addSublayer(&qr);
        }
        if let Some(bytes) = logo_png {
            if let Some(logo) = image_sublayer(
                mtm,
                bytes,
                NSRect::new(NSPoint::new(18.0, 20.0), NSSize::new(38.0, 38.0)),
            ) {
                card.addSublayer(&logo);
            }
        }
        let label_layer = CATextLayer::layer();
        let label_text = plain_string(
            label,
            10.0,
            &NSColor::colorWithSRGBRed_green_blue_alpha(0.2, 0.22, 0.28, 0.7),
        );
        unsafe {
            label_layer.setString(Some(&*label_text));
        }
        // SAFETY: The linked QuartzCore framework provides this immutable alignment constant.
        label_layer.setAlignmentMode(unsafe { objc2_quartz_core::kCAAlignmentCenter });
        label_layer.setContentsScale(state.scale);
        label_layer.setFrame(NSRect::new(
            NSPoint::new(58.0, 46.0),
            NSSize::new(150.0, 18.0),
        ));
        card.addSublayer(&label_layer);
        let code_layer = CATextLayer::layer();
        let code_text = plain_string(
            code,
            24.0,
            &NSColor::colorWithSRGBRed_green_blue_alpha(0.05, 0.06, 0.09, 0.9),
        );
        unsafe {
            code_layer.setString(Some(&*code_text));
        }
        // SAFETY: The linked QuartzCore framework provides this immutable alignment constant.
        code_layer.setAlignmentMode(unsafe { objc2_quartz_core::kCAAlignmentCenter });
        code_layer.setContentsScale(state.scale);
        code_layer.setFrame(NSRect::new(
            NSPoint::new(58.0, 18.0),
            NSSize::new(150.0, 30.0),
        ));
        card.addSublayer(&code_layer);
        if !hide_layertalk {
            let brand = parse_hex_color(brand_color).unwrap_or_else(|| {
                NSColor::colorWithSRGBRed_green_blue_alpha(0.42, 0.54, 1.0, 1.0)
            });
            let brand_layer = CATextLayer::layer();
            let brand_text = plain_string("LayerTalk", 9.0, &brand);
            unsafe {
                brand_layer.setString(Some(&*brand_text));
            }
            // SAFETY: The linked QuartzCore framework provides this immutable alignment constant.
            brand_layer.setAlignmentMode(unsafe { objc2_quartz_core::kCAAlignmentCenter });
            brand_layer.setContentsScale(state.scale);
            brand_layer.setFrame(NSRect::new(
                NSPoint::new(58.0, 5.0),
                NSSize::new(150.0, 14.0),
            ));
            card.addSublayer(&brand_layer);
        }
        state.root.addSublayer(&card);
        state.join_card = Some(card);
    });
}

fn parse_hex_color(value: &str) -> Option<Retained<NSColor>> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let rgb = u32::from_str_radix(hex, 16).ok()?;
    Some(NSColor::colorWithSRGBRed_green_blue_alpha(
        ((rgb >> 16) & 0xff) as f64 / 255.0,
        ((rgb >> 8) & 0xff) as f64 / 255.0,
        (rgb & 0xff) as f64 / 255.0,
        1.0,
    ))
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
    fn outline_is_drawn_as_a_positive_stroke() {
        // 負値にすると塗りが縁で潰れて黒い字になる（罠 #21）。3px を 30pt に載せると 10%。
        assert!((outline_stroke_percent(30.0) - 10.0).abs() < 1e-9);
        assert!(outline_stroke_percent(18.0) > 0.0);
    }

    #[test]
    fn emoji_frame_is_never_smaller_than_the_measured_glyph() {
        // 絵文字の字面はフォントサイズより背が高い。実寸が上回っても枠に収まること（罠 #23）。
        let tall = glyph_frame_size(NSSize::new(50.0, 58.0), 48.0);
        assert!(tall.width > 50.0 && tall.height > 58.0);
        // 実寸が小さく測れても、フォントサイズより小さい枠にはしない。
        let small = glyph_frame_size(NSSize::new(10.0, 10.0), 48.0);
        assert!(small.width >= 48.0 && small.height >= 48.0);
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
