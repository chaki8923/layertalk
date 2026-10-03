//! Windows の OS 連携。macOS ビルドからは丸ごと消える。
//!
//! macOS 側が `NSWorkspace` を直接叩いているのと対になる場所
//! （罠 #18: `tauri-plugin-opener` は `/usr/bin/open` を spawn するので sandbox で
//! 黙って失敗する。だからプラットフォームごとに OS の API を直接呼ぶ）。
//!
//! **`tauri` に依存させないこと。** ここが `windows` クレートだけで閉じていれば、
//! `scripts/winprobe` から `#[path]` で読んで macOS 上で型検査できる。
//! `tauri::WebviewWindow` を受け取る関数を足した瞬間にそれができなくなる。
#![cfg(target_os = "windows")]

use windows::core::HSTRING;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// 既定のブラウザで URL を開く。
///
/// **`ShellExecuteW` はエラーを戻り値で返す。** `HINSTANCE` が 32 以下なら失敗という
/// 古い約束で、`Result` にはならない。握り潰すと「押しても何も起きない」になる
/// — 法務ページ・サポート・領収書への導線がそれで、辿れないこと自体が
/// ストアの審査指摘になる（App Store 5.1.1(i) と同趣旨の要求が Microsoft Store にもある）。
///
/// 呼び出し側（`open_external_url`）が http(s) に限っているので、ここでは検査しない。
pub fn open_url(url: &str) -> Result<(), String> {
    let target = HSTRING::from(url);
    let verb = HSTRING::from("open");
    // SAFETY: どちらの文字列も呼び出しのあいだ生きている。
    let result = unsafe { ShellExecuteW(None, &verb, &target, None, None, SW_SHOWNORMAL) };
    let code = result.0 as isize;
    if code <= 32 {
        return Err(format!("could not open the URL (code {code})"));
    }
    Ok(())
}
