use crate::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Starting,
    Moving,
    Turning,
    Stopping,
    Sleeping,
    Waking,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScreenGeometry {
    pub id: u64,
    pub visible: Rect,
    pub backing_scale: f64,
}
#[derive(Clone, Copy, Debug)]
pub struct TickInput {
    pub dt: f64,
    pub cursor: Vec2,
    pub screen: ScreenGeometry,
    pub scale: f64,
    pub paused: bool,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TickOutput {
    pub panel_origin: Vec2,
    pub panel_size: Vec2,
    pub frame: Frame,
    pub flip_x: bool,
    pub screen_id: u64,
    pub scale: f64,
}
pub struct Brain {
    pub pack: Pack,
    pub player: Player,
    pub phase: Phase,
    pub origin: Vec2,
    pub velocity: Vec2,
    pub facing_left: bool,
    pub chase_requested: bool,
    pub rest: f64,
    pub arrival: f64,
    pub cursor_still: f64,
    pub cursor_speed: f64,
    pub character_speed: f64,
    pub target_distance: f64,
    last_cursor: Option<Vec2>,
    screen: Option<ScreenGeometry>,
    scale: f64,
    paused: bool,
}
impl Brain {
    pub fn new(pack: Pack, origin: Vec2) -> Self {
        Self::new_scaled(pack, origin, 1.)
    }
    pub fn new_scaled(pack: Pack, origin: Vec2, scale: f64) -> Self {
        Self {
            player: Player::new(pack.behavior.idle),
            pack,
            phase: Phase::Idle,
            origin,
            velocity: Vec2::ZERO,
            facing_left: false,
            chase_requested: false,
            rest: 0.,
            arrival: 0.,
            cursor_still: 0.,
            cursor_speed: 0.,
            character_speed: 0.,
            target_distance: 0.,
            last_cursor: None,
            screen: None,
            scale,
            paused: false,
        }
    }
    pub fn reset_cursor(&mut self) {
        self.last_cursor = None;
    }
    fn enter(&mut self, phase: Phase, clip: usize) {
        self.phase = phase;
        self.player.select(clip);
    }
    fn start(&mut self, waking: bool, target: Vec2) {
        if (target.x - self.origin.x).abs() > 2. {
            self.facing_left = target.x < self.origin.x;
        }
        let b = &self.pack.behavior;
        if waking && let Some(c) = b.wake {
            self.enter(Phase::Waking, c);
        } else if let Some(c) = b.start {
            self.enter(Phase::Starting, c);
        } else {
            self.enter(Phase::Moving, b.moving);
        }
    }
    fn stop(&mut self) {
        if let Some(c) = self.pack.behavior.stop {
            self.enter(Phase::Stopping, c);
        } else {
            self.enter(Phase::Idle, self.pack.behavior.idle);
        }
    }
    fn step(&mut self, dt: f64, target: Vec2, visible: Rect, size: Vec2) {
        let distance = (target - self.origin).length();
        if !self.chase_requested && distance >= self.pack.motion.start_distance {
            self.chase_requested = true;
            self.arrival = 0.;
        }
        if self.chase_requested {
            if distance <= self.pack.motion.stop_distance + 1e-7 {
                self.arrival += dt;
                if self.arrival + 1e-12 >= self.pack.behavior.idle_delay {
                    self.chase_requested = false;
                }
            } else {
                self.arrival = 0.;
            }
        }
        // Facing is predicted from this step's velocity; arrival wins over turning.
        let follow = matches!(self.phase, Phase::Moving | Phase::Turning);
        let predicted = if follow {
            self.next_velocity(target, dt)
        } else {
            Vec2::ZERO
        };
        let new_left = if predicted.x.abs() > 8. {
            predicted.x < 0.
        } else {
            self.facing_left
        };
        let turn = new_left != self.facing_left;
        self.facing_left = new_left;
        let oneshot = !self.pack.clips[self.player.clip].looped;
        if oneshot {
            if self.phase == Phase::Stopping
                && self.chase_requested
                && self.pack.clips[self.player.clip].interrupt == Interrupt::OnMove
            {
                self.start(false, target);
            } else if self.player.completed {
                if self.phase == Phase::Stopping {
                    if self.chase_requested {
                        self.start(false, target);
                    } else {
                        self.enter(Phase::Idle, self.pack.behavior.idle);
                    }
                } else if self.chase_requested {
                    self.enter(Phase::Moving, self.pack.behavior.moving);
                } else {
                    self.stop();
                }
            }
        } else {
            match self.phase {
                Phase::Idle | Phase::Sleeping if self.chase_requested => {
                    self.start(self.phase == Phase::Sleeping, target)
                }
                Phase::Idle
                    if self.rest >= self.pack.behavior.sleep_after
                        && self.pack.behavior.sleep.is_some() =>
                {
                    self.enter(Phase::Sleeping, self.pack.behavior.sleep.unwrap())
                }
                Phase::Moving if !self.chase_requested => self.stop(),
                Phase::Moving if turn && self.pack.behavior.turn.is_some() => {
                    self.enter(Phase::Turning, self.pack.behavior.turn.unwrap())
                }
                _ => {}
            }
        }
        let old = self.origin;
        if matches!(self.phase, Phase::Moving | Phase::Turning) {
            self.velocity = self.next_velocity(target, dt);
            if let Some(at) = stop_at_radius(
                self.origin,
                self.velocity * dt,
                target,
                self.pack.motion.stop_distance,
            ) {
                self.origin = at;
                self.velocity = Vec2::ZERO;
            } else {
                self.origin = self.origin + self.velocity * dt;
            }
            let clamped = visible.clamp(self.origin, size);
            if clamped.x != self.origin.x {
                self.velocity.x = 0.;
            }
            if clamped.y != self.origin.y {
                self.velocity.y = 0.;
            }
            self.origin = clamped;
            if self.velocity.x.abs() > 8. {
                self.facing_left = self.velocity.x < 0.;
            }
        } else {
            self.velocity = Vec2::ZERO;
        }
        self.character_speed = (self.origin - old).length() / dt;
        self.target_distance = (target - self.origin).length();
        if self.cursor_speed <= 4. {
            self.cursor_still += dt;
        } else {
            self.cursor_still = 0.;
        }
        if matches!(self.phase, Phase::Idle | Phase::Sleeping)
            && !self.chase_requested
            && self.cursor_speed <= 4.
        {
            self.rest += dt;
        } else {
            self.rest = 0.;
        }
        let interrupt = self.phase == Phase::Stopping && self.chase_requested;
        if self.player.advance(&self.pack, dt, interrupt) {
            self.start(false, target);
        }
    }
    fn next_velocity(&self, target: Vec2, dt: f64) -> Vec2 {
        let delta = target - self.origin;
        let n = delta.length();
        if n <= self.pack.motion.stop_distance + 1e-7 {
            return Vec2::ZERO;
        }
        let m = self.pack.motion;
        let speed = m
            .max_speed
            .min((2. * m.acceleration * (n - m.stop_distance)).sqrt());
        self.velocity
            .towards(delta * (speed / n), m.acceleration * dt)
    }
    pub fn tick(&mut self, input: TickInput) -> TickOutput {
        if input.paused {
            self.paused = true;
            return self.output();
        }
        if self.paused {
            self.reset_cursor();
            self.paused = false;
        }
        let scale = input
            .scale
            .clamp(0.01, 2.)
            .min(input.screen.visible.size.x / self.pack.tile.x)
            .min(input.screen.visible.size.y / self.pack.tile.y)
            .max(0.001);
        let size = self.pack.tile * scale;
        let relocated = self.screen.is_some_and(|s| s != input.screen) || scale != self.scale;
        if relocated {
            self.origin =
                self.origin + self.pack.anchor_offset(self.scale) - self.pack.anchor_offset(scale);
            if self.screen.is_some_and(|s| s.id != input.screen.id) {
                self.origin = input.cursor - self.pack.anchor_offset(scale);
            }
            self.velocity = Vec2::ZERO;
            self.reset_cursor();
            self.character_speed = 0.;
        }
        self.origin = input.screen.visible.clamp(self.origin, size);
        self.screen = Some(input.screen);
        self.scale = scale;
        let elapsed = if input.dt.is_finite() {
            input.dt.clamp(0., 0.1)
        } else {
            0.
        };
        self.cursor_speed = self
            .last_cursor
            .filter(|_| input.dt > 0.)
            .map_or(0., |p| (input.cursor - p).length() / input.dt);
        self.last_cursor = Some(input.cursor);
        let target = input
            .screen
            .visible
            .clamp(input.cursor - self.pack.anchor_offset(scale), size);
        let steps = (elapsed / (1. / 120.)).ceil() as u32;
        if steps > 0 {
            for _ in 0..steps {
                self.step(
                    elapsed / f64::from(steps),
                    target,
                    input.screen.visible,
                    size,
                );
            }
        }
        self.output()
    }
    fn output(&self) -> TickOutput {
        TickOutput {
            panel_origin: self.origin,
            panel_size: self.pack.tile * self.scale,
            frame: self.player.frame(&self.pack),
            flip_x: self.player.flipped(&self.pack, self.facing_left),
            screen_id: self.screen.map_or(0, |s| s.id),
            scale: self.scale,
        }
    }
}
