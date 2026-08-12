use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow,
};
#[cfg(not(target_os = "macos"))]
use tauri::{Monitor, PhysicalPosition, PhysicalSize};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const OVERLAY: &str = "overlay";
const CONTROL: &str = "control";
const QUESTIONS: &str = "questions";
const QUESTION_PANEL_WIDTH: f64 = 430.0;
const QUESTION_TAB_WIDTH: f64 = 56.0;

/// 発表中かどうか。ウィンドウの表示・非表示は Rust の責務なので、
/// ここを唯一の真実にする。永続化しない = 再起動したら必ず停止状態から始まる。
#[derive(Default)]
struct SessionState {
    live: Mutex<bool>,
    /// 前面化ウォッチドッグが回っているか。開始と終了を繰り返しても
    /// スレッドが積み上がらないようにするためのフラグ。
    watching: Mutex<bool>,
    /// 質問パネルを出したか。最初の質問が来るまでは出さない仕様なので、
    /// ウォッチドッグが空のパネルを起こさないための判断材料にする。
    /// `isVisible()` は当てにならないので Rust 側で持つ。
    panel_shown: Mutex<bool>,
    /// 表示先モニター名（`native_overlay::screen_name` と同じ形式）。
    ///
    /// **フロントの各窓に覚えさせないこと。** オーバーレイ窓・質問窓がそれぞれ
    /// 自分の `settings` を持つと、設定変更の到着順で古い名前を送り返してきて
    /// 場所を奪い合う。実際、窓を動かすと webview のリサイズが起きて
    /// `refit_overlay` が古い名前で呼ばれ、オーバーレイが主ディスプレイへ
    /// 引き戻されていた。書き込むのは利用者が選んだときだけ。
    monitor: Mutex<Option<String>>,
}

/// 前面化を当て直す間隔。Space の切り替えに追従するためのもので、発表中だけ回る。
const FRONT_WATCHDOG_INTERVAL: Duration = Duration::from_millis(1000);

// ---------------------------------------------------------------- macOS 固有

/// kCGScreenSaverWindowLevel。スライドショーより上、かつカーソルより下。
#[cfg(target_os = "macos")]
const SCREEN_SAVER_LEVEL: isize = 1000;

/// NSNormalWindowLevel。普通のアプリのウィンドウと同じ扱いに戻すとき使う。
#[cfg(target_os = "macos")]
const NORMAL_WINDOW_LEVEL: isize = 0;

/// NSWindow を生ポインタで取り出す。取れなければ呼び出し側は何もしない。
#[cfg(target_os = "macos")]
fn ns_window_ptr(window: &WebviewWindow) -> Option<*mut objc2::runtime::AnyObject> {
    let Ok(ptr) = window.ns_window() else {
        eprintln!("[layertalk] ns_window() を取得できませんでした");
        return None;
    };

    let ns_window = ptr as *mut objc2::runtime::AnyObject;
    if ns_window.is_null() {
        return None;
    }
    Some(ns_window)
}

#[cfg(not(target_os = "macos"))]
fn elevate_overlay_window(_window: &WebviewWindow) {}

/// 調査用ログの出力先。ターミナルにも出すが、`tauri dev` の親プロセスに環境変数が
/// 渡っていない・stderr が見えないといった事情に左右されないよう、必ずファイルにも残す。
/// **原因が判明したら `log_window_state` ごと落とす一時的な仕掛け。**
#[cfg(target_os = "macos")]
const DEBUG_LOG_PATH: &str = "/tmp/layertalk-overlay.log";

#[cfg(target_os = "macos")]
fn debug_log(line: &str) {
    use std::io::Write;

    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{seconds}] {line}");

    eprintln!("{line}");

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(DEBUG_LOG_PATH)
    {
        let _ = writeln!(file, "{line}");
    }
}

#[cfg(not(target_os = "macos"))]
fn debug_log(_line: &str) {}

