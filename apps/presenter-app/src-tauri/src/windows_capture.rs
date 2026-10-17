//! Windows の画面撮影（質問スライド）。macOS ビルドからは丸ごと消える。
//!
//! macOS は ScreenCaptureKit の**常時ストリーム**（2fps）＋最新フレームの控えで撮っている。
//! あれは `SCScreenshotManager` の単発撮影がタイムアウトを持たずにブロックするから
//! （罠 #17）で、Windows にその制約は無い。こちらは **質問が届いた瞬間に1枚だけ撮る**。
//! 常時ストリームにしないのは、**WGC は撮影中ずっと画面に黄色い枠を描く**ため — 発表中
//! ずっと投影面に枠が出ることになる。オンデマンドなら出ても一瞬で済む。
//!
//! # 自分のオーバーレイを写さない
//!
//! macOS は `SCContentFilter::with_excluding_applications` で自アプリだけ除ける。
//! **Windows に同じものは無い。** 代わりに `SetWindowDisplayAffinity` の
//! `WDA_EXCLUDEFROMCAPTURE` を使うが、これは **Zoom や OBS を含むすべての録画経路から
//! 窓を消す**。立てっぱなしにすると画面共有している遠隔の参加者にコメントが見えなくなるので、
//! **撮る瞬間だけ立てて必ず戻す**（`ExcludeGuard` の Drop が戻す。`?` で抜けても戻る）。
//! 戻し損ねると「オーバーレイが以後ずっと他のキャプチャから消えたまま」になる — これが
//! この設計で最悪の壊れ方なので、Drop の中では絶対に early return しない。
//!
//! # WGC に縮小は無い
//!
//! `SCStreamConfiguration` と違い、WGC は画面の実寸で返す。**縮小しないと 4K がそのまま
//! `encode_jpeg` に入り**、1枚 1.5MB 超・取り置き 30 枚で 45MB・レポートの base64 で 1.3 倍に
//! なる。`question_capture::capture_dimensions`（長辺 1920）をここで通す。
#![cfg(target_os = "windows")]

