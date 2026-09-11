mod overlay_render;
mod question_capture;

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
/// 質問パネルの見え幅。**webview が不透明になったので「窓＝見えているパネル」**。
/// 以前は 430 の窓の中で `left-3 right-3` の余白を透過させていたぶん、その 24 を引いた値。
const QUESTION_PANEL_WIDTH: f64 = 406.0;
/// 折りたたみタブ。移植元の `w-12` / `min-h-28`。
const QUESTION_TAB_WIDTH: f64 = 48.0;
const QUESTION_TAB_HEIGHT: f64 = 112.0;
/// 中身の高さがまだ届いていないときの暫定値。最初の `ResizeObserver` で上書きされる。
const QUESTION_PANEL_FALLBACK_HEIGHT: f64 = 220.0;

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

/// トレイメニューの項目ハンドル。
///
/// トレイは起動時に一度だけ組み立てられ、あとから作り直す口が無い。表示言語を
/// 切り替えたときにラベルだけ差し替えられるよう、`MenuItem` を持っておく。
struct TrayMenu {
    show_control: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

/// トレイの 3 項目のラベル。フロントの文言カタログはここへ届かないので、
/// この 3 本だけ Rust 側にも持つ。
fn tray_labels(language: &str) -> (&'static str, &'static str, &'static str) {
    if language == "en" {
        (
            "Show Controls  ⇧⌘L",
            "Stop presenting",
            "Quit LayerTalk",
        )
    } else {
        (
            "コントロールを表示  ⇧⌘L",
            "プレゼンを終了",
            "LayerTalk を終了",
        )
    }
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

/// 調査用ログのファイル出力先。`init_debug_log` が setup で1度だけ入れる。
///
/// **以前は全ビルドが無条件に `/tmp/layertalk-overlay.log` へ追記していた。**
/// 発表中はウォッチドッグが毎秒 1〜2 行書くので、2時間の登壇で1万行が
/// 誰でも書ける `/tmp` に無期限で積み上がっていた。App Sandbox では拒否される場所でもある。
#[cfg(target_os = "macos")]
static DEBUG_LOG_PATH: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

/// `LAYERTALK_DEBUG_OVERLAY=1` のときだけファイルへ残す。
/// 環境変数を1度だけ読む形。
#[cfg(target_os = "macos")]
fn debug_log_to_file() -> bool {
    static FLAG: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *FLAG.get_or_init(|| std::env::var("LAYERTALK_DEBUG_OVERLAY").as_deref() == Ok("1"))
}

/// setup から1度だけ呼ぶ。**起動ごとに作り直す**（append のままだと発表を重ねるたびに伸び続ける）。
/// 置き場所をアプリのデータフォルダにしてあるので、sandbox を入れてもコンテナ内に収まる。
#[cfg(target_os = "macos")]
fn init_debug_log(app_data: &std::path::Path) {
    if !debug_log_to_file() {
        return;
    }
    if std::fs::create_dir_all(app_data).is_err() {
        return;
    }
    let path = app_data.join("layertalk-overlay.log");
    if std::fs::write(&path, b"").is_ok() {
        let _ = DEBUG_LOG_PATH.set(path);
    }
}

#[cfg(target_os = "macos")]
fn debug_log(line: &str) {
    use std::io::Write;

    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{seconds}] {line}");

    // stderr は残す。どこにも溜まらないので、Console.app から見たい人の邪魔にならない。
    eprintln!("{line}");

    let Some(path) = DEBUG_LOG_PATH.get() else {
        return;
    };
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
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
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
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

    /// 質問パネルの角丸。移植元のカード（`rounded-[18px]`）より少し大きくして、
    /// カードが面の中に収まって見えるようにする。
    const PANEL_RADIUS: f64 = 22.0;
    /// 画面の右端から浮かせる距離。移植元の `right-3`（12px）。
    /// **折りたたみタブも同じだけ浮かせる**（密着させると右2隅だけ丸める必要が出る）。
    const PANEL_RIGHT_INSET: f64 = 12.0;
    /// 上端からの距離。移植元の `top-[5vh]`。
    const PANEL_TOP_RATIO: f64 = 0.05;

    /// いまのパネルの大きさ。モニターを貼り直すときに全高へ戻さないために覚えておく。
    /// **`frame()` から読み直さない** —— 貼り直しの最中は反映前の値が返る（罠 #9 の `*_async`）。
    static PANEL_WIDTH: AtomicUsize = AtomicUsize::new(0);
    static PANEL_HEIGHT: AtomicUsize = AtomicUsize::new(0);

    fn remember_panel(width: f64, height: f64) {
        PANEL_WIDTH.store(width.round().max(0.0) as usize, Ordering::Relaxed);
        PANEL_HEIGHT.store(height.round().max(0.0) as usize, Ordering::Relaxed);
    }

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

    fn screen_display_id(screen: &NSScreen) -> Option<u32> {
        let description = screen.deviceDescription();
        let key = NSString::from_str("NSScreenNumber");
        let value = description.objectForKey(&key)?;
        Some(unsafe { msg_send![&*value, unsignedIntValue] })
    }

    /// ScreenCaptureKit と同じ CGDirectDisplayID を返す。AppKit の表示名を選択値として
    /// 使いつつ、キャプチャ対象は物理ディスプレイ ID で曖昧なく指定する。
    pub fn display_id(mtm: MainThreadMarker, target: Option<&str>) -> Option<u32> {
        let screens = NSScreen::screens(mtm);
        if let Some(name) = target {
            for (index, screen) in screens.iter().enumerate() {
                if screen_name(&screen, index) == name {
                    return screen_display_id(&screen);
                }
            }
        }
        screens.iter().next().and_then(|screen| screen_display_id(&screen))
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

    /// オーバーレイを webview ではなくネイティブ描画にするか。
    ///
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

        // ネイティブ描画のオーバーレイは webview を載せない。**contentView は 1 枚しか
        // 持てない**ので、この経路と下の載せ替えは排他であること。
        //
        // 副作用として、オーバーレイの webview は tao 窓（`visible: false` のまま
        // 一度も show されない）に残って動き続ける。つまりこの分岐を有効にして
        // コメントが流れれば、**「隠れた WKWebView が Supabase の購読を保てるか」**
        // という移行計画いちばんの未知数がそのまま検証できる。
        // 流れないなら購読を Rust 側へ移す必要がある、という判断材料になる。
        if kind == Hosted::Overlay {
            // **窓自身から取る。** `SessionState` の monitor 名を引き回すと、
            // 罠 #12 の名前一致に依存するうえ、窓が実際に居る画面とずれうる。
            let scale = window.backingScaleFactor();
            let bounds = NSRect::new(
                NSPoint::new(0.0, 0.0),
                NSSize::new(frame.size.width, frame.size.height),
            );
            if !attached.load(Ordering::Relaxed) {
                let host = super::overlay_render::make_host_view(mtm, bounds, scale);
                window.setContentView(Some(&host));
                attached.store(true, Ordering::Relaxed);
                super::debug_log("native/overlay: ネイティブ描画のホストを載せました");
            } else {
                super::overlay_render::resize(bounds, scale);
            }
            window.setFrame_display(frame, true);
            window.orderFrontRegardless();
            return;
        }

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

                // **質問パネルだけは webview が見えている。** 透過は private API を
                // 要求するので不透明のまま出し、角丸で丸い板に見せる
                // （`cornerRadius` / `masksToBounds` はどちらも公開 API）。
                // 窓側は既に `setOpaque(false)` + `clearColor` なので、
                // 角の外はちゃんとスライドが透ける。
                if kind == Hosted::Panel {
                    content.setWantsLayer(true);
                    if let Some(layer) = content.layer() {
                        layer.setCornerRadius(PANEL_RADIUS);
                        layer.setMasksToBounds(true);
                    }
                }
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

    /// 質問パネルを表示する。単位はポイント。
    ///
    /// **窓＝見えているパネルそのもの。** webview を不透明にした以上、窓の中は全部塗られるので、
    /// 中身より大きい窓を出すと縦に伸びた黒帯になる。高さは JS が `ResizeObserver` で
    /// 測って渡す（`set_question_panel_size`）。
    pub fn show_panel(
        tao_ns_window: *mut AnyObject,
        target: Option<&str>,
        width: f64,
        height: f64,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(screen) = screen_frame(mtm, target) else {
            super::debug_log("native/panel: 表示できる画面が見つかりません");
            return;
        };
        // 画面からはみ出させない。質問が増え続けても画面内に収める。
        let usable = (screen.size.height - PANEL_TOP_RATIO * screen.size.height * 2.0).max(1.0);
        let height = height.clamp(1.0, usable);
        let top_gap = (screen.size.height * PANEL_TOP_RATIO).round();
        let frame = NSRect::new(
            NSPoint::new(
                screen.origin.x + screen.size.width - width - PANEL_RIGHT_INSET,
                // AppKit は下原点。上から `top_gap` に見せたいので下からの距離へ直す。
                screen.origin.y + screen.size.height - top_gap - height,
            ),
            NSSize::new(width, height),
        );
        remember_panel(width, height);
        show(Hosted::Panel, tao_ns_window, frame);
    }

    /// いまの質問パネルの幅（ポイント）。モニターを貼り直すときに、
    /// 展開中／折りたたみ中のどちらだったかを保つために使う。
    /// いまのパネルの大きさ（幅, 高さ）。まだ一度も出していなければ `None`。
    pub fn panel_size() -> Option<(f64, f64)> {
        let width = PANEL_WIDTH.load(Ordering::Relaxed);
        let height = PANEL_HEIGHT.load(Ordering::Relaxed);
        if width == 0 || height == 0 {
            return None;
        }
        Some((width as f64, height as f64))
    }

    /// いまの幅を保ったまま、指定モニターの右端へ貼り直す。
    /// 載せ替えは済んでいるので tao 窓のポインタは要らない。
    pub fn refit_panel(target: Option<&str>) {
        let Some((width, height)) = panel_size() else {
            return;
        };
        show_panel(std::ptr::null_mut(), target, width, height);
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
fn show_question_panel(app: &AppHandle, logical_width: f64, logical_height: f64) {
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
                logical_height,
            );
            debug_log(&format!(
                "native/panel/show: {}",
                native_overlay::state(native_overlay::Hosted::Panel)
            ));
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = logical_height;
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
        let mut keepalive: u64 = 0;

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

            // **オーバーレイ窓の webview を起こし続ける。**
            //
            // オーバーレイの webview は一度も表示されない tao 窓に載っているので、
            // macOS は起動から約 6 秒でこのページを凍らせる（実測。`docs/mas-migration-handover.md`）。
            // 凍ると `setInterval` も止まり、**Supabase の購読は繋がったまま何も届かなくなる**
            // — 外から来た broadcast では起きない（同じく実測）。
            // 起こせるのは「窓を表示する」か「ネイティブ側から IPC を送る」かの二択で、
            // ここは後者。発表中だけ 1 秒ごとに突いて、コメントが届く状態を保つ。
            // **消さないこと。消すとコメントが数秒で流れなくなる。**
            keepalive += 1;
            if let Some(overlay) = handle.get_webview_window(OVERLAY) {
                let _ = overlay.emit("overlay-keepalive", keepalive);
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

#[cfg(target_os = "macos")]
fn capture_display_id(app: &AppHandle, monitor: Option<String>) -> Option<u32> {
    let (tx, rx) = std::sync::mpsc::channel();
    if app
        .run_on_main_thread(move || {
            let display_id = objc2::MainThreadMarker::new()
                .and_then(|mtm| native_overlay::display_id(mtm, monitor.as_deref()));
            let _ = tx.send(display_id);
        })
        .is_err()
    {
        return None;
    }
    rx.recv_timeout(Duration::from_secs(2)).ok().flatten()
}

#[cfg(not(target_os = "macos"))]
fn capture_display_id(_app: &AppHandle, _monitor: Option<String>) -> Option<u32> {
    None
}

fn start_question_capture(app: &AppHandle, session_id: &str, monitor: Option<String>) {
    let Some(display_id) = capture_display_id(app, monitor) else {
        let detail = "capture display was not found";
        debug_log(&format!("question capture could not start: {detail}"));
        let event = question_capture::error_event(
            question_capture::CaptureErrorKind::DisplayUnavailable,
            detail,
        );
        let _ = app.emit("question-capture-error", event);
        return;
    };
    if let Err(error) = app
        .state::<question_capture::QuestionCaptureState>()
        .start(session_id, display_id)
    {
        debug_log(&format!(
            "question capture could not start ({:?}): {}",
            error.kind, error.detail
        ));
        let event = question_capture::error_event(error.kind, error.detail);
        let _ = app.emit("question-capture-error", event);
    }
}

/// ネイティブ描画のオーバーレイへコメントを1件流す（App Store 2.5.1 対応の移行中）。
///
/// **AppKit はメインスレッド専用**なので `run_on_main_thread` で入る。同期コマンドは
/// メインスレッドで走るが（罠 #17 の `capture_question_slide` 参照）、フロントが
/// どのスレッドから呼ぶかに依存させないため明示する。
///
#[tauri::command]
fn overlay_push_comment(
    app: AppHandle,
    text: String,
    font_size: f64,
    opacity: f64,
    base_duration_sec: f64,
) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            overlay_render::push_comment(&text, font_size, opacity, base_duration_sec);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, text, font_size, opacity, base_duration_sec);
    }
}

/// フキダシ表示のコメントを 1 件流す（ネイティブ描画）。
///
/// `overlay_push_comment`（横流し）と分けてあるのは、レーンの数・間隔・選び方が
/// 移植元の時点で別物だから。引数で分岐させると、どちらの規則で動いているのか
/// 呼び出し側から見えなくなる。
#[tauri::command]
fn overlay_push_bubble(
    app: AppHandle,
    text: String,
    font_size: f64,
    opacity: f64,
    base_duration_sec: f64,
) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            overlay_render::push_bubble(&text, font_size, opacity, base_duration_sec);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, text, font_size, opacity, base_duration_sec);
    }
}

