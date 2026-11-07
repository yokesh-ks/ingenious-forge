//! Model providers plug in through adapters (PRD §6.1 Models and reasoning
//! effort): a provider registered with the agent can be selected for a
//! session without changing the agent loop.

use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    anthropic::{AnthropicProvider, DEFAULT_MODEL},
    model::{ModelClient, ModelError, ModelEvent, ModelRequest},
    providers::{ModelChoice, ModelInfo, ModelProvider, Providers},
    tools::ToolBox,
    Agent, AgentError,
};
use api_types::{SessionEvent, TurnEndReason};
use services::EventService;
use tokio::sync::mpsc;

/// A provider that answers every request with "<provider>:<model>".
struct EchoProvider {
    id: &'static str,
    models: Vec<&'static str>,
    calls: Arc<Mutex<Vec<String>>>,
}

struct EchoClient {
    label: String,
    calls: Arc<Mutex<Vec<String>>>,
}

impl ModelClient for EchoClient {
    fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        self.calls.lock().unwrap().push(self.label.clone());
        let (tx, rx) = mpsc::channel(4);
        let label = self.label.clone();
        tokio::spawn(async move {
            let _ = tx.send(Ok(ModelEvent::TextDelta(label))).await;
        });
        rx
    }
}

impl ModelProvider for EchoProvider {
    fn id(&self) -> &str {
        self.id
    }
    fn name(&self) -> &str {
        "Echo"
    }
    fn models(&self) -> Vec<ModelInfo> {
        self.models
            .iter()
            .map(|m| ModelInfo {
                id: m.to_string(),
                name: m.to_uppercase(),
                efforts: api_types::ReasoningEffort::ALL.to_vec(),
            })
            .collect()
    }
    fn client(&self, model: &str) -> Arc<dyn ModelClient> {
        Arc::new(EchoClient {
            label: format!("{}:{model}", self.id),
            calls: self.calls.clone(),
        })
    }
}

fn echo(
    id: &'static str,
    models: Vec<&'static str>,
) -> (Arc<EchoProvider>, Arc<Mutex<Vec<String>>>) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    (
        Arc::new(EchoProvider {
            id,
            models,
            calls: calls.clone(),
        }),
        calls,
    )
}

fn choice(provider: &str, model: &str) -> ModelChoice {
    ModelChoice {
        provider: provider.into(),
        model: model.into(),
        effort: None,
    }
}

#[tokio::test]
async fn a_session_that_changes_model_sends_its_next_message_to_the_new_one() {
    let (a, calls) = echo("a", vec!["x", "y"]);
    let mut providers = Providers::new();
    providers.register(a);
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::with_providers(providers, events);
    agent
        .open_session_with("s", ToolBox::new(std::env::temp_dir()), &choice("a", "x"))
        .unwrap();

    assert!(agent.set_model("s", &choice("a", "y")).unwrap());
    assert!(matches!(
        agent.set_model("s", &choice("a", "nope")),
        Err(AgentError::Model(_))
    ));
    assert!(!agent.set_model("closed", &choice("a", "y")).unwrap());

    agent.send_message("s", "hi").unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        while !matches!(
            rx.recv().await.unwrap().event,
            SessionEvent::TurnEnded {
                reason: TurnEndReason::Completed,
                ..
            }
        ) {}
    })
    .await
    .unwrap();
    assert_eq!(*calls.lock().unwrap(), vec!["a:y".to_string()]);
}

// ---- registry ----

#[test]
fn the_first_provider_and_its_first_model_are_the_default() {
    let (a, _) = echo("a", vec!["a1", "a2"]);
    let (b, _) = echo("b", vec!["b1"]);
    let mut providers = Providers::new();
    providers.register(a);
    providers.register(b);

    assert_eq!(providers.default_choice(), Some(choice("a", "a1")));
    assert_eq!(Providers::new().default_choice(), None);
}

