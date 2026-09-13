use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use base64::Engine;
use image::{codecs::jpeg::JpegEncoder, ImageBuffer, Rgb};
use serde::Serialize;
use uuid::Uuid;

const CAPTURE_DIRECTORY: &str = "question-captures";
const RETENTION: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const JPEG_QUALITY: u8 = 82;
const MAX_LONG_EDGE: u32 = 1920;
/// 承認待ちの質問のために取り置くスライドの上限。1枚は数百KBの JPEG なので、溢れたら古いものから捨てる
/// （その質問は、承認されたときのスライドで諦める）。
const MAX_HELD_CAPTURES: usize = 30;

/// フォールバック撮影の待ち上限。`SCScreenshotManager` はタイムアウトを持たない
/// Condvar 待ちなので、replayd が黙ると永久に返らない。
#[cfg(target_os = "macos")]
const SNAPSHOT_TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePermission {
    pub supported: bool,
    pub granted: bool,
    /// macOS では許可後にアプリの再起動が必要になる場合がある。
    pub restart_required: bool,
    pub permission_target: CapturePermissionTarget,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CapturePermissionTarget {
    LayerTalk,
    LaunchingApp,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CaptureErrorKind {
    PermissionDenied,
    DisplayUnavailable,
    CaptureStartFailed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureErrorEvent {
    pub kind: CaptureErrorKind,
    pub detail: String,
    pub permission_target: CapturePermissionTarget,
}

#[derive(Debug)]
pub struct CaptureStartError {
    pub kind: CaptureErrorKind,
    pub detail: String,
}

impl CaptureStartError {
    fn start(detail: impl Into<String>) -> Self {
        Self {
            kind: CaptureErrorKind::CaptureStartFailed,
            detail: detail.into(),
        }
    }

    fn permission() -> Self {
        Self {
            kind: CaptureErrorKind::PermissionDenied,
            detail: "screen capture permission is not granted".into(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CaptureQuestionStatus {
    Captured,
    Inactive,
    FramePending,
}

/// `FramePending` になった理由。ここを潰すと「画面収録の準備が完了せず」しか
/// 出せなくなり、権限・macOS の確認ダイアログ・ディスプレイ消失の区別が付かなくなる。
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CapturePendingReason {
    /// まだ 1 枚もフレームが届いていない（開始直後）。
    AwaitingFirstFrame,
    /// Blank / Suspended / Stopped を受け取った。macOS 側で塞がれている。
    CaptureBlocked,
    /// デリゲートがストリームの停止を報告した。
    StreamStopped,
    /// フォールバックの単発撮影も失敗した（macOS 13 では常にここ）。
    SnapshotFailed,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct CaptureQuestionResult {
    pub status: CaptureQuestionStatus,
    /// `FramePending` のときだけ入る。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<CapturePendingReason>,
}

impl CaptureQuestionResult {
    fn captured() -> Self {
        Self {
            status: CaptureQuestionStatus::Captured,
            reason: None,
        }
    }

    fn inactive() -> Self {
        Self {
            status: CaptureQuestionStatus::Inactive,
            reason: None,
        }
    }

    fn pending(reason: CapturePendingReason) -> Self {
        Self {
            status: CaptureQuestionStatus::FramePending,
            reason: Some(reason),
        }
    }
}

/// ストリームが何を返しているかの記録。**これが無いと「フレームが来ない」以外に
/// 言えることが無くなる。** 実際、原因（`frame_status()` が全部 `None`）は
/// アプリのログからは分からず、macOS の `log show --predicate 'process == "replayd"'` と
/// 突き合わせるまで特定できなかった。
#[derive(Debug, Default, Clone)]
pub struct CaptureHealth {
    pub frames_seen: u64,
    pub frames_stored: u64,
    /// 直近フレームの `SCFrameStatus` の名前。ログ用。
    pub last_status: Option<&'static str>,
    /// Blank / Suspended / Stopped を 1 度でも見たか。
    pub blocked: bool,
    /// デリゲートが報告した停止理由。
    pub stopped: Option<String>,
}

/// 収録中の表示に使う判定。撮影していない（`None`）か、macOS が停止を報告していれば収録していない。
fn recording(health: Option<&CaptureHealth>) -> bool {
    health.is_some_and(|health| health.stopped.is_none())
}

#[derive(Clone)]
struct Frame {
    width: u32,
    height: u32,
    /// 行パディングを除いた BGRA。
    bgra: Vec<u8>,
}

/// 承認待ちの質問のために取り置いた、届いた時点のスライド（JPEG）。**ディスクには書かない。**
///
/// 承認されたら `capture_question` がここから取り出して保存する。非表示にされたら
/// `discard_question` が捨て、発表を終えると `ActiveCapture` ごと消える。
/// → 承認されなかった質問のスライドはどこにも残らない。
#[derive(Default)]
struct HeldCaptures {
    entries: VecDeque<(Uuid, Vec<u8>)>,
}

impl HeldCaptures {
    /// 同じ質問は最初の1枚を残す（届いた時点のスライドを後から上書きしない）。
    fn insert(&mut self, question_id: Uuid, jpeg: Vec<u8>) {
        if self.contains(question_id) {
            return;
        }
        self.entries.push_back((question_id, jpeg));
        while self.entries.len() > MAX_HELD_CAPTURES {
            self.entries.pop_front();
        }
    }

    fn contains(&self, question_id: Uuid) -> bool {
        self.entries.iter().any(|(id, _)| *id == question_id)
    }

    fn take(&mut self, question_id: Uuid) -> Option<Vec<u8>> {
        let index = self.entries.iter().position(|(id, _)| *id == question_id)?;
        self.entries.remove(index).map(|(_, jpeg)| jpeg)
    }
}

#[cfg(target_os = "macos")]
struct ActiveCapture {
    session_id: Uuid,
    display_id: u32,
    latest: Arc<Mutex<Option<Frame>>>,
    health: Arc<Mutex<CaptureHealth>>,
    /// 単発撮影のフォールバックで使い回す。`Clone` は Swift の retain なので
    /// クレートの勧めどおり `Arc` で共有する。
    filter: Arc<screencapturekit::stream::content_filter::SCContentFilter>,
    configuration: Arc<screencapturekit::stream::configuration::SCStreamConfiguration>,
    /// 発表ごとに持つ。`ActiveCapture` と一緒に消えるので、発表を終えれば取り置きも必ず消える。
    held: Arc<Mutex<HeldCaptures>>,
    stream: screencapturekit::stream::SCStream,
}

/// 撮影に要るものを `active` のロックの中で写し取ったもの。**ロックを握ったまま撮らない**ため
/// （単発撮影の待ちで `stop_presentation` まで巻き添えで固まる。罠 #17）。
#[cfg(target_os = "macos")]
struct CaptureParts {
    session_id: Uuid,
    latest: Arc<Mutex<Option<Frame>>>,
    filter: Arc<screencapturekit::stream::content_filter::SCContentFilter>,
    configuration: Arc<screencapturekit::stream::configuration::SCStreamConfiguration>,
    held: Arc<Mutex<HeldCaptures>>,
}

#[cfg(target_os = "macos")]
impl CaptureParts {
    /// 最新フレーム。ストリームがまだ1枚も出していなければ、ここで単発撮影を試す。
    fn grab_frame(&self) -> Result<Option<Frame>, String> {
        let latest = self
            .latest
            .lock()
            .map_err(|_| "latest frame lock failed")?
            .clone();
        Ok(latest.or_else(|| snapshot_frame(&self.filter, &self.configuration)))
    }
}

#[derive(Default)]
pub struct QuestionCaptureState {
    #[cfg(target_os = "macos")]
    active: Mutex<Option<ActiveCapture>>,
    /// 取り置き・保存・破棄を1件ずつ通す。承認が取り置きの途中に届くと、取り置きを見つけられずに
    /// **承認した瞬間のスライド**を保存してしまう。`start` / `stop` はこれを取らない（発表の停止を待たせない）。
    #[cfg(target_os = "macos")]
    order: Mutex<()>,
}

impl QuestionCaptureState {
    #[cfg(target_os = "macos")]
    pub fn active_session_id(&self) -> Option<String> {
        self.active.lock().ok().and_then(|active| {
            active
                .as_ref()
                .map(|capture| capture.session_id.to_string())
        })
    }

    #[cfg(not(target_os = "macos"))]
    pub fn active_session_id(&self) -> Option<String> {
        None
    }

    /// ストリームの健康状態。撮影していなければ `None`。
    #[cfg(target_os = "macos")]
    pub fn health(&self) -> Option<CaptureHealth> {
        let active = self.active.lock().ok()?;
        let capture = active.as_ref()?;
        let health = capture.health.lock().ok()?;
        Some(health.clone())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn health(&self) -> Option<CaptureHealth> {
        None
    }

    /// いま画面を収録しているか。**収録中の表示（コントロール窓とトレイ）の正はこれ**（App Store 2.5.14）。
    pub fn is_recording(&self) -> bool {
        recording(self.health().as_ref())
    }

    #[cfg(target_os = "macos")]
    pub fn start(&self, session_id: &str, display_id: u32) -> Result<(), CaptureStartError> {
        use screencapturekit::prelude::*;
        use screencapturekit::stream::configuration::PixelFormat;
        use screencapturekit::stream::StreamCallbacks;

        let session_id = parse_id(session_id, "session").map_err(CaptureStartError::start)?;
        let access = core_graphics::access::ScreenCaptureAccess::default();
        if !access.preflight() {
            return Err(CaptureStartError::permission());
        }

        let mut active = self
            .active
            .lock()
            .map_err(|_| CaptureStartError::start("capture state lock failed"))?;
        if let Some(current) = active.as_ref() {
            if current.session_id == session_id && current.display_id == display_id {
                return Ok(());
            }
        }
        stop_locked(&mut active);

        let content =
            SCShareableContent::get().map_err(|err| CaptureStartError::start(err.to_string()))?;
        let displays = content.displays();
        let display = displays
            .iter()
            .find(|candidate| candidate.display_id() == display_id)
            .or_else(|| displays.first())
            .ok_or_else(|| CaptureStartError {
                kind: CaptureErrorKind::DisplayUnavailable,
                detail: "capture display was not found".into(),
            })?;

        // LayerTalk 自身の透明オーバーレイや質問パネルをスライド画像へ焼き込まない。
        let own_applications = content
            .applications()
            .into_iter()
            .filter(|application| application.process_id() == std::process::id() as i32)
            .collect::<Vec<_>>();
        let own_application_refs = own_applications.iter().collect::<Vec<_>>();
        let filter = Arc::new(
            SCContentFilter::create()
                .with_display(display)
                // アプリ単位で除外するため、開始後に初めて作られる質問パネルも写らない。
                .with_excluding_applications(&own_application_refs, &[])
                .build(),
        );

        let (width, height) = capture_dimensions(display.width(), display.height());
        let configuration = Arc::new(
            SCStreamConfiguration::new()
                .with_width(width)
                .with_height(height)
                .with_pixel_format(PixelFormat::BGRA)
                .with_shows_cursor(false)
                // Apple が文書化している下限は 3（2 を渡していた）。
                .with_queue_depth(3)
                .with_fps(2),
        );

        let latest = Arc::new(Mutex::new(None));
        let health = Arc::new(Mutex::new(CaptureHealth::default()));

        // デリゲートを付けないと、macOS にキャプチャを止められても**何も起きない**。
        // 「まだ準備中」と言い続けたまま発表が終わる。
        let health_for_stop = Arc::clone(&health);
        let health_for_error = Arc::clone(&health);
        let delegate = StreamCallbacks::new()
            .on_stop(move |error| {
                if let Ok(mut health) = health_for_stop.lock() {
                    health.stopped = Some(error.unwrap_or_else(|| "stream stopped".into()));
                }
            })
            .on_error(move |error| {
                if let Ok(mut health) = health_for_error.lock() {
                    health.stopped = Some(error.to_string());
                }
            });

        let latest_for_handler = Arc::clone(&latest);
        let health_for_handler = Arc::clone(&health);
        let mut stream = SCStream::new_with_delegate(&filter, &configuration, delegate);
        let handler = stream.add_output_handler(
            move |sample: CMSampleBuffer, output_type: SCStreamOutputType| {
                if output_type != SCStreamOutputType::Screen {
                    return;
                }
                let status = sample.frame_status();
                let usable = usable_status(status);
                let frame = if usable {
                    frame_from_sample(&sample)
                } else {
                    None
                };
                if let Ok(mut health) = health_for_handler.lock() {
                    health.frames_seen += 1;
                    health.last_status = Some(frame_status_name(status));
                    if !usable {
                        health.blocked = true;
                    }
                    if frame.is_some() {
                        health.frames_stored += 1;
                    }
                }
                if let Some(frame) = frame {
                    if let Ok(mut target) = latest_for_handler.lock() {
                        *target = Some(frame);
                    }
                }
            },
            SCStreamOutputType::Screen,
        );
        if handler.is_none() {
            return Err(CaptureStartError::start(
                "could not install the screen capture handler",
            ));
        }
        stream
            .start_capture()
            .map_err(|err| CaptureStartError::start(err.to_string()))?;
        *active = Some(ActiveCapture {
            session_id,
            display_id,
            latest,
            health,
            filter,
            configuration,
            held: Arc::new(Mutex::new(HeldCaptures::default())),
            stream,
        });
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn start(&self, _session_id: &str, _display_id: u32) -> Result<(), CaptureStartError> {
        Err(CaptureStartError::start(
            "question screenshots are only supported on macOS",
        ))
    }

    #[cfg(target_os = "macos")]
    pub fn stop(&self) {
        if let Ok(mut active) = self.active.lock() {
            stop_locked(&mut active);
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn stop(&self) {}

    /// 撮影に要るものを写し取る。撮影していなければ `None`。
    #[cfg(target_os = "macos")]
    fn parts(&self) -> Result<Option<CaptureParts>, String> {
        let state = self
            .active
            .lock()
            .map_err(|_| "capture state lock failed")?;
        Ok(state.as_ref().map(|active| CaptureParts {
            session_id: active.session_id,
            latest: Arc::clone(&active.latest),
            filter: Arc::clone(&active.filter),
            configuration: Arc::clone(&active.configuration),
            held: Arc::clone(&active.held),
        }))
    }

    /// 質問のスライドを保存する。
    ///
    /// 1. 保存済みなら何もしない（承認の更新でも hook が再度呼ばれる。質問到着時の画像を上書きしない）
    /// 2. 承認待ちのあいだ取り置いた、届いた時点のスライドがあればそれを書く
    /// 3. どちらでもなければ、いまのスライドを撮る（承認制でなければ、ここが届いた時点になる）
    #[cfg(target_os = "macos")]
    pub fn capture_question(
        &self,
        app_data: &Path,
        question_id: &str,
    ) -> Result<CaptureQuestionResult, String> {
        let question_id = parse_id(question_id, "question")?;
        let _order = self.order.lock().map_err(|_| "capture order lock failed")?;
        let Some(parts) = self.parts()? else {
            return Ok(CaptureQuestionResult::inactive());
        };
        let path = capture_path(app_data, parts.session_id, question_id);
        if path.exists() {
            return Ok(CaptureQuestionResult::captured());
        }
        let held = parts
            .held
            .lock()
            .map_err(|_| "held capture lock failed")?
            .take(question_id);
        if let Some(jpeg) = held {
            write_jpeg(&path, &jpeg)?;
            return Ok(CaptureQuestionResult::captured());
        }

        // ストリームが 1 枚も出していなくても、ここで単発撮影を試す。
        // **`active` のロックは `parts` が既に外してある**（握ったまま待つと `stop_presentation`
        // まで巻き添えで固まる）。
        let Some(frame) = parts.grab_frame()? else {
            return Ok(CaptureQuestionResult::pending(self.pending_reason()));
        };
        write_jpeg(&path, &encode_jpeg(frame)?)?;
        Ok(CaptureQuestionResult::captured())
    }

    /// 承認待ちの質問のために、いまのスライドを JPEG にしてメモリにだけ取り置く。
    /// **ディスクには書かない** — 承認されなかった質問のスライドを残さないため。
    /// 返り値の `Captured` は「取り置けた」の意味。
    #[cfg(target_os = "macos")]
    pub fn hold_question(&self, question_id: &str) -> Result<CaptureQuestionResult, String> {
        let question_id = parse_id(question_id, "question")?;
        let _order = self.order.lock().map_err(|_| "capture order lock failed")?;
        let Some(parts) = self.parts()? else {
            return Ok(CaptureQuestionResult::inactive());
        };
        if parts
            .held
            .lock()
            .map_err(|_| "held capture lock failed")?
            .contains(question_id)
        {
            return Ok(CaptureQuestionResult::captured());
        }
        let Some(frame) = parts.grab_frame()? else {
            return Ok(CaptureQuestionResult::pending(self.pending_reason()));
        };
        let jpeg = encode_jpeg(frame)?;
        parts
            .held
            .lock()
            .map_err(|_| "held capture lock failed")?
            .insert(question_id, jpeg);
        Ok(CaptureQuestionResult::captured())
    }

    /// 取り置いたスライドを捨てる（非表示・ブロック）。
    ///
    /// **保存済みのファイルは消さない。** 承認済みの質問を非表示から戻したとき、届いた時点の
    /// 1枚が要る。レポートは承認済みの質問しか載せないので、非表示のあいだは出ない。
    #[cfg(target_os = "macos")]
    pub fn discard_question(&self, question_id: &str) -> Result<(), String> {
        let question_id = parse_id(question_id, "question")?;
        let _order = self.order.lock().map_err(|_| "capture order lock failed")?;
        if let Some(parts) = self.parts()? {
            parts
                .held
                .lock()
                .map_err(|_| "held capture lock failed")?
                .take(question_id);
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn capture_question(
        &self,
        _app_data: &Path,
        _question_id: &str,
    ) -> Result<CaptureQuestionResult, String> {
        Ok(CaptureQuestionResult::inactive())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn hold_question(&self, _question_id: &str) -> Result<CaptureQuestionResult, String> {
        Ok(CaptureQuestionResult::inactive())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn discard_question(&self, _question_id: &str) -> Result<(), String> {
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn pending_reason(&self) -> CapturePendingReason {
        let Some(health) = self.health() else {
            return CapturePendingReason::SnapshotFailed;
        };
        if health.stopped.is_some() {
            return CapturePendingReason::StreamStopped;
        }
        if health.blocked {
            return CapturePendingReason::CaptureBlocked;
        }
        if health.frames_seen == 0 {
            return CapturePendingReason::AwaitingFirstFrame;
        }
        CapturePendingReason::SnapshotFailed
    }
}

pub fn permission_target() -> CapturePermissionTarget {
    #[cfg(all(target_os = "macos", debug_assertions))]
    {
        let bundled = std::env::current_exe()
            .ok()
            .is_some_and(|path| is_inside_app_bundle(&path));
        if !bundled {
            return CapturePermissionTarget::LaunchingApp;
        }
    }
    CapturePermissionTarget::LayerTalk
}

fn is_inside_app_bundle(path: &Path) -> bool {
    path.ancestors()
        .any(|ancestor| ancestor.extension().and_then(|value| value.to_str()) == Some("app"))
}

pub fn error_event(kind: CaptureErrorKind, detail: impl Into<String>) -> CaptureErrorEvent {
    CaptureErrorEvent {
        kind,
        detail: detail.into(),
        permission_target: permission_target(),
    }
}

/// 撮影を止める。取り置いていたスライド（承認されないまま終わった質問の分）も `ActiveCapture` ごとここで消える。
#[cfg(target_os = "macos")]
fn stop_locked(active: &mut Option<ActiveCapture>) {
    if let Some(previous) = active.take() {
        let _ = previous.stream.stop_capture();
    }
}

/// 取り込んでよいフレームか。**ステータスは「読めたときだけ効く拒否リスト」として扱う。**
///
/// `frame_status()` は `SCStreamFrameInfo` の attachment を読むだけで、**読めないと `None`
/// を返す**。実測（macOS 26 / screencapturekit 8.0.1）では **12枚中12枚が `None`** で、
/// それでも `image_buffer()` は全部中身を持っていた。
/// 元のコードは `!= Some(Complete)` で捨てていたので、**全フレームが無言で消えていた**
/// ——これが「画面収録の準備が完了せず」の正体。
///
/// なので「`Complete` を許可する」ではなく「**明示的に中身が無いと言われたときだけ捨てる**」
/// と書く。`Blank` / `Suspended` / `Stopped` は macOS がキャプチャを塞いだ合図で、
/// 取り込むと真っ黒な画像が保存される。それ以外（読めなかった `None` も、静止スライドで
/// 延々来る `Idle` も）は中身があるものとして扱い、実際に取れるかは
/// `frame_from_sample` の `image_buffer()` に判定させる。
#[cfg(target_os = "macos")]
fn usable_status(status: Option<screencapturekit::cm::SCFrameStatus>) -> bool {
    use screencapturekit::cm::SCFrameStatus;

    !matches!(
        status,
        Some(SCFrameStatus::Blank | SCFrameStatus::Suspended | SCFrameStatus::Stopped)
    )
}

#[cfg(target_os = "macos")]
fn frame_status_name(status: Option<screencapturekit::cm::SCFrameStatus>) -> &'static str {
    use screencapturekit::cm::SCFrameStatus;

    match status {
        Some(SCFrameStatus::Complete) => "complete",
        Some(SCFrameStatus::Idle) => "idle",
        Some(SCFrameStatus::Blank) => "blank",
        Some(SCFrameStatus::Suspended) => "suspended",
        Some(SCFrameStatus::Started) => "started",
        Some(SCFrameStatus::Stopped) => "stopped",
        None => "unknown",
    }
}

/// BGRA の行パディングを落として `Frame` にする。ストリームと単発撮影で共用する。
#[cfg(target_os = "macos")]
fn frame_from_sample(sample: &screencapturekit::prelude::CMSampleBuffer) -> Option<Frame> {
    use screencapturekit::prelude::CMSampleBufferExt;

    let buffer = sample.image_buffer()?;
    let guard = buffer.lock_read_only().ok()?;
    let frame_width = guard.width();
    let frame_height = guard.height();
    let source_stride = guard.bytes_per_row();
    let row_bytes = frame_width.saturating_mul(4);
    if frame_width == 0 || frame_height == 0 || source_stride < row_bytes {
        return None;
    }
    let source = guard.as_slice();
    let mut bgra = vec![0; row_bytes.saturating_mul(frame_height)];
    for row in 0..frame_height {
        let source_start = row.saturating_mul(source_stride);
        let target_start = row.saturating_mul(row_bytes);
        let source_row = source.get(source_start..source_start + row_bytes)?;
        bgra[target_start..target_start + row_bytes].copy_from_slice(source_row);
    }
    Some(Frame {
        width: frame_width as u32,
        height: frame_height as u32,
        bgra,
    })
}

/// ストリームに頼らず今の画面を 1 枚だけ撮る。macOS 14 以降でのみ成功する。
///
/// `SCScreenshotManager::capture_sample_buffer` は**タイムアウトを持たない**
/// Condvar 待ち（`doom-fish-utils` の `SyncCompletion::wait`）なので、
/// 直接呼ぶと replayd が黙ったときに呼び出し元ごと固まる。必ず別スレッドへ投げて見切る。
#[cfg(target_os = "macos")]
fn snapshot_frame(
    filter: &Arc<screencapturekit::stream::content_filter::SCContentFilter>,
    configuration: &Arc<screencapturekit::stream::configuration::SCStreamConfiguration>,
) -> Option<Frame> {
    use screencapturekit::screenshot_manager::SCScreenshotManager;

    let filter = Arc::clone(filter);
    let configuration = Arc::clone(configuration);
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let frame = SCScreenshotManager::capture_sample_buffer(&filter, &configuration)
            .ok()
            .as_ref()
            .and_then(frame_from_sample);
        let _ = tx.send(frame);
    });
    rx.recv_timeout(SNAPSHOT_TIMEOUT).ok().flatten()
}

fn parse_id(value: &str, kind: &str) -> Result<Uuid, String> {
    Uuid::parse_str(value).map_err(|_| format!("invalid {kind} id"))
}

fn capture_dimensions(width: u32, height: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (MAX_LONG_EDGE, 1080);
    }
    let scale = MAX_LONG_EDGE as f64 / width.max(height) as f64;
    let scaled = |value: u32| (((value as f64 * scale).round() as u32).max(2)) & !1;
    (scaled(width), scaled(height))
}

fn capture_path(app_data: &Path, session_id: Uuid, question_id: Uuid) -> PathBuf {
    app_data
        .join(CAPTURE_DIRECTORY)
        .join(session_id.to_string())
        .join(format!("{question_id}.jpg"))
}

/// BGRA のフレームを JPEG にする。取り置き（メモリ）と保存（ディスク）で共用する。
fn encode_jpeg(frame: Frame) -> Result<Vec<u8>, String> {
    let mut rgb = Vec::with_capacity(frame.bgra.len() / 4 * 3);
    for pixel in frame.bgra.chunks_exact(4) {
        rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
    }
    let image = ImageBuffer::<Rgb<u8>, _>::from_raw(frame.width, frame.height, rgb)
        .ok_or_else(|| "captured frame had invalid dimensions".to_string())?;
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
        .encode_image(&image)
        .map_err(|err| err.to_string())?;
    Ok(jpeg)
}

/// 一時ファイルに書いてから名前を変える（書きかけの JPEG をレポートに読ませない）。
fn write_jpeg(path: &Path, jpeg: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "capture path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    let temporary = path.with_extension("jpg.tmp");
    fs::write(&temporary, jpeg).map_err(|err| err.to_string())?;
    fs::rename(&temporary, path).map_err(|err| err.to_string())?;
    Ok(())
}

pub fn read_capture(
    app_data: &Path,
    session_id: &str,
    question_id: &str,
) -> Result<Option<String>, String> {
    let session_id = parse_id(session_id, "session")?;
    let question_id = parse_id(question_id, "question")?;
    let path = capture_path(app_data, session_id, question_id);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    Ok(Some(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )))
}

pub fn capture_count(app_data: &Path, session_id: &str) -> Result<usize, String> {
    let session_id = parse_id(session_id, "session")?;
    let directory = app_data
        .join(CAPTURE_DIRECTORY)
        .join(session_id.to_string());
    let files = match fs::read_dir(directory) {
        Ok(files) => files,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(err) => return Err(err.to_string()),
    };
    Ok(files
        .flatten()
        .filter(|entry| {
            let path = entry.path();
            path.is_file()
                && path.extension().and_then(|extension| extension.to_str()) == Some("jpg")
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| Uuid::parse_str(stem).is_ok())
        })
        .count())
}

pub fn cleanup_expired(app_data: &Path) {
    let root = app_data.join(CAPTURE_DIRECTORY);
    let Ok(sessions) = fs::read_dir(&root) else {
        return;
    };
    let now = SystemTime::now();
    for session in sessions.flatten() {
        let path = session.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(files) = fs::read_dir(&path) else {
            continue;
        };
        for file in files.flatten() {
            let file_path = file.path();
            let expired = file
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| now.duration_since(modified).ok())
                .is_some_and(|age| age > RETENTION);
            if expired {
                let _ = fs::remove_file(file_path);
            }
        }
        if fs::read_dir(&path)
            .ok()
            .is_some_and(|mut entries| entries.next().is_none())
        {
            let _ = fs::remove_dir(path);
        }
    }
}

pub fn permission(request: bool) -> CapturePermission {
    #[cfg(target_os = "macos")]
    {
        let access = core_graphics::access::ScreenCaptureAccess::default();
        if access.preflight() {
            return CapturePermission {
                supported: true,
                granted: true,
                restart_required: false,
                permission_target: permission_target(),
            };
        }
        if request {
            let granted_now = access.request();
            let granted = access.preflight();
            return CapturePermission {
                supported: true,
                granted,
                restart_required: granted_now && !granted,
                permission_target: permission_target(),
            };
        }
        CapturePermission {
            supported: true,
            granted: false,
            restart_required: false,
            permission_target: permission_target(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        CapturePermission {
            supported: false,
            granted: false,
            restart_required: false,
            permission_target: permission_target(),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn recording_needs_a_stream_that_macos_has_not_stopped() {
        assert!(!super::recording(None));
        assert!(super::recording(Some(&super::CaptureHealth::default())));
        let stopped = super::CaptureHealth {
            stopped: Some("user acknowledgement refused".into()),
            ..super::CaptureHealth::default()
        };
        assert!(!super::recording(Some(&stopped)));
    }

    use super::*;

    #[test]
    fn dimensions_preserve_landscape_aspect_ratio() {
        assert_eq!(capture_dimensions(3840, 2160), (1920, 1080));
    }

    #[test]
    fn dimensions_preserve_portrait_aspect_ratio() {
        assert_eq!(capture_dimensions(1080, 1920), (1080, 1920));
    }

    #[test]
    fn capture_count_only_includes_uuid_jpegs() {
        let suffix = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("layertalk-capture-test-{suffix}"));
        let session_id = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();
        let question_id = Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap();
        let directory = root.join(CAPTURE_DIRECTORY).join(session_id.to_string());
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(format!("{question_id}.jpg")), b"jpeg").unwrap();
        fs::write(directory.join("not-a-question.jpg"), b"jpeg").unwrap();
        fs::write(directory.join(format!("{question_id}.tmp")), b"temp").unwrap();

        assert_eq!(capture_count(&root, &session_id.to_string()).unwrap(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn app_bundle_detection_distinguishes_direct_development_binary() {
        assert!(is_inside_app_bundle(Path::new(
            "/Applications/LayerTalk.app/Contents/MacOS/presenter-app"
        )));
        assert!(!is_inside_app_bundle(Path::new(
            "/project/target/debug/presenter-app"
        )));
    }

    #[test]
    fn capture_question_status_serializes_for_tauri() {
        let captured = serde_json::to_value(CaptureQuestionResult::captured()).unwrap();
        assert_eq!(captured, serde_json::json!({ "status": "captured" }));

        let pending = serde_json::to_value(CaptureQuestionResult::pending(
            CapturePendingReason::CaptureBlocked,
        ))
        .unwrap();
        assert_eq!(
            pending,
            serde_json::json!({ "status": "framePending", "reason": "captureBlocked" })
        );
    }

    #[test]
    fn held_captures_keep_the_arrival_slide_and_drop_the_oldest() {
        let mut held = HeldCaptures::default();
        let first = Uuid::from_u128(1);
        held.insert(first, vec![1]);
        // 承認待ちのまま取り直されても、届いた時点の1枚を上書きしない。
        held.insert(first, vec![2]);
        assert_eq!(held.take(first), Some(vec![1]));
        assert_eq!(held.take(first), None);

        for n in 0..=MAX_HELD_CAPTURES as u128 {
            held.insert(Uuid::from_u128(100 + n), vec![0]);
        }
        assert_eq!(held.entries.len(), MAX_HELD_CAPTURES);
        assert!(!held.contains(Uuid::from_u128(100)));
        assert!(held.contains(Uuid::from_u128(101)));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn only_explicitly_empty_frames_are_rejected() {
        use screencapturekit::cm::SCFrameStatus;

        // **実測ではステータスを1枚も読めなかった（全部 None）。** ここを false にすると
        // 全フレームが無言で消え、1枚も保存できなくなる。
        assert!(usable_status(None));
        // 静止したスライドは Idle で流れてくる。ここを落とすと1枚も撮れない。
        assert!(usable_status(Some(SCFrameStatus::Idle)));
        assert!(usable_status(Some(SCFrameStatus::Started)));
        assert!(usable_status(Some(SCFrameStatus::Complete)));
        // macOS に塞がれた合図。取り込むと真っ黒な画像が残る。
        assert!(!usable_status(Some(SCFrameStatus::Blank)));
        assert!(!usable_status(Some(SCFrameStatus::Suspended)));
        assert!(!usable_status(Some(SCFrameStatus::Stopped)));
    }
}
