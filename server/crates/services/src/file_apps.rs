//! The programs that can open a file, as the operating system knows them
//! (PRD §6.2 File tab).

use std::{path::Path, process::Command};

use api_types::FileApplication;

/// Asks the system's own workspace service, through the scripting bridge
/// every macOS install has, so no extra dependency is needed.
#[cfg(target_os = "macos")]
const LIST_SCRIPT: &str = r#"
ObjC.import('AppKit');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const workspace = $.NSWorkspace.sharedWorkspace;
  const chosen = workspace.URLForApplicationToOpenURL(url);
  const preferred = chosen.isNil() ? '' : chosen.path.js;
  const found = workspace.URLsForApplicationsToOpenURL(url);
  const out = [];
  for (let i = 0; i < found.count; i++) {
    const path = found.objectAtIndex(i).path.js;
    const image = workspace.iconForFile(path);
    const area = { origin: { x: 0, y: 0 }, size: { width: 32, height: 32 } };
    const small = $.NSImage.alloc.initWithSize(area.size);
    small.lockFocus;
    image.drawInRectFromRectOperationFraction(area, { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } }, 2, 1);
    const rep = $.NSBitmapImageRep.alloc.initWithFocusedViewRect(area);
    small.unlockFocus;
    const png = rep.representationUsingTypeProperties(4, $());
    out.push({
      path,
      name: $.NSFileManager.defaultManager.displayNameAtPath(path).js.replace(/\.app$/, ''),
      default: path === preferred,
      icon: png.base64EncodedStringWithOptions(0).js,
    });
  }
  return JSON.stringify(out);
}
"#;

/// Reads the script's answer; a program listed twice appears once.
pub fn parse_applications(json: &str) -> Vec<FileApplication> {
    let listed: Vec<FileApplication> = serde_json::from_str(json).unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let mut apps: Vec<FileApplication> = listed
        .into_iter()
        .filter(|app| seen.insert(app.path.clone()))
        .collect();
    apps.sort_by_key(|app| !app.default);
    apps
}

/// The programs that can open `file`, the system's default first. Empty
/// where the system offers no list.
pub fn applications_for(file: &Path) -> Vec<FileApplication> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args(["-l", "JavaScript", "-e", LIST_SCRIPT])
            .arg(file)
            .output();
        match output {
            Ok(done) if done.status.success() => {
                parse_applications(&String::from_utf8_lossy(&done.stdout))
            }
            _ => Vec::new(),
        }
    }
    #[cfg(target_os = "linux")]
    {
        linux_applications(file)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (file, Command::new);
        Vec::new()
    }
}

/// The content type `gio info` reports for a file.
pub fn parse_content_type(info: &str) -> Option<&str> {
    info.lines()
        .find_map(|line| line.trim().strip_prefix("standard::content-type:"))
        .map(str::trim)
}

/// The desktop entries `gio mime` lists for a type: the default, if any, and
/// every entry, each once.
pub fn parse_mime_apps(listing: &str) -> (Option<String>, Vec<String>) {
    let default = listing
        .lines()
        .find(|line| line.starts_with("Default application"))
        .and_then(|line| line.rsplit(':').next())
        .map(|id| id.trim().to_string())
        .filter(|id| id.ends_with(".desktop"));
    let mut seen = std::collections::HashSet::new();
    let ids = default
        .iter()
        .cloned()
        .chain(
            listing
                .lines()
                .filter(|line| line.starts_with(char::is_whitespace))
                .map(|line| line.trim().to_string())
                .filter(|line| line.ends_with(".desktop")),
        )
        .filter(|id| seen.insert(id.clone()))
        .collect();
    (default, ids)
}

/// The name a desktop entry shows, or `None` for a hidden one.
pub fn desktop_entry_name(text: &str) -> Option<String> {
    let mut name = None;
    let mut in_entry = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
        } else if in_entry {
            match line.split_once('=') {
                Some(("Hidden", "true")) | Some(("NoDisplay", "true")) => return None,
                Some(("Name", value)) => name = Some(value.to_string()),
                _ => {}
            }
        }
    }
    name
}

