use crate::{assets::Assets, protocol::*};
use notavirus_core::*;
use notavirus_pack::{Candidate, LoadedPack};
use serde_json::{Value, json};
use std::path::PathBuf;

pub fn input(sample: Sample, scale: f64) -> TickInput {
    let [mx, my, _, mh] = sample.monitor;
    let [wx, wy, ww, wh] = sample.work;
    TickInput {
        dt: if sample.reset || !sample.visible {
            0.
        } else {
            sample.dt.min(0.1)
        },
        cursor: Vec2::new(sample.pointer[0] - mx, my + mh - sample.pointer[1]),
        screen: ScreenGeometry {
            id: sample.monitor_id,
            visible: Rect {
                origin: Vec2::new(wx - mx, my + mh - wy - wh),
                size: Vec2::new(ww, wh),
            },
            backing_scale: sample.device_scale,
        },
        scale,
        paused: false,
    }
}
/// Safe idle scheduling hint. The core remains the sole animation/phase clock.
/// Leave room for the 17 ms Shell poll before the core's 100 ms tick cap.
pub fn quiet_for(brain: &Brain) -> f64 {
    if !matches!(brain.phase, Phase::Idle | Phase::Sleeping)
        || brain.chase_requested
        || brain.velocity != Vec2::ZERO
    {
        return 0.;
    }
    let mut elapsed = brain.player.elapsed;
    for frame in &brain.pack.clips[brain.player.clip].frames {
        if elapsed + 1e-12 < frame.duration {
            return (frame.duration - elapsed).clamp(0., 0.075);
        }
        elapsed -= frame.duration;
    }
    0.
}

