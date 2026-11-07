//! Session logs on disk: one append-only JSON Lines file per session
//! (ADR 0005, PRD §6.1 Sessions and resume).

use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::Mutex,
};

use api_types::{SessionEnvelope, SessionEvent};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LogRecord {
    /// An event shown in the session, with its sequence number and the
    /// time it was published (0 in logs written before ADR 0012).
    Event {
        seq: u64,
        #[serde(default)]
        ts: u64,
        event: SessionEvent,
    },
    /// A message of the model conversation.
    Message { message: Value },
    /// A file's content before the agent's first edit (`None`: it did not
    /// exist).
    Original {
        path: String,
        content: Option<String>,
    },
    /// The baselines still tracked after a revert, replacing earlier ones.
    Originals {
        originals: BTreeMap<String, Option<String>>,
    },
}

pub struct SessionLog {
    dir: PathBuf,
    /// The last sequence number of each session seen since start-up.
    seqs: Mutex<HashMap<String, u64>>,
}

/// Session ids become file names, so only plain ids are logged.
fn is_safe_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= 128
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Reads only the last byte, so appending stays cheap as a log grows.
fn ends_without_newline(path: &std::path::Path) -> io::Result<bool> {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e),
    };
    if file.metadata()?.len() == 0 {
        return Ok(false);
    }
    file.seek(SeekFrom::End(-1))?;
    let mut last = [0u8; 1];
    file.read_exact(&mut last)?;
    Ok(last[0] != b'\n')
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn unsafe_id(session_id: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        format!("unsafe session id {session_id:?}"),
    )
}

