use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

pub const MAX_STRENGTH: f32 = 0.01;
const LOOP_SECONDS: f32 = 12.;
// Gains relative to the stored pointer strength. At the default, the camera
// travels 0.45% of the short edge and the nearest objects travel another 0.65%.
const CAMERA_GAIN: [f32; 2] = [0.9, 0.4];
const FOREGROUND_GAIN: [f32; 2] = [1.3, 0.5];

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    pub depth_version: u8,
    pub focal: [f32; 2],
    pub horizon: f32,
    /// Fraction of the short edge at full pointer deflection.
    pub strength: f32,
    pub ambient: bool,
    pub motion: bool,
    #[serde(default)]
    pub held_pose: Option<Pose>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            depth_version: 1,
            focal: [0.5; 2],
            horizon: 0.4,
            strength: 0.005,
            ambient: true,
            motion: true,
            held_pose: None,
        }
    }
}
impl Settings {
    pub fn validate(self) -> Result<()> {
        ensure!(
            self.depth_version == 1
                && (0.0..=0.99).contains(&self.horizon)
                && (0.0..=MAX_STRENGTH).contains(&self.strength)
                && self
                    .held_pose
                    .is_none_or(|p| p.pointer.iter().all(|v| (-1.0..=1.).contains(v))
                        && (0.0..=1.).contains(&p.phase))
                && self.focal.iter().all(|v| (0.0..=1.).contains(v)),
            "Unsupported depth or framing settings"
        );
        Ok(())
    }
}

#[derive(Clone, Copy, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct Pose {
    pub pointer: [f32; 2],
    pub phase: f32,
}

#[derive(Default)]
pub struct Motion {
    pub pose: Pose,
}
impl Motion {
    pub fn step(
        &mut self,
        s: Settings,
        target: [f32; 2],
        dt: f32,
        paused: bool,
        reduced: bool,
    ) -> bool {
        if !s.motion || s.strength == 0. || reduced {
            self.pose = Pose::default();
            return false;
        }
        if let Some(pose) = s.held_pose {
            self.pose = pose;
            return false;
        }
        if paused {
            return false;
        }
        let dt = dt.clamp(0., 0.1);
        let k = 1. - (-dt / 0.25).exp();
        let mut moving = false;
        for (axis, dest) in self.pose.pointer.iter_mut().zip(target) {
            let dest = dest.clamp(-1., 1.);
            *axis += (dest - *axis) * k;
            if (dest - *axis).abs() < 0.0001 {
                *axis = dest;
            } else {
                moving = true;
            }
        }
        if s.ambient {
            self.pose.phase = (self.pose.phase + dt / LOOP_SECONDS).fract();
        }
        moving || s.ambient
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Crop {
    pub center: [f32; 2],
    pub span: [f32; 2],
    pub bounds: [f32; 2],
}
pub fn crop(image: [u32; 2], viewport: [u32; 2], focal: [f32; 2]) -> Crop {
    let [w, h] = viewport.map(|v| v.max(1) as f32);
    let [iw, ih] = image.map(|v| v.max(1) as f32);
    // Keep the same crop in Still and Motion, including at maximum pointer reach.
    let max_travel = MAX_STRENGTH * (1. + CAMERA_GAIN[0] + FOREGROUND_GAIN[0]);
    let guard = max_travel * w.min(h);
    let scale = ((w + 2. * guard) / (iw - 1.).max(1.)).max((h + 2. * guard) / (ih - 1.).max(1.));
    let span = [w / (scale * iw), h / (scale * ih)];
    let bounds = [
        ((0.5 * w + guard) / scale + 0.5) / iw,
        ((0.5 * h + guard) / scale + 0.5) / ih,
    ]
    .map(|v| v.min(0.5));
    let center = std::array::from_fn(|i| focal[i].clamp(bounds[i], 1. - bounds[i]));
    Crop {
        center,
        span,
        bounds,
    }
}
pub fn uniforms(image: [u32; 2], viewport: [u32; 2], s: Settings, pose: Pose) -> [f32; 8] {
    let crop = crop(image, viewport, s.focal);
    let phase = if s.ambient {
        pose.phase * std::f32::consts::TAU
    } else {
        0.
    };
    let sway = phase.sin();
    let foreground_wave = [sway, (2. * phase).sin()];
    let short = viewport[0].min(viewport[1]) as f32;
    let strength = if s.motion { s.strength } else { 0. };
    let mut center = crop.center;
    let mut offset = [0.; 2];
    for i in 0..2 {
        let unit = strength * short * crop.span[i] / viewport[i].max(1) as f32;
        center[i] += unit * CAMERA_GAIN[i] * sway;
        offset[i] = unit * (pose.pointer[i] + FOREGROUND_GAIN[i] * foreground_wave[i]);
    }
    [
        center[0],
        center[1],
        crop.span[0],
        crop.span[1],
        offset[0],
        offset[1],
        s.horizon,
        0.,
    ]
}
