use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow,
};
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
}

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

/// オーバーレイ窓を「発表アプリのフルスクリーンより前」に持ち上げる。
///
/// Tauri の `alwaysOnTop` は NSFloatingWindowLevel (3) を設定するだけで、
/// Keynote / PowerPoint のスライドショーはそれより高いレベルで描画されるため
/// 背面に隠れてしまう。ここで NSWindow を直接叩いて回避する。
#[cfg(target_os = "macos")]
fn elevate_overlay_window(window: &WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::Bool;

    let Some(ns_window) = ns_window_ptr(window) else {
        return;
    };

    /// NSWindowCollectionBehavior のビットフラグ:
    ///   CanJoinAllSpaces    (1<<0) 全ての Space に出る
    ///   Stationary          (1<<4) Mission Control のスワイプで置き去りにされない
    ///   IgnoresCycle        (1<<6) ⌘` のウィンドウ巡回に現れない
    ///   FullScreenAuxiliary (1<<8) 他アプリのフルスクリーン Space にも重ねられる
    const COLLECTION_BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);

    unsafe {
        let _: () = msg_send![ns_window, setLevel: SCREEN_SAVER_LEVEL];
        let _: () = msg_send![ns_window, setCollectionBehavior: COLLECTION_BEHAVIOR];
        let _: () = msg_send![ns_window, setOpaque: Bool::NO];
        let _: () = msg_send![ns_window, setHasShadow: Bool::NO];
    }
}

#[cfg(not(target_os = "macos"))]
fn elevate_overlay_window(_window: &WebviewWindow) {}

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
fn monitor_label(monitor: &Monitor, index: usize) -> String {
    monitor
        .name()
        .cloned()
        .unwrap_or_else(|| format!("ディスプレイ {}", index + 1))
}

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
            let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
            let _ = window.set_size(PhysicalSize::new(size.width, size.height));
        }
        None => eprintln!("[layertalk] 表示できるモニターが見つかりません"),
    }
}

/// 質問窓を指定モニターの右端へ合わせる。
/// 幅はCSSピクセルで指定し、Retinaでも同じ見た目になるよう物理ピクセルへ変換する。
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

/// 現在の質問窓幅を保ったまま、モニター右端へ貼り直す。
fn refit_question_panel(window: &WebviewWindow, target: Option<&str>) {
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
    fit_question_panel_to_monitor(window, target, logical_width);
}

/// オーバーレイはクリックスルー固定。切り替える手段は用意しない。
/// 発表中に「気づかないまま背面が操作できなくなっている」事故が起きないようにするため。
fn apply_overlay_behaviour(window: &WebviewWindow, target: Option<&str>) {
    elevate_overlay_window(window);
    fit_overlay_to_monitor(window, target);

    if let Err(err) = window.set_ignore_cursor_events(true) {
        eprintln!("[layertalk] クリックスルーの設定に失敗: {err}");
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

fn set_live(app: &AppHandle, value: bool) {
    if let Ok(mut guard) = app.state::<SessionState>().live.lock() {
        *guard = value;
    }
    let _ = app.emit("presentation-state-changed", value);
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
    app.get_webview_window(OVERLAY)
        .map(|window| collect_monitors(&window))
        .unwrap_or_default()
}

/// 表示先モニターを変更する。発表中なら即座に移動する。
#[tauri::command]
fn set_overlay_monitor(app: AppHandle, monitor: Option<String>) {
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        apply_overlay_behaviour(&overlay, monitor.as_deref());
    }
    if let Some(questions) = app.get_webview_window(QUESTIONS) {
        refit_question_panel(&questions, monitor.as_deref());
    }
}

/// 発表を開始する。指定モニターに配置してからオーバーレイを見せる。
#[tauri::command]
fn start_presentation(app: AppHandle, monitor: Option<String>) {
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        apply_overlay_behaviour(&overlay, monitor.as_deref());
        let _ = overlay.show();
    }
    set_live(&app, true);
}

/// 発表を終了する。ルームの設定はそのまま残すので、同じコードですぐ再開できる。
#[tauri::command]
fn stop_presentation(app: AppHandle) {
    set_live(&app, false);
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        let _ = overlay.hide();
    }
    if let Some(questions) = app.get_webview_window(QUESTIONS) {
        let _ = questions.hide();
    }
}

#[tauri::command]
fn get_presentation_state(app: AppHandle) -> bool {
    is_live(&app)
}

/// 開始前にオーバーレイを一瞬だけ見せる。
///
/// モニター名だけでは物理的にどの画面か分からないので、選んだ先に実物を出して
/// 確認できるようにする。スタンプのプレビューにも使う。
/// 発表中は既に見えているので何もしない。
#[tauri::command]
fn peek_overlay(app: AppHandle, monitor: Option<String>, ms: u64) {
    if is_live(&app) {
        return;
    }

    let Some(overlay) = app.get_webview_window(OVERLAY) else {
        return;
    };

    apply_overlay_behaviour(&overlay, monitor.as_deref());
    let _ = overlay.show();
    let _ = app.emit("overlay-peek", ms);

    // Tauri のウィンドウ操作はスレッドセーフ（内部でメインスレッドへ委譲される）。
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(ms));
        // 待っている間に発表が始まっていたら消さない。
        if is_live(&handle) {
            return;
        }
        if let Some(overlay) = handle.get_webview_window(OVERLAY) {
            let _ = overlay.hide();
        }
    });
}

/// ディスプレイ構成が変わったときに呼ぶ（外部モニタ接続・解像度変更など）。
#[tauri::command]
fn refit_overlay(app: AppHandle, monitor: Option<String>) {
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        apply_overlay_behaviour(&overlay, monitor.as_deref());
    }
    if let Some(questions) = app.get_webview_window(QUESTIONS) {
        refit_question_panel(&questions, monitor.as_deref());
    }
}

/// 質問パネルを展開幅またはタブ幅に変更し、選択モニターの右端へ揃える。
#[tauri::command]
fn set_question_panel_expanded(app: AppHandle, monitor: Option<String>, expanded: bool) {
    if !is_live(&app) {
        return;
    }

    if let Some(questions) = app.get_webview_window(QUESTIONS) {
        elevate_overlay_window(&questions);
        let width = if expanded {
            QUESTION_PANEL_WIDTH
        } else {
            QUESTION_TAB_WIDTH
        };
        fit_question_panel_to_monitor(&questions, monitor.as_deref(), width);
        let _ = questions.show();
    }
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

            // オーバーレイは「プレゼンを開始」まで隠したままにする。
            // tauri.conf.json で visible:false にしてあるので、ここでは
            // ネイティブの設定だけ済ませておく。
            if let Some(overlay) = app.get_webview_window(OVERLAY) {
                apply_overlay_behaviour(&overlay, None);
            }

            // 質問窓は操作可能な別ウィンドウ。メインオーバーレイの
            // クリックスルーを保ったまま、右端の範囲だけクリックを受け取る。
            if let Some(questions) = app.get_webview_window(QUESTIONS) {
                elevate_overlay_window(&questions);
                fit_question_panel_to_monitor(&questions, None, QUESTION_PANEL_WIDTH);
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
