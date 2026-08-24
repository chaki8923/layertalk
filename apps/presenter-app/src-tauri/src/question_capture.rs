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

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePermission {
    pub supported: bool,
    pub granted: bool,
    /// macOS では許可後にアプリの再起動が必要になる場合がある。
    pub restart_required: bool,
}

#[derive(Clone)]
struct Frame {
    width: u32,
    height: u32,
    /// 行パディングを除いた BGRA。
    bgra: Vec<u8>,
}

#[cfg(target_os = "macos")]
struct ActiveCapture {
    session_id: Uuid,
    display_id: u32,
    latest: Arc<Mutex<Option<Frame>>>,
    stream: screencapturekit::stream::SCStream,
}

#[derive(Default)]
pub struct QuestionCaptureState {
    #[cfg(target_os = "macos")]
    active: Mutex<Option<ActiveCapture>>,
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

    #[cfg(target_os = "macos")]
    pub fn start(&self, session_id: &str, display_id: u32) -> Result<(), String> {
        use screencapturekit::cm::SCFrameStatus;
        use screencapturekit::prelude::*;
        use screencapturekit::stream::configuration::PixelFormat;

        let session_id = parse_id(session_id, "session")?;
        let access = core_graphics::access::ScreenCaptureAccess::default();
        if !access.preflight() {
            return Err("screen capture permission is not granted".into());
        }

        let mut active = self
            .active
            .lock()
            .map_err(|_| "capture state lock failed")?;
        if let Some(current) = active.as_ref() {
            if current.session_id == session_id && current.display_id == display_id {
                return Ok(());
            }
        }
        stop_locked(&mut active);

        let content = SCShareableContent::get().map_err(|err| err.to_string())?;
        let displays = content.displays();
        let display = displays
            .iter()
            .find(|candidate| candidate.display_id() == display_id)
            .or_else(|| displays.first())
            .ok_or_else(|| "capture display was not found".to_string())?;

        // LayerTalk 自身の透明オーバーレイや質問パネルをスライド画像へ焼き込まない。
        let own_applications = content
            .applications()
            .into_iter()
            .filter(|application| application.process_id() == std::process::id() as i32)
            .collect::<Vec<_>>();
        let own_application_refs = own_applications.iter().collect::<Vec<_>>();
        let filter = SCContentFilter::create()
            .with_display(display)
            // アプリ単位で除外するため、開始後に初めて作られる質問パネルも写らない。
            .with_excluding_applications(&own_application_refs, &[])
            .build();

        let (width, height) = capture_dimensions(display.width(), display.height());
        let configuration = SCStreamConfiguration::new()
            .with_width(width)
            .with_height(height)
            .with_pixel_format(PixelFormat::BGRA)
            .with_shows_cursor(false)
            .with_queue_depth(2)
            .with_fps(2);
        let latest = Arc::new(Mutex::new(None));
        let latest_for_handler = Arc::clone(&latest);
        let mut stream = SCStream::new(&filter, &configuration);
        let handler = stream.add_output_handler(
            move |sample: CMSampleBuffer, output_type: SCStreamOutputType| {
                if output_type != SCStreamOutputType::Screen
                    || sample.frame_status() != Some(SCFrameStatus::Complete)
                {
                    return;
                }
                let Some(buffer) = sample.image_buffer() else {
                    return;
                };
                let Ok(guard) = buffer.lock_read_only() else {
                    return;
                };
                let frame_width = guard.width();
                let frame_height = guard.height();
                let source_stride = guard.bytes_per_row();
                let row_bytes = frame_width.saturating_mul(4);
                if frame_width == 0 || frame_height == 0 || source_stride < row_bytes {
                    return;
                }
                let source = guard.as_slice();
                let mut bgra = vec![0; row_bytes.saturating_mul(frame_height)];
                for row in 0..frame_height {
                    let source_start = row.saturating_mul(source_stride);
                    let target_start = row.saturating_mul(row_bytes);
                    let Some(source_row) = source.get(source_start..source_start + row_bytes)
                    else {
                        return;
                    };
                    bgra[target_start..target_start + row_bytes].copy_from_slice(source_row);
                }
                if let Ok(mut target) = latest_for_handler.lock() {
                    *target = Some(Frame {
                        width: frame_width as u32,
                        height: frame_height as u32,
                        bgra,
                    });
                }
            },
            SCStreamOutputType::Screen,
        );
        if handler.is_none() {
            return Err("could not install the screen capture handler".into());
        }
        stream.start_capture().map_err(|err| err.to_string())?;
        *active = Some(ActiveCapture {
            session_id,
            display_id,
            latest,
            stream,
        });
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn start(&self, _session_id: &str, _display_id: u32) -> Result<(), String> {
        Err("question screenshots are only supported on macOS".into())
    }

    #[cfg(target_os = "macos")]
    pub fn stop(&self) {
        if let Ok(mut active) = self.active.lock() {
            stop_locked(&mut active);
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn stop(&self) {}

    #[cfg(target_os = "macos")]
    pub fn capture_question(&self, app_data: &Path, question_id: &str) -> Result<bool, String> {
        let question_id = parse_id(question_id, "question")?;
        let (path, frame) = {
            let state = self
                .active
                .lock()
                .map_err(|_| "capture state lock failed")?;
            let Some(active) = state.as_ref() else {
                return Ok(false);
            };
            let path = capture_path(app_data, active.session_id, question_id);
            if path.exists() {
                // pending → approved の更新でも hook が再度呼ばれる。質問到着時の画像を上書きしない。
                return Ok(true);
            }
            let frame = active
                .latest
                .lock()
                .map_err(|_| "latest frame lock failed")?
                .clone();
            (path, frame)
        };
        let Some(frame) = frame else { return Ok(false) };
        write_frame(&path, frame)?;
        Ok(true)
    }

    #[cfg(not(target_os = "macos"))]
    pub fn capture_question(&self, _app_data: &Path, _question_id: &str) -> Result<bool, String> {
        Ok(false)
    }
}

#[cfg(target_os = "macos")]
fn stop_locked(active: &mut Option<ActiveCapture>) {
    if let Some(previous) = active.take() {
        let _ = previous.stream.stop_capture();
    }
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

fn write_frame(path: &Path, frame: Frame) -> Result<(), String> {
    let mut rgb = Vec::with_capacity(frame.bgra.len() / 4 * 3);
    for pixel in frame.bgra.chunks_exact(4) {
        rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
    }
    let image = ImageBuffer::<Rgb<u8>, _>::from_raw(frame.width, frame.height, rgb)
        .ok_or_else(|| "captured frame had invalid dimensions".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "capture path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    let temporary = path.with_extension("jpg.tmp");
    let file = fs::File::create(&temporary).map_err(|err| err.to_string())?;
    JpegEncoder::new_with_quality(file, JPEG_QUALITY)
        .encode_image(&image)
        .map_err(|err| err.to_string())?;
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
            };
        }
        if request {
            let granted_now = access.request();
            let granted = access.preflight();
            return CapturePermission {
                supported: true,
                granted,
                restart_required: granted_now && !granted,
            };
        }
        CapturePermission {
            supported: true,
            granted: false,
            restart_required: false,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        CapturePermission {
            supported: false,
            granted: false,
            restart_required: false,
        }
    }
}

#[cfg(test)]
mod tests {
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
}