/// オーバーレイの中身（wry の contentView = WKWebView）を、**自前で作った素の NSWindow** へ
/// 載せ替える。
///
/// tao が作る窓は、レベル(1000)・collectionBehavior(337)・styleMask・サイズを
/// どう揃えても他アプリの全画面 Space（Canva のプレゼン等）に入れない
/// （`isOnActiveSpace` が false のまま）。一方、**同じプロセス内で作った素の NSWindow は
/// 画面ぴったりのサイズでも入れる**ことを実測した。原因は tao の窓そのものにあるので、
/// 窓だけ自前に差し替える。
///
/// wry は `ns_window.setContentView(parent_view)` で WKWebView を貼っている
/// （`wry-0.55.1/src/wkwebview/mod.rs:685`）ので、その contentView を丸ごと移せば
/// webview はそのまま生きる（IPC も描画も webview 側の話なので影響しない）。
/// tao の窓は表示しないまま残す。
#[cfg(target_os = "macos")]
mod native_overlay {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, MainThreadMarker};
    use objc2_app_kit::{
        NSBackingStoreType, NSColor, NSPanel, NSScreen, NSView, NSWindow,
        NSWindowCollectionBehavior, NSWindowOcclusionState, NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    /// 載せ替える窓は 2 つある。性質が違うので作り方も分ける。
    ///   * `Overlay` — 全面・クリックスルー。素の `NSWindow`
    ///   * `Panel`   — 右端・クリックを受ける。`NSPanel` の nonactivating にして、
    ///     触ってもスライドショーからフォーカスを奪わないようにする
    #[derive(Copy, Clone, PartialEq, Eq)]
    pub enum Hosted {
        Overlay,
        Panel,
    }

    /// 自前の窓。プロセスと同じ寿命なので解放しない（`Retained` は Send でない）。
    static OVERLAY_WINDOW: AtomicUsize = AtomicUsize::new(0);
    static OVERLAY_ATTACHED: AtomicBool = AtomicBool::new(false);
    static PANEL_WINDOW: AtomicUsize = AtomicUsize::new(0);
    static PANEL_ATTACHED: AtomicBool = AtomicBool::new(false);

    /// kCGScreenSaverWindowLevel。tao 窓に当てていたのと同じ条件に揃える。
    const LEVEL: isize = 1000;

    fn slots(kind: Hosted) -> (&'static AtomicUsize, &'static AtomicBool) {
        match kind {
            Hosted::Overlay => (&OVERLAY_WINDOW, &OVERLAY_ATTACHED),
            Hosted::Panel => (&PANEL_WINDOW, &PANEL_ATTACHED),
        }
    }

    fn label(kind: Hosted) -> &'static str {
        match kind {
            Hosted::Overlay => "native/overlay",
            Hosted::Panel => "native/panel",
        }
    }

    fn behavior() -> NSWindowCollectionBehavior {
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary
    }

    /// メインスレッドからのみ呼ぶこと。
    fn existing(kind: Hosted) -> Option<&'static NSWindow> {
        let ptr = slots(kind).0.load(Ordering::Relaxed);
        if ptr == 0 {
            return None;
        }
        Some(unsafe { &*(ptr as *const NSWindow) })
    }

    fn ensure(kind: Hosted, mtm: MainThreadMarker, frame: NSRect) -> &'static NSWindow {
        if let Some(window) = existing(kind) {
            return window;
        }

        // NSPanel は NSWindow のサブクラスなので、生成後は NSWindow として扱う。
        let window: Retained<NSWindow> = match kind {
            Hosted::Overlay => unsafe {
                NSWindow::initWithContentRect_styleMask_backing_defer(
                    mtm.alloc::<NSWindow>(),
                    frame,
                    NSWindowStyleMask::Borderless,
                    NSBackingStoreType::Buffered,
                    false,
                )
            },
            Hosted::Panel => {
                let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
                    mtm.alloc::<NSPanel>(),
                    frame,
                    NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
                    NSBackingStoreType::Buffered,
                    false,
                );
                panel.setFloatingPanel(true);
                // 入力が必要なときだけキー窓になる。展開／折りたたみのクリックだけなら
                // キー窓にならず、スライドショーからフォーカスを奪わない。
                panel.setBecomesKeyOnlyIfNeeded(true);
                Retained::into_super(panel)
            }
        };

        // 共通の性質: 透過・影なし・スライドショーより上・全 Space。
        window.setOpaque(false);
        window.setBackgroundColor(Some(&NSColor::clearColor()));
        window.setHasShadow(false);
        window.setLevel(LEVEL);
        window.setCollectionBehavior(behavior());
        // NSWindow の既定は false だが、**NSPanel の既定は true**。
        // 立っているとアプリが非アクティブになった瞬間に消えるので必ず落とす。
        window.setHidesOnDeactivate(false);
        // 閉じられて解放されると宙に浮いたポインタを触ることになる。閉じる手段は
        // 与えていないが、明示しておく。
        unsafe { window.setReleasedWhenClosed(false) };

        // オーバーレイだけクリックスルー。質問パネルは操作を受ける。
        window.setIgnoresMouseEvents(kind == Hosted::Overlay);

        let raw = Retained::into_raw(window);
        slots(kind).0.store(raw as usize, Ordering::Relaxed);
        super::debug_log(&format!("{}: 自前の窓を作りました", label(kind)));
        unsafe { &*raw }
    }

    /// 画面の表示名。`localizedName` が空なら並び順で代替名を作る。
    /// **`list_monitors` が返す名前と、ここで突き合わせる名前は同じ実装であること。**
    /// 別々に作ると（tao の "Monitor #N" と `localizedName` のように）一致しなくなり、
    /// 黙ってフォールバックに落ちる。実際にこれで発表中にパネルが別の画面へ飛んだ。
    fn screen_name(screen: &NSScreen, index: usize) -> String {
        let name = screen.localizedName().to_string();
        if name.is_empty() {
            format!("ディスプレイ {}", index + 1)
        } else {
            name
        }
    }

    /// 選択中のモニターの矩形（AppKit の座標系・ポイント単位）。
    pub fn screen_frame(mtm: MainThreadMarker, target: Option<&str>) -> Option<NSRect> {
        let screens = NSScreen::screens(mtm);

        if let Some(name) = target {
            for (index, screen) in screens.iter().enumerate() {
                if screen_name(&screen, index) == name {
                    return Some(screen.frame());
                }
            }
        }

        // フォールバックは**主ディスプレイ**（メニューバーがある画面 = `screens[0]`）。
        // `mainScreen` は「キーボードフォーカスがある画面」を返すので使ってはいけない。
        // 発表中は他アプリにフォーカスがあるため、外部モニターへ飛ぶ。
        screens.iter().next().map(|screen| screen.frame())
    }

    /// 表示先の候補一覧。名前は `screen_frame` と同じ実装で作る。
    /// `x` / `y` は AppKit 座標（左下原点）のポイント値。UI では使っていない。
    pub fn monitors() -> Vec<super::MonitorInfo> {
        let Some(mtm) = MainThreadMarker::new() else {
            return Vec::new();
        };

        NSScreen::screens(mtm)
            .iter()
            .enumerate()
            .map(|(index, screen)| {
                let frame = screen.frame();
                let scale = screen.backingScaleFactor();
                super::MonitorInfo {
                    name: screen_name(&screen, index),
                    width: (frame.size.width * scale).round() as u32,
                    height: (frame.size.height * scale).round() as u32,
                    x: frame.origin.x.round() as i32,
                    y: frame.origin.y.round() as i32,
                    scale,
                    // NSScreen.screens の先頭がメニューバーのある画面。
                    is_primary: index == 0,
                }
            })
            .collect()
    }

    /// tao 窓の contentView を自前の窓へ移し、指定の矩形に合わせて表示する。
    /// 何度呼んでもよい（移し替えは初回だけ）。
    fn show(kind: Hosted, tao_ns_window: *mut AnyObject, frame: NSRect) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };

        let window = ensure(kind, mtm, frame);
        let attached = slots(kind).1;

        if !attached.load(Ordering::Relaxed) && !tao_ns_window.is_null() {
            unsafe {
                let content: *mut NSView = msg_send![tao_ns_window, contentView];
                let Some(content) = Retained::retain(content) else {
                    super::debug_log(&format!("{}: contentView を取得できません", label(kind)));
                    return;
                };

                // **tao の窓を空にしたままにしないこと。** tao の `ns_view()` は
                // `contentView().unwrap()`（`tao-0.35.3/.../window.rs:1568`）なので、
                // contentView が nil のまま Tauri 側から触られると panic する。
                // 実際にこれでアプリが落ちた。空のビューを置いて安全にする。
                let placeholder = NSView::new(mtm);
                let _: () = msg_send![tao_ns_window, setContentView: &*placeholder];

                window.setContentView(Some(&content));
            }
            attached.store(true, Ordering::Relaxed);
            super::debug_log(&format!("{}: webview を自前の窓へ移しました", label(kind)));
        }

        window.setFrame_display(frame, true);
        window.orderFrontRegardless();
    }

    /// オーバーレイ（全面）を表示する。
    pub fn show_overlay(tao_ns_window: *mut AnyObject, target: Option<&str>) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(frame) = screen_frame(mtm, target) else {
            super::debug_log("native/overlay: 表示できる画面が見つかりません");
            return;
        };
        show(Hosted::Overlay, tao_ns_window, frame);
    }

    /// 質問パネル（右端の縦帯）を表示する。幅はポイント単位。
    pub fn show_panel(tao_ns_window: *mut AnyObject, target: Option<&str>, width: f64) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(screen) = screen_frame(mtm, target) else {
            super::debug_log("native/panel: 表示できる画面が見つかりません");
            return;
        };
        let frame = NSRect::new(
            NSPoint::new(screen.origin.x + screen.size.width - width, screen.origin.y),
            NSSize::new(width, screen.size.height),
        );
        show(Hosted::Panel, tao_ns_window, frame);
    }

    /// いまの質問パネルの幅（ポイント）。モニターを貼り直すときに、
    /// 展開中／折りたたみ中のどちらだったかを保つために使う。
    pub fn panel_width() -> Option<f64> {
        MainThreadMarker::new()?;
        existing(Hosted::Panel).map(|window| window.frame().size.width)
    }

    /// いまの幅を保ったまま、指定モニターの右端へ貼り直す。
    /// 載せ替えは済んでいるので tao 窓のポインタは要らない。
    pub fn refit_panel(target: Option<&str>) {
        let Some(width) = panel_width() else {
            return;
        };
        show_panel(std::ptr::null_mut(), target, width);
    }

    /// 位置を変えずに最前面へ出し直すだけ。Space の切り替えに追従するために
    /// ウォッチドッグから毎周呼ぶ。表示先モニターを知らないので frame は触らない。
    pub fn raise(kind: Hosted) {
        if MainThreadMarker::new().is_none() {
            return;
        }
        if let Some(window) = existing(kind) {
            window.orderFrontRegardless();
        }
    }

    pub fn hide(kind: Hosted) {
        if MainThreadMarker::new().is_none() {
            return;
        }
        if let Some(window) = existing(kind) {
            window.orderOut(None);
        }
    }

    /// ログ用の状態。実際にどう見えているかはこれで判断する。
    pub fn state(kind: Hosted) -> String {
        if MainThreadMarker::new().is_none() {
            return "メインスレッド外".to_string();
        }
        let Some(window) = existing(kind) else {
            return "未作成".to_string();
        };
        let frame = window.frame();
        format!(
            "visible={} space:{} vis:{} frame={},{} {}x{}",
            window.isVisible(),
            if window.isOnActiveSpace() {
                "IN "
            } else {
                "OUT"
            },
            if window
                .occlusionState()
                .contains(NSWindowOcclusionState::Visible)
            {
                "Y"
            } else {
                "N"
            },
            frame.origin.x,
            frame.origin.y,
            frame.size.width,
            frame.size.height,
        )
    }
}

