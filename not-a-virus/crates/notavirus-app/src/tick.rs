use objc2::{rc::Retained, runtime::AnyObject, sel};
use objc2_app_kit::NSPanel;
use objc2_foundation::{NSObjectProtocol, NSRunLoop, NSRunLoopCommonModes, NSTimer};
use objc2_quartz_core::CADisplayLink;
pub enum Clock {
    Display(Retained<CADisplayLink>),
    Timer(Retained<NSTimer>),
}
impl Clock {
    /// AppKit's window display link follows the window's display and delivers on
    /// this run loop. Runtime availability preserves the macOS 13 timer fallback.
    pub fn start(panel: &NSPanel, target: &AnyObject) -> Self {
        unsafe {
            if panel.respondsToSelector(sel!(displayLinkWithTarget:selector:)) {
                let link = panel.displayLinkWithTarget_selector(target, sel!(tick:));
                link.setPreferredFrameRateRange(objc2_quartz_core::CAFrameRateRange {
                    minimum: 60.,
                    maximum: 60.,
                    preferred: 60.,
                });
                link.addToRunLoop_forMode(&NSRunLoop::mainRunLoop(), NSRunLoopCommonModes);
                Self::Display(link)
            } else {
                let timer = NSTimer::timerWithTimeInterval_target_selector_userInfo_repeats(
                    1. / 60.,
                    target,
                    sel!(tick:),
                    None,
                    true,
                );
                NSRunLoop::mainRunLoop().addTimer_forMode(&timer, NSRunLoopCommonModes);
                Self::Timer(timer)
            }
        }
    }
}
impl Drop for Clock {
    fn drop(&mut self) {
        match self {
            Self::Display(v) => v.invalidate(),
            Self::Timer(v) => v.invalidate(),
        }
    }
}
