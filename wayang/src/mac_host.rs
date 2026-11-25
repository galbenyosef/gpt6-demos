//! A per-display lease prevents stale control records from reporting a crashed player as active.
use super::*;
#[path = "mac_login.rs"]
mod login;
use crate::project::playback_root;
use anyhow::Context;
use eframe::egui;
pub(crate) use login::application_support;
use login::{Choice, Registry, compare, registration, screen_uuid, selection};
pub use login::{Registration, open_login_settings, restore_at_login, set_resume};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{
    ffi::{CString, c_char, c_void},
    fs::{self, File},
    io::{BufRead, BufReader, Read},
    os::unix::{fs::MetadataExt, process::CommandExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

#[repr(C)]
#[derive(Clone, Copy)]
struct NativeInput {
    x: f32,
    y: f32,
    lw: f32,
    lh: f32,
    w: u32,
    h: u32,
    paused: u8,
    reduced: u8,
    suspended: u8,
    close: u8,
}
unsafe extern "C" {
    fn wy_reduced() -> bool;
    fn wy_attach(
        view: *mut c_void,
        display: u32,
        editor: *const c_char,
        wake: extern "C" fn(*mut c_void),
        ctx: *mut c_void,
    ) -> *mut c_void;
    fn wy_input(host: *mut c_void) -> NativeInput;
    fn wy_menu(host: *mut c_void);
    fn wy_on_stop(host: *mut c_void, callback: extern "C" fn(*mut c_void));
    fn wy_release(host: *mut c_void);
}
fn control() -> Result<PathBuf> {
    let dir = playback_root()?.with_file_name("players");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}
fn record(dir: &Path, display: &str) -> Result<PathBuf> {
    let id = display.parse::<u32>()?;
    Ok(dir.join(format!("{id}.active")))
}
fn lock(dir: &Path, name: &str) -> Result<File> {
    let file = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join(format!("{name}.lock")))?;
    file.lock()?;
    Ok(file)
}
fn lease(dir: &Path, token: &str) -> PathBuf {
    dir.join(format!("{token}.lease"))
}
fn active_token(dir: &Path, token: &str) -> bool {
    if uuid::Uuid::parse_str(token).is_err() {
        return false;
    }
    File::open(lease(dir, token))
        .ok()
        .is_some_and(|f| matches!(f.try_lock(), Err(std::fs::TryLockError::WouldBlock)))
}
fn legacy_players(dir: &Path) -> Result<Vec<(u32, String)>> {
    let mut result = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("active") {
            continue;
        }
        let Some(id) = path
            .file_stem()
            .and_then(|s| s.to_str())
            .and_then(|s| s.parse().ok())
        else {
            continue;
        };
        if let Ok(token) = fs::read_to_string(path)
            && active_token(dir, &token)
        {
            result.push((id, token));
        }
    }
    Ok(result)
}
pub fn status() -> Status {
    let mut active = Vec::new();
    let mut requested = false;
    if let Ok(dir) = control() {
        if let Ok(state) = Registry::read(&dir) {
            requested = state.enabled;
            for (uuid, c) in state.displays {
                if active_token(&dir, &c.token)
                    && let Some(id) = login::screen_id(&uuid)
                {
                    active.push(id.to_string());
                }
            }
        }
        for (id, _) in legacy_players(&dir).unwrap_or_default() {
            active.push(id.to_string());
        }
    }
    Status {
        protocol: 1,
        active,
        reduced: unsafe { wy_reduced() },
        registration: registration(),
        resume_requested: requested,
        ..Default::default()
    }
}
pub fn apply(scene: &str, display: &str) -> Result<()> {
    let dir = control()?;
    let id: u32 = display.parse()?;
    let key = screen_uuid(id)?;
    let _lock = lock(&dir, &key)?;
    let _legacy_lock = lock(&dir, display)?;
    start_player(&dir, &key, id, scene, selection(id, &key), None)?;
    remove_legacy(&dir, display)
}
fn remove_legacy(dir: &Path, display: &str) -> Result<()> {
    match fs::remove_file(record(dir, display)?) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        other => Ok(other?),
    }
}
// Pre-002 players expose only a lease token on disk. Recover the immutable
// scene ID from that specific live player's arguments before handing it over.
fn adopt_legacy_players(dir: &Path) -> Result<()> {
    for (id, old_token) in legacy_players(dir)? {
        let key = screen_uuid(id)?;
        let _lock = lock(dir, &key)?;
        let display = id.to_string();
        let _legacy_lock = lock(dir, &display)?;
        let path = record(dir, &display)?;
        if fs::read_to_string(path).ok().as_ref() != Some(&old_token)
            || !active_token(dir, &old_token)
        {
            continue;
        }
        let pids = Command::new("/usr/bin/pgrep")
            .args(["-x", "wyang-player"])
            .output()?;
        let mut found = None;
        for pid in String::from_utf8_lossy(&pids.stdout).split_whitespace() {
            let out = Command::new("/bin/ps")
                .args(["-ww", "-p", pid, "-o", "command="])
                .output()?;
            let line = String::from_utf8_lossy(&out.stdout);
            let args: Vec<_> = line.trim().rsplitn(6, ' ').collect();
            if args.len() == 6
                && args[0] == old_token
                && args[1] == display
                && args[5].ends_with("/wyang-player")
                && args[4].len() == 64
                && args[4].bytes().all(|c| c.is_ascii_hexdigit())
            {
                found = Some(args[4].to_owned());
                break;
            }
        }
        let scene = found.context(
            "Reapply the wallpaper from this version to remember the older player's scene",
        )?;
        if !active_token(dir, &old_token) {
            continue;
        }
        start_player(dir, &key, id, &scene, selection(id, &key), None)?;
        remove_legacy(dir, &display)?;
    }
    Ok(())
}
fn start_player(
    dir: &Path,
    key: &str,
    id: u32,
    scene: &str,
    baseline: Option<String>,
    restoring: Option<&str>,
) -> Result<()> {
    let token = uuid::Uuid::new_v4().to_string();
    let exe = std::env::current_exe()?.with_file_name("wyang-player");
    let display = id.to_string();
    let mut child = Command::new(exe)
        .args([
            scene,
            "640",
            "480",
            &display,
            key,
            if restoring.is_some() {
                "restore"
            } else {
                "apply"
            },
            &token,
        ])
        .process_group(0)
        .env_remove("OPENAI_API_KEY")
        .env_remove("OPENAI_IMAGE_MODEL")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("Install wyang-player beside the editor")?;
    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut line = String::new();
        let _ = BufReader::new(stdout).read_line(&mut line);
        let _ = tx.send(line);
    });
    let ready = rx.recv_timeout(Duration::from_secs(20)).ok().as_deref() == Some("ready\n");
    let result = if ready {
        (|| {
            ensure!(screen_uuid(id)? == key, "Display changed during Apply");
            let current = selection(id, key);
            let system = compare(baseline.as_deref(), current.as_deref());
            Registry::update(dir, |state| {
                state.publish(
                    key,
                    Choice {
                        scene: scene.to_owned(),
                        token: token.clone(),
                        baseline,
                        resume: false,
                    },
                    restoring.map(|previous| (previous, registration())),
                    system,
                )
            })
        })()
    } else {
        Err(anyhow::anyhow!("Wallpaper did not become ready"))
    };
    if result.is_err() {
        let _ = child.kill();
    }
    // EOF tells the helper that publication finished. It also wakes it if the editor dies.
    drop(child.stdin.take());
    thread::spawn(move || {
        let _ = child.wait();
    });
    result
}
pub fn stop(display: &str) -> Result<()> {
    let dir = control()?;
    let key = screen_uuid(display.parse()?)?;
    let _lock = lock(&dir, &key)?;
    let _legacy_lock = lock(&dir, display)?;
    Registry::update(&dir, |s| {
        s.forget(&key, None);
        Ok(())
    })?;
    remove_legacy(&dir, display)
}

