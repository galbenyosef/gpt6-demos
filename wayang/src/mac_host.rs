//! A per-display lease prevents stale control records from reporting a crashed player as active.
use super::*;
use crate::project::{atomic_write, playback_root};
use anyhow::Context;
use eframe::egui;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{
    ffi::{CString, c_char, c_void},
    fs::{self, File},
    io::{BufRead, BufReader, Read},
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
fn transaction(dir: &Path, display: &str) -> Result<File> {
    let id = display.parse::<u32>()?;
    let file = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join(format!("{id}.lock")))?;
    file.lock()?;
    Ok(file)
}
fn lease(dir: &Path, token: &str) -> PathBuf {
    dir.join(format!("{token}.lease"))
}
fn active(dir: &Path, path: &Path) -> bool {
    let Ok(token) = fs::read_to_string(path) else {
        return false;
    };
    if uuid::Uuid::parse_str(&token).is_err() {
        return false;
    }
    File::open(lease(dir, &token))
        .ok()
        .is_some_and(|f| matches!(f.try_lock(), Err(std::fs::TryLockError::WouldBlock)))
}
pub fn status() -> Status {
    let active = control()
        .ok()
        .and_then(|dir| {
            Some(
                fs::read_dir(&dir)
                    .ok()?
                    .flatten()
                    .filter_map(|e| {
                        let path = e.path();
                        (path.extension()?.to_str()? == "active" && active(&dir, &path))
                            .then(|| path.file_stem().unwrap().to_string_lossy().into_owned())
                    })
                    .collect(),
            )
        })
        .unwrap_or_default();
    Status {
        protocol: 1,
        active,
        reduced: unsafe { wy_reduced() },
        ..Default::default()
    }
}
pub fn apply(scene: &str, display: &str) -> Result<()> {
    let dir = control()?;
    let path = record(&dir, display)?;
    let _lock = transaction(&dir, display)?;
    let token = uuid::Uuid::new_v4().to_string();
    let exe = std::env::current_exe()?.with_file_name("wyang-player");
    let mut child = Command::new(exe)
        .args([scene, "640", "480", display, &token])
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
        atomic_write(&path, token.as_bytes())
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
    let _lock = transaction(&dir, display)?;
    let path = record(&dir, display)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
pub struct Host {
    native: *mut c_void,
    _ctx: Box<egui::Context>,
    alive: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    _lease: File,
    lease_path: PathBuf,
}
extern "C" fn wake(ctx: *mut c_void) {
    unsafe { &*(ctx as *const egui::Context) }.request_repaint();
}
impl Host {
    pub fn attach(cc: &eframe::CreationContext<'_>, display: &str, _scene: &str) -> Result<Self> {
        let token = std::env::args().nth(5).context("Missing player lease")?;
        uuid::Uuid::parse_str(&token)?;
        let dir = control()?;
        let path = record(&dir, display)?;
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
        let mut ctx = Box::new(cc.egui_ctx.clone());
        let native = unsafe {
            wy_attach(
                view.ns_view.as_ptr(),
                display.parse()?,
                editor.as_ptr(),
                wake,
                (&mut *ctx as *mut egui::Context).cast(),
            )
        };
        ensure!(!native.is_null(), "Display disconnected");
        let alive = Arc::new(AtomicBool::new(true));
        let stop = Arc::new(AtomicBool::new(false));
        let (run, end, waker) = (alive.clone(), stop.clone(), cc.egui_ctx.clone());
        thread::spawn(move || {
            let _ = std::io::stdin().read(&mut [0]);
            while run.load(Ordering::Acquire) {
                let mine = fs::read_to_string(&path).is_ok_and(|s| s == token);
                if !mine {
                    end.store(true, Ordering::Release);
                    waker.request_repaint();
                    break;
                }
                thread::sleep(Duration::from_millis(150));
            }
        });
        Ok(Self {
            native,
            _ctx: ctx,
            alive,
            stop,
            _lease: lease,
            lease_path,
        })
    }
    pub fn ready(&self) {
        unsafe { wy_menu(self.native) };
        println!("ready");
    }
    pub fn should_close(&self) -> bool {
        self.stop.load(Ordering::Acquire) || unsafe { wy_input(self.native) }.close != 0
    }
    pub fn sample(&self, _: &egui::Context) -> Option<Input> {
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
