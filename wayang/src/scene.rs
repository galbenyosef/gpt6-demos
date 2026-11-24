use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

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
                && (0.0..=0.01).contains(&self.strength)
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
            self.pose.phase = (self.pose.phase + dt / 24.).fract();
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
    // Reserve 1% pointer + 0.2% drift on either axis, and a source texel for filtering.
    let guard = 0.012 * w.min(h);
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
    let phase = pose.phase * std::f32::consts::TAU;
    let drift = if s.ambient {
        [phase.sin() * 0.2, (phase * 2.).sin() * 0.2]
    } else {
        [0.; 2]
    };
    let short = viewport[0].min(viewport[1]) as f32;
    let offset: [f32; 2] = std::array::from_fn(|i| {
        if s.motion {
            (pose.pointer[i] + drift[i]) * s.strength * short * crop.span[i]
                / viewport[i].max(1) as f32
        } else {
            0.
        }
    });
    [
        crop.center[0],
        crop.center[1],
        crop.span[0],
        crop.span[1],
        offset[0],
        offset[1],
        s.horizon,
        0.,
    ]
}
