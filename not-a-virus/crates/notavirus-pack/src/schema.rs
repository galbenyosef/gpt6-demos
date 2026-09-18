use serde::Deserialize;
use std::collections::BTreeMap;
#[derive(Deserialize)]
pub struct Manifest {
    pub schema: u32,
    pub id: String,
    pub name: String,
    #[serde(default = "one")]
    pub version: u32,
    pub tile: [u32; 2],
    pub anchor: [f64; 2],
    #[serde(default = "nearest")]
    pub filter: String,
    pub atlas: Atlas,
    #[serde(default)]
    pub behavior: Behavior,
    #[serde(default)]
    pub motion: Motion,
    pub states: BTreeMap<String, Clip>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, toml::Value>,
}
fn one() -> u32 {
    1
}
fn nearest() -> String {
    "nearest".into()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Atlas {
    pub file: String,
    pub grid: Option<[u32; 2]>,
    pub regions: Option<String>,
}
#[derive(Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Behavior {
    pub preset: String,
    pub idle: String,
    pub moving: String,
    pub start_moving: Option<String>,
    pub stop_moving: Option<String>,
    pub turn: Option<String>,
    pub sleep: Option<String>,
    pub wake: Option<String>,
    pub idle_delay_ms: f64,
    pub sleep_after_ms: f64,
}
impl Default for Behavior {
    fn default() -> Self {
        Self {
            preset: "chase".into(),
            idle: "idle".into(),
            moving: "run".into(),
            start_moving: None,
            stop_moving: None,
            turn: None,
            sleep: None,
            wake: None,
            idle_delay_ms: 250.,
            sleep_after_ms: 12000.,
        }
    }
}
#[derive(Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Motion {
    pub max_speed: f64,
    pub acceleration: f64,
    pub stop_distance: f64,
    pub start_distance: f64,
}
impl Default for Motion {
    fn default() -> Self {
        Self {
            max_speed: 360.,
            acceleration: 1200.,
            stop_distance: 24.,
            start_distance: 40.,
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clip {
    pub frames: Vec<FrameKey>,
    pub fps: Option<f64>,
    pub durations_ms: Option<Vec<f64>>,
    #[serde(rename = "loop", default = "yes")]
    pub looped: bool,
    pub next: Option<String>,
    pub interrupt: Option<String>,
    pub flip: Option<String>,
}
fn yes() -> bool {
    true
}
#[derive(Deserialize)]
#[serde(untagged)]
pub enum FrameKey {
    Index(u32),
    Name(String),
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}
