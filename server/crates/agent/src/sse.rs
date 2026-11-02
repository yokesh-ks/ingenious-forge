//! Incremental parser for `text/event-stream` bodies. Network chunks can
//! split an event, a line or a UTF-8 character anywhere, so bytes are
//! buffered until a blank line closes the event.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
}

#[derive(Debug, Default)]
pub struct SseParser {
    buf: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseEvent> {
        self.buf.extend_from_slice(chunk);
        let mut events = Vec::new();
        while let Some((end, sep_len)) = find_block_end(&self.buf) {
            let block: Vec<u8> = self.buf.drain(..end + sep_len).take(end).collect();
            if let Some(event) = parse_block(&String::from_utf8_lossy(&block)) {
                events.push(event);
            }
        }
        events
    }
}

/// Position and length of the first blank-line separator (`\n\n` or
/// `\r\n\r\n`).
fn find_block_end(buf: &[u8]) -> Option<(usize, usize)> {
    (0..buf.len()).find_map(|i| {
        if buf[i..].starts_with(b"\r\n\r\n") {
            Some((i, 4))
        } else if buf[i..].starts_with(b"\n\n") {
            Some((i, 2))
        } else {
            None
        }
    })
}

fn parse_block(block: &str) -> Option<SseEvent> {
    let mut event = String::from("message");
    let mut data: Vec<&str> = Vec::new();
    for line in block.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => event = value.to_string(),
            "data" => data.push(value),
            _ => {}
        }
    }
    if data.is_empty() {
        return None;
    }
    Some(SseEvent {
        event,
        data: data.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(event: &str, data: &str) -> SseEvent {
        SseEvent {
            event: event.into(),
            data: data.into(),
        }
    }

    #[test]
    fn parses_complete_events() {
        let mut p = SseParser::default();
        let out = p.push(b"event: a\ndata: {\"x\":1}\n\nevent: b\ndata: 2\n\n");
        assert_eq!(out, vec![ev("a", "{\"x\":1}"), ev("b", "2")]);
    }

    #[test]
    fn buffers_events_split_across_chunks() {
        let mut p = SseParser::default();
        assert!(p.push(b"event: a\nda").is_empty());
        assert!(p.push(b"ta: hel").is_empty());
        assert_eq!(p.push(b"lo\n\n"), vec![ev("a", "hello")]);
    }

    #[test]
    fn keeps_multibyte_characters_split_across_chunks() {
        let bytes = "data: héllo\n\n".as_bytes();
        let split = bytes.iter().position(|b| *b == 0xC3).unwrap() + 1;
        let mut p = SseParser::default();
        assert!(p.push(&bytes[..split]).is_empty());
        assert_eq!(p.push(&bytes[split..]), vec![ev("message", "héllo")]);
    }

    #[test]
    fn handles_crlf_line_endings_and_comments() {
        let mut p = SseParser::default();
        let out = p.push(b": ping\r\nevent: a\r\ndata: x\r\n\r\n");
        assert_eq!(out, vec![ev("a", "x")]);
    }

    #[test]
    fn joins_multiple_data_lines_with_newline() {
        let mut p = SseParser::default();
        assert_eq!(
            p.push(b"data: one\ndata: two\n\n"),
            vec![ev("message", "one\ntwo")]
        );
    }

    #[test]
    fn skips_blocks_without_data() {
        let mut p = SseParser::default();
        assert!(p.push(b"event: ping\n\n").is_empty());
    }
}
