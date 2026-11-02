//! Folders on the user's disk: checking that one can be opened as a
//! project, and listing sub-folders for the folder picker (PRD §6.2
//! Projects and session list).

use std::{
    fs, io,
    path::{Path, PathBuf},
};

use api_types::{DirEntry, DirListing};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum FolderError {
    #[error("the folder path must be absolute")]
    NotAbsolute,
    #[error("that folder does not exist")]
    NotFound,
    #[error("that path is not a folder")]
    NotADirectory,
    #[error("that folder is not a git repository")]
    NotAGitRepo,
}

/// A folder that can be opened as a project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectFolder {
    pub path: PathBuf,
    pub name: String,
}

fn is_git_repo(path: &Path) -> bool {
    // `.git` is a folder in a normal clone and a file in a worktree.
    path.join(".git").exists()
}

pub fn inspect_folder(path: &str) -> Result<ProjectFolder, FolderError> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err(FolderError::NotAbsolute);
    }
    let path = path.canonicalize().map_err(|_| FolderError::NotFound)?;
    if !path.is_dir() {
        return Err(FolderError::NotADirectory);
    }
    if !is_git_repo(&path) {
        return Err(FolderError::NotAGitRepo);
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    Ok(ProjectFolder { path, name })
}

/// The visible sub-folders of `path`, sorted by name.
pub fn list_dirs(path: &Path) -> io::Result<DirListing> {
    let path = path.canonicalize()?;
    let mut entries: Vec<DirEntry> = fs::read_dir(&path)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let child = entry.path();
            (!name.starts_with('.') && child.is_dir()).then(|| DirEntry {
                is_git_repo: is_git_repo(&child),
                path: child.to_string_lossy().into_owned(),
                name,
            })
        })
        .collect();
    entries.sort_by_key(|e| e.name.to_lowercase());
    Ok(DirListing {
        is_git_repo: is_git_repo(&path),
        parent: path.parent().map(|p| p.to_string_lossy().into_owned()),
        path: path.to_string_lossy().into_owned(),
        entries,
    })
}

/// Where the folder picker starts: the user's home folder.
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}