/// コントロール窓を「いま操作しているアプリより前」へ引き出す。
///
/// Tauri の `set_focus()` は当てにならない。tao の実装は
/// `makeKeyAndOrderFront` + `activateIgnoringOtherApps:` だけで、後者は macOS 14 で
/// 非推奨になり、Accessory ポリシーの（＝バックグラウンドの）アプリからの要求は
/// 協調アクティベーションの判定で却下されることがある。実際 ⇧⌘L が空振りしていた。
///
/// 順序に意味がある:
///   1. collectionBehavior — いま見ている Space にそのまま出す。これが無いと macOS が
///      Space を切り替えてしまい、発表中にスライドショーから抜ける事故になる
///   2. setLevel        — Keynote / PowerPoint のスライドショーより上へ
///   3. orderFrontRegardless — アクティブ化が却下されても前面に出す
///   4. activate + makeKeyAndOrderFront — キーボード入力を webview に渡す
///
/// レベルは呼び出しているあいだだけ上げる。フォーカスを失う / 閉じると
/// `reset_control_window_level` で通常レベルへ戻す。
#[cfg(target_os = "macos")]
fn raise_control_window(window: &WebviewWindow) {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send, sel};

    let Some(ns_window) = ns_window_ptr(window) else {
        return;
    };

    /// CanJoinAllSpaces (1<<0) | FullScreenAuxiliary (1<<8)。
    /// 操作する窓なので Stationary / IgnoresCycle はオーバーレイと違って立てない。
    const CONTROL_COLLECTION_BEHAVIOR: usize = (1 << 0) | (1 << 8);

    unsafe {
        let _: () = msg_send![ns_window, setCollectionBehavior: CONTROL_COLLECTION_BEHAVIOR];
        let _: () = msg_send![ns_window, setLevel: SCREEN_SAVER_LEVEL];
        let _: () = msg_send![ns_window, orderFrontRegardless];

        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        // 引数なしの `activate` は macOS 14 で追加された。それより古い OS では
        // respondsToSelector: が false になるので非推奨の API に落とす。
        let has_activate: Bool = msg_send![app, respondsToSelector: sel!(activate)];
        if has_activate.as_bool() {
            let _: () = msg_send![app, activate];
        } else {
            let _: () = msg_send![app, activateIgnoringOtherApps: Bool::YES];
        }

        let _: () = msg_send![ns_window, makeKeyAndOrderFront: std::ptr::null_mut::<AnyObject>()];
    }
}

