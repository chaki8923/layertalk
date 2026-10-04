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

// ------------------------------------------------------- 資格情報マネージャー

use windows::core::HRESULT;
use windows::Win32::Foundation::ERROR_NOT_FOUND;
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_MAX_CREDENTIAL_BLOB_SIZE,
    CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
};
use windows::core::PWSTR;

/// 「見つからない」の HRESULT。**これだけを「未設定」に落とす。**
fn is_not_found(error: &windows::core::Error) -> bool {
    error.code() == HRESULT::from_win32(ERROR_NOT_FOUND.0)
}

/// 失敗の中身をログにだけ残す。**呼び出し側へは `()` しか返さない。**
///
/// ここが扱う値は Slack / Teams の webhook URL そのもので、**秘密**。
/// OS のメッセージに値が混ざる可能性がある以上、エラーを文字列化して
/// 上へ渡す経路を作らない（`notifications.rs` が `"storage_error"` に畳む）。
/// ログに出すのも操作名とコードだけで、ターゲット名も中身も出さない。
fn credential_failed(operation: &str, error: windows::core::Error) {
    crate::debug_log(&format!("win/credential {operation}: {:?}", error.code()));
}

/// 資格情報を読む。
///
/// **「無い」と「読めない」を必ず分けること。** 拒否されたのに `None` を返すと、
/// 設定済みの送信先が「未設定」に見え、黙って上書きされる。
pub fn credential_read(target: &str) -> Result<Option<Vec<u8>>, ()> {
    let name = HSTRING::from(target);
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();

    // SAFETY: `name` は呼び出しのあいだ生きている。`credential` は成功時だけ書かれる。
    match unsafe { CredReadW(&name, CRED_TYPE_GENERIC, None, &mut credential) } {
        Ok(()) => {}
        Err(error) if is_not_found(&error) => return Ok(None),
        Err(error) => {
            credential_failed("read", error);
            return Err(());
        }
    }

    if credential.is_null() {
        return Ok(None);
    }

    // SAFETY: `CredReadW` が成功したので `credential` は有効。読み終えたら必ず `CredFree`。
    let bytes = unsafe {
        let blob = (*credential).CredentialBlob;
        let size = (*credential).CredentialBlobSize as usize;
        let bytes = if blob.is_null() || size == 0 {
            Vec::new()
        } else {
            std::slice::from_raw_parts(blob, size).to_vec()
        };
        CredFree(credential as *const core::ffi::c_void);
        bytes
    };

    Ok(Some(bytes))
}

/// 資格情報を書く。
pub fn credential_write(target: &str, blob: &[u8]) -> Result<(), ()> {
    // **黙って失敗する経路を作らない。** webhook URL の検証は 8192 バイトまで通すのに、
    // `CredentialBlob` の上限は 2560 バイト。超えたまま渡すと `CredWriteW` が失敗し、
    // 画面には「保存しました」が出たのに何も残らない、という形になりうる。
    if blob.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
        crate::debug_log(&format!(
            "win/credential write: blob is {} bytes, limit is {CRED_MAX_CREDENTIAL_BLOB_SIZE}",
            blob.len()
        ));
        return Err(());
    }

    let mut name: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(name.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        // **ローミングさせない。** プライバシーポリシーが「この端末だけに保存」と
        // 約束しているので、`CRED_PERSIST_ENTERPRISE` にすると文書のほうが嘘になる。
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };

    // SAFETY: `name` と `blob` は呼び出しのあいだ生きている。`CredWriteW` は中身をコピーする。
    match unsafe { CredWriteW(&credential, 0) } {
        Ok(()) => Ok(()),
        Err(error) => {
            credential_failed("write", error);
            Err(())
        }
    }
}

/// 資格情報を消す。**冪等** — 元から無ければ成功として返す。
pub fn credential_delete(target: &str) -> Result<(), ()> {
    let name = HSTRING::from(target);
    // SAFETY: `name` は呼び出しのあいだ生きている。
    match unsafe { CredDeleteW(&name, CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        Err(error) if is_not_found(&error) => Ok(()),
        Err(error) => {
            credential_failed("delete", error);
            Err(())
        }
    }
}
