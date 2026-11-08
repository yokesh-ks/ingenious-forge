//! The workspace terminal (PRD §6.2 Workspace panel; ADR 0007): one PTY
//! per project, running the user's shell in the project folder. It lives
//! until the shell exits, so a browser can leave and come back to it.

use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    path::Path,
    sync::{Arc, Mutex},
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tokio::sync::broadcast;

/// Recent output replayed to a browser that attaches.
const SCROLLBACK_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TermEvent {
    Output(Vec<u8>),
    /// The shell ended; the terminal is gone.
    Exit,
}

/// A browser's view of a terminal: what it missed, then what comes next.
pub struct Attached {
    pub terminal: Arc<Terminal>,
    pub scrollback: Vec<u8>,
    pub events: broadcast::Receiver<TermEvent>,
}

pub struct Terminal {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    output: Mutex<Output>,
}

struct Output {
    scrollback: VecDeque<u8>,
    tx: broadcast::Sender<TermEvent>,
    exited: bool,
}

impl Terminal {
    /// Sends keystrokes to the shell.
    pub fn write(&self, data: &[u8]) -> std::io::Result<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.write_all(data)?;
        writer.flush()
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    fn exited(&self) -> bool {
        self.output.lock().unwrap().exited
    }
}

impl Drop for Terminal {
    fn drop(&mut self) {
        let _ = self.child.lock().unwrap().kill();
    }
}

/// The terminals of every project, by project id, or `project:tab` for a
/// workspace panel tab with its own shell.
#[derive(Clone)]
pub struct Terminals {
    shell: String,
    open: Arc<Mutex<HashMap<String, Arc<Terminal>>>>,
}

impl Default for Terminals {
    /// Runs the user's `$SHELL`, or `/bin/sh`.
    fn default() -> Self {
        Self::with_shell(std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into()))
    }
}

impl Terminals {
    pub fn with_shell(shell: impl Into<String>) -> Self {
        Self {
            shell: shell.into(),
            open: Arc::default(),
        }
    }

    /// Attaches to the terminal of project `key`, starting a shell in `cwd`
    /// when it has none (or its shell has exited).
    pub fn attach(&self, key: &str, cwd: &Path) -> Result<Attached, String> {
        let mut open = self.open.lock().unwrap();
        let terminal = match open.get(key).filter(|t| !t.exited()) {
            Some(terminal) => terminal.clone(),
            None => {
                let terminal = self.spawn(cwd)?;
                open.insert(key.to_string(), terminal.clone());
                terminal
            }
        };
        // Snapshot and subscribe together, so no output falls between them.
        let output = terminal.output.lock().unwrap();
        let attached = Attached {
            scrollback: output.scrollback.iter().copied().collect(),
            events: output.tx.subscribe(),
            terminal: terminal.clone(),
        };
        drop(output);
        Ok(attached)
    }

    /// Forgets the terminal of project `key`; its shell ends once no browser
    /// is attached.
    pub fn close(&self, key: &str) {
        self.open.lock().unwrap().remove(key);
    }

    /// Forgets every terminal of a project: its own and its panel tabs',
    /// which are keyed `project:tab`.
    pub fn close_project(&self, project: &str) {
        let tabs = format!("{project}:");
        self.open
            .lock()
            .unwrap()
            .retain(|key, _| key != project && !key.starts_with(&tabs));
    }

    fn spawn(&self, cwd: &Path) -> Result<Arc<Terminal>, String> {
        if !cwd.is_dir() {
            return Err(format!("{} is not a folder", cwd.display()));
        }
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("cannot open a terminal: {e}"))?;
        let mut command = CommandBuilder::new(&self.shell);
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("cannot start {}: {e}", self.shell))?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let (tx, _) = broadcast::channel(1024);
        let terminal = Arc::new(Terminal {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
            output: Mutex::new(Output {
                scrollback: VecDeque::new(),
                tx,
                exited: false,
            }),
        });

        // The reader blocks, so it gets its own thread. It holds a weak
        // reference: dropping the terminal ends it.
        let weak = Arc::downgrade(&terminal);
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                let n = reader.read(&mut buf).unwrap_or(0);
                let Some(terminal) = weak.upgrade() else {
                    return;
                };
                let mut output = terminal.output.lock().unwrap();
                if n == 0 {
                    output.exited = true;
                    let _ = output.tx.send(TermEvent::Exit);
                    return;
                }
                output.scrollback.extend(&buf[..n]);
                let extra = output.scrollback.len().saturating_sub(SCROLLBACK_BYTES);
                output.scrollback.drain(..extra);
                let _ = output.tx.send(TermEvent::Output(buf[..n].to_vec()));
            }
        });
        Ok(terminal)
    }
}