#[test]
fn a_registered_provider_and_model_resolve_to_a_client() {
    let (a, _) = echo("a", vec!["a1"]);
    let mut providers = Providers::new();
    providers.register(a);

    assert!(providers.resolve(&choice("a", "a1")).is_ok());
    assert_eq!(
        providers.resolve(&choice("zzz", "a1")).err(),
        Some(ModelError::UnknownProvider("zzz".into()))
    );
    assert_eq!(
        providers.resolve(&choice("a", "nope")).err(),
        Some(ModelError::UnknownModel {
            provider: "a".into(),
            model: "nope".into()
        })
    );
}

#[test]
fn registering_the_same_id_again_replaces_the_provider() {
    let (first, _) = echo("a", vec!["old"]);
    let (second, _) = echo("a", vec!["new"]);
    let mut providers = Providers::new();
    providers.register(first);
    providers.register(second);

    assert_eq!(providers.list().len(), 1);
    assert_eq!(providers.default_choice(), Some(choice("a", "new")));
}

#[test]
fn the_anthropic_provider_offers_the_default_claude_model_first() {
    let provider = AnthropicProvider::new(None);
    assert_eq!(provider.id(), "anthropic");
    let models = provider.models();
    assert_eq!(models[0].id, DEFAULT_MODEL);
    assert!(models.iter().all(|m| m.id.starts_with("claude-")));
}

#[test]
fn a_provider_without_a_key_is_neither_listed_nor_the_default() {
    let keyless = AnthropicProvider::new(None);
    let key = keyless.key_handle();
    let mut providers = Providers::new();
    providers.register(Arc::new(keyless));
    let pick = choice("anthropic", DEFAULT_MODEL);

    assert_eq!(providers.default_choice(), None);
    let catalog = providers.catalog();
    assert!(catalog.providers.is_empty());
    assert_eq!(catalog.default, None);
    assert_eq!(
        providers.check_usable(&pick),
        Err(ModelError::MissingApiKey {
            provider: "Anthropic".into()
        })
    );

    *key.write().unwrap() = Some("sk-1".into());

    assert_eq!(providers.default_choice(), Some(pick.clone()));
    assert_eq!(providers.catalog().providers.len(), 1);
    assert_eq!(providers.check_usable(&pick), Ok(()));
}

#[test]
fn the_first_configured_provider_is_the_default_whatever_its_position() {
    let (a, _) = echo("a", vec!["a1"]);
    let mut providers = Providers::new();
    providers.register(Arc::new(AnthropicProvider::new(None)));
    providers.register(a);

    assert_eq!(providers.default_choice(), Some(choice("a", "a1")));
    let listed: Vec<_> = providers
        .catalog()
        .providers
        .into_iter()
        .map(|p| p.id)
        .collect();
    assert_eq!(listed, ["a"]);
}

#[test]
fn an_effort_the_model_does_not_offer_is_not_sent() {
    use agent::openai_compat::{OpenAiCompatProvider, PROVIDERS};
    use api_types::ReasoningEffort::{High, Max, Medium};
    let mut providers = Providers::new();
    providers.register(Arc::new(OpenAiCompatProvider::new(
        PROVIDERS.iter().find(|p| p.id == "nvidia").unwrap(),
        None,
    )));
    let ultra = "nvidia/nemotron-3-ultra-550b-a55b";
    let with = |model: &str, effort| ModelChoice {
        provider: "nvidia".into(),
        model: model.into(),
        effort: Some(effort),
    };

    assert_eq!(providers.effort_for(&with(ultra, Medium)), Some(Medium));
    assert_eq!(providers.effort_for(&with(ultra, Max)), None);
    assert_eq!(
        providers.effort_for(&with("nvidia/nemotron-3.5-lightning-30b-a3b", High)),
        None
    );
    // A model it cannot look up keeps what the session saved.
    assert_eq!(providers.effort_for(&with("gone", High)), Some(High));
}

// ---- in a session ----

async fn reply_text(
    agent: &Agent,
    session: &str,
    rx: &mut tokio::sync::broadcast::Receiver<api_types::SessionEnvelope>,
) -> String {
    agent.send_message(session, "hi").unwrap();
    let mut text = String::new();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
        if event.session_id() != session {
            continue;
        }
        match event {
            SessionEvent::Output { chunk, .. } => text.push_str(&chunk),
            SessionEvent::TurnEnded {
                reason: TurnEndReason::Completed,
                ..
            } => return text,
            SessionEvent::TurnEnded {
                reason: TurnEndReason::Error { message, .. },
                ..
            } => panic!("{message}"),
            _ => {}
        }
    }
}

