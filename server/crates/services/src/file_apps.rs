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
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (file, Command::new);
        Vec::new()
    }
}

/// Opens `file` with the program installed at `application`, which must be
/// one the system lists for that file.
pub fn open_with_application(file: &Path, application: &str) -> Result<(), String> {
    if !applications_for(file).iter().any(|a| a.path == application) {
        return Err(format!("{application} cannot open that file"));
    }
    let status = Command::new("open")
        .arg("-a")
        .arg(application)
        .arg(file)
        .status()
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
    fn a_program_the_system_does_not_list_is_refused() {
        let dir = std::env::temp_dir();
        let error = open_with_application(&dir.join("forge-no-such-file"), "/bin/rm").unwrap_err();
        assert!(error.contains("cannot open"));
    }
}
