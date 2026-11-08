//! A session's totals, folded from its logged events (ADR 0012).

use api_types::{SessionEvent, SessionStats};

/// Folds `events`, in log order, into the session's totals. Logs written
/// before turns, steps and usage were recorded add only what they hold.
pub fn fold<'a>(events: impl IntoIterator<Item = &'a SessionEvent>) -> SessionStats {
    let mut stats = SessionStats::default();
    for event in events {
        match event {
            SessionEvent::TurnStarted { .. } => stats.turns += 1,
            SessionEvent::StepEnded {
                usage,
                first_token_ms,
                generation_ms,
                ..
            } => {
                stats.steps += 1;
                if let Some(ttft) = first_token_ms {
                    stats.ttft_ms += ttft;
                    stats.ttft_steps += 1;
                }
                stats.model_ms += first_token_ms.unwrap_or(0) + generation_ms.unwrap_or(0);
                if let Some(usage) = usage {
                    stats.usage.input += usage.input;
                    stats.usage.output += usage.output;
                    stats.usage.cache_read += usage.cache_read;
                    stats.usage.cache_write += usage.cache_write;
                    stats.last_context_tokens = usage.input + usage.cache_read + usage.cache_write;
                    if let Some(generation) = generation_ms.filter(|ms| *ms > 0) {
                        if usage.output > 0 {
                            stats.decode_ms += generation;
                            stats.decode_tokens += usage.output;
                        }
                    }
                }
            }
            SessionEvent::ToolResult {
                started_at,
                ended_at,
                ..
            } if *started_at > 0 => {
                stats.tool_ms += ended_at.saturating_sub(*started_at);
            }
            SessionEvent::RequestContext { context_window, .. } => {
                stats.context_window = *context_window;
            }
            _ => {}
        }
    }
    stats
}

#[cfg(test)]
mod tests {
    use api_types::Usage;

    use super::*;

    fn step(usage: Option<Usage>, first: Option<u64>, generation: Option<u64>) -> SessionEvent {
        SessionEvent::StepEnded {
            session_id: "s".into(),
            turn: 1,
            step: 1,
            usage,
            first_token_ms: first,
            generation_ms: generation,
        }
    }

    fn usage(input: u64, output: u64, cache_read: u64, cache_write: u64) -> Usage {
        Usage {
            input,
            output,
            cache_read,
            cache_write,
        }
    }

    #[test]
    fn totals_turns_steps_usage_and_time() {
        let events = [
            SessionEvent::TurnStarted {
                session_id: "s".into(),
                turn: 1,
            },
            SessionEvent::RequestContext {
                session_id: "s".into(),
                provider: "p".into(),
                model: "m".into(),
                context_window: Some(128_000),
            },
            step(Some(usage(100, 50, 4_000, 0)), Some(300), Some(500)),
            SessionEvent::ToolResult {
                session_id: "s".into(),
                call_id: "t".into(),
                output: String::new(),
                is_error: false,
                exit_code: None,
                meta: None,
                started_at: 10_000,
                ended_at: 10_035,
            },
            // A step whose provider reported no usage still counts.
            step(None, Some(200), Some(100)),
            step(Some(usage(20, 30, 4_100, 50)), None, Some(300)),
        ];
        let stats = fold(&events);
        assert_eq!(stats.turns, 1);
        assert_eq!(stats.steps, 3);
        assert_eq!(stats.usage, usage(120, 80, 8_100, 50));
        assert_eq!(stats.model_ms, 300 + 500 + 200 + 100 + 300);
        assert_eq!(stats.tool_ms, 35);
        assert_eq!((stats.ttft_ms, stats.ttft_steps), (500, 2));
        assert_eq!((stats.decode_ms, stats.decode_tokens), (800, 80));
        assert_eq!(stats.last_context_tokens, 20 + 4_100 + 50);
        assert_eq!(stats.context_window, Some(128_000));
    }

    #[test]
    fn an_old_log_without_steps_has_empty_totals() {
        let events = [
            SessionEvent::TurnStarted {
                session_id: "s".into(),
                turn: 0,
            },
            SessionEvent::Output {
                session_id: "s".into(),
                chunk: "hi".into(),
            },
            SessionEvent::ToolResult {
                session_id: "s".into(),
                call_id: "t".into(),
                output: String::new(),
                is_error: false,
                exit_code: None,
                meta: None,
                started_at: 0,
                ended_at: 0,
            },
        ];
        let stats = fold(&events);
        assert_eq!(stats.turns, 1);
        assert_eq!(stats.steps, 0);
        assert_eq!(stats.tool_ms, 0);
        assert_eq!(stats.context_window, None);
    }
}
