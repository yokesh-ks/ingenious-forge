//! The Shell tool (PRD §6.1 Built-in tools): runs a command with `sh -c`
//! in the project folder and reports each line of output as it arrives.

use std::{collections::VecDeque, path::Path, process::Stdio};

use api_types::OutputStream;
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Command,
    sync::{mpsc, watch},
};

/// Output kept for the model; older lines are dropped first.
const MAX_OUTPUT_BYTES: usize = 30_000;

/// One line of a command's output, without its line ending.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Line {
    pub stream: OutputStream,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellOutcome {
    /// What the model reads: the output's end and the exit code.
    pub output: String,
    /// `None` when the command did not exit normally.
    pub exit_code: Option<i32>,
    /// True when the command could not be run at all.
    pub is_error: bool,
}

/// Runs `command` in `root`, calling `on_line` for every line of stdout
/// and stderr as it is produced.
pub async fn run(
    root: &Path,
    command: &str,
    mut on_line: impl FnMut(Line) + Send,
    _stop: watch::Receiver<bool>,
) -> ShellOutcome {
    let mut child = match Command::new("/bin/sh")
        .arg("-c")
        .arg(command)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(err) => return failed(format!("cannot run the command: {err}")),
    };

    let (tx, mut rx) = mpsc::unbounded_channel();
    if let Some(out) = child.stdout.take() {
        tokio::spawn(forward(out, OutputStream::Stdout, tx.clone()));
    }
    if let Some(err) = child.stderr.take() {
        tokio::spawn(forward(err, OutputStream::Stderr, tx.clone()));
    }
    drop(tx);

    let mut kept = Tail::default();
    while let Some(line) = rx.recv().await {
        kept.push(&line.text);
        on_line(line);
    }
    let status = match child.wait().await {
        Ok(status) => status,
        Err(err) => return failed(format!("the command did not finish: {err}")),
    };
    let exit_code = status.code();
    let ending = match exit_code {
        Some(code) => format!("Exit code: {code}"),
        None => "The command was killed by a signal.".to_string(),
    };
    ShellOutcome {
        output: format!("{}\n{ending}", kept.render()),
        exit_code,
        is_error: false,
    }
}

fn failed(output: String) -> ShellOutcome {
    ShellOutcome {
        output,
        exit_code: None,
        is_error: true,
    }
}

/// Sends each line read from `reader` until it closes.
async fn forward(
    reader: impl AsyncRead + Unpin,
    stream: OutputStream,
    tx: mpsc::UnboundedSender<Line>,
) {
    let mut reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => return,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n' | b'\r')) {
                    buf.pop();
                }
                let text = String::from_utf8_lossy(&buf).into_owned();
                if tx.send(Line { stream, text }).is_err() {
                    return;
                }
            }
        }
    }
}

/// The last lines of output, up to `MAX_OUTPUT_BYTES`.
#[derive(Default)]
struct Tail {
    lines: VecDeque<String>,
    bytes: usize,
    dropped: usize,
}

impl Tail {
    fn push(&mut self, line: &str) {
        self.bytes += line.len() + 1;
        self.lines.push_back(line.to_string());
        while self.bytes > MAX_OUTPUT_BYTES && self.lines.len() > 1 {
            if let Some(old) = self.lines.pop_front() {
                self.bytes -= old.len() + 1;
                self.dropped += 1;
            }
        }
    }

    fn render(&self) -> String {
        if self.lines.is_empty() {
            return "(no output)".into();
        }
        let body = Vec::from(self.lines.clone()).join("\n");
        if self.dropped == 0 {
            body
        } else {
            format!("[{} earlier lines not shown]\n{body}", self.dropped)
        }
    }
}