pub struct Runtime {
    pub brain: Option<Brain>,
    roots: Vec<PathBuf>,
    candidates: Vec<Candidate>,
    pub assets: Assets,
    staged: Option<(u64, LoadedPack)>,
    pub generation: u64,
    next_generation: u64,
    size: f64,
    paused: bool,
    initialized: bool,
    last_seq: u64,
    last_sample: Option<Sample>,
}
impl Runtime {
    pub fn new(roots: Vec<PathBuf>, assets: Assets) -> Self {
        let candidates = notavirus_pack::discover(&roots);
        Self {
            brain: None,
            roots,
            candidates,
            assets,
            staged: None,
            generation: 0,
            next_generation: 0,
            size: 1.,
            paused: false,
            initialized: false,
            last_seq: 0,
            last_sample: None,
        }
    }
    fn stage(&mut self, id: &str, seq: u64) -> Result<Value, String> {
        if !id_valid(id) {
            return Err("Invalid pack ID".into());
        }
        let candidate = self
            .candidates
            .iter()
            .find(|p| p.id.as_deref() == Some(id) && p.failure.is_none())
            .ok_or("Pack is unavailable")?;
        let loaded = notavirus_pack::load(&candidate.path).map_err(|e| e.to_string())?;
        self.next_generation += 1;
        let generation = self.next_generation;
        let token = self
            .assets
            .stage(generation, &loaded.rgba)
            .map_err(|e| e.to_string())?;
        if let Some((old, _)) = self.staged.take() {
            self.assets.remove(old);
        }
        let message = json!({"type":"asset_ready", "seq":seq, "generation":generation, "session":self.assets.token(), "token":token, "width":loaded.width, "height":loaded.height, "bytes":loaded.rgba.len(), "id":loaded.pack.id, "name":loaded.pack.name, "filter":filter(loaded.pack.filter)});
        self.staged = Some((generation, loaded));
        Ok(message)
    }
    pub fn handle(&mut self, request: Request) -> Result<Value, String> {
        let seq = request.seq();
        if seq <= self.last_seq || seq > MAX_SEQUENCE {
            return Err("Sequence must increase within JavaScript's safe integer range".into());
        }
        self.last_seq = seq;
        if !self.initialized && !matches!(request, Request::Hello { .. }) {
            return Err("hello required".into());
        }
        let ack = || json!({"type":"ack", "seq":seq});
        match request {
            Request::Hello {
                version,
                pack,
                size,
                paused,
                ..
            } => {
                if self.initialized || version != VERSION {
                    return Err("Incompatible protocol version or duplicate hello".into());
                }
                if !size_valid(size) || !id_valid(&pack) {
                    return Err("Invalid startup preferences".into());
                }
                self.size = size;
                self.paused = paused;
                let id = if self
                    .candidates
                    .iter()
                    .any(|p| p.id.as_deref() == Some(&pack) && p.failure.is_none())
                {
                    pack.as_str()
                } else {
                    "default"
                };
                let mut result = self.stage(id, seq)?;
                result["version"] = json!(VERSION);
                result["build"] = json!(env!("CARGO_PKG_VERSION"));
                self.initialized = true;
                Ok(result)
            }
            Request::SelectPack { id, .. } => self.stage(&id, seq),
            Request::DiscardPack { generation, .. } => {
                if self.staged.as_ref().is_some_and(|p| p.0 == generation) {
                    self.staged = None;
                    self.assets.remove(generation);
                }
                Ok(ack())
            }
            Request::CommitPack { generation, .. } => {
                if !self.staged.as_ref().is_some_and(|p| p.0 == generation) {
                    return Err("Stale pack generation".into());
                }
                let (_, loaded) = self.staged.take().unwrap();
                let origin = self.brain.as_ref().map_or(Vec2::ZERO, |b| b.origin);
                let id = loaded.pack.id.clone();
                self.brain = Some(Brain::new_scaled(loaded.pack, origin, self.size));
                self.generation = generation;
                self.assets.remove(generation);
                Ok(json!({"type":"committed", "seq":seq, "generation":generation, "id":id}))
            }
            Request::Sample { sample, .. } => {
                sample.validate()?;
                let brain = self.brain.as_mut().ok_or("No committed pack")?;
                let relocated = self.last_sample.is_none_or(|s| {
                    s.monitor_generation != sample.monitor_generation
                        || s.monitor_id != sample.monitor_id
                });
                let mut tick = input(sample, self.size);
                if sample.reset || relocated {
                    brain.reset_cursor();
                    brain.velocity = Vec2::ZERO;
                    tick.dt = 0.;
                }
                if self.last_sample.is_none() {
                    brain.origin = tick.cursor - brain.pack.anchor_offset(self.size);
                }
                if self.paused || !sample.visible {
                    tick.dt = 0.;
                }
                // Zero-time tick updates geometry while preserving the paused clip.
                let frame = brain.tick(tick);
                self.last_sample = Some(sample);
                let [mx, my, _, mh] = sample.monitor;
                let uv = frame.frame.uv;
                Ok(
                    json!({"type":"frame", "seq":seq, "generation":self.generation, "monitor_generation":sample.monitor_generation, "rect":[mx+frame.panel_origin.x, my+mh-frame.panel_origin.y-frame.panel_size.y, frame.panel_size.x, frame.panel_size.y], "crop":[uv.origin.x, 1.-uv.origin.y-uv.size.y, uv.size.x, uv.size.y], "flip":frame.flip_x, "mirror_offset":brain.pack.mirror_translation(frame.scale), "filter":filter(brain.pack.filter), "phase":format!("{:?}",brain.phase), "quiet_for":quiet_for(brain)}),
                )
            }
            Request::SetSize { size, .. } => {
                if !size_valid(size) {
                    return Err("Size must be 1, 1.5 or 2".into());
                }
                self.size = size;
                Ok(ack())
            }
            Request::SetPaused { paused, .. } => {
                self.paused = paused;
                if let Some(b) = &mut self.brain {
                    b.reset_cursor();
                    b.velocity = Vec2::ZERO;
                }
                Ok(ack())
            }
            Request::ListPacks { offset, .. } => {
                let packs: Vec<_> = self.candidates.iter().skip(offset).take(24).map(|p| json!({"id":p.id,"name":p.name.chars().take(256).collect::<String>(),"error":p.failure.as_ref().map(|s| s.chars().take(256).collect::<String>())})).collect();
                let next = (offset.saturating_add(packs.len()) < self.candidates.len())
                    .then_some(offset + packs.len());
                Ok(json!({"type":"packs","seq":seq,"packs":packs,"next":next}))
            }
            Request::ReloadPacks { .. } => {
                self.candidates = notavirus_pack::discover(&self.roots);
                Ok(ack())
            }
            Request::Shutdown { .. } => Ok(ack()),
        }
    }
}
fn filter(filter: Filter) -> &'static str {
    match filter {
        Filter::Nearest => "nearest",
        Filter::Linear => "linear",
    }
}
