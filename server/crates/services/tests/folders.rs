use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use services::folders::{inspect_folder, list_dirs, FolderError};

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

#[test]
fn listing_shows_visible_subfolders_sorted_and_marks_repositories() {
    let dir = Dir::new();
    dir.mkdir("beta");
    dir.mkdir("Alpha");
    dir.mkdir(".hidden");
    fs::create_dir_all(dir.mkdir("repo").join(".git")).unwrap();
    fs::write(dir.path().join("file.txt"), "x").unwrap();

    let listing = list_dirs(dir.path()).unwrap();

    assert_eq!(listing.path, dir.path().to_string_lossy());
    assert_eq!(
        listing.parent.as_deref(),
        dir.path().parent().map(|p| p.to_string_lossy()).as_deref()
    );
    assert!(!listing.is_git_repo);
    let entries: Vec<_> = listing
        .entries
        .iter()
        .map(|e| (e.name.as_str(), e.is_git_repo))
        .collect();
    assert_eq!(entries, [("Alpha", false), ("beta", false), ("repo", true)]);
    assert_eq!(
        listing.entries[2].path,
        dir.path().join("repo").to_string_lossy()
    );
}

#[test]
fn listing_a_missing_folder_fails() {
    let dir = Dir::new();
    assert!(list_dirs(&dir.path().join("missing")).is_err());
}
