//! The agent drafts a commit message from the session and the changes
//! (PRD §6.2 Git actions).

use std::sync::{Arc, Mutex};

use agent::{
    model::{ChatMessage, ModelClient, ModelError, ModelEvent, ModelRequest},
    tools::ToolBox,
    Agent, AgentError,
};
use services::EventService;
use tokio::sync::mpsc;

struct Replying(
    Result<&'static str, ModelError>,
    Arc<Mutex<Vec<ModelRequest>>>,
);

impl ModelClient for Replying {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        self.1.lock().unwrap().push(request);
        let item = self.0.clone().map(|t| ModelEvent::TextDelta(t.into()));
        let (tx, rx) = mpsc::channel(2);
        tokio::spawn(async move {
            let _ = tx.send(item).await;
        });
        rx
    }
}

fn agent(reply: Result<&'static str, ModelError>) -> (Agent, Arc<Mutex<Vec<ModelRequest>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let agent = Agent::new(Arc::new(Replying(reply, seen.clone())), EventService::new());
    agent.open_session("s1", ToolBox::new(std::env::temp_dir()));
    (agent, seen)
}

#[tokio::test]
async fn the_draft_comes_from_the_changes_without_tools() {
    let (agent, seen) = agent(Ok("  fix: handle empty input\n\nGuard the parser.  \n"));

    let draft = agent
        .draft_commit_message("s1", "M src/parse.rs\n+if input.is_empty()")
        .await
        .unwrap();

    assert_eq!(draft, "fix: handle empty input\n\nGuard the parser.");
    let requests = seen.lock().unwrap();
    assert!(requests[0].tools.is_empty());
    let sent = serde_json::to_string(&requests[0].messages).unwrap();
    assert!(sent.contains("src/parse.rs"), "{sent}");
    assert!(sent.contains("commit message"), "{sent}");
}

#[tokio::test]
async fn the_draft_does_not_join_the_conversation() {
    let (agent, seen) = agent(Ok("chore: tidy"));
    agent.draft_commit_message("s1", "M a").await.unwrap();
    agent.draft_commit_message("s1", "M b").await.unwrap();
    // Each draft is a one-off request.
    assert_eq!(seen.lock().unwrap()[1].messages.len(), 1);
    let _ = ChatMessage::user_text("");
}

#[tokio::test]
async fn a_model_failure_or_an_unknown_session_is_an_error() {
    let (agent, _) = agent(Err(ModelError::MissingApiKey {
        provider: "Anthropic".into(),
    }));
    assert!(matches!(
        agent.draft_commit_message("s1", "M a").await,
        Err(AgentError::Model(ModelError::MissingApiKey { .. }))
    ));
    assert!(matches!(
        agent.draft_commit_message("nope", "M a").await,
        Err(AgentError::UnknownSession)
    ));
}

#[tokio::test]
async fn an_empty_reply_is_an_error() {
    let (agent, _) = agent(Ok("   "));
    assert!(agent.draft_commit_message("s1", "M a").await.is_err());
}