/// 絵文字スタンプを `count` 個ぶん舞い上げる（ネイティブ描画）。
#[tauri::command]
fn overlay_burst_emoji(app: AppHandle, emoji: String, count: usize, opacity: f64, base_duration_sec: f64) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            overlay_render::burst_emoji(&emoji, count, opacity, base_duration_sec);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, emoji, count, opacity, base_duration_sec);
    }
}

/// カスタムスタンプの PNG を Rust 側へ渡して覚えさせる。
///
/// **Rust から署名 URL を取りに行かせない**（HTTP クライアントと Supabase セッションが
/// Rust 側にも要ることになる）。JS が bytes を取って base64 で渡し、復号は `NSImage` に任せる。
/// 一覧が届いた時点で呼ぶ前提 —— 200 粒のバーストで毎回復号すると間に合わない。
#[tauri::command(async)]
fn overlay_cache_stamp_image(app: AppHandle, id: String, png_base64: String) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            overlay_render::cache_stamp_image(&id, &png_base64);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, id, png_base64);
    }
}

/// カスタムスタンプを `count` 個ぶん舞い上げる。**知らない id は黙って捨てる。**
#[tauri::command]
fn overlay_burst_image(app: AppHandle, id: String, count: usize, opacity: f64, base_duration_sec: f64) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            overlay_render::burst_image(&id, count, opacity, base_duration_sec);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, id, count, opacity, base_duration_sec);
    }
}

