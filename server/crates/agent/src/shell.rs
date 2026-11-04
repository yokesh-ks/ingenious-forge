//! The Shell tool (PRD §6.1 Built-in tools): runs a command with `sh -c`
//! in the project folder and reports each line of output as it arrives.

use std::{
    collections::VecDeque,
    os::unix::process::ExitStatusExt,
    path::Path,
    process::{ExitStatus, Stdio},
    time::Duration,
};

use api_types::OutputStream;

use crate::sandbox::{Policy, Sandbox};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Command,
    sync::{mpsc, watch},
};

/// Output kept for the model; older lines are dropped first.
const MAX_OUTPUT_BYTES: usize = 30_000;
/// How long a stopped command gets to exit after SIGTERM before SIGKILL.
const TERM_GRACE: Duration = Duration::from_secs(2);
/// How long to keep reading after the shell exits, for output still in
/// the pipes; a background process that keeps them open is cut off.
const DRAIN_GRACE: Duration = Duration::from_millis(200);

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
    /// The exit code; 128 plus the signal number for a command ended by a
    /// signal, as shells report it. `None` when it never ran.
    pub exit_code: Option<i32>,
    /// True when the command could not be run at all.
    pub is_error: bool,
    /// True when it was stopped before it finished.
    pub interrupted: bool,
}

/// Runs `command` in `root` without a sandbox, calling `on_line` for
/// every line of stdout and stderr as it is produced.
pub async fn run(
    root: &Path,
    command: &str,
    on_line: impl FnMut(Line) + Send,
    stop: watch::Receiver<bool>,
) -> ShellOutcome {
    run_in(
        &Sandbox::Off,
        &Policy::project(root),
        root,
        command,
        on_line,
        stop,
    )
    .await
}

/// Like [`run`], confined by `sandbox` to what `policy` allows. An
/// unavailable sandbox runs nothing.
pub async fn run_in(
    sandbox: &Sandbox,
    policy: &Policy,
    root: &Path,
    command: &str,
    mut on_line: impl FnMut(Line) + Send,
    mut stop: watch::Receiver<bool>,
) -> ShellOutcome {
    let (program, args) = match sandbox.command(policy, command) {
        Ok(launch) => launch,
        Err(reason) => return failed(reason),
    };
    if *stop.borrow() {
        return ShellOutcome {
            output: "Stopped by the user before it started.".into(),
            exit_code: None,
            is_error: false,
            interrupted: true,
        };
    }
    // Its own process group, so stopping it reaches everything it starts.
    let mut child = match Command::new(&program)
        .args(&args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(err) => return failed(format!("cannot run the command: {err}")),
    };
    let group = child.id();

    let (tx, mut rx) = mpsc::unbounded_channel();
    if let Some(out) = child.stdout.take() {
        tokio::spawn(forward(out, OutputStream::Stdout, tx.clone()));
    }
    if let Some(err) = child.stderr.take() {
        tokio::spawn(forward(err, OutputStream::Stderr, tx.clone()));
    }
    drop(tx);

    let mut kept = Tail::default();
    let mut status: Option<ExitStatus> = None;
    let mut interrupted = false;
    loop {
        tokio::select! {
            line = recv(&mut rx, status.is_some()) => match line {
                Some(line) => {
                    kept.push(&line.text);
                    on_line(line);
                }
                None => break,
            },
            done = child.wait(), if status.is_none() => match done {
                Ok(done) => status = Some(done),
                Err(err) => return failed(format!("the command did not finish: {err}")),
            },
            _ = stop_requested(&mut stop), if !interrupted && status.is_none() => {
                interrupted = true;
                status = Some(terminate(&mut child, group).await);
            },
        }
    }
    let status = match status {
        Some(status) => status,
        None => match child.wait().await {
            Ok(status) => status,
            Err(err) => return failed(format!("the command did not finish: {err}")),
        },
    };
    // Whatever it left running in the background goes with it.
    signal_group(group, "KILL");
    let exit_code = status.code().or_else(|| status.signal().map(|s| 128 + s));
    let code = exit_code.map_or("unknown".to_string(), |c| c.to_string());
    let ending = if interrupted {
        format!("Stopped by the user before it finished (exit code {code}).")
    } else {
        format!("Exit code: {code}")
    };
    ShellOutcome {
        output: format!("{}\n{ending}", kept.render()),
        exit_code,
        is_error: false,
        interrupted,
    }
}

/// Resolves once a stop is requested; never when the sender is gone.
async fn stop_requested(stop: &mut watch::Receiver<bool>) {
    if stop.wait_for(|stop| *stop).await.is_err() {
        std::future::pending::<()>().await;
    }
}

/// The next line; once the shell has exited, `None` after `DRAIN_GRACE`
/// without output.
async fn recv(rx: &mut mpsc::UnboundedReceiver<Line>, exited: bool) -> Option<Line> {
    if !exited {
        return rx.recv().await;
    }
    tokio::time::timeout(DRAIN_GRACE, rx.recv())
        .await
        .ok()
        .flatten()
}

/// Sends SIGTERM to the command's process group, then SIGKILL if it has
/// not exited after `TERM_GRACE`.
async fn terminate(child: &mut tokio::process::Child, group: Option<u32>) -> ExitStatus {
    signal_group(group, "TERM");
    if let Ok(Ok(status)) = tokio::time::timeout(TERM_GRACE, child.wait()).await {
        return status;
    }
    signal_group(group, "KILL");
    let _ = child.start_kill();
    child
        .wait()
        .await
        .unwrap_or_else(|_| ExitStatus::from_raw(9))
}

/// Signals every process in `group` with the system `kill` command.
fn signal_group(group: Option<u32>, signal: &str) {
    if let Some(group) = group {
        let _ = std::process::Command::new("kill")
            .arg(format!("-{signal}"))
            .arg("--")
            .arg(format!("-{group}"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

fn failed(output: String) -> ShellOutcome {
    ShellOutcome {
        output,
        exit_code: None,
        is_error: true,
        interrupted: false,
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
