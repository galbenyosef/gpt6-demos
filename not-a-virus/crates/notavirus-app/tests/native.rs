//! Main-thread AppKit integration checks; no event injection or other-app inspection.
#[cfg(target_os = "macos")]
#[path = "../src/app.rs"]
#[allow(dead_code)]
mod app;
#[cfg(target_os = "macos")]
#[path = "../src/bridge.rs"]
mod bridge;
#[cfg(target_os = "macos")]
#[path = "support/capture.rs"]
mod capture;
#[cfg(target_os = "macos")]
#[path = "../src/cursor.rs"]
mod cursor;
#[cfg(target_os = "macos")]
#[path = "../src/panel.rs"]
mod panel;
#[cfg(target_os = "macos")]
#[path = "../src/preferences.rs"]
mod preferences;
#[cfg(target_os = "macos")]
#[path = "../src/status.rs"]
mod status;
#[cfg(target_os = "macos")]
#[path = "../src/tick.rs"]
mod tick;
#[cfg(target_os = "macos")]
fn main() {
    use notavirus_core::*;
    use objc2_app_kit::*;
    use objc2_foundation::MainThreadMarker;
    let mtm = MainThreadMarker::new().unwrap();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../resources/packs");
    if std::env::args().any(|arg| arg == "--benchmark") {
        app::benchmark::idle(mtm, root);
        return;
    }
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    let panel = panel::create(mtm);
    assert_eq!(
        app.activationPolicy(),
        NSApplicationActivationPolicy::Accessory
    );
    assert!(!panel.isOpaque());
    assert!(!panel.hasShadow());
    assert!(panel.ignoresMouseEvents());
    assert!(!panel.hidesOnDeactivate());
    assert!(panel.isFloatingPanel());
    assert!(panel.becomesKeyOnlyIfNeeded());
    assert!(!panel.isMovableByWindowBackground());
    assert_eq!(panel.level(), NSFloatingWindowLevel);
    assert!(
        panel
            .styleMask()
            .contains(NSWindowStyleMask::NonactivatingPanel)
    );
    assert!(panel.collectionBehavior().contains(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
    ));
    capture::paco(
        &panel,
        &root,
        std::env::args().any(|arg| arg == "--capture"),
    );
    for id in ["default", "paco", "gatita"] {
        let mut loaded = notavirus_pack::load(&root.join(id)).unwrap();
        let renderer = bridge::Renderer::prepare(&mut loaded).unwrap();
        renderer.attach(&panel);
        let mut brain = Brain::new(loaded.pack, Vec2::new(100., 100.));
        for scale in [1., 1.5, 2.] {
            let screen = ScreenGeometry {
                id: 1,
                visible: Rect {
                    origin: Vec2::ZERO,
                    size: Vec2::new(1600., 1000.),
                },
                backing_scale: 2.,
            };
            let out = brain.tick(TickInput {
                dt: 0.,
                cursor: Vec2::new(800., 800.),
                screen,
                scale,
                paused: false,
            });
            renderer.apply(&panel, &brain.pack, out, 2.);
            assert_eq!(panel.frame().size.width, 128. * scale);
            assert_eq!(renderer.layer.contentsScale(), 2.);
            let rect = renderer.layer.contentsRect();
            assert_eq!(rect.origin.y, out.frame.uv.origin.y);
            let mut flipped = out;
            flipped.flip_x = true;
            renderer.apply(&panel, &brain.pack, flipped, 2.);
            assert_eq!(renderer.layer.affineTransform().a, -1.);
            // A failed load cannot mutate the already prepared native resource.
            assert!(notavirus_pack::load(&root.join("absent")).is_err());
            assert!(unsafe { renderer.layer.contents() }.is_some());
        }
    }
    app::verify_controls(mtm, root);
    println!(
        "native: accessory policy, all panel flags, three pack images, 1×/1.5×/2× size, Retina scale, frame UVs, mirroring and failed-load resource preservation passed"
    );
}
#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native checks require macOS; portable tests run separately.");
}
