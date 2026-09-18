use super::{
    bridge::Renderer,
    cursor::{self, Monitors, Tracker},
    panel,
    preferences::Preferences,
    status,
    tick::Clock,
};
use notavirus_core::{Brain, TickInput};
use notavirus_pack::{self as packs, Candidate};
use objc2::{
    DefinedClass, MainThreadOnly, define_class, msg_send, rc::Retained, runtime::ProtocolObject,
};
use objc2_app_kit::*;
use objc2_foundation::{
    MainThreadMarker, NSBundle, NSHomeDirectory, NSNotification, NSObject, NSObjectProtocol,
    NSString, NSURL, ns_string,
};
use std::{cell::RefCell, path::PathBuf, time::Instant};
pub struct App {
    panel: Retained<NSPanel>,
    status: Retained<NSStatusItem>,
    renderer: Renderer,
    brain: Brain,
    preferences: Preferences,
    clock: Option<Clock>,
    monitors: Option<Monitors>,
    cursor: Tracker,
    last: Instant,
    roots: Vec<PathBuf>,
    packs: Vec<Candidate>,
    failure: Option<String>,
    #[cfg(test)]
    benchmark_input: Option<(notavirus_core::Vec2, notavirus_core::ScreenGeometry)>,
    #[cfg(test)]
    ticks: u64,
}
#[derive(Default)]
pub struct Ivars {
    state: RefCell<Option<App>>,
}
define_class!(
    #[unsafe(super=NSObject)]
    #[thread_kind=MainThreadOnly]
    #[ivars=Ivars]
    pub struct Delegate;
    unsafe impl NSObjectProtocol for Delegate {}
    unsafe impl NSApplicationDelegate for Delegate {
        #[unsafe(method(applicationDidFinishLaunching:))]
        fn launched(&self, _: &NSNotification) {
            match App::new(self) {
                Ok(app) => {
                    *self.ivars().state.borrow_mut() = Some(app);
                    self.menu();
                    self.start_clock();
                    tracing::info!("NotAVirus launched");
                }
                Err(e) => {
                    tracing::error!(%e,"startup failed");
                    let alert = NSAlert::new(self.mtm());
                    alert.setMessageText(ns_string!("NotAVirus could not load its default pack."));
                    alert.setInformativeText(&NSString::from_str(&e));
                    alert.runModal();
                    NSApplication::sharedApplication(self.mtm()).terminate(None);
                }
            }
        }
        #[unsafe(method(applicationShouldHandleReopen:hasVisibleWindows:))]
        fn reopen(&self, _: &NSApplication, _: bool) -> bool {
            self.show_menu();
            false
        }
        #[unsafe(method(applicationDidChangeScreenParameters:))]
        fn screens_changed(&self, _: &NSNotification) {
            if let Some(app) = self.ivars().state.borrow_mut().as_mut() { app.cursor.refresh(self.mtm()); app.render_geometry(self.mtm()); }
        }
        #[unsafe(method(applicationWillTerminate:))]
        fn terminating(&self, _: &NSNotification) {
            self.cleanup();
        }
    }
    impl Delegate {
        #[unsafe(method(tick:))]
        fn tick(&self, _: &NSObject) {
            if let Some(app) = self.ivars().state.borrow_mut().as_mut() {
                app.tick(self.mtm());
            }
        }
        #[unsafe(method(pause:))]
        fn pause(&self, _: &NSMenuItem) {
            if let Some(app) = self.ivars().state.borrow_mut().as_mut() {
                app.preferences.paused = !app.preferences.paused;
                app.preferences.save();
                app.clock.take();
                app.brain.reset_cursor();
            }
            self.start_clock();
            self.menu();
        }
        #[unsafe(method(size:))]
        fn size(&self, sender: &NSMenuItem) {
            if let Some(app) = self.ivars().state.borrow_mut().as_mut()
                && let Some(scale) = [1., 1.5, 2.].get(sender.tag() as usize)
            {
                app.preferences.scale = *scale;
                app.preferences.save();
                // Apply geometry while paused without advancing either clock.
                app.render_geometry(self.mtm());
            }
            self.menu();
        }
        #[unsafe(method(selectPack:))]
        fn select_pack(&self, sender: &NSMenuItem) {
            if let Some(app) = self.ivars().state.borrow_mut().as_mut()
                && let Some(path) = app.packs.get(sender.tag() as usize).map(|p| p.path.clone())
            {
                match app.switch(&path, self.mtm()) {
                    Ok(()) => app.failure = None,
                    Err(e) => {
                        tracing::error!(%e,"pack switch failed");
                        app.failure = Some(e);
                    }
                }
            }
            self.menu();
        }
        #[unsafe(method(openPacks:))]
        fn open_packs(&self, _: &NSMenuItem) {
            if let Some(app) = self.ivars().state.borrow().as_ref() {
                let path = &app.roots[1];
                if let Err(e) = std::fs::create_dir_all(path) {
                    tracing::error!(%e,"cannot create packs folder");
                    return;
                }
                NSWorkspace::sharedWorkspace().openURL(&NSURL::fileURLWithPath(&NSString::from_str(
                    &path.to_string_lossy(),
                )));
            }
        }
        #[unsafe(method(importPack:))]
        fn import_pack(&self, _: &NSMenuItem) {
            let chooser = NSOpenPanel::openPanel(self.mtm());
            chooser.setCanChooseFiles(true);
            chooser.setCanChooseDirectories(false);
            chooser.setAllowsMultipleSelection(false);
            chooser.setTitle(Some(ns_string!("Import .petpack")));
            #[allow(deprecated)]
            {
                chooser.setAllowedFileTypes(Some(&objc2_foundation::NSArray::from_slice(&[
                    ns_string!("petpack"),
                ])));
            }
            // Do not hold a RefCell borrow across an AppKit modal event loop.
            if chooser.runModal() != NSModalResponseOK {
                return;
            }
            if let Some(path) = chooser.URL().and_then(|u| u.path()) {
                self.import_path(&PathBuf::from(path.to_string()));
            }
        }
        #[unsafe(method(about:))]
        fn about(&self, _: &NSMenuItem) {
            let alert = NSAlert::new(self.mtm());
            alert.setMessageText(ns_string!("NotAVirus"));
            alert.setInformativeText(ns_string!("It follows the mouse.\nThat is the entire product.\n\nv0.1 · Paco and gatita\nMenu bar sprite. No network. No permissions."));
            alert.runModal();
        }
        #[unsafe(method(quit:))]
        fn quit(&self, _: &NSMenuItem) {
            self.cleanup();
            NSApplication::sharedApplication(self.mtm()).terminate(None);
        }
    }
);
impl Delegate {
    pub fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Ivars::default());
        unsafe { msg_send![super(this), init] }
    }
    // Shared by the file chooser and native acceptance checks. The chooser itself
    // remains a manual desktop check; installation and menu state use this path.
    fn import_path(&self, archive: &std::path::Path) {
        if let Some(app) = self.ivars().state.borrow_mut().as_mut() {
            let ids = app
                .packs
                .iter()
                .filter_map(|p| p.id.clone())
                .collect::<Vec<_>>();
            let result = packs::install(archive, &app.roots[1], &ids)
                .map_err(|e| e.to_string())
                .and_then(|path| {
                    app.packs = packs::discover(&app.roots);
                    app.switch(&path, self.mtm())
                });
            app.failure = result.err();
            if let Some(error) = &app.failure {
                tracing::error!(%error, "pack import failed");
            }
        }
        self.menu();
    }
    fn show_menu(&self) {
        // Menu tracking runs a nested event loop; release the borrow before it.
        let button = self
            .ivars()
            .state
            .borrow()
            .as_ref()
            .and_then(|app| app.status.button(self.mtm()));
        if let Some(button) = button {
            unsafe {
                button.performClick(None);
            }
        }
    }
    fn menu(&self) {
        if let Some(app) = self.ivars().state.borrow().as_ref() {
            status::rebuild(
                &app.status,
                self,
                app.preferences.paused,
                app.preferences.scale,
                &app.preferences.active,
                &app.packs,
                app.failure.as_deref(),
            );
        }
    }
    fn start_clock(&self) {
        if let Some(app) = self.ivars().state.borrow_mut().as_mut()
            && !app.preferences.paused
        {
            app.last = Instant::now();
            app.clock = Some(Clock::start(&app.panel, self));
        }
    }
    fn cleanup(&self) {
        if let Some(mut app) = self.ivars().state.borrow_mut().take() {
            app.clock.take();
            app.monitors.take();
            app.panel.orderOut(None);
            NSStatusBar::systemStatusBar().removeStatusItem(&app.status);
            tracing::info!("NotAVirus quit");
        }
    }
}
impl App {
    fn new(delegate: &Delegate) -> Result<Self, String> {
        let preferences = Preferences::load();
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        let bundled = NSBundle::mainBundle()
            .resourcePath()
            .map(|s| PathBuf::from(s.to_string()))
            .map(|p| p.join("packs"))
            .filter(|p| p.is_dir());
        // cargo run: locate resources relative to target/{debug,release}/binary.
        let development = executable
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .map(|p| p.join("resources/packs"));
        let root = bundled
            .or(development.filter(|p| p.is_dir()))
            .ok_or("cannot locate bundled packs")?;
        let roots = vec![
            root,
            PathBuf::from(NSHomeDirectory().to_string())
                .join("Library/Application Support/NotAVirus/packs"),
        ];
        let app = Self::with_options(delegate, preferences, roots)?;
        app.panel.orderFrontRegardless();
        Ok(app)
    }
    fn with_options(
        delegate: &Delegate,
        mut preferences: Preferences,
        roots: Vec<PathBuf>,
    ) -> Result<Self, String> {
        let mtm = delegate.mtm();
        let candidates = packs::discover(&roots);
        for candidate in &candidates {
            if let Some(e) = &candidate.failure {
                tracing::warn!(path=%candidate.path.display(),error=%e,"invalid pack");
            }
        }
        let selected = candidates
            .iter()
            .find(|p| p.id.as_deref() == Some(&preferences.active) && p.failure.is_none())
            .or_else(|| {
                candidates
                    .iter()
                    .find(|p| p.id.as_deref() == Some("default") && p.failure.is_none())
            })
            .ok_or("bundled default pack is missing or invalid")?;
        let mut loaded = packs::load(&selected.path).map_err(|e| e.to_string())?;
        let renderer = Renderer::prepare(&mut loaded)?;
        preferences.active = loaded.pack.id.clone();
        preferences.save();
        let (cursor, _) = cursor::sample(mtm).ok_or("no displays available")?;
        let origin = cursor - loaded.pack.anchor_offset(preferences.scale);
        let brain = Brain::new_scaled(loaded.pack, origin, preferences.scale);
        let panel = panel::create(mtm);
        renderer.attach(&panel);
        let mut app = Self {
            panel,
            status: status::create(mtm),
            renderer,
            brain,
            preferences,
            clock: None,
            monitors: Some(Monitors::new()),
            cursor: Tracker::new(mtm),
            last: Instant::now(),
            roots,
            packs: candidates,
            failure: None,
            #[cfg(test)]
            benchmark_input: None,
            #[cfg(test)]
            ticks: 0,
        };
        app.render_geometry(mtm);
        Ok(app)
    }
    fn switch(&mut self, path: &std::path::Path, mtm: MainThreadMarker) -> Result<(), String> {
        let mut loaded = packs::load(path).map_err(|e| e.to_string())?;
        let renderer = Renderer::prepare(&mut loaded)?; // Prepare everything before commit.
        let anchor = self.brain.origin + self.brain.pack.anchor_offset(self.preferences.scale);
        let origin = anchor - loaded.pack.anchor_offset(self.preferences.scale);
        let brain = Brain::new_scaled(loaded.pack, origin, self.preferences.scale);
        self.preferences.active = brain.pack.id.clone();
        self.brain = brain;
        self.renderer = renderer;
        self.renderer.attach(&self.panel);
        self.preferences.save();
        self.last = Instant::now();
        self.render_geometry(mtm);
        Ok(())
    }
    fn render_geometry(&mut self, mtm: MainThreadMarker) {
        if let Some((cursor, screen)) = self.sample(mtm) {
            let out = self.brain.tick(TickInput {
                dt: 0.,
                cursor,
                screen,
                scale: self.preferences.scale,
                paused: false,
            });
            self.renderer
                .apply(&self.panel, &self.brain.pack, out, screen.backing_scale);
        }
    }
    fn tick(&mut self, mtm: MainThreadMarker) {
        #[cfg(test)]
        {
            self.ticks += 1;
        }
        let now = Instant::now();
        let dt = now.duration_since(self.last).as_secs_f64();
        self.last = now;
        if let Some((cursor, screen)) = self.sample(mtm) {
            let out = self.brain.tick(TickInput {
                dt,
                cursor,
                screen,
                scale: self.preferences.scale,
                paused: self.preferences.paused,
            });
            self.renderer
                .apply(&self.panel, &self.brain.pack, out, screen.backing_scale);
        }
    }
    fn sample(
        &mut self,
        mtm: MainThreadMarker,
    ) -> Option<(notavirus_core::Vec2, notavirus_core::ScreenGeometry)> {
        // Benchmarks still pay for the production cursor poll and screen cache.
        let sampled = self.cursor.sample(mtm);
        #[cfg(test)]
        if let Some(input) = self.benchmark_input {
            return Some(input);
        }
        sampled
    }
}