use std::ffi::c_void;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use windows::core::{factory, Interface, BOOL};
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{
    Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, MonitorFromPoint, HDC, HMONITOR, MONITORINFO,
    MONITORINFOEXW, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::UI::WindowsAndMessaging::{
    IsWindow, SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
};

use crate::question_capture::{capture_dimensions, Frame};

/// 1枚撮るのを諦めるまで。macOS の 1.5 秒より短いのは、`ControlWindow` が
/// 500ms 空けて1度だけ再試行するため（800 + 500 + 800 ≒ 2.1 秒で赤いバナーに届く）。
const SHOT_TIMEOUT: Duration = Duration::from_millis(800);

/// 撮影の一瞬だけキャプチャから外す窓（`overlay` と `questions`）。
///
/// `capture_question` は `AppHandle` を受け取らない（受けるようにすると macOS 側の
/// シグネチャまで動く）。どちらの窓も `CloseRequested` を止めていて破棄されないので、
/// 生成時に一度登録すれば足りる。
///
/// **`control` はわざと登録しない。** 発表者の手元画面にあるのが普通で、外すと
/// Zoom からもコントロール窓が消える。投影面にコントロール窓を置いた場合は写り込む。
static EXCLUDED: Mutex<Vec<isize>> = Mutex::new(Vec::new());

/// この Windows で WGC が使えるか。**`start` から呼ぶ同期の事前判定**なので、
/// GPU に触る処理をここに足さないこと（`start_presentation` はメインスレッドで走る）。
pub fn is_supported() -> bool {
    GraphicsCaptureSession::IsSupported().unwrap_or(false)
}

pub fn register_excluded(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    if let Ok(mut list) = EXCLUDED.lock() {
        if !list.contains(&hwnd) {
            list.push(hwnd);
        }
    }
}

fn excluded() -> Vec<isize> {
    EXCLUDED.lock().map(|list| list.clone()).unwrap_or_default()
}

/// 保険。`ExcludeGuard` の Drop が走らなかった場合に備え、発表を終えるときに戻す。
/// 冪等なので何度呼んでもよい。
pub fn restore_all_excluded() {
    for raw in excluded() {
        let hwnd = HWND(raw as *mut c_void);
        let _ = unsafe { SetWindowDisplayAffinity(hwnd, WDA_NONE) };
    }
}

// ------------------------------------------------------------------ モニター

/// 1枚のモニター。**`HMONITOR` を持たない** — 生ポインタで `Send` にならず、
/// 画面構成が変わると無効になる。GDI のデバイス名で覚えて撮影のたびに引き直す。
#[derive(Clone, Debug)]
pub struct MonitorTarget {
    /// `\\.\DISPLAY1` など。`monitor_label` が設定に保存しているのと同じ文字列。
    pub device: String,
    /// `EnumDisplayMonitors` の並び順。tao の `available_monitors()` と同じ順。
    pub index: u32,
    /// 仮想デスクトップ上の左上。名前も添字も外れたときの最後の保険。
    pub origin: (i32, i32),
}

unsafe extern "system" fn collect_monitor(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _clip: *mut RECT,
    data: LPARAM,
) -> BOOL {
    let list = data.0 as *mut Vec<HMONITOR>;
    unsafe { (*list).push(hmonitor) };
    true.into()
}

/// tao の `get_monitor_info` と同じ作法（`cbSize` は `MONITORINFOEXW` の大きさ、
/// ポインタは `*mut MONITORINFO` へキャスト）。ずらすと `GetMonitorInfoW` が false を返す。
fn enumerate() -> Vec<(HMONITOR, MonitorTarget)> {
    let mut handles: Vec<HMONITOR> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(collect_monitor),
            LPARAM(&mut handles as *mut Vec<HMONITOR> as isize),
        );
    }

    handles
        .into_iter()
        .enumerate()
        .filter_map(|(index, hmonitor)| {
            let mut info = MONITORINFOEXW::default();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            let ok = unsafe {
                GetMonitorInfoW(hmonitor, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO)
            };
            if !ok.as_bool() {
                return None;
            }
            let end = info
                .szDevice
                .iter()
                .position(|unit| *unit == 0)
                .unwrap_or(info.szDevice.len());
            Some((
                hmonitor,
                MonitorTarget {
                    device: String::from_utf16_lossy(&info.szDevice[..end]),
                    index: index as u32,
                    origin: (info.monitorInfo.rcMonitor.left, info.monitorInfo.rcMonitor.top),
                },
            ))
        })
        .collect()
}

fn primary_index(monitors: &[(HMONITOR, MonitorTarget)]) -> u32 {
    // `MONITORINFOF_PRIMARY` は windows crate に**存在しない**（metadata に無い #define）。
    // tao の `primary_monitor()` と同じく原点から引く。
    let primary = unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) };
    monitors
        .iter()
        .find(|(hmonitor, _)| *hmonitor == primary)
        .map(|(_, target)| target.index)
        .unwrap_or(0)
}

/// `monitor_label` の代替名（`ディスプレイ N`）から添字を引く。
/// 番号は同じ `EnumDisplayMonitors` の並びなので添字に落とせる。
fn label_index(label: &str, count: usize) -> Option<u32> {
    label
        .strip_prefix("ディスプレイ ")
        .and_then(|n| n.parse::<u32>().ok())
        .and_then(|n| n.checked_sub(1))
        .filter(|index| (*index as usize) < count)
}