/// セルフテストが走っているか。
///
/// **JS 側の effect と取り合わないために要る。** 参加QR とモニターカードは常設レイヤで、
/// 普段は `OverlayWindow` が「出す／消す」を持っている。セルフテストは
/// ルームもサインインも無しで走るので、webview 側は `showQr = false` と判断して
/// **置いた直後に消しに来る**（実測でこれに1時間溶かした）。
#[tauri::command]
fn is_overlay_selftest() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        overlay_selftest_mode().map(|mode| {
            match mode {
                SelftestMode::Flow => "flow",
                SelftestMode::Bubble => "bubble",
                SelftestMode::Stamp => "stamp",
                SelftestMode::Qr => "qr",
                SelftestMode::Peek => "peek",
                SelftestMode::Panel => "panel",
                SelftestMode::Pump => "pump",
                // JS 側のプローブは同じものを使う。
                SelftestMode::PumpLive | SelftestMode::PumpPoke | SelftestMode::PumpWake => "pump",
            }
            .to_string()
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// セルフテストのプローブからの通報を、既存のデバッグログにそのまま乗せる。
///
/// **`pump` の計測はこれ1本で足りる。** 隠れた webview の中で
/// タイマーが刻めているか・realtime のソケットが往復しているかを、
/// `LAYERTALK_DEBUG_OVERLAY` のログへ落として grep で解析する。
#[tauri::command]
fn selftest_heartbeat(kind: String, seq: u32, detail: String) {
    debug_log(&format!("pump/{kind} seq={seq} {detail}"));
}

/// 参加QR を左下に出す。`png_base64` が `None` なら消す。
///
/// **カードは JS が `<canvas>` に描いて渡す。** QR は1ピクセル狂うと読み取れないので、
/// `qrcode.react` が出したものを Rust で再実装しない。文言もキャンバスに焼かれるので、
/// i18n のカタログを Rust へ複製せずに済む。
#[tauri::command]
fn overlay_set_join_qr(app: AppHandle, png_base64: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            overlay_render::set_join_qr(png_base64.as_deref());
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, png_base64);
    }
}

