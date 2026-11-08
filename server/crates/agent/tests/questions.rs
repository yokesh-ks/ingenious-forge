//! The plan and question tools (PRD §6.1 Built-in tools): `todo_write`
//! replaces the session's plan; `ask_user_question` waits for the user's
//! answer, and a stopped turn counts as no answer.

use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    tools::{ToolBox, ASK_USER_QUESTION, TODO_WRITE},
    Agent,
};
use api_types::{
    QuestionAnswer, SessionEnvelope, SessionEvent, TodoItem, TodoStatus, TurnEndReason,
};
use serde_json::{json, Value};
use services::EventService;
use tokio::sync::{broadcast, mpsc};

#[derive(Default)]
struct FakeModel {
    replies: Mutex<VecDeque<Vec<ModelEvent>>>,
    requests: Mutex<Vec<ModelRequest>>,
}

impl ModelClient for FakeModel {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        self.requests.lock().unwrap().push(request);
        let steps = self.replies.lock().unwrap().pop_front().unwrap_or_default();
        let (tx, rx) = mpsc::channel(16);
        tokio::spawn(async move {
            for step in steps {
                if tx.send(Ok(step)).await.is_err() {
                    return;
                }
            }
        });
        rx
    }
}

fn call(id: &str, name: &str, input: Value) -> Vec<ModelEvent> {
    vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
        id: id.into(),
        name: name.into(),
        input,
    }])]
}

fn reply(text: &str) -> Vec<ModelEvent> {
    vec![ModelEvent::TextDelta(text.into())]
}

fn setup(
    replies: Vec<Vec<ModelEvent>>,
) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEnvelope>) {
    let model = Arc::new(FakeModel {
        replies: Mutex::new(replies.into()),
        ..FakeModel::default()
    });
    let events = EventService::new();
    let rx = events.subscribe();
    let agent = Agent::new(model.clone(), events);
    agent.open_session("s1", ToolBox::new(std::env::temp_dir()));
    (agent, model, rx)
}

async fn next(rx: &mut broadcast::Receiver<SessionEnvelope>) -> SessionEvent {
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .expect("timed out waiting for a session event")
        .unwrap()
        .event
}

async fn until_end(rx: &mut broadcast::Receiver<SessionEnvelope>) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = next(rx).await;
        let end = matches!(event, SessionEvent::TurnEnded { .. });
        out.push(event);
        if end {
            return out;
        }
    }
}

async fn until_asked(rx: &mut broadcast::Receiver<SessionEnvelope>) -> SessionEvent {
    loop {
        let event = next(rx).await;
        match event {
            SessionEvent::QuestionAsked { .. } => return event,
            SessionEvent::TurnEnded { .. } => panic!("the turn ended without asking"),
            _ => {}
        }
    }
}

/// The tool results of `events`: error flag, output and meta.
fn results(events: &[SessionEvent]) -> Vec<(bool, String, Option<Value>)> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::ToolResult {
                is_error,
                output,
                meta,
                ..
            } => Some((*is_error, output.clone(), meta.clone())),
            _ => None,
        })
        .collect()
}

fn todo(content: &str, status: TodoStatus) -> TodoItem {
    TodoItem {
        content: content.into(),
        status,
    }
}

#[test]
fn both_tools_are_offered_to_the_model() {
    let names: Vec<_> = ToolBox::new(std::env::temp_dir())
        .specs()
        .into_iter()
        .map(|s| s.name)
        .collect();
    assert!(names.contains(&TODO_WRITE), "{names:?}");
    assert!(names.contains(&ASK_USER_QUESTION), "{names:?}");
}