struct PlayerContext {
    egui: egui::Context,
    dir: PathBuf,
    key: String,
    token: String,
}
extern "C" fn forget_player(ctx: *mut c_void) {
    let ctx = unsafe { &*ctx.cast::<PlayerContext>() };
    if let Err(error) = Registry::update(&ctx.dir, |s| {
        s.forget(&ctx.key, Some(&ctx.token));
        Ok(())
    }) {
        eprintln!("Could not forget stopped wallpaper: {error:#}");
    }
}
pub struct Host {
    native: *mut c_void,
    _ctx: Box<PlayerContext>,
    committed: Arc<AtomicBool>,
    shown: bool,
    alive: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    _lease: File,
    lease_path: PathBuf,
}
extern "C" fn wake(ctx: *mut c_void) {
    unsafe { &*ctx.cast::<PlayerContext>() }
        .egui
        .request_repaint();
}
impl Host {
    pub fn attach(cc: &eframe::CreationContext<'_>, display: &str, _scene: &str) -> Result<Self> {
        let key = screen_uuid(display.parse()?)?;
        ensure!(
            std::env::args().nth(5).as_ref() == Some(&key),
            "Display changed before player launch"
        );
        let token = std::env::args().nth(7).context("Missing player lease")?;
        uuid::Uuid::parse_str(&token)?;
        let dir = control()?;
        let path = dir.join(login::STATE);
        let lease_path = lease(&dir, &token);
        let lease = File::options()
            .write(true)
            .create_new(true)
            .open(&lease_path)?;
        lease.lock()?;
        let RawWindowHandle::AppKit(view) = cc.window_handle()?.as_raw() else {
            anyhow::bail!("AppKit window unavailable")
        };
        let editor = CString::new(
            std::env::current_exe()?
                .with_file_name("wyang")
                .as_os_str()
                .as_encoded_bytes(),
        )?;
        let mut ctx = Box::new(PlayerContext {
            egui: cc.egui_ctx.clone(),
            dir: dir.clone(),
            key: key.clone(),
            token: token.clone(),
        });
        let native = unsafe {
            wy_attach(
                view.ns_view.as_ptr(),
                display.parse()?,
                editor.as_ptr(),
                wake,
                (&mut *ctx as *mut PlayerContext).cast(),
            )
        };
        ensure!(!native.is_null(), "Display disconnected");
        unsafe { wy_on_stop(native, forget_player) };
        let committed = Arc::new(AtomicBool::new(false));
        let published = committed.clone();
        let alive = Arc::new(AtomicBool::new(true));
        let stop = Arc::new(AtomicBool::new(false));
        let (run, end, waker) = (alive.clone(), stop.clone(), cc.egui_ctx.clone());
        thread::spawn(move || {
            let _ = std::io::stdin().read(&mut [0]);
            let mut previous = None;
            while run.load(Ordering::Acquire) {
                let version = fs::metadata(&path)
                    .ok()
                    .map(|m| (m.ino(), m.ctime(), m.ctime_nsec()));
                if previous != version || !published.load(Ordering::Acquire) {
                    previous = version;
                    let mine = Registry::read(&dir)
                        .is_ok_and(|s| s.displays.get(&key).is_some_and(|c| c.token == token));
                    if mine && !published.swap(true, Ordering::AcqRel) {
                        waker.request_repaint();
                    }
                    if !mine {
                        end.store(true, Ordering::Release);
                        waker.request_repaint();
                        break;
                    }
                }
                thread::sleep(Duration::from_millis(150));
            }
        });
        Ok(Self {
            native,
            _ctx: ctx,
            committed,
            shown: false,
            alive,
            stop,
            _lease: lease,
            lease_path,
        })
    }
    pub fn ready(&self) {
        println!("ready");
    }
    pub fn should_close(&self) -> bool {
        self.stop.load(Ordering::Acquire) || unsafe { wy_input(self.native) }.close != 0
    }
    pub fn sample(&mut self, _: &egui::Context) -> Option<Input> {
        if !self.shown && self.committed.load(Ordering::Acquire) {
            unsafe { wy_menu(self.native) };
            self.shown = true;
        }
        let i = unsafe { wy_input(self.native) };
        if self.should_close() {
            return None;
        }
        if i.w == 0 || i.h == 0 {
            return Some(Input {
                suspended: true,
                ..Input::new([1, 1])
            });
        }
        Some(Input {
            size: [i.w, i.h],
            logical: [i.lw, i.lh],
            pointer: [i.x, i.y],
            paused: i.paused != 0,
            reduced: i.reduced != 0,
            suspended: i.suspended != 0,
        })
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Release);
        unsafe { wy_release(self.native) };
        let _ = fs::remove_file(&self.lease_path);
    }
}