/// `capture_display_id` の Windows 実装。
///
/// **返す u32 は「列挙順の添字」**で、`start` が耐久性のある識別子へ格上げするまでの
/// あいだだけ意味を持つ（`HMONITOR` は 32bit に入らないし、画面構成が変わると無効になる）。
pub fn monitor_index(label: Option<&str>) -> Option<u32> {
    let monitors = enumerate();
    if monitors.is_empty() {
        return None;
    }
    let Some(label) = label else {
        return Some(primary_index(&monitors));
    };
    let found = monitors
        .iter()
        .find(|(_, target)| target.device == label)
        .map(|(_, target)| target.index)
        .or_else(|| label_index(label, monitors.len()));
    // 見つからなければ主モニターへ落とす。発表直前にケーブルが抜けても撮影を諦めない
    // （`fit_overlay_to_monitor` と同じ方針）。
    Some(found.unwrap_or_else(|| primary_index(&monitors)))
}

/// `start` が受け取った添字を、以後ずっと使う識別子へ格上げする。
pub fn target_at(index: u32) -> Option<MonitorTarget> {
    let monitors = enumerate();
    monitors
        .get(index as usize)
        .map(|(_, target)| target.clone())
        .or_else(|| monitors.first().map(|(_, target)| target.clone()))
}

/// 撮影時に `MonitorTarget` を `HMONITOR` へ戻す。表示構成が変わっていてもここで吸収する。
/// デバイス名 → 位置 → 添字の順。全部外れたら撮らない（勝手に別の画面を撮らない）。
fn resolve(target: &MonitorTarget) -> Option<HMONITOR> {
    let monitors = enumerate();
    monitors
        .iter()
        .find(|(_, candidate)| candidate.device == target.device)
        .or_else(|| monitors.iter().find(|(_, candidate)| candidate.origin == target.origin))
        .or_else(|| monitors.get(target.index as usize))
        .map(|(hmonitor, _)| *hmonitor)
}

// ------------------------------------------------------------------ エラー

#[derive(Debug)]
pub enum ShotError {
    /// この Windows に WGC が無い。回復しない。
    Unsupported(String),
    /// 撮影対象のモニターが消えた。回復しない。
    MonitorGone,
    /// D3D11 デバイスを作れない。
    Device(String),
    /// 制限時間内に1枚も届かなかった。
    Timeout,
    /// 想定外のピクセル形式（HDR の画面など）。
    Format(u32),
    /// 読み出しに失敗した。
    Readback(String),
}

impl ShotError {
    /// `CaptureHealth.last_status` に入れる固定文字列（`&'static str` しか入らない）。
    pub fn status_name(&self) -> &'static str {
        match self {
            Self::Unsupported(_) => "wgc/unsupported",
            Self::MonitorGone => "wgc/no-monitor",
            Self::Device(_) => "wgc/no-device",
            Self::Timeout => "wgc/timeout",
            Self::Format(_) => "wgc/format",
            Self::Readback(_) => "wgc/readback",
        }
    }

    /// 回復しない失敗か。true のとき `health.stopped` に入れて収録表示を落とす。
    pub fn is_fatal(&self) -> bool {
        matches!(self, Self::Unsupported(_) | Self::MonitorGone)
    }
}

impl std::fmt::Display for ShotError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported(detail) => write!(f, "windows graphics capture unavailable: {detail}"),
            Self::MonitorGone => write!(f, "capture monitor is gone"),
            Self::Device(detail) => write!(f, "d3d11 device: {detail}"),
            Self::Timeout => write!(f, "no frame arrived in time"),
            Self::Format(format) => write!(f, "unexpected pixel format: {format}"),
            Self::Readback(detail) => write!(f, "readback: {detail}"),
        }
    }
}

// ------------------------------------------------------------------ 除外ガード

struct ExcludeGuard {
    applied: Vec<HWND>,
}

impl ExcludeGuard {
    fn apply(handles: &[isize]) -> Self {
        let mut applied = Vec::new();
        for raw in handles {
            let hwnd = HWND(*raw as *mut c_void);
            if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
                continue;
            }
            match unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) } {
                Ok(()) => applied.push(hwnd),
                // Windows 10 2004 より前に `WDA_EXCLUDEFROMCAPTURE` は無い。
                // **そのまま撮る。** `WDA_MONITOR` に落とすとスライドに黒い箱が乗るので、
                // 写り込むほうがまだまし。
                Err(err) => crate::debug_log(&format!("win/capture: exclude failed {err}")),
            }
        }
        Self { applied }
    }
}