#[cfg(not(target_os = "macos"))]
fn raise_control_window(_window: &WebviewWindow) {}

/// コントロール窓を普通のウィンドウに戻す。作業中ずっと他アプリの上に
/// 浮いたままにしないため、フォーカスを失った時点で降ろす。
///
/// 穴: アクティブ化が却下されて `orderFrontRegardless` だけで出た場合、キー窓に
/// ならないので `Focused(false)` が来ず、レベルが上がったまま残る。
/// その場合は ⌘W / 閉じるボタン（= hide）でリセットされる。
#[cfg(target_os = "macos")]
fn reset_control_window_level(window: &WebviewWindow) {
    use objc2::msg_send;

    let Some(ns_window) = ns_window_ptr(window) else {
        return;
    };

    unsafe {
        let _: () = msg_send![ns_window, setLevel: NORMAL_WINDOW_LEVEL];
    }
}

#[cfg(not(target_os = "macos"))]
fn reset_control_window_level(_window: &WebviewWindow) {}

// -------------------------------------------------------------- モニター

#[derive(Serialize, Clone)]
struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    scale: f64,
    is_primary: bool,
}

/// name が None のモニターがあり得るので、位置から安定した代替名を作る。
#[cfg(not(target_os = "macos"))]
fn monitor_label(monitor: &Monitor, index: usize) -> String {
    monitor
        .name()
        .cloned()
        .unwrap_or_else(|| format!("ディスプレイ {}", index + 1))
}