/// モニター確認カードの表示・非表示。
///
/// **`monitor` は訳さないこと**（罠 #12）。`ディスプレイ N` は `settings.monitorName` に
/// 保存されて文字列一致で照合される ID なので、JS が組み立てたものをそのまま渡す。
#[tauri::command]
fn overlay_set_peek_card(app: AppHandle, caption: Option<String>, monitor: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || match (caption, monitor) {
            (Some(caption), Some(monitor)) => overlay_render::show_peek_card(&caption, &monitor),
            _ => overlay_render::hide_peek_card(),
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, caption, monitor);
    }
}

/// ネイティブ描画のオーバーレイを空にする。発表の開始・終了で呼ぶ。
#[tauri::command]
fn overlay_clear(app: AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(overlay_render::clear);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
}

/// 表示先モニターを変更する。発表中なら即座に移動する。
#[tauri::command]
fn set_overlay_monitor(app: AppHandle, monitor: Option<String>) {
    // ここが表示先を書き換えられる唯一の入口（あとは開始時と確認表示）。
    set_target_monitor(&app, monitor.clone());

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

    // 発表中に表示先を変えた場合は、質問用のスライド画像も同じ画面へ追従する。
    if is_live(&app) {
        if let Some(session_id) = app
            .state::<question_capture::QuestionCaptureState>()
            .active_session_id()
        {
            start_question_capture(&app, &session_id, monitor);
        }
    }
}

