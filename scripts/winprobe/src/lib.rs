//! Windows 専用コードを macOS から型検査するための器。
//!
//! **中身を書き写さないこと。** 写すと必ず本物とずれる。`#[path]` で本物を読む。
//!
//! ここで見られるのは「`windows` クレートだけに依存するファイル」に限る。
//! `tauri::WebviewWindow` を取るもの（`windows_overlay.rs`、`lib.rs` の Windows 腕）は
//! 読めないので、そこは VM でのビルドが唯一の検査になる。

/// 本物の `crate::debug_log` の影。
pub fn debug_log(_message: &str) {}

/// 本物の `question_capture` のうち、`windows_capture` が触る部分だけの影。
/// **フィールドと戻り値の形を本物と合わせること。**
pub mod question_capture {
    #[derive(Clone)]
    pub struct Frame {
        pub width: u32,
        pub height: u32,
        pub bgra: Vec<u8>,
    }

    pub fn capture_dimensions(width: u32, height: u32) -> (u32, u32) {
        let _ = (width, height);
        (1920, 1080)
    }
}

#[path = "../../../apps/presenter-app/src-tauri/src/windows_capture.rs"]
mod windows_capture;

#[path = "../../../apps/presenter-app/src-tauri/src/windows_shell.rs"]
mod windows_shell;
