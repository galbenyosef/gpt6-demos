use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Display {
    pub id: String,
    pub name: String,
    pub size: [u32; 2],
    pub scale: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Status {
    pub protocol: u32,
    pub shell: u32,
    pub displays: Vec<Display>,
    pub active: Vec<String>,
    pub reduced: bool,
    #[serde(default)]
    pub reason: String,
}
impl Status {
    pub fn available(&self) -> bool {
        self.reason.is_empty() && self.protocol == 1
    }
}
pub fn monitors(window: &winit::window::Window) -> Vec<Display> {
    window
        .available_monitors()
        .enumerate()
        .map(|(i, m)| {
            let name = m.name().unwrap_or_else(|| format!("Display {}", i + 1));
            #[cfg(target_os = "macos")]
            let id = {
                use winit::platform::macos::MonitorHandleExtMacOS;
                m.native_id().to_string()
            };
            #[cfg(not(target_os = "macos"))]
            let id = name.clone();
            Display {
                id,
                name,
                size: [m.size().width, m.size().height],
                scale: m.scale_factor(),
            }
        })
        .collect()
}
#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use gio::{
        glib::{Variant, variant::ToVariant},
        prelude::*,
    };
    const INTERFACE: &str = "org.gnome.Shell.Extensions.Wyang";
    fn call(method: &str, args: Option<&Variant>) -> Result<Variant> {
        let bus = gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE)?;
        Ok(bus.call_sync(
            Some("org.gnome.Shell"),
            "/org/gnome/Shell/Extensions/Wyang",
            INTERFACE,
            method,
            args,
            None,
            gio::DBusCallFlags::NO_AUTO_START,
            25000,
            gio::Cancellable::NONE,
        )?)
    }
    pub fn status() -> Status {
        let reduced = gio::SettingsSchemaSource::default()
            .and_then(|s| s.lookup("org.gnome.desktop.interface", true))
            .is_some_and(|_| {
                !gio::Settings::new("org.gnome.desktop.interface").boolean("enable-animations")
            });
        let unsupported = |msg: &str| Status {
            reduced,
            reason: msg.into(),
            ..Default::default()
        };
        if std::env::var("XDG_SESSION_TYPE").as_deref() != Ok("wayland")
            || !std::env::var("XDG_CURRENT_DESKTOP")
                .unwrap_or_default()
                .split(':')
                .any(|s| s.eq_ignore_ascii_case("gnome"))
        {
            return unsupported("Live playback requires GNOME Shell 50 on Wayland.");
        }
        let s = call("Status", None)
            .ok()
            .and_then(|v| v.get::<(String,)>())
            .and_then(|(s,)| serde_json::from_str::<Status>(&s).ok());
        match s {
            Some(s) if s.protocol == 1 && s.shell == 50 => s,
            Some(_) => unsupported("Install the matching Wyang extension for GNOME Shell 50."),
            None => unsupported("Install and enable the Wyang GNOME Shell 50 extension."),
        }
    }
    pub fn apply(id: &str, display: &str) -> Result<()> {
        ensure!(
            status().available(),
            "The matching GNOME extension is unavailable"
        );
        call("Apply", Some(&(display, id).to_variant()))?;
        Ok(())
    }
    pub fn stop(display: &str) -> Result<()> {
        call("Stop", Some(&(display,).to_variant()))?;
        Ok(())
    }
}
#[cfg(target_os = "macos")]
#[path = "mac_host.rs"]
pub mod platform;
pub use platform::{apply, status, stop};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Input {
    pub pointer: [f32; 2],
    pub size: [u32; 2],
    pub logical: [f32; 2],
    pub paused: bool,
    pub reduced: bool,
    pub suspended: bool,
}
impl Input {
    pub fn new(size: [u32; 2]) -> Self {
        Self {
            pointer: [0.; 2],
            size,
            logical: size.map(|n| n as f32),
            paused: false,
            reduced: false,
            suspended: false,
        }
    }
    pub fn valid(&self) -> bool {
        self.size.iter().all(|v| (1..=32768).contains(v))
            && self.logical.iter().all(|v| (1.0..=32768.).contains(v))
            && self.pointer.iter().all(|v| (-1.0..=1.).contains(v))
    }
}