#[cfg(test)]
#[allow(dead_code)] // Invoked by the native integration executable, not the binary test target.
#[path = "benchmark.rs"]
pub mod benchmark;
pub fn run() {
    let mtm = MainThreadMarker::new().expect("main thread");
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    let instances = NSRunningApplication::runningApplicationsWithBundleIdentifier(ns_string!(
        "app.notavirus.NotAVirus"
    ));
    for other in instances.iter() {
        if other.processIdentifier() != std::process::id() as i32 {
            if let Some(url) = other.bundleURL() {
                NSWorkspace::sharedWorkspace().openURL(&url);
            }
            return;
        }
    }
    let delegate = Delegate::new(mtm);
    app.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    app.run();
}

#[cfg(test)]
#[allow(dead_code)]
pub fn verify_controls(mtm: MainThreadMarker, root: PathBuf) {
    use objc2::AllocAnyThread;
    use objc2_foundation::NSUserDefaults;
    let suite = NSString::from_str(&format!("app.notavirus.tests.{}", std::process::id()));
    let defaults =
        NSUserDefaults::initWithSuiteName(NSUserDefaults::alloc(), Some(&suite)).unwrap();
    defaults.removePersistentDomainForName(&suite);
    defaults.setDouble_forKey(99., ns_string!("scale"));
    unsafe {
        defaults.setObject_forKey(Some(ns_string!("unavailable")), ns_string!("active_pack"));
    }
    let preferences = Preferences::from_defaults(defaults.clone());
    assert_eq!(preferences.scale, 1.);
    let delegate = Delegate::new(mtm);
    let app = App::with_options(
        &delegate,
        preferences,
        vec![root.clone(), root.join("missing-user-directory")],
    )
    .unwrap();
    assert_eq!(app.preferences.active, "default");
    *delegate.ivars().state.borrow_mut() = Some(app);
    delegate.menu();
    delegate.start_clock();
    let sender = NSMenuItem::new(mtm);
    unsafe {
        let _: () = msg_send![&*delegate, pause: &*sender];
    }
    {
        let mut state = delegate.ivars().state.borrow_mut();
        let app = state.as_mut().unwrap();
        assert!(app.preferences.paused);
        assert!(app.clock.is_none());
        let before = (app.brain.origin, app.brain.player.elapsed, app.brain.rest);
        app.tick(mtm);
        assert_eq!(
            before,
            (app.brain.origin, app.brain.player.elapsed, app.brain.rest)
        );
    }
    sender.setTag(2);
    unsafe {
        let _: () = msg_send![&*delegate, size: &*sender];
    }
    let index = delegate
        .ivars()
        .state
        .borrow()
        .as_ref()
        .unwrap()
        .packs
        .iter()
        .position(|p| p.id.as_deref() == Some("paco"))
        .unwrap();
    sender.setTag(index as isize);
    unsafe {
        let _: () = msg_send![&*delegate, selectPack: &*sender];
    }
    {
        let mut state = delegate.ivars().state.borrow_mut();
        let app = state.as_mut().unwrap();
        assert_eq!(app.preferences.active, "paco");
        assert_eq!(app.preferences.scale, 2.);
        assert!(app.preferences.paused);
        assert_eq!(app.brain.phase, notavirus_core::Phase::Idle);
        assert_eq!(app.brain.player.elapsed, 0.);
        let layer = objc2::rc::Retained::as_ptr(&app.renderer.layer);
        let origin = app.brain.origin;
        assert!(app.switch(&root.join("broken"), mtm).is_err());
        assert_eq!(app.preferences.active, "paco");
        assert_eq!(origin, app.brain.origin);
        assert_eq!(layer, objc2::rc::Retained::as_ptr(&app.renderer.layer));
        let menu = app.status.menu(mtm).unwrap();
        assert_eq!(menu.itemAtIndex(2).unwrap().title().to_string(), "Resume");
        assert_eq!(menu.itemAtIndex(3).unwrap().state(), 1);
        assert!(!menu.itemAtIndex(3).unwrap().isEnabled());
    }
    let restored = Preferences::from_defaults(defaults.clone());
    assert_eq!(restored.active, "paco");
    assert_eq!(restored.scale, 2.);
    assert!(restored.paused);
    unsafe {
        let _: () = msg_send![&*delegate, pause: &*sender];
    }
    assert!(
        delegate
            .ivars()
            .state
            .borrow()
            .as_ref()
            .unwrap()
            .clock
            .is_some()
    );
    // Exercise the same cleanup used by Quit, without terminating the test harness.
    delegate.cleanup();
    assert!(delegate.ivars().state.borrow().is_none());
    defaults.removePersistentDomainForName(&suite);
    println!(
        "native controls: stale preferences fallback, Pause/Resume clock ownership, Size, pack switch, failed switch preservation, menu checks, persisted settings and Quit cleanup passed"
    );
}

#[cfg(test)]
#[path = "../tests/support/import.rs"]
pub mod import_acceptance;
