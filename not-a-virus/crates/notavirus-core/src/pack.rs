use crate::{Rect, Vec2};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlipMode {
    None,
    Velocity,
    AlwaysLeft,
    AlwaysRight,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Interrupt {
    Finish,
    OnMove,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Filter {
    Nearest,
    Linear,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    /// Bottom-left unit coordinates; converted exactly once by the loader.
    pub uv: Rect,
    pub duration: f64,
}
#[derive(Clone, Debug)]
pub struct Clip {
    pub name: String,
    pub frames: Vec<Frame>,
    pub looped: bool,
    pub next: Option<usize>,
    pub interrupt: Interrupt,
    pub flip: FlipMode,
}
impl Clip {
    pub fn duration(&self) -> f64 {
        self.frames.iter().map(|f| f.duration).sum()
    }
}
#[derive(Clone, Debug)]
pub struct Behavior {
    pub idle: usize,
    pub moving: usize,
    pub start: Option<usize>,
    pub stop: Option<usize>,
    pub turn: Option<usize>,
    pub sleep: Option<usize>,
    pub wake: Option<usize>,
    pub idle_delay: f64,
    pub sleep_after: f64,
}
#[derive(Clone, Copy, Debug)]
pub struct Motion {
    pub max_speed: f64,
    pub acceleration: f64,
    pub stop_distance: f64,
    pub start_distance: f64,
}
#[derive(Clone, Debug)]
pub struct Pack {
    pub id: String,
    pub name: String,
    pub version: u32,
    pub tile: Vec2,
    pub anchor: Vec2,
    pub filter: Filter,
    pub clips: Vec<Clip>,
    pub behavior: Behavior,
    pub motion: Motion,
}
impl Pack {
    pub fn anchor_offset(&self, scale: f64) -> Vec2 {
        Vec2::new(self.anchor.x, self.tile.y - self.anchor.y) * scale
    }
    pub fn mirror_translation(&self, scale: f64) -> f64 {
        (2. * self.anchor.x - self.tile.x) * scale
    }
}
