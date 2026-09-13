#![cfg(target_os = "macos")]

//! 右端の質問パネルのネイティブ描画。
//!
//! 旧 `QuestionWindow.tsx`（webview）と同じ振る舞いにする。質問は最大 5 件で、新しいものが上。
//! 見出しの「›」で折りたたみ、右上のタブで開く。折りたたみ中に届いた質問は未読数に積む。
//!
//! **全面オーバーレイと違って、この窓だけはクリックを受ける**（`native_overlay::ensure`）。
//! `acceptsFirstMouse:` を true にしてあるので、nonactivating な NSPanel のまま、
//! スライドショーからフォーカスを奪わずに 1 回目のクリックで開閉できる。

use std::cell::RefCell;

use objc2::rc::Retained;
use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSColor, NSEvent, NSFont, NSFontWeightBold, NSResponder, NSView};
use objc2_foundation::{
    NSAttributedString, NSMutableAttributedString, NSObject, NSPoint, NSRect, NSSize, NSString,
};
use objc2_quartz_core::{kCAAlignmentCenter, CALayer, CATextLayer, CATransaction};

/// 同時に出す質問の上限（旧 `QuestionWindow.tsx` の `MAX_QUESTIONS`）。
const MAX_QUESTIONS: usize = 5;
const EXPANDED_WIDTH: f64 = 430.0;
const TAB_WIDTH: f64 = 56.0;
const TAB_HEIGHT: f64 = 128.0;
/// 画面上端からの余白（旧 UI の `top-[5vh]`）。
const TOP_MARGIN_RATIO: f64 = 0.05;
const SIDE_INSET: f64 = 12.0;
const HEADER_HEIGHT: f64 = 40.0;
const CARD_HEIGHT: f64 = 100.0;
const GAP: f64 = 10.0;

/// 表示する中身。窓がまだ無いうちに届いた質問も落とさないよう、ビューとは分けて持つ。
struct Model {
    questions: Vec<String>,
    expanded: bool,
    unread: usize,
}

struct View {
    host: Retained<NSView>,
    root: Retained<CALayer>,
    scale: f64,
}

thread_local! {
    /// どちらもメインスレッド専用（CALayer / NSView は Send でない）。
    static MODEL: RefCell<Model> = const {
        RefCell::new(Model { questions: Vec::new(), expanded: true, unread: 0 })
    };
    static VIEW: RefCell<Option<View>> = const { RefCell::new(None) };
}

define_class!(
    // SAFETY: NSView はサブクラス化してよいクラスで、このクラスは Drop を実装していない。
    #[unsafe(super(NSView, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "LayerTalkQuestionPanelView"]
    struct QuestionPanelView;

    impl QuestionPanelView {
        /// 非アクティブなアプリの窓は、既定では 1 回目のクリックを「窓を前に出す」ことにしか使わない。
        /// このパネルは前に出す必要が無いので、そのまま押せるようにする。
        #[unsafe(method(acceptsFirstMouse:))]
        fn accepts_first_mouse(&self, _event: Option<&NSEvent>) -> bool {
            true
        }

        #[unsafe(method(mouseDown:))]
        fn mouse_down(&self, event: &NSEvent) {
            let point = self.convertPoint_fromView(event.locationInWindow(), None);
            toggle_from_click(point);
        }
    }
);

/// パネル窓の枠（AppKit 座標・ポイント）。`screen` は表示先モニターの frame。
///
/// **展開中もカードの分の高さしか取らない。** この窓はクリックを受けるので、画面の高さいっぱいに
/// 取ると右端のスライドまで操作できなくなる。折りたたみ中は右上の小さなタブだけ。
fn panel_frame(screen: NSRect, expanded: bool, question_count: usize) -> NSRect {
    let top_margin = (screen.size.height * TOP_MARGIN_RATIO).round();
    let (width, height) = if expanded {
        let cards = question_count.min(MAX_QUESTIONS) as f64;
        let content = HEADER_HEIGHT + cards * (GAP + CARD_HEIGHT);
        (EXPANDED_WIDTH, content.min(screen.size.height - top_margin * 2.0))
    } else {
        (TAB_WIDTH, TAB_HEIGHT)
    };
    NSRect::new(
        NSPoint::new(
            screen.origin.x + screen.size.width - width,
            screen.origin.y + screen.size.height - top_margin - height,
        ),
        NSSize::new(width, height),
    )
}