/// 発表を開始する。指定モニターに配置してからオーバーレイを見せる。
#[tauri::command]
fn start_presentation(app: AppHandle, monitor: Option<String>, capture_session_id: Option<String>) {
    debug_log(&format!("command: start_presentation monitor={monitor:?}"));
    set_target_monitor(&app, monitor.clone());
    if let Some(session_id) = capture_session_id {
        // 失敗しても発表は止めない。権限・キャプチャは付加機能であり、オーバーレイを
        // 開始できない理由にしてはいけない。
        start_question_capture(&app, &session_id, monitor);
    } else {
        app.state::<question_capture::QuestionCaptureState>().stop();
    }
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
    app.state::<question_capture::QuestionCaptureState>().stop();

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

/// ネイティブ描画のオーバーレイを、**クリックも認証もルームも無しで**画面に出す。
///
/// A1（App Store 2.5.1）の可否 —— *private API 無しで本当に透過できるか* —— は
/// 画面に出してみる以外に確かめようがない。だが通常の経路はサインイン →
/// ルーム作成 → 発表開始 → テストコメント、と人の手が要る。
///
/// ネイティブ経路は **tao の窓にも認証にもルームにも依存していない**
/// （`native_overlay::show` はオーバーレイなら `tao_ns_window` に触れずに早期 return し、
/// 窓は `ensure` が自前で作る）。
/// なので起動直後に `show_overlay` を呼んで文字を流すだけで可否が分かる。
///
#[cfg(target_os = "macos")]
#[derive(Copy, Clone, PartialEq, Eq)]
enum SelftestMode {
    Flow,
    Bubble,
    Stamp,
    Qr,
    Peek,
    Panel,
    /// 隠れた webview でタイマーとソケットが生き続けるかを計る（移行計画いちばんの未知数）。
    Pump,
    /// `Pump` と同じ計測に、**Rust から 2 秒ごとに webview を突く**処理を足したもの。
    /// 隠れた webview が止まるとき、IPC で起こし続けられるなら対策はこれで済む。
    PumpPoke,
    /// 隠れたまま 60 秒放置してから窓を出す。**止まった webview が窓の表示で
    /// 起き直るか**、ソケットが自力で戻るかを見る。購読を「見えている窓」へ移す設計は、
    /// 発表開始のたびにこの復帰が起きることを前提にするので、ここが要になる。
    PumpWake,
    /// `Pump` と同じ計測を**発表中の条件**で行う（オーバーレイ表示 ＋ ウォッチドッグ稼働）。
    /// 隠れたままの `Pump` が落ちたときに、原因が「アプリごと暇」なのか
    /// 「webview が隠れていること」なのかを切り分けるために要る。
    PumpLive,
}

/// スタンプのセルフテスト用の画像（48px のマゼンタの丸＋白いリング）。
/// **絵文字と一目で区別できる図形**にしてある。Supabase を通さずに
/// 「base64 → NSImage → CGImage → CALayer.contents」の経路を丸ごと通すためのもの。
#[cfg(target_os = "macos")]
const SELFTEST_STAMP_PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABJElEQVR42u2aQRbCIAxEm7mN3epd7BH1Lnarx6mr7qhSMgmhlGWfHf5A+kAGGYjtfX0sOb8b50lYfYoXtJUZqQHNNIMo8KXaEgFcMxuICL+nT0SE39M3osLnMiAyfA4LosP/Y0IL8L/YMDTexGL0L6978vnn9qSvEcKC34LealozqwlYjjj7HcpeiAnCMAFN+TAASjVWZtQcPYYWasNrNRF54copo+YXMkQoH412fzNwGjgN9G6AtSVmabc/A8yDVu82zpPAa6qtNOHdIVsLmiNuholSDdpfSo0JxgCgVgmwSvA4xyotnMylvtfjbSUiL2wpNljHoNaREzyyXMu8DF6BtFXYB89U3SKphPfVAHbMKpGC7pLBgvfdBrZ2n5c9Il23+QIINaFWoAsf2AAAAABJRU5ErkJggg==";

#[cfg(target_os = "macos")]
fn overlay_selftest_mode() -> Option<SelftestMode> {
    static MODE: std::sync::OnceLock<Option<SelftestMode>> = std::sync::OnceLock::new();
    *MODE.get_or_init(|| {
        match std::env::var("LAYERTALK_OVERLAY_SELFTEST").as_deref() {
            Ok("1") | Ok("flow") => Some(SelftestMode::Flow),
            Ok("bubble") => Some(SelftestMode::Bubble),
            Ok("stamp") => Some(SelftestMode::Stamp),
            Ok("qr") => Some(SelftestMode::Qr),
            Ok("peek") => Some(SelftestMode::Peek),
            Ok("panel") => Some(SelftestMode::Panel),
            Ok("pump") => Some(SelftestMode::Pump),
            Ok("pump-live") => Some(SelftestMode::PumpLive),
            Ok("pump-poke") => Some(SelftestMode::PumpPoke),
            Ok("pump-wake") => Some(SelftestMode::PumpWake),
            _ => None,
        }
    })
}

#[cfg(target_os = "macos")]
fn start_overlay_selftest(app: &AppHandle) {
    let Some(mode) = overlay_selftest_mode() else {
        return;
    };
    let handle = app.clone();
    std::thread::spawn(move || {
        // tao の窓が揃うまで待つ。`show_overlay` は overlay ラベルの窓を引くので、
        // setup の途中で呼ぶと取れないことがある。
        std::thread::sleep(Duration::from_millis(1500));
        // `pump` は隠れた webview の中だけを計る。**オーバーレイは出さない**
        // （画面を覆わずに15分走らせたい。窓を出しても計測対象は変わらない）。
        if mode == SelftestMode::PumpWake {
            debug_log("selftest: pump-wake（60 秒隠したまま放置してから窓を出す）");
            std::thread::sleep(Duration::from_secs(60));
            debug_log("selftest: pump-wake（ここから表示）");
            show_overlay(&handle);
            set_live(&handle, true);
            show_question_panel(&handle, QUESTION_TAB_WIDTH, QUESTION_TAB_HEIGHT);
            set_panel_shown(&handle, true);
        } else if mode == SelftestMode::PumpLive {
            debug_log("selftest: pump-live（発表中と同じ条件。オーバーレイ表示 ＋ ウォッチドッグ）");
            show_overlay(&handle);
            set_live(&handle, true);
            // 質問パネルも出す。**こちらの webview は本当に画面に出ている**ので、
            // 隠れたオーバーレイ窓との差がそのまま「購読をどこに置くか」の答えになる。
            show_question_panel(&handle, QUESTION_TAB_WIDTH, QUESTION_TAB_HEIGHT);
            set_panel_shown(&handle, true);
        } else if mode == SelftestMode::PumpPoke {
            debug_log("selftest: pump-poke（隠れたまま。Rust から 2 秒ごとに突く）");
            let poker = handle.clone();
            std::thread::spawn(move || {
                let mut n: u32 = 0;
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    n += 1;
                    if let Some(overlay) = poker.get_webview_window(OVERLAY) {
                        let _ = overlay.emit("selftest-poke", n);
                    }
                }
            });
        } else if mode != SelftestMode::Pump {
            debug_log("selftest: オーバーレイを出します");
            show_overlay(&handle);
        } else {
            debug_log("selftest: pump（隠れた webview の生存を計測。オーバーレイは出さない）");
        }

        match mode {
            // 判定用の文。**細い字と英数字を混ぜてある** —— Retina のにじみ
            // （`contentsScale` の設定漏れ）は細い線に最初に出るため。
            SelftestMode::Flow => {
                let lines = [
                    "透過チェック — 背後のアプリがこの文字の周りに見えていれば合格",
                    "Retina 1234567890 ABCDEfghij ｜ﾊﾞｯｸｸﾞﾗｳﾝﾄﾞ",
                    "縁取りは白塗り＋黒縁。中抜きなら NSStrokeWidth の符号が逆",
                    "SELFTEST / native overlay / no private API",
                    "あいうえお かきくけこ 漢字とかなの混在も見る",
                    "iiiillll1111 —— 細い線がぼけていないか",
                ];
                for (index, line) in lines.iter().enumerate() {
                    std::thread::sleep(Duration::from_millis(400));
                    let text = format!("{} [{}]", line, index + 1);
                    // AppKit はメインスレッド専用。
                    let _ = handle.run_on_main_thread(move || {
                        // 引数は OVERLAY_DEFAULTS（lib/settings.ts）と同じに揃える。
                        overlay_render::push_comment(&text, 30.0, 1.0, 9.0);
                    });
                }
            }
            // フキダシは**幅の決まり方**が要点なので、短文・長文・1文字を必ず混ぜる。
            // 「短文は文字に吸い付き、長文はレーン幅まで伸びてから折り返す」が再現できているか。
            SelftestMode::Bubble => {
                let lines = [
                    "あ",
                    "短い",
                    "白い板・濃い文字・左下にしっぽ",
                    "これは折り返しの確認用に長くした文です。レーンの幅まで伸びたら折り返して縦に伸びるはずで、140文字でも省略しないという決めごとを守れているかをここで見ます。あいうえおかきくけこ。",
                    "Retina 1234567890 ABCDEfghij",
                    "同じレーンで重なっていないか",
                ];
                for (index, line) in lines.iter().enumerate() {
                    std::thread::sleep(Duration::from_millis(400));
                    let text = format!("{} [{}]", line, index + 1);
                    let _ = handle.run_on_main_thread(move || {
                        overlay_render::push_bubble(&text, 30.0, 1.0, 9.0);
                    });
                }
            }
            // スタンプは**粒がばらけているか**が要点。絵文字と画像の両方を撒く。
            SelftestMode::Stamp => {
                // 画像の経路（base64 → NSImage → CGImage）を Supabase 抜きで通す。
                let _ = handle.run_on_main_thread(|| {
                    overlay_render::cache_stamp_image("selftest", SELFTEST_STAMP_PNG);
                });
                std::thread::sleep(Duration::from_millis(200));

                for (emoji, count) in [("🎉", 40), ("👏", 40), ("❤️", 40)] {
                    std::thread::sleep(Duration::from_millis(500));
                    let _ = handle.run_on_main_thread(move || {
                        overlay_render::burst_emoji(emoji, count, 1.0, 9.0);
                    });
                }
                std::thread::sleep(Duration::from_millis(500));
                // 上限（200）に当てて、古いものから回収されることも見る。
                let _ = handle.run_on_main_thread(|| {
                    overlay_render::burst_image("selftest", 60, 1.0, 9.0);
                });
            }
            // 常設レイヤ。**消える瞬間まで見る**のが要点（粒と違って寿命で消えない）。
            SelftestMode::Qr => {
                let _ = handle.run_on_main_thread(|| {
                    overlay_render::set_join_qr(Some(SELFTEST_STAMP_PNG));
                });
                std::thread::sleep(Duration::from_secs(6));
                debug_log("selftest: QR を消します");
                let _ = handle.run_on_main_thread(|| overlay_render::set_join_qr(None));
            }
            // 質問パネルの**窓の形**を見る。`set_question_panel_size` は `is_live` で
            // 弾かれる（発表中しか出ない）ので、ここは `show_panel` を直接叩く。
            // 中身は質問0件のヘッダだけになるが、**不透明・角丸・内容に合わせた高さ・
            // 周りが透過**という窓側の性質はこれで確かめられる。
            SelftestMode::Panel => {
                let handle_for_panel = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let Some(questions) = handle_for_panel.get_webview_window(QUESTIONS) {
                        if let Some(ptr) = ns_window_ptr(&questions) {
                            native_overlay::show_panel(
                                ptr as *mut objc2::runtime::AnyObject,
                                None,
                                QUESTION_PANEL_WIDTH,
                                180.0,
                            );
                        }
                    }
                });
                std::thread::sleep(Duration::from_secs(6));
                debug_log("selftest: 質問パネルを消します");
                let _ = handle.run_on_main_thread(|| {
                    native_overlay::hide(native_overlay::Hosted::Panel);
                });
            }
            // 計測の本体は webview 側のプローブ（`OverlayWindow.tsx`）。
            // Rust は `selftest_heartbeat` を受けてログに落とすだけ。
            SelftestMode::Pump
            | SelftestMode::PumpLive
            | SelftestMode::PumpPoke
            | SelftestMode::PumpWake => {}
            SelftestMode::Peek => {
                let _ = handle.run_on_main_thread(|| {
                    // 実際の呼び出しと同じく、`ディスプレイ N` は組み立て済みの文字列を渡す。
                    overlay_render::show_peek_card("このディスプレイに表示します", "ディスプレイ 1");
                });
                std::thread::sleep(Duration::from_secs(6));
                debug_log("selftest: モニターカードを消します");
                let _ = handle.run_on_main_thread(overlay_render::hide_peek_card);
            }
        }
        debug_log("selftest: 流し終えました");
    });
}