#[tokio::test]
async fn each_session_talks_to_the_provider_and_model_it_was_opened_with() {
    let (a, a_calls) = echo("a", vec!["a1"]);
    let (stub, stub_calls) = echo("stub", vec!["s1", "s2"]);
    let mut providers = Providers::new();
    providers.register(a);
    providers.register(stub);
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::with_providers(providers, events);
    let dir = std::env::temp_dir();

    agent.open_session("default", ToolBox::new(&dir));
    agent
        .open_session_with("picked", ToolBox::new(&dir), &choice("stub", "s2"))
        .unwrap();

    assert_eq!(reply_text(&agent, "default", &mut rx).await, "a:a1");
    assert_eq!(reply_text(&agent, "picked", &mut rx).await, "stub:s2");
    assert_eq!(*a_calls.lock().unwrap(), ["a:a1"]);
    assert_eq!(*stub_calls.lock().unwrap(), ["stub:s2"]);
}

#[tokio::test]
async fn opening_a_session_with_an_unknown_model_fails() {
    let (a, _) = echo("a", vec!["a1"]);
    let mut providers = Providers::new();
    providers.register(a);
    let agent = Agent::with_providers(providers, EventService::new());

    let result =
        agent.open_session_with("s", ToolBox::new(std::env::temp_dir()), &choice("a", "x"));
    assert!(matches!(result, Err(AgentError::Model(_))));
    assert!(!agent.is_open("s"));
}

#[tokio::test]
async fn an_agent_with_no_providers_reports_it_when_a_turn_starts() {
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::with_providers(Providers::new(), events);
    agent.open_session("s", ToolBox::new(std::env::temp_dir()));

    agent.send_message("s", "hi").unwrap();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
        if let SessionEvent::TurnEnded {
            reason: TurnEndReason::Error { message, .. },
            ..
        } = event
        {
            assert!(message.contains("no model provider"), "{message}");
            break;
        }
    }
}

#[tokio::test]
async fn the_session_effort_is_sent_with_every_request() {
    use agent::model::ModelRequest;
    use api_types::ReasoningEffort;

    /// Records the effort of each request.
    struct Recorder(Arc<Mutex<Vec<Option<ReasoningEffort>>>>);
    impl ModelClient for Recorder {
        fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
            self.0.lock().unwrap().push(request.effort);
            let (tx, rx) = mpsc::channel(1);
            tokio::spawn(async move {
                let _ = tx.send(Ok(ModelEvent::TextDelta("ok".into()))).await;
            });
            rx
        }
    }
    let seen = Arc::new(Mutex::new(Vec::new()));
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::new(Arc::new(Recorder(seen.clone())), events);
    let pick = ModelChoice {
        provider: "default".into(),
        model: "default".into(),
        effort: Some(ReasoningEffort::Low),
    };
    agent
        .open_session_with("s", ToolBox::new(std::env::temp_dir()), &pick)
        .unwrap();

    assert_eq!(reply_text(&agent, "s", &mut rx).await, "ok");
    assert_eq!(*seen.lock().unwrap(), [Some(ReasoningEffort::Low)]);
}

#[test]
fn a_session_approval_mode_is_kept_by_the_agent() {
    use api_types::ApprovalMode;
    let agent = Agent::new(
        Arc::new(EchoClient {
            label: "x".into(),
            calls: Arc::default(),
        }),
        EventService::new(),
    );
    agent.open_session("s", ToolBox::new(std::env::temp_dir()));
    // A session opened without a mode runs without approvals.
    assert_eq!(agent.approval_mode("s"), Some(ApprovalMode::FullAuto));
    assert!(agent.set_approval_mode("s", ApprovalMode::Ask));
    assert_eq!(agent.approval_mode("s"), Some(ApprovalMode::Ask));
    assert!(!agent.set_approval_mode("unknown", ApprovalMode::Ask));
    assert_eq!(agent.approval_mode("unknown"), None);
}