#[cfg(target_os = "linux")]
fn linux_applications(file: &Path) -> Vec<FileApplication> {
    let run = |args: &[&std::ffi::OsStr]| -> Option<String> {
        let out = Command::new("gio")
            .env("LC_ALL", "C")
            .args(args)
            .output()
            .ok()?;
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    };
    let info = run(&[
        "info".as_ref(),
        "-a".as_ref(),
        "standard::content-type".as_ref(),
        file.as_os_str(),
    ]);
    let Some(mime) = info
        .as_deref()
        .and_then(parse_content_type)
        .map(str::to_string)
    else {
        return Vec::new();
    };
    let Some(listing) = run(&["mime".as_ref(), mime.as_ref()]) else {
        return Vec::new();
    };
    let (default, ids) = parse_mime_apps(&listing);
    let home = std::env::var("HOME").unwrap_or_default();
    let data_dirs =
        std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    let roots: Vec<String> = std::iter::once(format!("{home}/.local/share"))
        .chain(data_dirs.split(':').map(str::to_string))
        .collect();
    ids.iter()
        .filter_map(|id| {
            let path = roots
                .iter()
                .map(|root| format!("{root}/applications/{id}"))
                .find(|p| Path::new(p).is_file())?;
            let name = desktop_entry_name(&std::fs::read_to_string(&path).ok()?)?;
            Some(FileApplication {
                default: Some(id) == default.as_ref(),
                path,
                name,
                icon: None,
            })
        })
        .collect()
}

/// Opens `file` with the program installed at `application`, which must be
/// one the system lists for that file.
pub fn open_with_application(file: &Path, application: &str) -> Result<(), String> {
    if !applications_for(file).iter().any(|a| a.path == application) {
        return Err(format!("{application} cannot open that file"));
    }
    let status = if cfg!(target_os = "linux") {
        Command::new("gio")
            .arg("launch")
            .arg(application)
            .arg(file)
            .status()
    } else {
        Command::new("open")
            .arg("-a")
            .arg(application)
            .arg(file)
            .status()
    }
    .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{application} could not open the file"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: &str = r#"{"path":"/A.app","name":"A","default":false,"icon":null}"#;
    const TWO: &str = r#"{"path":"/B.app","name":"B","default":true,"icon":"x"}"#;

    #[test]
    fn the_default_comes_first_and_duplicates_go() {
        let apps = parse_applications(&format!("[{ONE},{TWO},{ONE}]"));
        let names: Vec<_> = apps.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["B", "A"]);
    }

    #[test]
    fn an_unreadable_answer_lists_nothing() {
        assert!(parse_applications("nope").is_empty());
    }

    #[test]
    fn linux_listings_are_read() {
        assert_eq!(
            parse_content_type("uri: x\nattributes:\n  standard::content-type: text/csv\n"),
            Some("text/csv")
        );
        let listing = "Default application for “text/csv”: calc.desktop\nRegistered applications:\n\tcalc.desktop\n\tgedit.desktop\nRecommended applications:\n\tgedit.desktop\n";
        let (default, ids) = parse_mime_apps(listing);
        assert_eq!(default.as_deref(), Some("calc.desktop"));
        assert_eq!(ids, ["calc.desktop", "gedit.desktop"]);
    }

    #[test]
    fn a_desktop_entry_gives_its_name_unless_hidden() {
        let shown =
            "[Desktop Entry]\nName=Calc\nName[fr]=Tableur\n[Desktop Action x]\nName=Other\n";
        assert_eq!(desktop_entry_name(shown).as_deref(), Some("Calc"));
        assert_eq!(
            desktop_entry_name("[Desktop Entry]\nName=A\nNoDisplay=true\n"),
            None
        );
    }

    #[test]
    fn a_program_the_system_does_not_list_is_refused() {
        let dir = std::env::temp_dir();
        let error = open_with_application(&dir.join("forge-no-such-file"), "/bin/rm").unwrap_err();
        assert!(error.contains("cannot open"));
    }
}
