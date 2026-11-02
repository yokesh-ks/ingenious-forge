use api_types::SessionEvent;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct EventService {
    tx: broadcast::Sender<SessionEvent>,
}

impl Default for EventService {
    fn default() -> Self {
        Self::new()
    }
}

impl EventService {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(1024);
        Self { tx }
    }

    pub fn publish(&self, event: SessionEvent) {
        if let Err(err) = self.tx.send(event) {
            tracing::debug!(?err, "no subscribers for session event");
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SessionEvent> {
        self.tx.subscribe()
    }
}
