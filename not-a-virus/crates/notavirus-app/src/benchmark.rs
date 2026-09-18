//! Opt-in native release benchmark. Never compiled into the application binary.
use super::*;
use notavirus_core::{Phase, Vec2};
use objc2::{AllocAnyThread, rc::autoreleasepool};
use objc2_foundation::{NSDate, NSRunLoop, NSUserDefaults};
use std::time::Duration;

fn usage() -> libc::rusage {
    let mut value = std::mem::MaybeUninit::uninit();
    // SAFETY: getrusage initializes the supplied structure on success.
    assert_eq!(
        unsafe { libc::getrusage(libc::RUSAGE_SELF, value.as_mut_ptr()) },
        0
    );
    unsafe { value.assume_init() }
}

fn cpu_seconds(value: &libc::rusage) -> f64 {
    value.ru_utime.tv_sec as f64
        + value.ru_stime.tv_sec as f64
        + (value.ru_utime.tv_usec + value.ru_stime.tv_usec) as f64 / 1_000_000.
}

fn pump(seconds: f64) {
    let until = Instant::now() + Duration::from_secs_f64(seconds);
    while Instant::now() < until {
        autoreleasepool(|_| {
            NSRunLoop::mainRunLoop().runUntilDate(&NSDate::dateWithTimeIntervalSinceNow(0.1));
        });
    }
}

pub fn idle(mtm: MainThreadMarker, root: PathBuf) {
    if cfg!(debug_assertions) {
        panic!("benchmark must use --release");
    }
    let native = NSApplication::sharedApplication(mtm);
    native.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    native.finishLaunching();
    let suite = NSString::from_str(&format!("app.notavirus.benchmark.{}", std::process::id()));
    let defaults =
        NSUserDefaults::initWithSuiteName(NSUserDefaults::alloc(), Some(&suite)).unwrap();
    defaults.removePersistentDomainForName(&suite);
    let delegate = Delegate::new(mtm);
    let mut app = App::with_options(
        &delegate,
        Preferences::from_defaults(defaults.clone()),
        vec![root],
    )
    .unwrap();
    let (_, screen) = app
        .cursor
        .sample(mtm)
        .expect("benchmark needs a connected display");
    let target = screen.visible.origin + screen.visible.size * 0.5;
    app.benchmark_input = Some((target, screen));
    app.brain = Brain::new_scaled(
        app.brain.pack.clone(),
        target - app.brain.pack.anchor_offset(1.),
        1.,
    );
    app.render_geometry(mtm);
    app.panel.orderFrontRegardless();
    let origin = app.brain.origin;
    *delegate.ivars().state.borrow_mut() = Some(app);
    delegate.menu();
    delegate.start_clock();
    let clock = match delegate
        .ivars()
        .state
        .borrow()
        .as_ref()
        .unwrap()
        .clock
        .as_ref()
        .unwrap()
    {
        Clock::Display(_) => "CADisplayLink",
        Clock::Timer(_) => "NSTimer",
    };
    pump(3.);
    let ticks_before = delegate.ivars().state.borrow().as_ref().unwrap().ticks;
    let before = usage();
    let started = Instant::now();
    pump(15.);
    let elapsed = started.elapsed().as_secs_f64();
    let after = usage();
    let cpu = (cpu_seconds(&after) - cpu_seconds(&before)) / elapsed * 100.;
    // On Darwin ru_maxrss is bytes, and measures the process high-water mark.
    let peak_rss_mb = after.ru_maxrss as f64 / 1_000_000.;
    let state = delegate.ivars().state.borrow();
    let app = state.as_ref().unwrap();
    let ticks = app.ticks - ticks_before;
    let hz = ticks as f64 / elapsed;
    assert_eq!(app.brain.origin, origin, "idle benchmark moved");
    assert_eq!(app.brain.velocity, Vec2::ZERO);
    assert!(matches!(app.brain.phase, Phase::Idle | Phase::Sleeping));
    println!(
        "idle benchmark: clock={clock}, seconds={elapsed:.3}, ticks={ticks}, hz={hz:.2}, cpu_percent={cpu:.3}, peak_rss_mb={peak_rss_mb:.2}, pack={}, tile={}x{}, scale=1, backing_scale={}",
        app.brain.pack.id, app.brain.pack.tile.x, app.brain.pack.tile.y, screen.backing_scale
    );
    drop(state);
    delegate.cleanup();
    defaults.removePersistentDomainForName(&suite);
    assert!(
        (55. ..=65.).contains(&hz),
        "benchmark did not maintain 60 Hz"
    );
    assert!(cpu < 1., "idle CPU exceeded the <1% target");
    assert!(peak_rss_mb < 80., "peak RSS exceeded the <80 MB target");
}