impl SessionLog {
    pub fn open(dir: impl Into<PathBuf>) -> io::Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir)?;
        Ok(Self {
            dir,
            seqs: Mutex::default(),
        })
    }

    fn path(&self, session_id: &str) -> PathBuf {
        self.dir.join(format!("{session_id}.jsonl"))
    }

    /// Starts `to`'s log as a copy of `from`'s, with its events re-addressed
    /// to `to`. A session with no log yet leaves nothing to copy.
    pub fn fork(&self, from: &str, to: &str) -> io::Result<()> {
        for id in [from, to] {
            if !is_safe_id(id) {
                return Err(unsafe_id(id));
            }
        }
        let _order = self.seqs.lock().unwrap();
        let text = match fs::read_to_string(self.path(from)) {
            Ok(text) => text,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e),
        };
        let mut copy = String::with_capacity(text.len());
        for line in text.lines().filter(|line| !line.trim().is_empty()) {
            let mut record: Value = match serde_json::from_str(line) {
                Ok(record) => record,
                Err(err) => {
                    tracing::warn!(session_id = %from, %err, "skipping unreadable log line");
                    continue;
                }
            };
            if let Some(event) = record.get_mut("event").and_then(Value::as_object_mut) {
                event.insert("session_id".to_string(), Value::from(to));
            }
            copy.push_str(&serde_json::to_string(&record)?);
            copy.push('\n');
        }
        fs::write(self.path(to), copy)
    }

    /// Deletes a session's log. A session with no log is fine.
    pub fn remove(&self, session_id: &str) -> io::Result<()> {
        if !is_safe_id(session_id) {
            return Err(unsafe_id(session_id));
        }
        self.seqs.lock().unwrap().remove(session_id);
        match fs::remove_file(self.path(session_id)) {
            Err(err) if err.kind() != io::ErrorKind::NotFound => Err(err),
            _ => Ok(()),
        }
    }

    /// Numbers `event`, appends it and returns its sequence number, or
    /// `None` when the session id cannot name a log file. A failed write
    /// still uses up its number, so no later event repeats it; the error
    /// is only reported, and the file has a gap there.
    pub fn append_event(&self, event: &SessionEvent) -> io::Result<Option<u64>> {
        self.append_event_at(event, now_ms())
    }

    /// Like [`SessionLog::append_event`], stamped with `ts`.
    pub fn append_event_at(&self, event: &SessionEvent, ts: u64) -> io::Result<Option<u64>> {
        let session_id = event.session_id();
        if !is_safe_id(session_id) {
            return Ok(None);
        }
        // The lock orders numbering and writing together, so concurrent
        // events reach the file in sequence order. The map only caches each
        // session's last number; after a restart it is read back from the
        // file.
        let mut seqs = self.seqs.lock().unwrap();
        let last = match seqs.get(session_id) {
            Some(last) => *last,
            None => self.last_seq(session_id)?,
        };
        let seq = last + 1;
        seqs.insert(session_id.to_string(), seq);
        let record = LogRecord::Event {
            seq,
            ts,
            event: event.clone(),
        };
        if let Err(err) = self.write(session_id, &record) {
            tracing::error!(%err, %session_id, seq, "cannot write session event");
        }
        Ok(Some(seq))
    }

    pub fn append(&self, session_id: &str, record: &LogRecord) -> io::Result<()> {
        if !is_safe_id(session_id) {
            return Err(unsafe_id(session_id));
        }
        let _order = self.seqs.lock().unwrap();
        self.write(session_id, record)
    }

    fn write(&self, session_id: &str, record: &LogRecord) -> io::Result<()> {
        let mut line = serde_json::to_string(record)?;
        line.push('\n');
        let path = self.path(session_id);
        // A line torn by a crash would swallow the next record, so start
        // on a fresh line when the file does not end with one.
        let torn = ends_without_newline(&path)?;
        if torn {
            line.insert(0, '\n');
        }
        let mut file = OpenOptions::new().create(true).append(true).open(path)?;
        file.write_all(line.as_bytes())
    }

    /// Every readable record of a session, in the order written.
    pub fn read(&self, session_id: &str) -> io::Result<Vec<LogRecord>> {
        if !is_safe_id(session_id) {
            return Ok(Vec::new());
        }
        let text = match fs::read_to_string(self.path(session_id)) {
            Ok(text) => text,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e),
        };
        Ok(text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| match serde_json::from_str(line) {
                Ok(record) => Some(record),
                Err(err) => {
                    tracing::warn!(%session_id, %err, "skipping unreadable log line");
                    None
                }
            })
            .collect())
    }

    /// The logged events of a session with a sequence number above `after`.
    pub fn events_after(&self, session_id: &str, after: u64) -> io::Result<Vec<SessionEnvelope>> {
        Ok(self
            .envelopes(session_id)?
            .filter(|envelope| envelope.seq > after)
            .collect())
    }

    /// Up to `limit` of a session's latest logged events with a sequence
    /// number below `before` (`None`: the newest), oldest first, so a long
    /// session can open at its tail and page backwards.
    pub fn events_before(
        &self,
        session_id: &str,
        before: Option<u64>,
        limit: usize,
    ) -> io::Result<Vec<SessionEnvelope>> {
        let mut events: Vec<_> = self
            .envelopes(session_id)?
            .filter(|envelope| before.is_none_or(|before| envelope.seq < before))
            .collect();
        let start = events.len().saturating_sub(limit);
        Ok(events.split_off(start))
    }

    fn envelopes(&self, session_id: &str) -> io::Result<impl Iterator<Item = SessionEnvelope>> {
        Ok(self
            .read(session_id)?
            .into_iter()
            .filter_map(|record| match record {
                LogRecord::Event { seq, ts, event } => Some(SessionEnvelope { seq, ts, event }),
                _ => None,
            }))
    }

    fn last_seq(&self, session_id: &str) -> io::Result<u64> {
        Ok(self
            .read(session_id)?
            .iter()
            .filter_map(|record| match record {
                LogRecord::Event { seq, .. } => Some(*seq),
                _ => None,
            })
            .max()
            .unwrap_or(0))
    }
}