impl Drop for ExcludeGuard {
    fn drop(&mut self) {
        for hwnd in self.applied.drain(..) {
            // 戻せないとオーバーレイが以後ずっと他のキャプチャから消えたままになる。
            // **絶対に unwrap も break もしない。**
            if let Err(err) = unsafe { SetWindowDisplayAffinity(hwnd, WDA_NONE) } {
                crate::debug_log(&format!("win/capture: restore failed {err}"));
            }
        }
    }
}

// ------------------------------------------------------------------ 撮影

fn create_device() -> Result<(ID3D11Device, ID3D11DeviceContext), ShotError> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    // `BGRA_SUPPORT` が無いと WGC のフレームプール生成が E_INVALIDARG で落ちる。
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .map_err(|err| ShotError::Device(err.to_string()))?;

    match (device, context) {
        (Some(device), Some(context)) => Ok((device, context)),
        _ => Err(ShotError::Device("device was null".into())),
    }
}

fn winrt_device(device: &ID3D11Device) -> Result<IDirect3DDevice, ShotError> {
    let dxgi: IDXGIDevice = device.cast().map_err(|e| ShotError::Device(e.to_string()))?;
    // これは `IInspectable` を返す。`IDirect3DDevice` ではないので cast が要る。
    let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }
        .map_err(|e| ShotError::Device(e.to_string()))?;
    inspectable.cast().map_err(|e| ShotError::Device(e.to_string()))
}

