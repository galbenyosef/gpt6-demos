//! Global positions are AppKit screen points, never atlas pixels.
use std::ops::{Add, Div, Mul, Sub};
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}
impl Vec2 {
    pub const ZERO: Self = Self { x: 0., y: 0. };
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    pub fn length(self) -> f64 {
        self.x.hypot(self.y)
    }
    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y
    }
    pub fn towards(self, target: Self, delta: f64) -> Self {
        let gap = target - self;
        let n = gap.length();
        if n <= delta || n == 0. {
            target
        } else {
            self + gap * (delta / n)
        }
    }
}
impl Add for Vec2 {
    type Output = Self;
    fn add(self, b: Self) -> Self {
        Self::new(self.x + b.x, self.y + b.y)
    }
}
impl Sub for Vec2 {
    type Output = Self;
    fn sub(self, b: Self) -> Self {
        Self::new(self.x - b.x, self.y - b.y)
    }
}
impl Mul<f64> for Vec2 {
    type Output = Self;
    fn mul(self, b: f64) -> Self {
        Self::new(self.x * b, self.y * b)
    }
}
impl Div<f64> for Vec2 {
    type Output = Self;
    fn div(self, b: f64) -> Self {
        self * (1. / b)
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub origin: Vec2,
    pub size: Vec2,
}
impl Rect {
    pub fn clamp(self, p: Vec2, size: Vec2) -> Vec2 {
        Vec2::new(
            p.x.clamp(
                self.origin.x,
                self.origin.x + (self.size.x - size.x).max(0.),
            ),
            p.y.clamp(
                self.origin.y,
                self.origin.y + (self.size.y - size.y).max(0.),
            ),
        )
    }
}
/// First segment/circle intersection, including exact radius-zero arrival.
pub fn stop_at_radius(origin: Vec2, delta: Vec2, target: Vec2, radius: f64) -> Option<Vec2> {
    let offset = origin - target;
    let a = delta.dot(delta);
    if a == 0. {
        return None;
    }
    let b = 2. * offset.dot(delta);
    let c = offset.dot(offset) - radius * radius;
    let disc = b * b - 4. * a * c;
    if disc < -1e-9 {
        return None;
    }
    let t = (-b - disc.max(0.).sqrt()) / (2. * a);
    if (0. ..=1.).contains(&t) {
        Some(origin + delta * t)
    } else {
        None
    }
}
