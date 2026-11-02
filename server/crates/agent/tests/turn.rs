use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use agent::{
    model::{ChatMessage, ModelClient, ModelError, ModelEvent, ModelRequest, Role},
    Agent, AgentError,
};
use api_types::SessionEvent;
use services::EventService;
use tokio::sync::{broadcast, mpsc, Semaphore};

type Step = (Duration, Result<ModelEvent, ModelError>);

/// Replays one scripted reply per call and records every request.
#[derive(Default)]
struct FakeModel {
    replies: Mutex<VecDeque<Vec<Step>>>,
    requests: Mutex<Vec<ModelRequest>>,
    hold: Option<Arc<Semaphore>>,
    emitted_at: Arc<Mutex<Vec<Instant>>>,
}

impl FakeModel {
    fn replying(replies: Vec<Vec<Step>>) -> Self {
        Self {
            replies: Mutex::new(replies.into()),
            ..Self::default()
        }
    }
}

impl ModelClient for FakeModel {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        self.requests.lock().unwrap().push(request);
        let steps = self.replies.lock().unwrap().pop_front().unwrap_or_default();
        let hold = self.hold.clone();
        let emitted_at = self.emitted_at.clone();
        let (tx, rx) = mpsc::channel(16);
        tokio::spawn(async move {
            if let Some(hold) = hold {
                hold.acquire().await.unwrap().forget();
            }
            for (delay, item) in steps {
                tokio::time::sleep(delay).await;
                emitted_at.lock().unwrap().push(Instant::now());
                if tx.send(item).await.is_err() {
                    return;
                }
            }
        });
        rx
    }
}

fn text(s: &str) -> Step {
    (Duration::ZERO, Ok(ModelEvent::TextDelta(s.into())))
}

async fn next(rx: &mut broadcast::Receiver<SessionEvent>) -> SessionEvent {
    tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("timed out waiting for a session event")
        .unwrap()
}

/// Collects events for `session_id` until its turn ends (done or error).
async fn turn_events(
    rx: &mut broadcast::Receiver<SessionEvent>,
    session_id: &str,
) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = next(rx).await;
        if event.session_id() != session_id {
            continue;
        }
        let end = matches!(
            event,
            SessionEvent::Done { .. } | SessionEvent::Error { .. }
        );
        out.push(event);
        if end {
            return out;
        }
    }
}

fn describe(events: &[SessionEvent]) -> Vec<String> {
    events
        .iter()
        .map(|e| match e {
            SessionEvent::TurnStarted { .. } => "started".to_string(),
            SessionEvent::Output { chunk, .. } => format!("out:{chunk}"),
            SessionEvent::ToolCall { name, .. } => format!("tool:{name}"),
            SessionEvent::Error { message, .. } => format!("error:{message}"),
            SessionEvent::Done { .. } => "done".to_string(),
        })
        .collect()
}

fn setup(model: FakeModel) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEvent>) {
    let model = Arc::new(model);
    let events = EventService::new();
    let rx = events.subscribe();
    (Agent::new(model.clone(), events), model, rx)
}

#[tokio::test]
async fn reply_streams_as_output_events_between_start_and_done() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![text("Hel"), text("lo")]]));

    agent.send_message("s1", "hi").unwrap();

    assert_eq!(
        describe(&turn_events(&mut rx, "s1").await),
        ["started", "out:Hel", "out:lo", "done"]
    );
}

#[tokio::test]
async fn follow_up_turn_sends_the_whole_conversation() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![text("Hello")],
        vec![text("Again")],
    ]));

    agent.send_message("s1", "hi").unwrap();
    turn_events(&mut rx, "s1").await;
    agent.send_message("s1", "  more  ").unwrap();
    turn_events(&mut rx, "s1").await;

    let requests = model.requests.lock().unwrap();
    assert_eq!(
        requests[1].messages,
        vec![
            ChatMessage {
                role: Role::User,
                content: "hi".into()
            },
            ChatMessage {
                role: Role::Assistant,
                content: "Hello".into()
            },
            ChatMessage {
                role: Role::User,
                content: "more".into()
            },
        ]
    );
}

#[tokio::test]
async fn sessions_keep_separate_conversations() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![vec![text("A")], vec![text("B")]]));

    agent.send_message("s1", "one").unwrap();
    turn_events(&mut rx, "s1").await;
    agent.send_message("s2", "two").unwrap();
    turn_events(&mut rx, "s2").await;

    let requests = model.requests.lock().unwrap();
    assert_eq!(requests[1].messages.len(), 1);
    assert_eq!(requests[1].messages[0].content, "two");
}

#[tokio::test]
async fn empty_message_is_rejected_without_starting_a_turn() {
    let (agent, model, _rx) = setup(FakeModel::default());

    assert_eq!(
        agent.send_message("s1", "   \n"),
        Err(AgentError::EmptyMessage)
    );
    assert!(model.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn second_message_during_a_running_turn_is_rejected() {
    let hold = Arc::new(Semaphore::new(0));
    let model = FakeModel {
        hold: Some(hold.clone()),
        ..FakeModel::replying(vec![vec![text("slow")]])
    };
    let (agent, _, mut rx) = setup(model);

    agent.send_message("s1", "first").unwrap();
    assert_eq!(
        agent.send_message("s1", "second"),
        Err(AgentError::TurnInProgress)
    );
    // Another session is not blocked by s1's turn.
    agent.send_message("s2", "other").unwrap();

    hold.add_permits(2);
    turn_events(&mut rx, "s1").await;
}

#[tokio::test]
async fn model_error_ends_the_turn_and_frees_the_session() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![
            text("par"),
            (Duration::ZERO, Err(ModelError::MissingApiKey)),
        ],
        vec![text("ok")],
    ]));

    agent.send_message("s1", "hi").unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);
    assert_eq!(events[..2], ["started", "out:par"]);
    assert!(
        events[2].starts_with("error:ANTHROPIC_API_KEY is not set"),
        "{events:?}"
    );

    // The failed exchange is not replayed to the model on the next turn.
    agent.send_message("s1", "retry").unwrap();
    turn_events(&mut rx, "s1").await;
    let requests = model.requests.lock().unwrap();
    assert_eq!(requests[1].messages.len(), 1);
    assert_eq!(requests[1].messages[0].content, "retry");
}

#[tokio::test]
async fn output_is_published_within_200ms_of_model_emission() {
    let model = FakeModel::replying(vec![vec![
        (
            Duration::from_millis(50),
            Ok(ModelEvent::TextDelta("a".into())),
        ),
        (
            Duration::from_millis(50),
            Ok(ModelEvent::TextDelta("b".into())),
        ),
    ]]);
    let emitted_at = model.emitted_at.clone();
    let (agent, _, mut rx) = setup(model);

    agent.send_message("s1", "hi").unwrap();
    let mut received_at = Vec::new();
    loop {
        match next(&mut rx).await {
            SessionEvent::Output { .. } => received_at.push(Instant::now()),
            SessionEvent::Done { .. } => break,
            _ => {}
        }
    }

    let emitted_at = emitted_at.lock().unwrap();
    assert_eq!(received_at.len(), 2);
    for (sent, got) in emitted_at.iter().zip(&received_at) {
        assert!(got.duration_since(*sent) < Duration::from_millis(200));
    }
}
