//! Word and PowerPoint files as PDFs for the file tab (PRD §6.2; ADR 0015).
//! Conversion runs in a Node helper the launcher ships, one process per file.

use std::{
    collections::VecDeque,
    fs::Metadata,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::{Duration, SystemTime},
};

use serde::Deserialize;
use tokio::{process::Command, sync::Semaphore};

pub const MAX_INPUT_BYTES: u64 = 52_428_800;
const MAX_OUTPUT_BYTES: u64 = 104_857_600;
const MAX_CONCURRENT: usize = 2;
const CACHED_FILES: usize = 8;
const TIMEOUT: Duration = Duration::from_secs(70);

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum OfficeError {
    #[error(
        "Office previews are unavailable. Start Forge with npx ingenious-forge to enable them."
    )]
    Unavailable,
    #[error("This Office file cannot be previewed. It may be damaged, password protected, or have the wrong extension.")]
    Invalid,
    #[error("The Office file or converted PDF exceeds the preview size limit.")]
    TooLarge,
    #[error("Office conversion timed out. Try again.")]
    Timeout,
    #[error("Office conversion did not produce a usable PDF. Check the file and try again.")]
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Converted {
    pub pdf: Arc<Vec<u8>>,
    pub missing_fonts: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HelperReply {
    #[serde(default)]
    missing_fonts: Vec<String>,
    code: Option<String>,
}

/// What the helper printed, as the fonts it lacked or why it failed.
pub fn parse_reply(output: &str) -> Result<Vec<String>, OfficeError> {
    let reply: HelperReply = serde_json::from_str(output).map_err(|_| OfficeError::Failed)?;
    match reply.code.as_deref() {
        None => Ok(reply.missing_fonts),
        Some("invalid") => Err(OfficeError::Invalid),
        Some("timeout") => Err(OfficeError::Timeout),
        Some(_) => Err(OfficeError::Failed),
    }
}

type CacheKey = (PathBuf, u64, Option<SystemTime>);

pub struct Converter {
    slots: Semaphore,
    cache: Mutex<VecDeque<(CacheKey, Converted)>>,
}

pub static CONVERTER: LazyLock<Converter> = LazyLock::new(|| Converter {
    slots: Semaphore::new(MAX_CONCURRENT),
    cache: Mutex::default(),
});

/// A private folder, removed when dropped.
struct WorkDir(PathBuf);

impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

impl Converter {
    pub async fn convert(&self, file: PathBuf, meta: Metadata) -> Result<Converted, OfficeError> {
        let key = (file.clone(), meta.len(), meta.modified().ok());
        if let Some(hit) = self.cached(&key) {
            return Ok(hit);
        }
        let helper = std::env::var_os("FORGE_OFFICE_HELPER").ok_or(OfficeError::Unavailable)?;
        let _slot = self
            .slots
            .acquire()
            .await
            .map_err(|_| OfficeError::Failed)?;
        // Another request may have finished this file while this one waited.
        if let Some(hit) = self.cached(&key) {
            return Ok(hit);
        }
        let node = std::env::var_os("FORGE_NODE").unwrap_or_else(|| "node".into());
        let converted = run(Path::new(&helper), &node, &file).await?;
        let mut cache = self.cache.lock().unwrap();
        cache.push_back((key, converted.clone()));
        if cache.len() > CACHED_FILES {
            cache.pop_front();
        }
        Ok(converted)
    }

    fn cached(&self, key: &CacheKey) -> Option<Converted> {
        let cache = self.cache.lock().unwrap();
        cache.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone())
    }
}

async fn run(helper: &Path, node: &std::ffi::OsStr, file: &Path) -> Result<Converted, OfficeError> {
    let dir = std::env::temp_dir().join(format!(
        "forge-office-{}-{}",
        std::process::id(),
        NEXT_DIR.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).map_err(|_| OfficeError::Failed)?;
    let work = WorkDir(dir);
    let extension = file.extension().unwrap_or_default();
    let input = work.0.join("input").with_extension(extension);
    let output = work.0.join("output.pdf");
    tokio::fs::copy(file, &input)
        .await
        .map_err(|_| OfficeError::Failed)?;
    let mut child = Command::new(node)
        .arg(helper)
        .arg(&input)
        .arg(&output)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| OfficeError::Unavailable)?;
    let mut stdout = child.stdout.take().ok_or(OfficeError::Failed)?;
    let reading = async {
        let mut text = String::new();
        tokio::io::AsyncReadExt::read_to_string(&mut stdout, &mut text)
            .await
            .map(|_| text)
    };
    let (text, _status) =
        tokio::time::timeout(TIMEOUT, async { tokio::join!(reading, child.wait()) })
            .await
            .map_err(|_| OfficeError::Timeout)?;
    let missing_fonts = parse_reply(&text.map_err(|_| OfficeError::Failed)?)?;
    let size = tokio::fs::metadata(&output)
        .await
        .map_err(|_| OfficeError::Failed)?
        .len();
    if size > MAX_OUTPUT_BYTES {
        return Err(OfficeError::TooLarge);
    }
    let pdf = tokio::fs::read(&output)
        .await
        .map_err(|_| OfficeError::Failed)?;
    Ok(Converted {
        pdf: Arc::new(pdf),
        missing_fonts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reply_names_the_missing_fonts() {
        let reply = parse_reply(r#"{"missingFonts":["Calibri"]}"#);
        assert_eq!(reply, Ok(vec!["Calibri".to_string()]));
    }

    #[test]
    fn a_reply_explains_a_failure() {
        assert_eq!(
            parse_reply(r#"{"code":"invalid"}"#),
            Err(OfficeError::Invalid)
        );
        assert_eq!(
            parse_reply(r#"{"code":"timeout"}"#),
            Err(OfficeError::Timeout)
        );
        assert_eq!(
            parse_reply(r#"{"code":"failed"}"#),
            Err(OfficeError::Failed)
        );
        assert_eq!(parse_reply("oops"), Err(OfficeError::Failed));
    }
}
