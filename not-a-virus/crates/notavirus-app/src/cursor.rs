use block2::RcBlock;
use notavirus_core::{Rect, ScreenGeometry, Vec2};
use objc2::{rc::Retained, runtime::AnyObject};
use objc2_app_kit::{NSEvent, NSEventMask, NSScreen};
use objc2_foundation::{MainThreadMarker, NSNumber, ns_string};
use std::ptr::NonNull;
/// AppKit screen dictionaries are surprisingly expensive. Cache plain geometry,
/// invalidate on display-change notifications, and refresh visibleFrame once per
/// second for Dock/menu-bar changes. Pointer/display selection still runs each tick.
pub struct Tracker {
    screens: Vec<(Rect, ScreenGeometry)>,
    refreshed: std::time::Instant,
}
impl Tracker {
    pub fn new(mtm: MainThreadMarker) -> Self {
        let mut this = Self {
            screens: Vec::new(),
            refreshed: std::time::Instant::now(),
        };
        this.refresh(mtm);
        this
    }
    pub fn refresh(&mut self, mtm: MainThreadMarker) {
        self.screens.clear();
        for screen in NSScreen::screens(mtm).iter() {
            let f = screen.frame();
            let r = screen.visibleFrame();
            let id = screen
                .deviceDescription()
                .objectForKey(ns_string!("NSScreenNumber"))
                .and_then(|n| n.downcast::<NSNumber>().ok())
                .map_or(0, |n| n.unsignedLongLongValue());
            self.screens.push((
                Rect {
                    origin: Vec2::new(f.origin.x, f.origin.y),
                    size: Vec2::new(f.size.width, f.size.height),
                },
                ScreenGeometry {
                    id,
                    visible: Rect {
                        origin: Vec2::new(r.origin.x, r.origin.y),
                        size: Vec2::new(r.size.width, r.size.height),
                    },
                    backing_scale: screen.backingScaleFactor(),
                },
            ));
        }
        self.refreshed = std::time::Instant::now();
    }
    pub fn sample(&mut self, mtm: MainThreadMarker) -> Option<(Vec2, ScreenGeometry)> {
        if self.refreshed.elapsed().as_secs_f64() >= 1. {
            self.refresh(mtm);
        }
        let p = NSEvent::mouseLocation();
        let p = Vec2::new(p.x, p.y);
        self.screens
            .iter()
            .find(|(r, _)| {
                p.x >= r.origin.x
                    && p.x < r.origin.x + r.size.x
                    && p.y >= r.origin.y
                    && p.y < r.origin.y + r.size.y
            })
            .or_else(|| self.screens.first())
            .map(|(_, s)| (p, *s))
    }
}
pub fn sample(mtm: MainThreadMarker) -> Option<(Vec2, ScreenGeometry)> {
    Tracker::new(mtm).sample(mtm)
}
pub struct Monitors(Vec<Retained<AnyObject>>);
impl Monitors {
    pub fn new() -> Self {
        let mask = NSEventMask::MouseMoved
            | NSEventMask::LeftMouseDragged
            | NSEventMask::RightMouseDragged
            | NSEventMask::OtherMouseDragged;
        // Monitors sample the cursor without consuming/modifying events. The tick
        // polls too, including while the pointer is stationary or this app is active.
        let global = RcBlock::new(|_: NonNull<NSEvent>| {
            let _ = NSEvent::mouseLocation();
        });
        let local = RcBlock::new(|e: NonNull<NSEvent>| {
            let _ = NSEvent::mouseLocation();
            e.as_ptr()
        });
        Self(
            [
                NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &global),
                unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &local) },
            ]
            .into_iter()
            .flatten()
            .collect(),
        )
    }
}
impl Drop for Monitors {
    fn drop(&mut self) {
        for monitor in &self.0 {
            unsafe {
                NSEvent::removeMonitor(monitor);
            }
        }
    }
}