#[tokio::test]
async fn todo_write_replaces_the_whole_plan_each_time() {
    let (agent, _, mut rx) = setup(vec![
        call(
            "t1",
            TODO_WRITE,
            json!({"todos": [
                {"content": "Read the code", "status": "in_progress"},
                {"content": "Fix the bug", "status": "pending"}
            ]}),
        ),
        call(
            "t2",
            TODO_WRITE,
            json!({"todos": [
                {"content": "Read the code", "status": "completed"},
                {"content": "Fix the bug", "status": "in_progress"},
                {"content": "Run the tests", "status": "pending"}
            ]}),
        ),
        reply("done"),
    ]);
    agent.send_message("s1", "plan").unwrap();
    let events = until_end(&mut rx).await;

    let lists: Vec<Vec<TodoItem>> = events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::TodosUpdated { todos, .. } => Some(todos.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(
        lists,
        vec![
            vec![
                todo("Read the code", TodoStatus::InProgress),
                todo("Fix the bug", TodoStatus::Pending),
            ],
            vec![
                todo("Read the code", TodoStatus::Completed),
                todo("Fix the bug", TodoStatus::InProgress),
                todo("Run the tests", TodoStatus::Pending),
            ],
        ]
    );
    assert_eq!(agent.todos("s1"), lists[1]);

    let results = results(&events);
    assert!(!results[0].0);
    assert_eq!(
        results[0].1,
        "Updated todo list: 1 pending, 1 in progress, 0 completed."
    );
    assert_eq!(
        results[1].1,
        "Updated todo list: 1 pending, 1 in progress, 1 completed."
    );
    let meta = results[1].2.clone().unwrap();
    assert_eq!(meta["todos"][2]["content"], "Run the tests");
    assert_eq!(
        meta["counts"],
        json!({"pending": 1, "in_progress": 1, "completed": 1})
    );
}

#[tokio::test]
async fn an_invalid_plan_is_rejected_and_keeps_the_old_one() {
    let (agent, _, mut rx) = setup(vec![
        call(
            "t1",
            TODO_WRITE,
            json!({"todos": [{"content": "A", "status": "pending"}]}),
        ),
        call(
            "t2",
            TODO_WRITE,
            json!({"todos": [
                {"content": "B", "status": "pending"},
                {"content": " B ", "status": "pending"}
            ]}),
        ),
        call(
            "t3",
            TODO_WRITE,
            json!({"todos": [{"content": "  ", "status": "pending"}]}),
        ),
        call(
            "t4",
            TODO_WRITE,
            json!({"todos": [{"content": "C", "status": "later"}]}),
        ),
        reply("ok"),
    ]);
    agent.send_message("s1", "plan").unwrap();
    let events = until_end(&mut rx).await;

    let results = results(&events);
    assert!(
        results[1].0 && results[1].1.contains("duplicate"),
        "{:?}",
        results[1]
    );
    assert!(
        results[2].0 && results[2].1.contains("non-empty"),
        "{:?}",
        results[2]
    );
    assert!(
        results[3].0 && results[3].1.contains("status"),
        "{:?}",
        results[3]
    );
    assert_eq!(agent.todos("s1"), vec![todo("A", TodoStatus::Pending)]);
}

fn color_question() -> Value {
    json!({"questions": [{
        "id": "color",
        "question": "Which color do you prefer?",
        "header": "Pick one",
        "multi_select": true,
        "options": [
            {"label": "Blue", "description": "Calm."},
            {"label": "Green"}
        ]
    }]})
}

#[tokio::test]
async fn a_question_waits_for_the_answer_and_the_turn_continues() {
    let (agent, model, mut rx) = setup(vec![
        call("q1", ASK_USER_QUESTION, color_question()),
        reply("DONE"),
    ]);
    agent.send_message("s1", "ask").unwrap();

    let SessionEvent::QuestionAsked {
        call_id, questions, ..
    } = until_asked(&mut rx).await
    else {
        unreachable!()
    };
    assert_eq!(call_id, "q1");
    assert_eq!(questions[0].header.as_deref(), Some("Pick one"));
    assert!(questions[0].multi_select);
    assert_eq!(questions[0].options[1].label, "Green");
    assert_eq!(questions[0].options[1].description, None);
    // The turn waits.
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(model.requests.lock().unwrap().len(), 1);

    // An answer for a question that was not asked is refused.
    assert!(!agent.answer_question(
        "s1",
        "q1",
        vec![QuestionAnswer {
            id: "size".into(),
            selected: vec![],
            custom: None,
        }]
    ));
    let answer = vec![QuestionAnswer {
        id: "color".into(),
        selected: vec!["Blue".into()],
        custom: Some("Include accessibility notes".into()),
    }];
    assert!(agent.answer_question("s1", "q1", answer.clone()));
    let events = until_end(&mut rx).await;

    assert!(matches!(
        &events[0],
        SessionEvent::QuestionAnswered { call_id, answers: Some(a), .. }
            if call_id == "q1" && *a == answer
    ));
    let (is_error, output, meta) = results(&events).remove(0);
    assert!(!is_error);
    assert_eq!(
        output,
        r#"{"answers":[{"id":"color","selected":["Blue"],"custom":"Include accessibility notes"}]}"#
    );
    let meta = meta.unwrap();
    assert_eq!(meta["questions"][0]["id"], "color");
    assert_eq!(meta["answers"][0]["selected"][0], "Blue");
    assert!(matches!(
        events.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Completed,
            ..
        })
    ));
    let sent = serde_json::to_string(&model.requests.lock().unwrap()[1].messages).unwrap();
    assert!(sent.contains("Include accessibility notes"), "{sent}");
    // The card is gone once answered.
    assert!(!agent.answer_question("s1", "q1", answer));
}

#[tokio::test]
async fn stopping_the_turn_cancels_the_question() {
    let (agent, _, mut rx) = setup(vec![call("q1", ASK_USER_QUESTION, color_question())]);
    agent.send_message("s1", "ask").unwrap();
    until_asked(&mut rx).await;

    assert!(agent.interrupt("s1"));
    let events = until_end(&mut rx).await;

    assert!(matches!(
        &events[0],
        SessionEvent::QuestionAnswered { call_id, answers: None, .. } if call_id == "q1"
    ));
    let (is_error, output, _) = results(&events).remove(0);
    assert!(is_error);
    assert!(output.contains("cancelled"), "{output}");
    assert!(matches!(
        events.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Interrupted,
            ..
        })
    ));
    assert!(!agent.answer_question("s1", "q1", vec![]));
}

#[tokio::test]
async fn a_malformed_question_fails_without_waiting() {
    let (agent, _, mut rx) = setup(vec![
        call("q1", ASK_USER_QUESTION, json!({"questions": []})),
        call(
            "q2",
            ASK_USER_QUESTION,
            json!({"questions": [{"id": "a", "question": "x"}, {"id": "a", "question": "y"}]}),
        ),
        reply("ok"),
    ]);
    agent.send_message("s1", "ask").unwrap();
    let events = until_end(&mut rx).await;

    assert!(!events
        .iter()
        .any(|e| matches!(e, SessionEvent::QuestionAsked { .. })));
    let results = results(&events);
    assert!(
        results[0].0 && results[0].1.contains("at least one"),
        "{:?}",
        results[0]
    );
    assert!(
        results[1].0 && results[1].1.contains("duplicate"),
        "{:?}",
        results[1]
    );
}