#[cfg(not(target_os = "macos"))]
fn collect_monitors(window: &WebviewWindow) -> Vec<MonitorInfo> {
    let primary_position = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| *m.position());

    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            let position = *monitor.position();
            let size = *monitor.size();
            MonitorInfo {
                name: monitor_label(monitor, index),
                width: size.width,
                height: size.height,
                x: position.x,
                y: position.y,
                scale: monitor.scale_factor(),
                // Monitor に is_primary が無いので、プライマリの座標と突き合わせる。
                is_primary: primary_position == Some(position),
            }
        })
        .collect()
}

/// 指定した名前のモニター全面（メニューバー領域含む）にオーバーレイを合わせる。
/// 見つからなければプライマリに落とす — 発表直前にケーブルが抜けても真っ暗にしないため。
#[cfg(not(target_os = "macos"))]
fn fit_overlay_to_monitor(window: &WebviewWindow, target: Option<&str>) {
    let monitors = window.available_monitors().unwrap_or_default();

    let chosen = target
        .and_then(|name| {
            monitors
                .iter()
                .enumerate()
                .find(|(index, monitor)| monitor_label(monitor, *index) == name)
                .map(|(_, monitor)| monitor.clone())
        })
        .or_else(|| window.primary_monitor().ok().flatten());

    match chosen {
        Some(monitor) => {
            let position = *monitor.position();
            let size = *monitor.size();
            // サイズ → 位置の順。位置を最後に当てると macOS の constrainFrameRect で
            // origin を動かされても最終的な位置が勝つ。質問パネル側と同じ順序に揃えてある。
            let _ = window.set_size(PhysicalSize::new(size.width, size.height));
            let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
        }
        None => eprintln!("[layertalk] 表示できるモニターが見つかりません"),
    }
}

/// 質問窓を指定モニターの右端へ合わせる。
/// 幅はCSSピクセルで指定し、Retinaでも同じ見た目になるよう物理ピクセルへ変換する。
#[cfg(not(target_os = "macos"))]
fn fit_question_panel_to_monitor(window: &WebviewWindow, target: Option<&str>, logical_width: f64) {
    let monitors = window.available_monitors().unwrap_or_default();

    let chosen = target
        .and_then(|name| {
            monitors
                .iter()
                .enumerate()
                .find(|(index, monitor)| monitor_label(monitor, *index) == name)
                .map(|(_, monitor)| monitor.clone())
        })
        .or_else(|| window.primary_monitor().ok().flatten());

    match chosen {
        Some(monitor) => {
            let position = *monitor.position();
            let size = *monitor.size();
            let physical_width = (logical_width * monitor.scale_factor()).round() as u32;
            let x = position.x + size.width as i32 - physical_width as i32;
            let _ = window.set_size(PhysicalSize::new(physical_width, size.height));
            let _ = window.set_position(PhysicalPosition::new(x, position.y));
        }
        None => eprintln!("[layertalk] 質問パネルを表示できるモニターが見つかりません"),
    }
}

/// 現在の質問パネル幅（展開中／折りたたみ中）を保ったまま、モニター右端へ貼り直す。
fn refit_question_panel(app: &AppHandle) {
    let monitor = target_monitor(app);

    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            native_overlay::refit_panel(monitor.as_deref());
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app.get_webview_window(QUESTIONS) {
            let logical_width = window
                .outer_size()
                .ok()
                .and_then(|size| {
                    window
                        .scale_factor()
                        .ok()
                        .map(|scale| size.width as f64 / scale)
                })
                .unwrap_or(QUESTION_PANEL_WIDTH);
            fit_question_panel_to_monitor(&window, monitor.as_deref(), logical_width);
        }
    }
}