#[tauri::command]
fn screen_capture_permission(request: bool) -> question_capture::CapturePermission {
    question_capture::permission(request)
}

#[tauri::command]
fn open_screen_capture_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        use objc2_foundation::NSURL;

        // **`/usr/bin/open` を spawn しないこと。** App Sandbox は他プロセスの起動を
        // 拒否するので、sandbox を入れた瞬間にここが黙って失敗する（A2 で必ず踏む）。
        // NSWorkspace の openURL: は sandbox 内から呼べる公開 API。
        let url = NSURL::URLWithString(&objc2_foundation::NSString::from_str(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ))
        .ok_or_else(|| "could not build the System Settings URL".to_string())?;

        if NSWorkspace::sharedWorkspace().openURL(&url) {
            Ok(())
        } else {
            Err("System Settings did not open".to_string())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("screen capture settings are only available on macOS".into())
    }
}

#[tauri::command]
fn question_capture_count(app: AppHandle, session_id: String) -> Result<usize, String> {
    let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    question_capture::capture_count(&app_data, &session_id)
}

/// 最新フレームを質問IDへ固定する。
///
/// **`async` を外さないこと。** Tauri の同期コマンドは**メインスレッド**で走る。
/// `capture_question` はストリームが1枚も出していないとき単発撮影へ落ちて最大1.5秒待つので、
/// メインスレッドで待つとオーバーレイごと固まる。
#[tauri::command(async)]
fn capture_question_slide(
    app: AppHandle,
    question_id: String,
) -> Result<question_capture::CaptureQuestionResult, String> {
    let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let state = app.state::<question_capture::QuestionCaptureState>();
    let result = state.capture_question(&app_data, &question_id)?;
    if result.status == question_capture::CaptureQuestionStatus::FramePending {
        // 「フレームが来ない」以外に言えることを残す。原因の切り分けはここにしか出ない。
        debug_log(&format!(
            "question capture pending ({:?}): {:?}",
            result.reason,
            state.health()
        ));
    }
    Ok(result)
}

