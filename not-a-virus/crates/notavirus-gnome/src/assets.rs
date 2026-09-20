use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    os::unix::{
        fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
        io::AsRawFd,
    },
    path::{Path, PathBuf},
};
use tempfile::TempDir;

fn owned_directory(path: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    // SAFETY: geteuid has no arguments or preconditions.
    if !meta.is_dir() || meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 {
        return Err(io::Error::other(format!(
            "{} must be an owned private directory (0700)",
            path.display()
        )));
    }
    Ok(())
}
pub fn lock(file: &File) -> io::Result<()> {
    // SAFETY: the File owns this live descriptor throughout the syscall.
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
pub fn private_file(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
}
pub struct Assets {
    directory: TempDir,
    _lease: File,
}
impl Assets {
    pub fn new(runtime: &Path) -> io::Result<Self> {
        if !runtime.is_absolute() {
            return Err(io::Error::other("XDG_RUNTIME_DIR must be absolute"));
        }
        owned_directory(runtime)?;
        let root = runtime.join("notavirus");
        match fs::DirBuilder::new().mode(0o700).create(&root) {
            Ok(()) => fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e),
        }
        owned_directory(&root)?;
        // A live session holds its lease. Never reclaim a symlink or another owner's data.
        for entry in fs::read_dir(&root)?.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("session-")
                || !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
                || owned_directory(&entry.path()).is_err()
                || entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.elapsed().ok())
                    .is_none_or(|age| age.as_secs() < 60)
            {
                continue;
            }
            if let Ok(lease) = OpenOptions::new()
                .read(true)
                .write(true)
                .custom_flags(libc::O_NOFOLLOW)
                .open(entry.path().join("lease"))
                && lock(&lease).is_ok()
            {
                fs::remove_dir_all(entry.path())?;
            }
        }
        let directory = tempfile::Builder::new()
            .prefix("session-")
            .tempdir_in(root)?;
        fs::set_permissions(directory.path(), fs::Permissions::from_mode(0o700))?;
        let lease = private_file(&directory.path().join("lease"))?;
        lock(&lease)?;
        Ok(Self {
            directory,
            _lease: lease,
        })
    }
    pub fn token(&self) -> String {
        self.directory
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    }
    pub fn stage(&self, generation: u64, bytes: &[u8]) -> io::Result<String> {
        let token = format!("atlas-{generation}.rgba");
        private_file(&self.directory.path().join(&token))?.write_all(bytes)?;
        Ok(token)
    }
    pub fn remove(&self, generation: u64) {
        let _ = fs::remove_file(
            self.directory
                .path()
                .join(format!("atlas-{generation}.rgba")),
        );
    }
    pub fn path(&self) -> &Path {
        self.directory.path()
    }
}
pub fn data_root() -> io::Result<PathBuf> {
    let root = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .ok_or_else(|| io::Error::other("HOME or absolute XDG_DATA_HOME is required"))?;
    Ok(root.join("notavirus/packs"))
}