/// 質問パネルを指定幅で出す。
///
/// macOS ではオーバーレイと同じ理由で自前の窓（nonactivating な `NSPanel`）に
/// 載せ替える。tao の窓では他アプリの全画面 Space に入れない（罠 #9）。
fn show_question_panel(app: &AppHandle, logical_width: f64) {
    let Some(questions) = app.get_webview_window(QUESTIONS) else {
        return;
    };
    let monitor = target_monitor(app);

    #[cfg(target_os = "macos")]
    {
        let Some(ns_window) = ns_window_ptr(&questions) else {
            return;
        };
        let ns_window = ns_window as usize;
        let _ = app.run_on_main_thread(move || {
            native_overlay::show_panel(
                ns_window as *mut objc2::runtime::AnyObject,
                monitor.as_deref(),
                logical_width,
            );
            debug_log(&format!(
                "native/panel/show: {}",
                native_overlay::state(native_overlay::Hosted::Panel)
            ));
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        elevate_overlay_window(&questions);
        fit_question_panel_to_monitor(&questions, monitor.as_deref(), logical_width);
        let _ = questions.show();
    }
}

/// オーバーレイはクリックスルー固定。切り替える手段は用意しない。
/// 発表中に「気づかないまま背面が操作できなくなっている」事故が起きないようにするため。
#[cfg(not(target_os = "macos"))]
fn apply_overlay_behaviour(window: &WebviewWindow, target: Option<&str>) {
    elevate_overlay_window(window);
    fit_overlay_to_monitor(window, target);

    if let Err(err) = window.set_ignore_cursor_events(true) {
        eprintln!("[layertalk] クリックスルーの設定に失敗: {err}");
    }
}

/// オーバーレイを表示する。
///
/// macOS では tao の窓は出さず、`native_overlay` の自前 NSWindow に webview を
/// 載せ替えて出す（tao の窓は他アプリの全画面 Space に入れないため。罠 #9）。
fn show_overlay(app: &AppHandle) {
    let Some(overlay) = app.get_webview_window(OVERLAY) else {
        return;
    };
    let monitor = target_monitor(app);

    // macOS では tao の窓に触らない。表示にも配置にも使わないうえ、contentView を
    // 移してあるので Tauri 側の経路（`ns_view()` など）を踏むと危ない。
    #[cfg(target_os = "macos")]
    {
        let Some(ns_window) = ns_window_ptr(&overlay) else {
            return;
        };
        // 生ポインタは Send ではないので usize で渡す。
        let ns_window = ns_window as usize;
        // AppKit はメインスレッド専用。
        let _ = app.run_on_main_thread(move || {
            native_overlay::show_overlay(
                ns_window as *mut objc2::runtime::AnyObject,
                monitor.as_deref(),
            );
            debug_log(&format!(
                "native/overlay/show: {}",
                native_overlay::state(native_overlay::Hosted::Overlay)
            ));
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        apply_overlay_behaviour(&overlay, monitor.as_deref());
        let _ = overlay.show();
    }
}

// ------------------------------------------------------------------ ヘルパ

fn is_live(app: &AppHandle) -> bool {
    app.state::<SessionState>()
        .live
        .lock()
        .map(|guard| *guard)
        .unwrap_or(false)
}

fn is_panel_shown(app: &AppHandle) -> bool {
    app.state::<SessionState>()
        .panel_shown
        .lock()
        .map(|guard| *guard)
        .unwrap_or(false)
}

fn set_panel_shown(app: &AppHandle, value: bool) {
    if let Ok(mut guard) = app.state::<SessionState>().panel_shown.lock() {
        *guard = value;
    }
}

/// 表示先モニター。利用者が選んだときだけ書き込む（`SessionState::monitor` 参照）。
fn set_target_monitor(app: &AppHandle, monitor: Option<String>) {
    if let Ok(mut guard) = app.state::<SessionState>().monitor.lock() {
        *guard = monitor;
    }
}

fn target_monitor(app: &AppHandle) -> Option<String> {
    app.state::<SessionState>()
        .monitor
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

fn set_live(app: &AppHandle, value: bool) {
    if let Ok(mut guard) = app.state::<SessionState>().live.lock() {
        *guard = value;
    }
    if value {
        start_front_watchdog(app);
    }
    let _ = app.emit("presentation-state-changed", value);
}

/// 前面化は「一度勝てば終わり」ではない。
///
/// プレゼンを開始したあとに Canva を全画面にすると、その時点で新しい全画面 Space が
/// 作られる。既に表示済みのオーバーレイは自動ではそこへ持ち上がらないので、
/// `show()` のときに前面化しただけでは操作の順序によって負ける。
/// 本来は NSWorkspace の `activeSpaceDidChangeNotification` で拾うべきだが、objc2 から
/// ブロック API を使うには依存追加（block2）が必要なので、発表中だけ回る軽い
/// ポーリングで代替している。終了すると `is_live` が false になり自然に止まる。
fn start_front_watchdog(app: &AppHandle) {
    {
        let state = app.state::<SessionState>();
        let Ok(mut watching) = state.watching.lock() else {
            return;
        };
        if *watching {
            return;
        }
        *watching = true;
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        debug_log("watchdog: 開始");

        loop {
            std::thread::sleep(FRONT_WATCHDOG_INTERVAL);

            if !is_live(&handle) {
                // 終了判定とフラグ解除を同じロックの中で行う。分けると
                // 「ループを抜けたがフラグは立ったまま」の隙に再開されたときに
                // `start_front_watchdog` が二度と起動しなくなる。
                let state = handle.state::<SessionState>();
                let Ok(mut watching) = state.watching.lock() else {
                    break;
                };
                if is_live(&handle) {
                    continue; // その隙に再開されていた
                }
                *watching = false;
                break;
            }

            let app = handle.clone();
            // AppKit はメインスレッド専用。ここから直接 NSWindow を叩いてはいけない。
            let _ = handle.run_on_main_thread(move || {
                // メインスレッドに渡るまでに終了しているかもしれない。ここで
                // 見直さないと `stop_presentation` の hide() を追い越して出し直してしまう。
                if !is_live(&app) {
                    return;
                }

                // コントロール窓を操作しているあいだは触らない。⇧⌘L で前に出した窓を
                // 1 秒後に自分で覆い隠してしまうため（「呼び出し中だけ最前面」の決めごと）。
                let control_focused = app
                    .get_webview_window(CONTROL)
                    .and_then(|control| control.is_focused().ok())
                    .unwrap_or(false);
                if control_focused {
                    return;
                }

                // オーバーレイも質問パネルも自前の窓。Space が切り替わっても
                // 追従できるよう、毎周前面へ出し直す。
                // 質問パネルを後に回す = 流れるコメントの下に潜り込ませない。
                #[cfg(target_os = "macos")]
                {
                    native_overlay::raise(native_overlay::Hosted::Overlay);
                    debug_log(&format!(
                        "native/overlay: {}",
                        native_overlay::state(native_overlay::Hosted::Overlay)
                    ));

                    // 質問パネルは最初の質問が来るまで出さないので、まだのときは触らない。
                    if is_panel_shown(&app) {
                        native_overlay::raise(native_overlay::Hosted::Panel);
                        debug_log(&format!(
                            "native/panel:   {}",
                            native_overlay::state(native_overlay::Hosted::Panel)
                        ));
                    }
                }
            });
        }

        debug_log("watchdog: 停止");
    });
}

fn focus_control_window(app: &AppHandle) {
    if let Some(control) = app.get_webview_window(CONTROL) {
        // show() が先。set_focus() は isVisible() が false だと黙って何もしない。
        let _ = control.show();
        let _ = control.unminimize();
        let _ = control.set_focus();
        // macOS では set_focus() だけでは前面に出ないので自前で引き出す。理由は
        // raise_control_window のコメントを参照。
        raise_control_window(&control);
    }
}

// ---------------------------------------------------------------- commands

#[tauri::command]
fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    // macOS では NSScreen から作る。表示に使う窓も NSScreen で選ぶので、
    // 一覧と選択を同じ実装に揃えないと名前が一致しない（`screen_name` 参照）。
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        // AppKit はメインスレッド専用なので、そこで作って送り返す。
        if app
            .run_on_main_thread(move || {
                let _ = tx.send(native_overlay::monitors());
            })
            .is_ok()
        {
            if let Ok(monitors) = rx.recv_timeout(Duration::from_secs(2)) {
                return monitors;
            }
        }
        eprintln!("[layertalk] モニター一覧を取得できませんでした");
        Vec::new()
    }

    #[cfg(not(target_os = "macos"))]
    {
        app.get_webview_window(OVERLAY)
            .map(|window| collect_monitors(&window))
            .unwrap_or_default()
    }
}

/// 表示先モニターを変更する。発表中なら即座に移動する。
#[tauri::command]
fn set_overlay_monitor(app: AppHandle, monitor: Option<String>) {
    // ここが表示先を書き換えられる唯一の入口（あとは開始時と確認表示）。
    set_target_monitor(&app, monitor);

    // 発表中なら自前の窓ごと移す。開始前は何もしなくてよい
    // （`peek_overlay` / `start_presentation` が保存値で配置する）。
    if is_live(&app) {
        show_overlay(&app);
    }
    #[cfg(not(target_os = "macos"))]
    if !is_live(&app) {
        if let Some(overlay) = app.get_webview_window(OVERLAY) {
            apply_overlay_behaviour(&overlay, target_monitor(&app).as_deref());
        }
    }
    refit_question_panel(&app);
}

/// 発表を開始する。指定モニターに配置してからオーバーレイを見せる。
#[tauri::command]
fn start_presentation(app: AppHandle, monitor: Option<String>) {
    debug_log(&format!("command: start_presentation monitor={monitor:?}"));
    set_target_monitor(&app, monitor);
    show_overlay(&app);
    set_live(&app, true);
}

/// 発表を終了する。ルームの設定はそのまま残すので、同じコードですぐ再開できる。
#[tauri::command]
fn stop_presentation(app: AppHandle) {
    debug_log("command: stop_presentation");
    // live を先に落とす。ウォッチドッグが止まってから hide() しないと、
    // 次の周回で show() し直されてオーバーレイが残る。
    set_live(&app, false);
    set_panel_shown(&app, false);

    // 自前の窓（オーバーレイ・質問パネル）を引っ込める。
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(|| {
        native_overlay::hide(native_overlay::Hosted::Overlay);
        native_overlay::hide(native_overlay::Hosted::Panel);
    });

    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        let _ = overlay.hide();
    }
    if let Some(questions) = app.get_webview_window(QUESTIONS) {
        let _ = questions.hide();
    }
}

#[tauri::command]
fn get_presentation_state(app: AppHandle) -> bool {
    // フロントが起動時に必ず呼ぶ。これが出れば「webview は生きていて IPC も通っている」、
    // 出なければ画面が読み込めていない、という切り分けになる。
    debug_log("command: get_presentation_state");
    is_live(&app)
}

/// 開始前にオーバーレイを一瞬だけ見せる。
///
/// モニター名だけでは物理的にどの画面か分からないので、選んだ先に実物を出して
/// 確認できるようにする。スタンプのプレビューにも使う。
/// 発表中は既に見えているので何もしない。
#[tauri::command]
fn peek_overlay(app: AppHandle, monitor: Option<String>, ms: u64) {
    debug_log(&format!("command: peek_overlay monitor={monitor:?}"));
    if is_live(&app) {
        return;
    }

    set_target_monitor(&app, monitor);
    show_overlay(&app);
    let _ = app.emit("overlay-peek", ms);

    // Tauri のウィンドウ操作はスレッドセーフ（内部でメインスレッドへ委譲される）。
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(ms));
        // 待っている間に発表が始まっていたら消さない。
        if is_live(&handle) {
            return;
        }
        #[cfg(target_os = "macos")]
        let _ = handle.run_on_main_thread(|| native_overlay::hide(native_overlay::Hosted::Overlay));
        if let Some(overlay) = handle.get_webview_window(OVERLAY) {
            let _ = overlay.hide();
        }
    });
}