/// 1枚目を捨てる枚数。既定 0（`DwmFlush` で合成を1回通してから撮るので足りる想定）。
/// **写り込みが出たら 1 にして確かめる。** 勘で 1 にはしない — 毎回1フレーム分遅くなる。
fn frames_to_skip() -> u32 {
    std::env::var("LAYERTALK_WIN_CAPTURE_SKIP")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

/// 指定モニターを1枚撮る。
///
/// **呼び出し側はロックを握っていないこと。** 数百 ms かかるので、`active` を握ったまま
/// 呼ぶと `stop_presentation` まで巻き添えで固まる（macOS の罠 #17 と同じ形）。
pub fn shoot_monitor(target: &MonitorTarget) -> Result<Frame, ShotError> {
    let Some(hmonitor) = resolve(target) else {
        return Err(ShotError::MonitorGone);
    };

    // 1) 自分の窓をキャプチャから外す。復帰は Drop が保証する。
    let _hidden = ExcludeGuard::apply(&excluded());
    // 2) **DWM の合成を1回通す。** `SetWindowDisplayAffinity` は次の合成で効くので、
    //    ここを飛ばすと外したはずのオーバーレイが1枚目に写る。
    let _ = unsafe { DwmFlush() };

    let (device, context) = create_device()?;
    let winrt = winrt_device(&device)?;

    let interop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
        .map_err(|e| ShotError::Unsupported(e.to_string()))?;
    let item: GraphicsCaptureItem =
        unsafe { interop.CreateForMonitor(hmonitor) }.map_err(|_| ShotError::MonitorGone)?;
    let size = item.Size().map_err(|_| ShotError::MonitorGone)?;

    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &winrt,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        size,
    )
    .map_err(|e| ShotError::Device(e.to_string()))?;
    let session = pool
        .CreateCaptureSession(&item)
        .map_err(|e| ShotError::Device(e.to_string()))?;

    // Windows 10 には `IGraphicsCaptureSession2 / 3` が無く、内部の cast が
    // `E_NOINTERFACE` を返すだけ。**どちらも撮影の成否に関係しないので無視して進む。**
    if let Err(err) = session.SetIsCursorCaptureEnabled(false) {
        crate::debug_log(&format!("win/capture: cursor off unavailable {err}"));
    }
    // **この Err はほぼ飛ばない。** Microsoft の文書が明示していて、枠を消すには
    // (a) マニフェストの `graphicsCaptureWithoutBorder`（パッケージ ID が付いたときだけ効く）と
    // (b) `GraphicsCaptureAccess.RequestAccessAsync(Borderless)` による利用者の同意
    // の両方が要る。**どちらが欠けても setter は Ok を返したまま値が無視される**ので、
    // ここのログは「枠が出ていない」ことの根拠にならない。素のビルド（＝VM での検証）では
    // そもそも要求されず枠は出なかった。MSIX 版で枠が出たら (b) を足す。
    if let Err(err) = session.SetIsBorderRequired(false) {
        crate::debug_log(&format!("win/capture: border off unavailable {err}"));
    }

    // **`TryGetNextFrame` のポーリングにしない。** 空のときも `Err` を返し、しかも
    // `code()` が `HRESULT(0)` なので「まだ来ていない」と本物の失敗を区別できない。
    let (tx, rx) = std::sync::mpsc::sync_channel::<Direct3D11CaptureFrame>(2);
    let token = pool
        .FrameArrived(&TypedEventHandler::<
            Direct3D11CaptureFramePool,
            windows::core::IInspectable,
        >::new(move |pool, _| {
            if let Some(pool) = pool.as_ref() {
                if let Ok(frame) = pool.TryGetNextFrame() {
                    let _ = tx.try_send(frame);
                }
            }
            Ok(())
        }))
        .map_err(|e| ShotError::Device(e.to_string()))?;

    session
        .StartCapture()
        .map_err(|e| ShotError::Device(e.to_string()))?;

    let started = Instant::now();
    let deadline = started + SHOT_TIMEOUT;
    let mut chosen: Option<Direct3D11CaptureFrame> = None;
    let mut seen = 0u32;
    while seen <= frames_to_skip() {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        match rx.recv_timeout(left) {
            Ok(frame) => {
                if let Some(previous) = chosen.replace(frame) {
                    let _ = previous.Close();
                }
                seen += 1;
            }
            Err(_) => break,
        }
    }

    // **撮れたかどうかに関わらず必ず片付ける。** session を閉じないと黄色い枠が残る。
    let _ = pool.RemoveFrameArrived(token);
    let _ = session.Close();

    let Some(frame) = chosen else {
        let _ = pool.Close();
        crate::debug_log(&format!(
            "capture/empty: after {}ms",
            started.elapsed().as_millis()
        ));
        return Err(ShotError::Timeout);
    };

    let result = read_back(&device, &context, &frame);
    let _ = frame.Close();
    let _ = pool.Close();

    if let Ok(frame) = &result {
        crate::debug_log(&format!(
            "capture/done: {}x{} frames={} in {}ms",
            frame.width,
            frame.height,
            seen,
            started.elapsed().as_millis()
        ));
    }
    result
}

