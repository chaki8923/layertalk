#[cfg(target_os = "macos")]
mod imp {
    use std::{
        ffi::{c_char, c_void, CStr, CString},
        sync::mpsc,
        time::Duration,
    };

    use serde_json::Value;
    use tauri::{AppHandle, Emitter};

    type Callback = unsafe extern "C" fn(*mut c_void, *const c_char);

    extern "C" {
        fn layertalk_storekit_product(
            product_id: *const c_char,
            context: *mut c_void,
            callback: Callback,
        );
        fn layertalk_storekit_purchase(
            product_id: *const c_char,
            attempt_id: *const c_char,
            context: *mut c_void,
            callback: Callback,
        );
        fn layertalk_storekit_unfinished(context: *mut c_void, callback: Callback);
        fn layertalk_storekit_finish(
            transaction_id: *const c_char,
            context: *mut c_void,
            callback: Callback,
        );
        fn layertalk_storekit_start_updates(context: *mut c_void, callback: Callback);
    }

    unsafe extern "C" fn once_callback(context: *mut c_void, json: *const c_char) {
        if context.is_null() {
            return;
        }
        let sender = unsafe { Box::from_raw(context.cast::<mpsc::Sender<String>>()) };
        let value = if json.is_null() {
            "{\"status\":\"error\"}".to_owned()
        } else {
            unsafe { CStr::from_ptr(json) }
                .to_string_lossy()
                .into_owned()
        };
        let _ = sender.send(value);
    }

    async fn call(start: impl FnOnce(*mut c_void, Callback)) -> Result<Value, String> {
        let (sender, receiver) = mpsc::channel();
        start(Box::into_raw(Box::new(sender)).cast(), once_callback);
        let json = tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(Duration::from_secs(120))
        })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
        serde_json::from_str(&json).map_err(|error| error.to_string())
    }

    fn cstring(value: &str) -> Result<CString, String> {
        CString::new(value).map_err(|_| "StoreKit argument contains a null byte".to_owned())
    }

    pub async fn product(product_id: String) -> Result<Value, String> {
        let product_id = cstring(&product_id)?;
        call(|context, callback| unsafe {
            layertalk_storekit_product(product_id.as_ptr(), context, callback)
        })
        .await
    }

    pub async fn purchase(product_id: String, attempt_id: String) -> Result<Value, String> {
        let product_id = cstring(&product_id)?;
        let attempt_id = cstring(&attempt_id)?;
        call(|context, callback| unsafe {
            layertalk_storekit_purchase(product_id.as_ptr(), attempt_id.as_ptr(), context, callback)
        })
        .await
    }

    pub async fn unfinished() -> Result<Value, String> {
        call(|context, callback| unsafe { layertalk_storekit_unfinished(context, callback) }).await
    }

    pub async fn finish(transaction_id: String) -> Result<Value, String> {
        let transaction_id = cstring(&transaction_id)?;
        call(|context, callback| unsafe {
            layertalk_storekit_finish(transaction_id.as_ptr(), context, callback)
        })
        .await
    }

    unsafe extern "C" fn updates_callback(context: *mut c_void, json: *const c_char) {
        if context.is_null() || json.is_null() {
            return;
        }
        let app = unsafe { &*context.cast::<AppHandle>() };
        let value = unsafe { CStr::from_ptr(json) }
            .to_string_lossy()
            .into_owned();
        if let Ok(payload) = serde_json::from_str::<Value>(&value) {
            let _ = app.emit("storekit-transaction", payload);
        }
    }

    pub fn start_updates(app: AppHandle) {
        let context = Box::into_raw(Box::new(app)).cast();
        // Intentionally retained for the lifetime of StoreKit's infinite updates task.
        unsafe { layertalk_storekit_start_updates(context, updates_callback) };
    }
}

#[cfg(target_os = "macos")]
pub use imp::*;
