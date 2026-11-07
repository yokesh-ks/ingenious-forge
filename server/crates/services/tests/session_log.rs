use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

use api_types::SessionEvent;
use serde_json::json;
use services::{
    log::{LogRecord, SessionLog},
    EventService,
};

fn dir() -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    std::env::temp_dir().join(format!(
        "forge-log-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ))
}

fn output(session: &str, chunk: &str) -> SessionEvent {
    SessionEvent::Output {
        session_id: session.into(),
        chunk: chunk.into(),
    }
}

#[test]
fn events_get_increasing_sequence_numbers_per_session() {
    let log = SessionLog::open(dir()).unwrap();
    assert_eq!(log.append_event(&output("a", "1")).unwrap(), Some(1));
    assert_eq!(log.append_event(&output("a", "2")).unwrap(), Some(2));
    assert_eq!(log.append_event(&output("b", "1")).unwrap(), Some(1));
}

#[test]
fn sequence_numbers_continue_after_a_restart() {
    let path = dir();
    {
        let log = SessionLog::open(&path).unwrap();
        log.append_event(&output("a", "1")).unwrap();
        log.append_event(&output("a", "2")).unwrap();
    }
    let log = SessionLog::open(&path).unwrap();
    assert_eq!(log.append_event(&output("a", "3")).unwrap(), Some(3));
}

#[test]
fn records_read_back_in_order() {
    let log = SessionLog::open(dir()).unwrap();
    log.append_event(&output("a", "x")).unwrap();
    log.append(
        "a",
        &LogRecord::Message {
            message: json!({"role":"user"}),
        },
    )
    .unwrap();
    log.append(
        "a",
        &LogRecord::Original {
            path: "f.txt".into(),
            content: None,
        },
    )
    .unwrap();

    let records = log.read("a").unwrap();
    assert_eq!(records.len(), 3);
    assert!(matches!(&records[0], LogRecord::Event { seq: 1, .. }));
    assert!(matches!(&records[1], LogRecord::Message { .. }));
    assert!(matches!(&records[2], LogRecord::Original { path, content: None } if path == "f.txt"));
}

#[test]
fn events_after_returns_only_newer_events() {
    let log = SessionLog::open(dir()).unwrap();
    for chunk in ["1", "2", "3"] {
        log.append_event(&output("a", chunk)).unwrap();
    }
    log.append("a", &LogRecord::Message { message: json!({}) })
        .unwrap();

    let after = log.events_after("a", 1).unwrap();
    assert_eq!(after.iter().map(|e| e.seq).collect::<Vec<_>>(), [2, 3]);
    assert!(matches!(&after[0].event, SessionEvent::Output { chunk, .. } if chunk == "2"));
}

#[test]
fn an_unknown_session_has_an_empty_log() {
    let log = SessionLog::open(dir()).unwrap();
    assert!(log.read("nobody").unwrap().is_empty());
}

#[test]
fn a_torn_last_line_is_skipped() {
    let path = dir();
    let log = SessionLog::open(&path).unwrap();
    log.append_event(&output("a", "ok")).unwrap();
    let file = path.join("a.jsonl");
    let mut text = fs::read_to_string(&file).unwrap();
    text.push_str("{\"kind\":\"event\",\"seq\":2,\"ev");
    fs::write(&file, text).unwrap();

    let reopened = SessionLog::open(&path).unwrap();
    assert_eq!(reopened.read("a").unwrap().len(), 1);
    assert_eq!(
        reopened.append_event(&output("a", "next")).unwrap(),
        Some(2)
    );
    assert_eq!(reopened.read("a").unwrap().len(), 2);
}

#[test]
fn unsafe_session_ids_are_never_written_to_disk() {
    let path = dir();
    let log = SessionLog::open(&path).unwrap();
    assert_eq!(log.append_event(&output("../escape", "x")).unwrap(), None);
    assert!(log
        .append("a/b", &LogRecord::Message { message: json!({}) })
        .is_err());
    assert!(!path.parent().unwrap().join("escape.jsonl").exists());
}

#[test]
fn a_failed_write_uses_up_its_sequence_number() {
    let path = dir();
    let log = SessionLog::open(&path).unwrap();
    log.append_event(&output("a", "1")).unwrap();
    let file = path.join("a.jsonl");
    let saved = std::fs::read(&file).unwrap();

    // A directory in the file's place makes the next write fail.
    std::fs::remove_file(&file).unwrap();
    std::fs::create_dir(&file).unwrap();
    assert_eq!(log.append_event(&output("a", "lost")).unwrap(), Some(2));

    std::fs::remove_dir(&file).unwrap();
    std::fs::write(&file, saved).unwrap();
    assert_eq!(log.append_event(&output("a", "3")).unwrap(), Some(3));
    let seqs: Vec<_> = log
        .events_after("a", 0)
        .unwrap()
        .iter()
        .map(|e| e.seq)
        .collect();
    assert_eq!(seqs, [1, 3]);
}

#[tokio::test]
async fn published_events_carry_their_sequence_number_and_are_logged() {
    let log = Arc::new(SessionLog::open(dir()).unwrap());
    let events = EventService::with_log(log.clone());
    let mut rx = events.subscribe();

    events.publish(output("a", "1"));
    events.publish(output("a", "2"));

    assert_eq!(rx.recv().await.unwrap().seq, 1);
    let second = rx.recv().await.unwrap();
    assert_eq!(second.seq, 2);
    assert!(matches!(second.event, SessionEvent::Output { ref chunk, .. } if chunk == "2"));
    assert_eq!(log.events_after("a", 0).unwrap().len(), 2);
}

#[tokio::test]
async fn without_a_log_sequence_numbers_still_increase() {
    let events = EventService::new();
    let mut rx = events.subscribe();
    events.publish(output("a", "1"));
    events.publish(output("a", "2"));
    events.publish(output("../odd", "x"));
    assert_eq!(rx.recv().await.unwrap().seq, 1);
    assert_eq!(rx.recv().await.unwrap().seq, 2);
    assert_eq!(rx.recv().await.unwrap().seq, 1);
}

#[test]
fn events_carry_the_time_they_were_logged() {
    let log = SessionLog::open(dir()).unwrap();
    let before = services::log::now_ms();
    log.append_event(&output("a", "x")).unwrap();
    log.append_event_at(&output("a", "y"), 42).unwrap();

    let events = log.events_after("a", 0).unwrap();
    assert!(events[0].ts >= before);
    assert_eq!(events[1].ts, 42);
}

#[test]
fn events_logged_before_timestamps_read_back_with_zero() {
    let path = dir();
    fs::create_dir_all(&path).unwrap();
    fs::write(
        path.join("a.jsonl"),
        "{\"kind\":\"event\",\"seq\":1,\"event\":{\"type\":\"done\",\"session_id\":\"a\"}}\n",
    )
    .unwrap();
    let log = SessionLog::open(&path).unwrap();

    let events = log.events_after("a", 0).unwrap();
    assert_eq!((events[0].seq, events[0].ts), (1, 0));
    assert!(matches!(events[0].event, SessionEvent::Done { .. }));
}

#[test]
fn events_before_pages_back_from_the_tail_oldest_first() {
    let log = SessionLog::open(dir()).unwrap();
    for i in 1..=7 {
        log.append_event(&output("a", &i.to_string())).unwrap();
    }
    let seqs = |events: Vec<api_types::SessionEnvelope>| -> Vec<u64> {
        events.iter().map(|e| e.seq).collect()
    };

    assert_eq!(seqs(log.events_before("a", None, 3).unwrap()), [5, 6, 7]);
    assert_eq!(seqs(log.events_before("a", Some(5), 3).unwrap()), [2, 3, 4]);
    assert_eq!(seqs(log.events_before("a", Some(2), 3).unwrap()), [1]);
    assert!(log.events_before("a", Some(1), 3).unwrap().is_empty());
    assert!(log.events_before("missing", None, 3).unwrap().is_empty());
}

#[test]
fn published_events_share_one_timestamp_between_log_and_browser() {
    let log = Arc::new(SessionLog::open(dir()).unwrap());
    let events = EventService::with_log(log.clone());
    let mut rx = events.subscribe();

    events.publish(output("a", "x"));

    let live = rx.try_recv().unwrap();
    assert!(live.ts > 0);
    assert_eq!(log.events_after("a", 0).unwrap()[0].ts, live.ts);
}
