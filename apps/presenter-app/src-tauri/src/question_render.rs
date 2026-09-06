#![cfg(target_os = "macos")]

use std::cell::RefCell;

use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSColor, NSFont, NSFontWeightBold, NSView};
use objc2_foundation::{
    NSAttributedString, NSMutableAttributedString, NSPoint, NSRect, NSSize, NSString,
};
use objc2_quartz_core::{CALayer, CATextLayer, CATransaction};

thread_local! {
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

struct State {
    host: Retained<NSView>,
    root: Retained<CALayer>,
    questions: Vec<String>,
    scale: f64,
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

pub fn make_host_view(mtm: MainThreadMarker, frame: NSRect, scale: f64) -> Retained<NSView> {
    let host = NSView::initWithFrame(mtm.alloc::<NSView>(), frame);
    host.setWantsLayer(true);
    let root = CALayer::layer();
    root.setFrame(frame);
    root.setContentsScale(scale);
    root.setBackgroundColor(Some(
        &NSColor::colorWithSRGBRed_green_blue_alpha(0.035, 0.043, 0.067, 0.94).CGColor(),
    ));
    host.setLayer(Some(&root));
    STATE.with(|state| {
        *state.borrow_mut() = Some(State {
            host: host.clone(),
            root,
            questions: Vec::new(),
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
    STATE.with(|cell| {
        if let Some(state) = cell.borrow_mut().as_mut() {
            state.host.setFrame(frame);
            state.root.setFrame(frame);
            state.root.setContentsScale(scale);
            state.scale = scale;
        }
    });
    redraw();
}

pub fn push(value: &str) {
    if MainThreadMarker::new().is_none() || value.is_empty() {
        return;
    }
    STATE.with(|cell| {
        if let Some(state) = cell.borrow_mut().as_mut() {
            state.questions.push(value.to_owned());
            if state.questions.len() > 5 {
                state.questions.remove(0);
            }
        }
    });
    redraw();
}

pub fn reset() {
    if MainThreadMarker::new().is_none() {
        return;
    }
    STATE.with(|cell| {
        if let Some(state) = cell.borrow_mut().as_mut() {
            state.questions.clear();
        }
    });
    redraw();
}

fn redraw() {
    if MainThreadMarker::new().is_none() {
        return;
    }
    STATE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let Some(state) = borrowed.as_mut() else {
            return;
        };
        CATransaction::begin();
        CATransaction::setDisableActions(true);
        unsafe { state.root.setSublayers(None) };
        let bounds = state.root.bounds();

        let header = CATextLayer::layer();
        let title = text(
            "QUESTIONS",
            13.0,
            &NSColor::colorWithSRGBRed_green_blue_alpha(0.55, 0.65, 1.0, 1.0),
        );
        unsafe {
            header.setString(Some(&*title));
        }
        header.setContentsScale(state.scale);
        header.setFrame(NSRect::new(
            NSPoint::new(22.0, bounds.size.height - 52.0),
            NSSize::new(bounds.size.width - 44.0, 22.0),
        ));
        state.root.addSublayer(&header);

        for (index, question) in state.questions.iter().rev().enumerate() {
            let top = 78.0 + index as f64 * 116.0;
            let card = CALayer::layer();
            card.setCornerRadius(16.0);
            card.setBackgroundColor(Some(
                &NSColor::colorWithSRGBRed_green_blue_alpha(0.10, 0.12, 0.18, 0.96).CGColor(),
            ));
            card.setFrame(NSRect::new(
                NSPoint::new(14.0, bounds.size.height - top - 100.0),
                NSSize::new(bounds.size.width - 28.0, 100.0),
            ));
            let label = CATextLayer::layer();
            let body = text(question, 17.0, &NSColor::whiteColor());
            unsafe {
                label.setString(Some(&*body));
            }
            label.setWrapped(true);
            label.setContentsScale(state.scale);
            label.setFrame(NSRect::new(
                NSPoint::new(16.0, 14.0),
                NSSize::new(bounds.size.width - 60.0, 72.0),
            ));
            card.addSublayer(&label);
            state.root.addSublayer(&card);
        }
        CATransaction::commit();
    });
}