#[tauri::command]
fn read_question_capture(
    app: AppHandle,
    session_id: String,
    question_id: String,
) -> Result<Option<String>, String> {
    let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    question_capture::read_capture(&app_data, &session_id, &question_id)
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
fn set_question_panel_size(app: AppHandle, expanded: bool, height: Option<f64>) {
    if !is_live(&app) {
        return;
    }

    let (width, height) = if expanded {
        (
            QUESTION_PANEL_WIDTH,
            height
                .filter(|value| *value > 1.0)
                .unwrap_or(QUESTION_PANEL_FALLBACK_HEIGHT),
        )
    } else {
        // 折りたたみタブは中身が固定なので測らせない。
        (QUESTION_TAB_WIDTH, QUESTION_TAB_HEIGHT)
    };
    show_question_panel(&app, width, height);
    set_panel_shown(&app, true);
}

#[tauri::command]
fn show_control(app: AppHandle) {
    focus_control_window(&app);
}

/// トレイのラベルを表示言語に合わせて書き換える。
///
/// 呼ぶのはコントロール窓だけ（3 つの窓から呼ぶと同じ更新が競合する）。
/// Rust 側は言語を永続化しないので、起動のたびにフロントから渡し直してもらう。
#[tauri::command]
fn set_app_language(app: AppHandle, language: String) {
    let (show_control, stop, quit) = tray_labels(&language);
    let handle = app.clone();

    // NSMenuItem の変更はメインスレッドから行う必要がある。
    // tauri のコマンドはワーカースレッドで走るので、ここで渡し直す。
    if let Err(err) = app.run_on_main_thread(move || {
        let Some(menu) = handle.try_state::<TrayMenu>() else {
            return;
        };
        let _ = menu.show_control.set_text(show_control);
        let _ = menu.stop.set_text(stop);
        let _ = menu.quit.set_text(quit);
    }) {
        eprintln!("[layertalk] トレイのラベルを更新できませんでした: {err}");
    }
}

// -------------------------------------------------------------------- tray

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    // 起動時は既定の日本語。フロントが localStorage を読んだあと
    // set_app_language で正しい言語に直す。
    let (show_control, stop, quit) = tray_labels("ja");

    let show_control_item = MenuItem::with_id(app, "show_control", show_control, true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", stop, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_control_item, &stop_item, &separator, &quit_item],
    )?;

    // ラベルを後から差し替えるためにハンドルを保持する。
    // メニュー項目の判別は event.id で行っているので、文字を変えても動作は変わらない。
    app.manage(TrayMenu {
        show_control: show_control_item.clone(),
        stop: stop_item.clone(),
        quit: quit_item.clone(),
    });

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
        // 発表レポートの書き出し用。WKWebView は <a download> を一切処理しないので、
        // ブラウザ流儀の Blob ダウンロードでは 1 バイトも保存されない。
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        .manage(question_capture::QuestionCaptureState::default())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            set_overlay_monitor,
            overlay_push_comment,
            overlay_push_bubble,
            overlay_burst_emoji,
            overlay_cache_stamp_image,
            overlay_burst_image,
            is_overlay_selftest,
            selftest_heartbeat,
            overlay_set_join_qr,
            overlay_set_peek_card,
            overlay_clear,
            start_presentation,
            stop_presentation,
            get_presentation_state,
            peek_overlay,
            refit_overlay,
            set_question_panel_size,
            show_control,
            set_app_language,
            screen_capture_permission,
            open_screen_capture_settings,
            capture_question_slide,
            question_capture_count,
            read_question_capture,
        ])
        .setup(|app| {
            if let Ok(app_data) = app.path().app_data_dir() {
                #[cfg(target_os = "macos")]
                init_debug_log(&app_data);
                question_capture::cleanup_expired(&app_data);
            }

            // A1 の可否を画面で確かめるための経路。既定では動かない。
            #[cfg(target_os = "macos")]
            start_overlay_selftest(app.handle());
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