/// クリックが開閉に当たったか。`point` はビュー座標（左下原点）。
/// 展開中は見出しの帯、折りたたみ中はタブ全体。
fn hits_toggle(bounds: NSSize, expanded: bool, point: NSPoint) -> bool {
    let inside = point.x >= 0.0
        && point.y >= 0.0
        && point.x <= bounds.width
        && point.y <= bounds.height;
    inside && (!expanded || point.y >= bounds.height - HEADER_HEIGHT)
}

/// いまの状態に合った窓の枠。`native_overlay::show_panel` が使う。
pub fn frame_for(screen: NSRect) -> NSRect {
    MODEL.with(|model| {
        let model = model.borrow();
        panel_frame(screen, model.expanded, model.questions.len())
    })
}

pub fn make_host_view(mtm: MainThreadMarker, frame: NSRect, scale: f64) -> Retained<NSView> {
    let this = mtm.alloc::<QuestionPanelView>().set_ivars(());
    // SAFETY: NSView の指定イニシャライザ。ivars は上で初期化済み。
    let view: Retained<QuestionPanelView> = unsafe { msg_send![super(this), initWithFrame: frame] };
    let host: Retained<NSView> = Retained::into_super(view);
    host.setWantsLayer(true);
    let root = CALayer::layer();
    root.setFrame(frame);
    root.setContentsScale(scale);
    // 折りたたみタブの右の角を窓の外へ逃がして、左の角だけ丸く見せるために切る。
    root.setMasksToBounds(true);
    host.setLayer(Some(&root));
    VIEW.with(|cell| {
        *cell.borrow_mut() = Some(View {
            host: host.clone(),
            root,
            scale,
        })
    });
    redraw();
    host
}

pub fn resize(frame: NSRect, scale: f64) {
    if MainThreadMarker::new().is_none() {
        return;
    }
    VIEW.with(|cell| {
        if let Some(view) = cell.borrow_mut().as_mut() {
            view.host.setFrame(frame);
            view.root.setFrame(frame);
            view.root.setContentsScale(scale);
            view.scale = scale;
        }
    });
    redraw();
}

pub fn push(value: &str) {
    if MainThreadMarker::new().is_none() || value.is_empty() {
        return;
    }
    MODEL.with(|model| {
        let mut model = model.borrow_mut();
        model.questions.push(value.to_owned());
        if model.questions.len() > MAX_QUESTIONS {
            model.questions.remove(0);
        }
        if !model.expanded {
            model.unread += 1;
        }
    });
    redraw();
}

/// 発表の開始時に呼ばれる。最初の質問は展開した状態で出す。
pub fn reset() {
    if MainThreadMarker::new().is_none() {
        return;
    }
    MODEL.with(|model| {
        let mut model = model.borrow_mut();
        model.questions.clear();
        model.expanded = true;
        model.unread = 0;
    });
    redraw();
}

pub fn set_expanded(expanded: bool) {
    if MainThreadMarker::new().is_none() {
        return;
    }
    MODEL.with(|model| {
        let mut model = model.borrow_mut();
        model.expanded = expanded;
        model.unread = 0;
    });
    redraw();
}

fn toggle_from_click(point: NSPoint) {
    let Some(bounds) = VIEW.with(|cell| cell.borrow().as_ref().map(|view| view.root.bounds().size))
    else {
        return;
    };
    let expanded = MODEL.with(|model| model.borrow().expanded);
    if !hits_toggle(bounds, expanded, point) {
        return;
    }
    set_expanded(!expanded);
    // 窓の大きさが変わるので出し直す。`show_panel` から `resize` → `redraw` が呼ばれるので、
    // ここまでで `MODEL` / `VIEW` の借用を全部手放していること。
    crate::native_overlay::reshow_panel();
}

fn text(value: &str, size: f64, color: &NSColor) -> Retained<NSAttributedString> {
    let source = NSString::from_str(value);
    let attributed = NSMutableAttributedString::from_nsstring(&source);
    let range = objc2_foundation::NSRange {
        location: 0,
        length: attributed.length(),
    };
    unsafe {
        let font = NSFont::systemFontOfSize_weight(size, NSFontWeightBold);
        attributed.addAttribute_value_range(objc2_app_kit::NSFontAttributeName, &*font, range);
        attributed.addAttribute_value_range(
            objc2_app_kit::NSForegroundColorAttributeName,
            color,
            range,
        );
    }
    Retained::into_super(attributed)
}

fn rgba(red: f64, green: f64, blue: f64, alpha: f64) -> Retained<NSColor> {
    NSColor::colorWithSRGBRed_green_blue_alpha(red, green, blue, alpha)
}

