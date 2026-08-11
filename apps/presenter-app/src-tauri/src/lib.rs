use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow,
};

const OVERLAY: &str = "overlay";
const CONTROL: &str = "control";

/// 発表中かどうか。ウィンドウの表示・非表示は Rust の責務なので、
/// ここを唯一の真実にする。永続化しない = 再起動したら必ず停止状態から始まる。
#[derive(Default)]
struct SessionState {
    live: Mutex<bool>,
}

// ---------------------------------------------------------------- macOS 固有

/// オーバーレイ窓を「発表アプリのフルスクリーンより前」に持ち上げる。
///
/// Tauri の `alwaysOnTop` は NSFloatingWindowLevel (3) を設定するだけで、
/// Keynote / PowerPoint のスライドショーはそれより高いレベルで描画されるため
/// 背面に隠れてしまう。ここで NSWindow を直接叩いて回避する。
#[cfg(target_os = "macos")]
fn elevate_overlay_window(window: &WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::{AnyObject, Bool};

    let Ok(ptr) = window.ns_window() else {
        eprintln!("[layertalk] ns_window() を取得できませんでした");
        return;
    };

    let ns_window = ptr as *mut AnyObject;
    if ns_window.is_null() {
        return;
    }

    /// kCGScreenSaverWindowLevel。スライドショーより上、かつカーソルより下。
    const SCREEN_SAVER_LEVEL: isize = 1000;

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
        let _ = control.show();
        let _ = control.unminimize();
        let _ = control.set_focus();
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
}

#[tauri::command]
fn show_control(app: AppHandle) {
    focus_control_window(&app);
}

// -------------------------------------------------------------------- tray

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_control_item =
        MenuItem::with_id(app, "show_control", "コントロールを表示", true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "プレゼンを終了", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "LayerTalk を終了", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_control_item, &stop_item, &separator, &quit_item])?;

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
        .manage(SessionState::default())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            set_overlay_monitor,
            start_presentation,
            stop_presentation,
            get_presentation_state,
            peek_overlay,
            refit_overlay,
            show_control,
        ])
        .setup(|app| {
            // Dock アイコンを出さず、⌘-Tab にも現れず、オーバーレイが
            // 発表アプリからフォーカスを奪わないようにする。
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();

            // オーバーレイは「プレゼンを開始」まで隠したままにする。
            // tauri.conf.json で visible:false にしてあるので、ここでは
            // ネイティブの設定だけ済ませておく。
            if let Some(overlay) = app.get_webview_window(OVERLAY) {
                apply_overlay_behaviour(&overlay, None);
            }

            // コントロール窓は閉じても破棄せず隠すだけにする（macOS の作法）。
            if let Some(control) = app.get_webview_window(CONTROL) {
                let control_for_event = control.clone();
                control.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = control_for_event.hide();
                    }
                });
            }

            setup_tray(&handle)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