/// ディスプレイ構成が変わったときに呼ぶ（外部モニタ接続・解像度変更など）。
#[tauri::command]
fn refit_overlay(app: AppHandle) {
    if is_live(&app) {
        show_overlay(&app);
    }
    #[cfg(not(target_os = "macos"))]
    if !is_live(&app) {
        if let Some(overlay) = app.get_webview_window(OVERLAY) {
            apply_overlay_behaviour(&overlay, target_monitor(&app).as_deref());
        }
    }
    refit_question_panel(&app);
}

/// 質問パネルを展開幅またはタブ幅に変更し、選択モニターの右端へ揃える。
#[tauri::command]
fn set_question_panel_expanded(app: AppHandle, expanded: bool) {
    if !is_live(&app) {
        return;
    }

    let width = if expanded {
        QUESTION_PANEL_WIDTH
    } else {
        QUESTION_TAB_WIDTH
    };
    show_question_panel(&app, width);
    set_panel_shown(&app, true);
}

#[tauri::command]
fn show_control(app: AppHandle) {
    focus_control_window(&app);
}

// -------------------------------------------------------------------- tray

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_control_item = MenuItem::with_id(
        app,
        "show_control",
        "コントロールを表示  ⇧⌘L",
        true,
        None::<&str>,
    )?;
    let stop_item = MenuItem::with_id(app, "stop", "プレゼンを終了", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "LayerTalk を終了", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_control_item, &stop_item, &separator, &quit_item],
    )?;

    let mut builder = TrayIconBuilder::with_id("layertalk-tray")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("LayerTalk")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_control" => focus_control_window(app),
            "stop" => stop_presentation(app.clone()),
            "quit" => app.exit(0),
            _ => {}
        });

    // Accessory ポリシーだと Dock から復帰できないため、トレイが唯一の常設入口になる。
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

