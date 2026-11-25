//! Durable login choices live in user Application Support. A single atomic
//! update publishes both the player's lease token and its restore selection.
use super::{active_token, control, lock, start_player};
use crate::project::atomic_write;
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    ffi::{CStr, CString, c_char},
    fs, io,
    path::Path,
};

unsafe extern "C" {
    fn wy_application_support() -> *mut c_char;
    fn wy_display_uuid(id: u32) -> *mut c_char;
    fn wy_display_id(uuid: *const c_char) -> u32;
    fn wy_system_selection(id: u32, uuid: *const c_char) -> *mut c_char;
    fn wy_same_selection(before: *const c_char, after: *const c_char) -> i32;
    fn wy_login_status() -> i32;
    fn wy_login_set(enabled: bool) -> *mut c_char;
    fn wy_login_settings();
}
fn owned_string(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    unsafe {
        let value = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        libc::free(ptr.cast());
        Some(value)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Registration {
    #[default]
    Unbundled,
    Unsupported,
    Missing,
    Off,
    Enabled,
    Approval,
}
pub fn registration() -> Registration {
    match unsafe { wy_login_status() } {
        -1 => Registration::Unbundled,
        -2 => Registration::Unsupported,
        0 => Registration::Off,
        1 => Registration::Enabled,
        2 => Registration::Approval,
        _ => Registration::Missing,
    }
}
pub fn open_login_settings() {
    unsafe { wy_login_settings() }
}

pub(crate) fn application_support() -> Result<std::path::PathBuf> {
    owned_string(unsafe { wy_application_support() })
        .map(Into::into)
        .context("Application Support directory unavailable")
}
pub(super) fn screen_uuid(display: u32) -> Result<String> {
    owned_string(unsafe { wy_display_uuid(display) }).context("Display disconnected")
}
pub(super) fn screen_id(key: &str) -> Option<u32> {
    uuid::Uuid::parse_str(key).ok()?;
    let uuid = CString::new(key).ok()?;
    let id = unsafe { wy_display_id(uuid.as_ptr()) };
    (id != 0).then_some(id)
}
pub(super) fn selection(id: u32, key: &str) -> Option<String> {
    let uuid = CString::new(key).ok()?;
    owned_string(unsafe { wy_system_selection(id, uuid.as_ptr()) })
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Comparison {
    Same,
    Changed,
    Unknown,
}
pub(super) fn compare(before: Option<&str>, after: Option<&str>) -> Comparison {
    let strings = before
        .zip(after)
        .and_then(|(a, b)| Some((CString::new(a).ok()?, CString::new(b).ok()?)));
    match strings.map(|(a, b)| unsafe { wy_same_selection(a.as_ptr(), b.as_ptr()) }) {
        Some(1) => Comparison::Same,
        Some(0) => Comparison::Changed,
        _ => Comparison::Unknown,
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub(super) struct Choice {
    pub scene: String,
    pub token: String,
    pub baseline: Option<String>,
    pub resume: bool,
}
#[derive(Default, Serialize, Deserialize)]
pub(super) struct Registry {
    pub enabled: bool,
    pub displays: BTreeMap<String, Choice>,
}
pub(super) const STATE: &str = "playback.json";
impl Registry {
    pub fn read(dir: &Path) -> Result<Self> {
        match fs::read(dir.join(STATE)) {
            Ok(bytes) => {
                Ok(serde_json::from_slice(&bytes).context("Invalid macOS playback record")?)
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.into()),
        }
    }
    pub fn update(dir: &Path, edit: impl FnOnce(&mut Self) -> Result<()>) -> Result<()> {
        let _lock = lock(dir, "playback")?;
        let mut state = Self::read(dir)?;
        edit(&mut state)?;
        atomic_write(&dir.join(STATE), &serde_json::to_vec(&state)?)
    }
    fn enable(&mut self, dir: &Path, enabled: bool) {
        if self.enabled == enabled {
            return;
        }
        self.enabled = enabled;
        for item in self.displays.values_mut() {
            item.resume = enabled && active_token(dir, &item.token);
        }
    }
    pub fn eligible(&self, key: &str, token: &str) -> bool {
        self.enabled
            && self
                .displays
                .get(key)
                .is_some_and(|c| c.resume && c.token == token)
    }
    pub fn publish(
        &mut self,
        key: &str,
        mut next: Choice,
        restore: Option<(&str, Registration)>,
        system: Comparison,
    ) -> Result<()> {
        ensure!(
            system != Comparison::Changed,
            "The system wallpaper changed during Apply"
        );
        if let Some((previous, service)) = restore {
            ensure!(
                system == Comparison::Same && can_restore(self, key, previous, service),
                "Wallpaper restore was cancelled"
            );
        }
        next.resume = self.enabled;
        self.displays.insert(key.to_owned(), next);
        Ok(())
    }
    pub fn forget(&mut self, key: &str, owner: Option<&str>) {
        if self
            .displays
            .get(key)
            .is_some_and(|c| owner.is_none_or(|t| t == c.token))
        {
            self.displays.remove(key);
        }
    }
}

pub fn set_resume(enabled: bool) -> Result<()> {
    let dir = control()?;
    let _change = lock(&dir, "registration")?;
    let service = registration();
    ensure!(
        matches!(
            service,
            Registration::Off | Registration::Enabled | Registration::Approval
        ),
        "Open the packaged Wyang.app on macOS 13 or later to change login settings"
    );
    Registry::update(&dir, |s| {
        s.enable(&dir, enabled);
        Ok(())
    })?;
    let registered = service != Registration::Off;
    if enabled != registered
        && let Some(error) = owned_string(unsafe { wy_login_set(enabled) })
    {
        if enabled {
            Registry::update(&dir, |s| {
                s.enable(&dir, false);
                Ok(())
            })?;
        }
        anyhow::bail!("{error}");
    }
    if enabled {
        super::adopt_legacy_players(&dir)?;
    }
    Ok(())
}

// The same gate is evaluated again after the player has decoded and rendered.
pub(super) fn can_restore(state: &Registry, key: &str, token: &str, service: Registration) -> bool {
    service == Registration::Enabled && state.eligible(key, token)
}

pub fn restore_at_login() -> Result<()> {
    if registration() != Registration::Enabled {
        return Ok(());
    }
    let dir = control()?;
    let state = Registry::read(&dir)?;
    if !state.enabled {
        return Ok(());
    }
    let mut pending: Vec<_> = state
        .displays
        .into_iter()
        .filter(|(_, c)| c.resume)
        .collect();
    // At login the Aqua agent can start before the display or WallpaperAgent
    // is ready. Give them a short grace period, then leave absent screens saved.
    for attempt in 0..=10 {
        pending.retain(|(key, choice)| {
            let Some(id) = screen_id(key) else {
                return true;
            };
            match restore_one(&dir, key, id, choice) {
                Ok(RestoreOutcome::DesktopUnavailable) => true,
                Ok(RestoreOutcome::Finished) => false,
                Err(error) => {
                    eprintln!("Wyang could not restore display {id}: {error:#}");
                    false
                }
            }
        });
        if pending.is_empty() || attempt == 10 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Ok(())
}
enum RestoreOutcome {
    Finished,
    DesktopUnavailable,
}

fn restore_one(dir: &Path, key: &str, id: u32, choice: &Choice) -> Result<RestoreOutcome> {
    let _display_lock = lock(dir, key)?;
    let state = Registry::read(dir)?;
    if !can_restore(&state, key, &choice.token, registration()) || active_token(dir, &choice.token)
    {
        return Ok(RestoreOutcome::Finished);
    }
    let system = selection(id, key);
    match compare(choice.baseline.as_deref(), system.as_deref()) {
        Comparison::Changed => Registry::update(dir, |s| {
            s.forget(key, Some(&choice.token));
            Ok(())
        })?,
        Comparison::Unknown => return Ok(RestoreOutcome::DesktopUnavailable),
        Comparison::Same => start_player(dir, key, id, &choice.scene, system, Some(&choice.token))?,
    }
    Ok(RestoreOutcome::Finished)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::platform::lease;
    use std::{fs::File, sync::Barrier, thread};
    use tempfile::tempdir;

    fn scene() -> Choice {
        Choice {
            scene: "harbor".into(),
            token: uuid::Uuid::new_v4().to_string(),
            baseline: None,
            resume: false,
        }
    }

    #[test]
    fn enabling_adopts_only_live_players_and_disabling_leaves_their_leases_alone() -> Result<()> {
        let tmp = tempdir()?;
        let dir = tmp.path();
        let live = scene();
        let lease = File::create(lease(dir, &live.token))?;
        lease.lock()?;
        let mut state = Registry::read(dir)?;
        assert!(!state.enabled);
        state.publish("A", live.clone(), None, Comparison::Same)?;
        state.publish("B", scene(), None, Comparison::Same)?;
        state.enable(dir, true);
        assert!(state.eligible("A", &live.token));
        assert!(!state.displays["B"].resume);
        drop(lease);
        // Logout drops the process lease, while the saved choice survives.
        assert!(state.eligible("A", &live.token));
        state.enable(dir, false);
        assert_eq!(state.displays["A"].token, live.token);
        assert!(!state.eligible("A", &live.token));
        state.enable(dir, true);
        assert!(!state.eligible("A", &live.token));
        Ok(())
    }

    #[test]
    fn a_restore_rechecks_owner_approval_and_system_choice_before_publication() -> Result<()> {
        let mut state = Registry {
            enabled: true,
            ..Default::default()
        };
        let first = scene();
        state.publish("A", first.clone(), None, Comparison::Same)?;
        for service in [
            Registration::Off,
            Registration::Approval,
            Registration::Unbundled,
        ] {
            assert!(
                state
                    .publish(
                        "A",
                        scene(),
                        Some((&first.token, service)),
                        Comparison::Same
                    )
                    .is_err()
            );
        }
        for comparison in [Comparison::Unknown, Comparison::Changed] {
            assert!(
                state
                    .publish(
                        "A",
                        scene(),
                        Some((&first.token, Registration::Enabled)),
                        comparison
                    )
                    .is_err()
            );
        }
        assert_eq!(state.displays["A"].token, first.token);
        let newer = scene();
        state.publish(
            "A",
            newer.clone(),
            Some((&first.token, Registration::Enabled)),
            Comparison::Same,
        )?;
        state.forget("A", Some(&first.token));
        assert_eq!(state.displays["A"].token, newer.token);
        assert!(
            state
                .publish(
                    "A",
                    scene(),
                    Some((&first.token, Registration::Enabled)),
                    Comparison::Same
                )
                .is_err()
        );
        Ok(())
    }

    #[test]
    fn explicit_stop_wins_against_a_restore_that_has_finished_rendering() -> Result<()> {
        let tmp = tempdir()?;
        let dir = tmp.path();
        let first = scene();
        Registry::update(dir, |s| {
            s.enabled = true;
            s.publish("A", first.clone(), None, Comparison::Same)?;
            s.publish("B", scene(), None, Comparison::Same)
        })?;
        let ready = Barrier::new(2);
        let stopped = Barrier::new(2);
        thread::scope(|scope| {
            let worker = scope.spawn(|| {
                ready.wait();
                stopped.wait();
                Registry::update(dir, |s| {
                    s.publish(
                        "A",
                        scene(),
                        Some((&first.token, Registration::Enabled)),
                        Comparison::Same,
                    )
                })
            });
            ready.wait();
            Registry::update(dir, |s| {
                s.forget("A", None);
                Ok(())
            })
            .unwrap();
            stopped.wait();
            assert!(worker.join().unwrap().is_err());
        });
        let state = Registry::read(dir)?;
        assert!(!state.displays.contains_key("A"));
        assert!(state.displays["B"].resume);
        Ok(())
    }
}