fn text_layer(
    view: &View,
    value: &str,
    size: f64,
    color: &NSColor,
    frame: NSRect,
    centered: bool,
) -> Retained<CATextLayer> {
    let layer = CATextLayer::layer();
    let body = text(value, size, color);
    unsafe {
        layer.setString(Some(&*body));
    }
    if centered {
        // SAFETY: The linked QuartzCore framework provides this immutable alignment constant.
        layer.setAlignmentMode(unsafe { kCAAlignmentCenter });
    }
    layer.setContentsScale(view.scale);
    layer.setFrame(frame);
    layer
}

/// 暗い板（黒の半透明 + 白の細い枠）。スライドの明暗を問わず白文字が読めるようにする。
fn dark_plate(frame: NSRect, radius: f64, alpha: f64, border_alpha: f64) -> Retained<CALayer> {
    let plate = CALayer::layer();
    plate.setFrame(frame);
    plate.setCornerRadius(radius);
    plate.setBackgroundColor(Some(&rgba(0.0, 0.0, 0.0, alpha).CGColor()));
    plate.setBorderWidth(1.0);
    plate.setBorderColor(Some(&rgba(1.0, 1.0, 1.0, border_alpha).CGColor()));
    plate
}

fn brand_circle(frame: NSRect) -> Retained<CALayer> {
    let circle = CALayer::layer();
    circle.setFrame(frame);
    circle.setCornerRadius(frame.size.height / 2.0);
    // `--lt-brand` (#6B8AFF)
    circle.setBackgroundColor(Some(&rgba(0.42, 0.54, 1.0, 1.0).CGColor()));
    circle
}

fn redraw() {
    if MainThreadMarker::new().is_none() {
        return;
    }
    let (questions, expanded, unread) = MODEL.with(|model| {
        let model = model.borrow();
        (model.questions.clone(), model.expanded, model.unread)
    });
    VIEW.with(|cell| {
        let borrowed = cell.borrow();
        let Some(view) = borrowed.as_ref() else {
            return;
        };
        CATransaction::begin();
        CATransaction::setDisableActions(true);
        unsafe { view.root.setSublayers(None) };
        let bounds = view.root.bounds();
        if expanded {
            draw_expanded(view, bounds, &questions);
        } else {
            draw_tab(view, bounds, unread);
        }
        CATransaction::commit();
    });
}

fn draw_expanded(view: &View, bounds: NSRect, questions: &[String]) {
    let width = bounds.size.width - SIDE_INSET * 2.0;

    // 見出しの帯。帯全体が押せる（`hits_toggle`）。右端の「›」は押せることを示す目印。
    let header = dark_plate(
        NSRect::new(
            NSPoint::new(SIDE_INSET, bounds.size.height - HEADER_HEIGHT),
            NSSize::new(width, HEADER_HEIGHT),
        ),
        HEADER_HEIGHT / 2.0,
        0.75,
        0.18,
    );
    header.addSublayer(&text_layer(
        view,
        "QUESTIONS",
        13.0,
        &rgba(0.55, 0.65, 1.0, 1.0),
        NSRect::new(NSPoint::new(18.0, 11.0), NSSize::new(width - 80.0, 18.0)),
        false,
    ));
    let button = CALayer::layer();
    button.setFrame(NSRect::new(
        NSPoint::new(width - 34.0, 6.0),
        NSSize::new(28.0, 28.0),
    ));
    button.setCornerRadius(14.0);
    button.setBackgroundColor(Some(&rgba(1.0, 1.0, 1.0, 0.14).CGColor()));
    button.addSublayer(&text_layer(
        view,
        "›",
        17.0,
        &NSColor::whiteColor(),
        NSRect::new(NSPoint::new(0.0, 3.0), NSSize::new(28.0, 22.0)),
        true,
    ));
    header.addSublayer(&button);
    view.root.addSublayer(&header);

    for (index, question) in questions.iter().rev().enumerate() {
        let top = HEADER_HEIGHT + GAP + index as f64 * (CARD_HEIGHT + GAP);
        let y = bounds.size.height - top - CARD_HEIGHT;
        if y < 0.0 {
            break;
        }
        let card = dark_plate(
            NSRect::new(NSPoint::new(SIDE_INSET, y), NSSize::new(width, CARD_HEIGHT)),
            18.0,
            0.78,
            0.16,
        );
        let badge = brand_circle(NSRect::new(
            NSPoint::new(14.0, CARD_HEIGHT - 14.0 - 32.0),
            NSSize::new(32.0, 32.0),
        ));
        badge.addSublayer(&text_layer(
            view,
            "Q",
            15.0,
            &NSColor::whiteColor(),
            NSRect::new(NSPoint::new(0.0, 7.0), NSSize::new(32.0, 18.0)),
            true,
        ));
        card.addSublayer(&badge);
        let label = text_layer(
            view,
            question,
            17.0,
            &NSColor::whiteColor(),
            NSRect::new(
                NSPoint::new(58.0, 12.0),
                NSSize::new(width - 58.0 - 14.0, CARD_HEIGHT - 24.0),
            ),
            false,
        );
        label.setWrapped(true);
        card.addSublayer(&label);
        view.root.addSublayer(&card);
    }
}

