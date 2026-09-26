//! Windows のオーバーレイ窓まわり。macOS ビルドからは丸ごと消える。
//!
//! macOS 側（`native_overlay` / `overlay_render`）が自前の NSWindow と Core Animation で
//! 描いているのに対し、Windows は **WebView2 をそのまま透過させて使う**方針。
//! WebKit と違って WebView2 には透過背景の公開 API があり、App Store 2.5.1 のような
//! private API の制約も無い（罠 #9 の Space 問題も Windows には存在しない）。
//!
//! # 先に知っておくこと（vendored のソースで確認済み）
//!
//! 1. **透過そのものは、もう効いているはず。** 窓側は tao の
//!    `DwmEnableBlurBehindWindow`、webview 側は wry が `transparent: true` を
//!    そのまま `SetDefaultBackgroundColor(alpha=0)` に変換している
//!    （`wry-0.55.1/src/webview2/mod.rs:127-131` と `:453`）。
//!    **どちらも窓の生成時にしか走らない**ので、後から透過へ切り替える道は無い。
//!    ここの `force_webview_transparent` は直す手段ではなく**切り分けの道具**。
//! 2. **tao は自分のフラグから拡張スタイルを毎回まるごと書き戻す**
//!    （`tao-0.35.3/src/platform_impl/windows/window_state.rs:426-441` の
//!    `SetWindowLongW(GWL_EXSTYLE, style_ex)`）。`show()` / `hide()` /
//!    `set_always_on_top()` / `set_ignore_cursor_events()` がどれも引き金になる。
//!    つまり**手で足した拡張スタイルは次の操作で消える**。
//!    → `WS_EX_TOPMOST` は `always_on_top`、`WS_EX_NOACTIVATE` は **`focusable(false)`**
//!      に任せ（`window_state.rs:296-297`）、tao が知らない `WS_EX_TOOLWINDOW` だけを
//!      ここで、**`show()` のあとに**当て直す。
//! 3. **topmost にしただけでは前に出られない。** PowerPoint のスライドショーも topmost なので
//!    同じ帯の中の順位争いになる。`SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE)` を
//!    発表中だけウォッチドッグから当て直す。`SWP_NOACTIVATE` を落とすと
//!    スライドショーからフォーカスを奪い、矢印キーでのページ送りが死ぬ。
#![cfg(target_os = "windows")]

use tauri::WebviewWindow;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
};

fn hwnd_of(window: &WebviewWindow) -> Option<HWND> {
    match window.hwnd() {
        Ok(hwnd) => Some(hwnd),
        Err(err) => {
            eprintln!("[layertalk] hwnd() を取得できませんでした: {err}");
            crate::debug_log(&format!("win/hwnd: failed {err}"));
            None
        }
    }
}

fn ex_style(hwnd: HWND) -> u32 {
    // SAFETY: hwnd は Tauri が持っている生存中のウィンドウハンドル。
    (unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) }) as u32
}

/// z オーダーだけを当て直す。**発表中にウォッチドッグから毎秒呼ぶのがこれ。**
///
/// 位置もサイズも所有者順も触らず、**アクティブにもしない**。
pub fn raise(window: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(window) else {
        return;
    };

    // SAFETY: 生存中のハンドルに対する z オーダーの変更のみ。
    let result = unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        )
    };
    if let Err(err) = result {
        crate::debug_log(&format!("win/raise: SetWindowPos failed {err}"));
    }
}

/// Alt+Tab とタスクバーから外す（`WS_EX_TOOLWINDOW`）。tao はこのスタイルを公開していない。
///
/// **すでに立っているときは何もしない。** 毎秒 `SWP_FRAMECHANGED` を撃つと
/// そのたびに非クライアント領域の再計算が走り、それ自体がちらつきの元になる。
///
/// tao のスタイル書き戻し（モジュール冒頭の 2.）で消えるので、
/// **窓を見せたあと・クリックスルーを入れたあとに呼び直すこと。**
pub fn apply_tool_window(window: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(window) else {
        return;
    };

    let current = ex_style(hwnd);
    let wanted = current | WS_EX_TOOLWINDOW.0;
    if current == wanted {
        return;
    }

    // SAFETY: 生存中のハンドル。既存のスタイルを読んで 1 ビット足すだけ。
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, wanted as isize);
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

/// いま実際に当たっている拡張スタイルを 1 行で返す。`debug_log` に落とす用。
///
/// 「`always_on_top(true)` を呼んだのに `WS_EX_TOPMOST` が立っていない」のような、
/// tao の書き戻しに消された事故を**目で見るため**にある。
pub fn state(window: &WebviewWindow) -> String {
    let Some(hwnd) = hwnd_of(window) else {
        return "ex=?（hwnd なし）".to_string();
    };
    let ex = ex_style(hwnd);
    let has = |bit: u32| u8::from(ex & bit != 0);
    format!(
        "ex=0x{ex:08x} topmost={} noactivate={} tool={} layered={} transparent={}",
        has(WS_EX_TOPMOST.0),
        has(WS_EX_NOACTIVATE.0),
        has(WS_EX_TOOLWINDOW.0),
        has(WS_EX_LAYERED.0),
        has(WS_EX_TRANSPARENT.0),
    )
}

/// WebView2 の既定背景色を alpha=0 に当て直す。**切り分け専用。**
///
/// wry は `transparent: true` のときこれを**すでに 2 回当てている**
/// （`wry/src/webview2/mod.rs:393-405` の `ICoreWebView2ControllerOptions3` と
/// `:453` の `ICoreWebView2Controller2`）。だから既定では呼ばない。
/// **`LAYERTALK_WIN_WEBVIEW_TRANSPARENT=1` を付けたときだけ**走らせて、
/// 「ここで直る＝適用の順序の問題」「直らない＝窓側（DWM）か CSS の問題」を分ける。
pub fn force_webview_transparent(window: &WebviewWindow) {
    if !std::env::var("LAYERTALK_WIN_WEBVIEW_TRANSPARENT").is_ok_and(|value| value == "1") {
        return;
    }

    let label = window.label().to_string();
    let result = window.with_webview(move |webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
        };
        use windows::core::Interface;

        match webview.controller().cast::<ICoreWebView2Controller2>() {
            // alpha は 0 か 255 しか受け付けない（他は E_INVALIDARG）。
            Ok(controller) => {
                let transparent = COREWEBVIEW2_COLOR {
                    A: 0,
                    R: 0,
                    G: 0,
                    B: 0,
                };
                // SAFETY: WebView2 が握っている生存中の COM インターフェース。
                match unsafe { controller.SetDefaultBackgroundColor(transparent) } {
                    Ok(()) => crate::debug_log(&format!("win/webview-bg: alpha=0 forced on {label}")),
                    Err(err) => crate::debug_log(&format!("win/webview-bg: failed {err}")),
                }
            }
            Err(err) => crate::debug_log(&format!("win/webview-bg: cast failed {err}")),
        }
    });

    if let Err(err) = result {
        crate::debug_log(&format!("win/webview-bg: with_webview failed {err}"));
    }
}