// --------------------------------------------------------------------- run

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyL)
                    {
                        focus_control_window(app);
                    }
                })
                .build(),
        )
        .manage(SessionState::default())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            set_overlay_monitor,
            start_presentation,
            stop_presentation,
            get_presentation_state,
            peek_overlay,
            refit_overlay,
            set_question_panel_expanded,
            show_control,
        ])
        .setup(|app| {
            // Dock アイコンを出さず、⌘-Tab にも現れず、オーバーレイが
            // 発表アプリからフォーカスを奪わないようにする。
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // LayerTalk が背面・非表示でも設定窓へ戻れる常設入口。
            // 競合していてもアプリ自体は起動できるよう、登録エラーはログに留める。
            let control_shortcut =
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyL);
            if let Err(err) = app.global_shortcut().register(control_shortcut) {
                eprintln!("[layertalk] ⇧⌘L の登録に失敗しました: {err}");
            }

            let handle = app.handle().clone();

            // macOS では tao の窓（overlay / questions）は表示にも配置にも使わない。
            // 「プレゼンを開始」で `native_overlay` が自前の窓を作り、webview の
            // contentView をそこへ移す。tauri.conf.json で visible:false にしてあるので、
            // ここでは何もしない。
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(overlay) = app.get_webview_window(OVERLAY) {
                    apply_overlay_behaviour(&overlay, None);
                }
                if let Some(questions) = app.get_webview_window(QUESTIONS) {
                    elevate_overlay_window(&questions);
                    fit_question_panel_to_monitor(&questions, None, QUESTION_PANEL_WIDTH);
                }
            }

            // コントロール窓は閉じても破棄せず隠すだけにする（macOS の作法）。
            // ⇧⌘L で上げたウィンドウレベルは、隠すときとフォーカスを失うときに戻す。
            if let Some(control) = app.get_webview_window(CONTROL) {
                let control_for_event = control.clone();
                control.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = control_for_event.hide();
                        reset_control_window_level(&control_for_event);
                    }
                    tauri::WindowEvent::Focused(false) => {
                        reset_control_window_level(&control_for_event);
                    }
                    _ => {}
                });
            }

            setup_tray(&handle)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
