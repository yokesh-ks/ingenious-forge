use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use api_types::OpenApp;
use services::folders::{inspect_folder, open_file_in, FolderError};

struct Dir(PathBuf);

impl Dir {
    fn new() -> Self {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "forge-folders-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        Self(dir.canonicalize().unwrap())
    }

    fn mkdir(&self, rel: &str) -> PathBuf {
        let p = self.0.join(rel);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn a_git_repository_folder_is_accepted_with_its_name() {
    let dir = Dir::new();
    let repo = dir.mkdir("my-app");
    fs::create_dir(repo.join(".git")).unwrap();

    let folder = inspect_folder(repo.to_str().unwrap()).unwrap();

    assert_eq!(folder.path, repo);
    assert_eq!(folder.name, "my-app");
}

#[test]
fn a_worktree_with_a_git_file_counts_as_a_repository() {
    let dir = Dir::new();
    let repo = dir.mkdir("wt");
    fs::write(repo.join(".git"), "gitdir: /elsewhere").unwrap();
    assert!(inspect_folder(repo.to_str().unwrap()).is_ok());
}

#[test]
fn folders_that_cannot_be_projects_are_refused() {
    let dir = Dir::new();
    let plain = dir.mkdir("plain");
    let file = dir.path().join("file.txt");
    fs::write(&file, "x").unwrap();

    assert_eq!(
        inspect_folder("relative/path"),
        Err(FolderError::NotAbsolute)
    );
    assert_eq!(
        inspect_folder(dir.path().join("missing").to_str().unwrap()),
        Err(FolderError::NotFound)
    );
    assert_eq!(
        inspect_folder(file.to_str().unwrap()),
        Err(FolderError::NotADirectory)
    );
    assert_eq!(
        inspect_folder(plain.to_str().unwrap()),
        Err(FolderError::NotAGitRepo)
    );
}

#[test]
fn errors_read_as_sentences() {
    assert_eq!(
        FolderError::NotAGitRepo.to_string(),
        "that folder is not a git repository"
    );
}

#[cfg(unix)]
mod open_with {
    use std::time::{Duration, Instant};

    use super::Dir;
    use services::folders::open_with;

    #[test]
    fn a_program_runs_in_the_folder() {
        let dir = Dir::new();
        let marker = dir.path().join("ran");
        let script = format!("[ \"$PWD\" = '{}' ] && touch ran", dir.path().display());
        assert_eq!(
            open_with(&[vec!["sh", "-c", &script]], dir.path(), false),
            Ok(())
        );
        assert!(marker.exists());
    }

    #[test]
    fn a_failing_program_is_reported_unless_its_exit_means_nothing() {
        let dir = Dir::new();
        assert!(open_with(&[vec!["false"]], dir.path(), false)
            .unwrap_err()
            .contains("could not open"));
        assert_eq!(open_with(&[vec!["false"]], dir.path(), true), Ok(()));
    }

    #[test]
    fn the_next_program_runs_when_one_is_not_installed() {
        let dir = Dir::new();
        let commands = [vec!["forge-no-such-program"], vec!["true"]];
        assert_eq!(open_with(&commands, dir.path(), false), Ok(()));
        let error = open_with(&[vec!["forge-no-such-program"]], dir.path(), false).unwrap_err();
        assert!(error.contains("not installed"), "{error}");
    }

    #[test]
    fn a_program_that_keeps_running_counts_as_opened_without_waiting_for_it() {
        let dir = Dir::new();
        let started = Instant::now();
        assert_eq!(open_with(&[vec!["sleep", "5"]], dir.path(), false), Ok(()));
        assert!(started.elapsed() < Duration::from_secs(4));
    }

    #[test]
    fn a_missing_folder_is_reported_without_running_anything() {
        let dir = Dir::new();
        let error = open_with(&[vec!["true"]], &dir.path().join("gone"), false).unwrap_err();
        assert!(error.contains("no longer exists"), "{error}");
    }
}

#[cfg(unix)]
mod folder_dialog {
    use services::folders::pick_folder_with;

    #[test]
    fn the_chosen_folder_comes_back_without_its_line_ending() {
        let dialog: &[&[&str]] = &[&["sh", "-c", "echo '/code/my app/'"]];
        assert_eq!(
            pick_folder_with(dialog, None),
            Ok(Some("/code/my app/".to_string()))
        );
    }

    #[test]
    fn closing_the_dialog_is_no_choice() {
        let empty: &[&[&str]] = &[&["sh", "-c", "echo"]];
        assert_eq!(pick_folder_with(empty, None), Ok(None));

        let cancel_code: &[&[&str]] = &[&["sh", "-c", "exit 1"]];
        assert_eq!(pick_folder_with(cancel_code, Some(1)), Ok(None));
    }

    #[test]
    fn a_failing_dialog_reports_its_error() {
        let dialog: &[&[&str]] = &[&["sh", "-c", "echo broken >&2; exit 2"]];
        assert_eq!(
            pick_folder_with(dialog, Some(1)),
            Err("the folder dialog failed: broken".to_string())
        );
    }

    #[test]
    fn the_next_dialog_runs_when_one_is_not_installed() {
        let dialogs: &[&[&str]] = &[&["forge-no-such-dialog"], &["sh", "-c", "echo /code"]];
        assert_eq!(
            pick_folder_with(dialogs, None),
            Ok(Some("/code".to_string()))
        );
    }

    #[test]
    fn no_installed_dialog_says_what_to_install() {
        let dialogs: &[&[&str]] = &[&["forge-no-such-dialog"]];
        let error = pick_folder_with(dialogs, None).unwrap_err();
        assert!(error.contains("zenity"), "{error}");
    }
}

#[test]
fn opening_a_file_that_is_gone_says_so_without_starting_anything() {
    let dir = Dir::new();
    let missing = dir.0.join("gone.txt");
    let err = open_file_in(OpenApp::VsCode, &dir.0, &missing).unwrap_err();
    assert!(err.contains("no longer exists"), "{err}");
}

#[test]
fn a_file_cannot_be_opened_in_a_terminal() {
    let dir = Dir::new();
    let file = dir.0.join("a.txt");
    fs::write(&file, "a").unwrap();
    let err = open_file_in(OpenApp::Terminal, &dir.0, &file).unwrap_err();
    assert!(err.contains("terminal"), "{err}");
}
