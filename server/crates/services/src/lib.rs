pub mod folders;
pub mod log;
pub mod projects;
pub mod secrets;
pub mod terminal;
pub mod workspace;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use api_types::{SessionEnvelope, SessionEvent};
use tokio::sync::broadcast;

use log::SessionLog;

/// Delivers session events to every open browser tab, numbering them per
/// session and, when a log is attached, writing them to disk first.
#[derive(Clone)]
pub struct EventService {
    tx: broadcast::Sender<SessionEnvelope>,
    log: Option<Arc<SessionLog>>,
    /// The last sequence number published for each session, logged or
    /// not; it numbers the events the log cannot.
    seqs: Arc<Mutex<HashMap<String, u64>>>,
}

impl Default for EventService {
    fn default() -> Self {
        Self::new()
    }
}

impl EventService {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(1024);
        Self {
            tx,
            log: None,
            seqs: Arc::default(),
        }
    }

    pub fn with_log(log: Arc<SessionLog>) -> Self {
        Self {
            log: Some(log),
            ..Self::new()
        }
    }

    pub fn log(&self) -> Option<&Arc<SessionLog>> {
        self.log.as_ref()
    }

    /// Publishes `event` and returns its sequence number.
    pub fn publish(&self, event: SessionEvent) -> u64 {
        let logged = self
            .log
            .as_ref()
            .and_then(|log| match log.append_event(&event) {
                Ok(seq) => seq,
                Err(err) => {
                    tracing::error!(%err, "cannot write session log");
                    None
                }
            });
        // Tracking logged numbers too keeps a fallback number from going
        // back below what browsers have already seen.
        let seq = {
            let mut seqs = self.seqs.lock().unwrap();
            let last = seqs.entry(event.session_id().to_string()).or_default();
            *last = logged.unwrap_or(*last + 1);
            *last
        };
        if let Err(err) = self.tx.send(SessionEnvelope { seq, event }) {
            tracing::debug!(?err, "no subscribers for session event");
        }
        seq
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SessionEnvelope> {
        self.tx.subscribe()
    }
}