fn read_back(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    frame: &Direct3D11CaptureFrame,
) -> Result<Frame, ShotError> {
    let content = frame
        .ContentSize()
        .map_err(|e| ShotError::Readback(e.to_string()))?;
    let surface = frame
        .Surface()
        .map_err(|e| ShotError::Readback(e.to_string()))?;
    let access: IDirect3DDxgiInterfaceAccess = surface
        .cast()
        .map_err(|e| ShotError::Readback(e.to_string()))?;
    let source: ID3D11Texture2D =
        unsafe { access.GetInterface() }.map_err(|e| ShotError::Readback(e.to_string()))?;

    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { source.GetDesc(&mut desc) };

    // **想定外の形式で黙って壊れた絵を作らない。** HDR の画面では
    // `R16G16B16A16_FLOAT` が返ることがあり、BGRA として読むと色が崩れる。
    if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM {
        return Err(ShotError::Format(desc.Format.0 as u32));
    }
    // テクスチャはプールの大きさ、有効域は `ContentSize`。狭いほうを使う
    // （解像度が変わった直後は右下にゴミが乗る）。
    let width = desc.Width.min(content.Width.max(0) as u32);
    let height = desc.Height.min(content.Height.max(0) as u32);
    if width == 0 || height == 0 {
        return Err(ShotError::Readback("frame is empty".into()));
    }

    let staging_desc = D3D11_TEXTURE2D_DESC {
        Width: desc.Width,
        Height: desc.Height,
        MipLevels: 1,
        ArraySize: 1,
        Format: desc.Format,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut staging: Option<ID3D11Texture2D> = None;
    unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging)) }
        .map_err(|e| ShotError::Readback(e.to_string()))?;
    let staging = staging.ok_or_else(|| ShotError::Readback("staging is null".into()))?;

    unsafe { context.CopyResource(&staging, &source) };

    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .map_err(|e| ShotError::Readback(e.to_string()))?;
    // **`Map` と `Unmap` のあいだで `?` しないこと。** 途中で戻るとテクスチャが張られたまま残る。
    let packed = if mapped.pData.is_null() || (mapped.RowPitch as usize) < width as usize * 4 {
        None
    } else {
        Some(unsafe { pack_rows(mapped.pData.cast::<u8>(), mapped.RowPitch, width, height) })
    };
    unsafe { context.Unmap(&staging, 0) };
    let bgra = packed.ok_or_else(|| ShotError::Readback("row pitch is too small".into()))?;

    let (target_width, target_height) = capture_dimensions(width, height);
    Ok(scale(Frame { width, height, bgra }, target_width, target_height))
}

/// 行パディングを落として詰める。macOS の `frame_from_sample` と同じ形の BGRA を作る。
unsafe fn pack_rows(data: *const u8, row_pitch: u32, width: u32, height: u32) -> Vec<u8> {
    let row_bytes = width as usize * 4;
    let pitch = row_pitch as usize;
    let mut out = vec![0u8; row_bytes * height as usize];
    for row in 0..height as usize {
        let source = unsafe { data.add(row * pitch) };
        let target = &mut out[row * row_bytes..(row + 1) * row_bytes];
        unsafe { std::ptr::copy_nonoverlapping(source, target.as_mut_ptr(), row_bytes) };
    }
    out
}

/// 長辺 1920 に落とす。**WGC には縮小が無い**ので、ここでやらないと 4K のまま JPEG になる。
fn scale(frame: Frame, width: u32, height: u32) -> Frame {
    if (frame.width, frame.height) == (width, height) || width == 0 || height == 0 {
        return frame;
    }
    // BGRA を「意味のない4チャンネル」として扱う。リサンプルはチャンネル独立なので
    // 並びは問わない。
    let (source_width, source_height) = (frame.width, frame.height);
    let Some(view) = image::ImageBuffer::<image::Rgba<u8>, &[u8]>::from_raw(
        source_width,
        source_height,
        frame.bgra.as_slice(),
    ) else {
        return frame;
    };
    let resized = image::imageops::resize(&view, width, height, image::imageops::FilterType::Triangle);
    Frame { width, height, bgra: resized.into_raw() }
}

#[cfg(test)]
mod tests {
    use super::label_index;

    #[test]
    fn fallback_label_maps_to_zero_based_index() {
        assert_eq!(label_index("ディスプレイ 1", 2), Some(0));
        assert_eq!(label_index("ディスプレイ 2", 2), Some(1));
        // 範囲外と、そもそも代替名ではないものは拾わない。
        assert_eq!(label_index("ディスプレイ 3", 2), None);
        assert_eq!(label_index("ディスプレイ 0", 2), None);
        assert_eq!(label_index(r"\\.\DISPLAY1", 2), None);
    }
}