fn draw_tab(view: &View, bounds: NSRect, unread: usize) {
    let width = bounds.size.width;
    let height = bounds.size.height;
    // 右の角は窓の外へはみ出させて、左の角だけ丸く見せる（旧 UI の `rounded-l`）。
    let tab = dark_plate(
        NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(width + 24.0, height)),
        18.0,
        0.8,
        0.18,
    );
    tab.addSublayer(&text_layer(
        view,
        "‹",
        20.0,
        &NSColor::whiteColor(),
        NSRect::new(NSPoint::new(0.0, height - 40.0), NSSize::new(width, 26.0)),
        true,
    ));
    tab.addSublayer(&text_layer(
        view,
        "Q",
        15.0,
        &NSColor::whiteColor(),
        NSRect::new(NSPoint::new(0.0, height - 66.0), NSSize::new(width, 20.0)),
        true,
    ));
    if unread > 0 {
        let badge = brand_circle(NSRect::new(
            NSPoint::new((width - 24.0) / 2.0, 22.0),
            NSSize::new(24.0, 24.0),
        ));
        badge.addSublayer(&text_layer(
            view,
            &unread.min(99).to_string(),
            11.0,
            &NSColor::whiteColor(),
            NSRect::new(NSPoint::new(0.0, 5.0), NSSize::new(24.0, 14.0)),
            true,
        ));
        tab.addSublayer(&badge);
    }
    view.root.addSublayer(&tab);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen() -> NSRect {
        // 1920x1080 の外部モニターが主画面の左にある構成（AppKit 座標）。
        NSRect::new(NSPoint::new(-1920.0, 0.0), NSSize::new(1920.0, 1080.0))
    }

    #[test]
    fn expanded_panel_only_takes_the_height_of_its_cards() {
        let one = panel_frame(screen(), true, 1);
        let three = panel_frame(screen(), true, 3);
        assert_eq!(one.size.width, EXPANDED_WIDTH);
        assert_eq!(one.size.height, HEADER_HEIGHT + GAP + CARD_HEIGHT);
        assert!(three.size.height > one.size.height);
        // 右端に貼り付き、上端から 5% 下がった位置で揃う。
        assert_eq!(one.origin.x + one.size.width, 0.0);
        assert_eq!(one.origin.y + one.size.height, 1080.0 - 54.0);
        assert_eq!(three.origin.y + three.size.height, one.origin.y + one.size.height);
    }

    #[test]
    fn expanded_panel_is_capped_at_five_questions_and_the_screen() {
        let five = panel_frame(screen(), true, 5);
        assert_eq!(panel_frame(screen(), true, 9).size.height, five.size.height);
        let short = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1280.0, 400.0));
        assert!(panel_frame(short, true, 5).size.height <= 400.0 - 40.0);
    }

    #[test]
    fn collapsed_panel_is_a_small_tab_at_the_top_right() {
        let tab = panel_frame(screen(), false, 5);
        assert_eq!(tab.size.width, TAB_WIDTH);
        assert_eq!(tab.size.height, TAB_HEIGHT);
        assert_eq!(tab.origin.x + tab.size.width, 0.0);
        assert_eq!(tab.origin.y + tab.size.height, 1080.0 - 54.0);
    }

    #[test]
    fn only_the_header_toggles_while_expanded() {
        let bounds = NSSize::new(EXPANDED_WIDTH, 260.0);
        assert!(hits_toggle(bounds, true, NSPoint::new(400.0, 250.0)));
        assert!(!hits_toggle(bounds, true, NSPoint::new(200.0, 100.0)));
        assert!(!hits_toggle(bounds, true, NSPoint::new(500.0, 250.0)));
    }

    #[test]
    fn the_whole_tab_toggles_while_collapsed() {
        let bounds = NSSize::new(TAB_WIDTH, TAB_HEIGHT);
        assert!(hits_toggle(bounds, false, NSPoint::new(10.0, 10.0)));
        assert!(hits_toggle(bounds, false, NSPoint::new(40.0, 120.0)));
        assert!(!hits_toggle(bounds, false, NSPoint::new(60.0, 10.0)));
    }
}
