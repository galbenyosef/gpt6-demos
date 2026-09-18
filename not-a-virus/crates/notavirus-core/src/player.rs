use crate::{FlipMode, Frame, Interrupt, Pack};
#[derive(Clone, Debug)]
pub struct Player {
    pub clip: usize,
    pub elapsed: f64,
    pub completed: bool,
}
impl Player {
    pub fn new(clip: usize) -> Self {
        Self {
            clip,
            elapsed: 0.,
            completed: false,
        }
    }
    pub fn select(&mut self, clip: usize) {
        *self = Self::new(clip);
    }
    /// Carries time across frames and sequence edges. A pending stop interruption
    /// is checked at every edge, before any time is spent in the next clip.
    pub fn advance(&mut self, pack: &Pack, dt: f64, interrupt_stop: bool) -> bool {
        if self.completed {
            return false;
        }
        self.elapsed += dt;
        loop {
            let clip = &pack.clips[self.clip];
            if interrupt_stop && clip.interrupt == Interrupt::OnMove {
                return true;
            }
            let duration = clip.duration();
            if clip.looped {
                self.elapsed = self.elapsed.rem_euclid(duration);
                return false;
            }
            if self.elapsed + 1e-12 < duration {
                return false;
            }
            if let Some(next) = clip.next {
                self.elapsed = (self.elapsed - duration).max(0.);
                self.clip = next;
            } else {
                self.elapsed = duration;
                self.completed = true;
                return false;
            }
        }
    }
    pub fn frame(&self, pack: &Pack) -> Frame {
        let frames = &pack.clips[self.clip].frames;
        let mut time = self.elapsed;
        for frame in frames {
            if time + 1e-12 < frame.duration {
                return *frame;
            }
            time -= frame.duration;
        }
        *frames.last().expect("validated nonempty clip")
    }
    pub fn flipped(&self, pack: &Pack, left: bool) -> bool {
        match pack.clips[self.clip].flip {
            FlipMode::AlwaysLeft => true,
            FlipMode::Velocity => left,
            _ => false,
        }
    }
}
