//! Exercise the production post-chooser import path with isolated files/settings.
use super::*;
use objc2::AllocAnyThread;
use objc2_foundation::NSUserDefaults;
use std::{fs, io::Write, path::Path};

fn archive(path: &Path, source: &Path, id: &str) {
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    for name in ["pack.toml", "atlas.png", "preview.png"] {
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        let bytes = fs::read(source.join(name)).unwrap();
        if name == "pack.toml" {
            let text = String::from_utf8(bytes)
                .unwrap()
                .replace("id = \"paco\"", &format!("id = \"{id}\""));
            zip.write_all(text.as_bytes()).unwrap();
        } else {
            zip.write_all(&bytes).unwrap();
        }
    }
    zip.finish().unwrap();
}

fn assert_menu(app: &App, mtm: MainThreadMarker, has_error: bool) {
    let menu = app.status.menu(mtm).unwrap();
    let packs = menu.itemAtIndex(5).unwrap().submenu().unwrap();
    for (index, candidate) in app.packs.iter().enumerate() {
        let item = packs.itemAtIndex(index as isize).unwrap();
        assert_eq!(item.isEnabled(), candidate.failure.is_none());
        assert_eq!(
            item.state(),
            isize::from(candidate.id.as_deref() == Some(&app.preferences.active))
        );
    }
    let errors = menu
        .itemArray()
        .iter()
        .filter(|item| item.title().to_string().starts_with("Pack error:"))
        .collect::<Vec<_>>();
    assert_eq!(errors.len(), usize::from(has_error));
    for item in errors {
        assert!(!item.isEnabled());
    }
}

#[allow(dead_code)] // Called by the native harness, not the app's binary test target.
pub fn verify(mtm: MainThreadMarker, root: PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let user_packs = temp.path().join("packs");
    let roots = vec![root.clone(), user_packs.clone()];
    let suite = NSString::from_str(&format!(
        "app.notavirus.import-tests.{}",
        std::process::id()
    ));
    let defaults =
        NSUserDefaults::initWithSuiteName(NSUserDefaults::alloc(), Some(&suite)).unwrap();
    defaults.removePersistentDomainForName(&suite);
    let mut prefs = Preferences::from_defaults(defaults.clone());
    prefs.paused = true;
    prefs.scale = 1.5;
    prefs.save();
    let delegate = Delegate::new(mtm);
    let app = App::with_options(&delegate, prefs, roots.clone()).unwrap();
    *delegate.ivars().state.borrow_mut() = Some(app);
    delegate.menu();

    let valid = temp.path().join("valid.petpack");
    archive(&valid, &root.join("paco"), "imported-paco");
    delegate.import_path(&valid);
    let installed_manifest = fs::read(user_packs.join("imported-paco/pack.toml")).unwrap();
    {
        let state = delegate.ivars().state.borrow();
        let app = state.as_ref().unwrap();
        assert_eq!(app.preferences.active, "imported-paco");
        assert_eq!(app.brain.pack.id, "imported-paco");
        assert!(app.failure.is_none());
        assert!(app.preferences.paused);
        assert_eq!(app.panel.frame().size.width, 192.);
        assert!(unsafe { app.renderer.layer.contents() }.is_some());
        assert_menu(app, mtm, false);
    }

    let truncated = temp.path().join("truncated.petpack");
    fs::write(&truncated, b"PK\x03\x04truncated").unwrap();
    let bundled_collision = temp.path().join("bundled.petpack");
    archive(&bundled_collision, &root.join("paco"), "default");
    for bad in [&truncated, &valid, &bundled_collision] {
        let before = {
            let state = delegate.ivars().state.borrow();
            let app = state.as_ref().unwrap();
            (
                Retained::as_ptr(&app.renderer.layer),
                app.brain.origin,
                app.packs.len(),
            )
        };
        delegate.import_path(bad);
        let state = delegate.ivars().state.borrow();
        let app = state.as_ref().unwrap();
        assert!(app.failure.is_some());
        assert_eq!(app.preferences.active, "imported-paco");
        assert_eq!(app.brain.pack.id, "imported-paco");
        assert_eq!(
            before,
            (
                Retained::as_ptr(&app.renderer.layer),
                app.brain.origin,
                app.packs.len()
            )
        );
        assert_menu(app, mtm, true);
        assert_eq!(fs::read_dir(&user_packs).unwrap().count(), 1);
        assert_eq!(
            fs::read(user_packs.join("imported-paco/pack.toml")).unwrap(),
            installed_manifest
        );
    }

    // A subsequent successful import clears the error and updates the menu.
    let recovery = temp.path().join("recovery.petpack");
    archive(&recovery, &root.join("paco"), "recovered-paco");
    delegate.import_path(&recovery);
    {
        let state = delegate.ivars().state.borrow();
        let app = state.as_ref().unwrap();
        assert_eq!(app.preferences.active, "recovered-paco");
        assert!(app.failure.is_none());
        assert_menu(app, mtm, false);
    }
    delegate.cleanup();
    assert!(delegate.ivars().state.borrow().is_none());

    // Recreate the app, including discovery/renderer/menu, from saved settings.
    let restored = App::with_options(
        &delegate,
        Preferences::from_defaults(defaults.clone()),
        roots.clone(),
    )
    .unwrap();
    assert_eq!(restored.brain.pack.id, "recovered-paco");
    assert_eq!(restored.preferences.scale, 1.5);
    assert!(restored.preferences.paused);
    assert_eq!(restored.panel.frame().size.width, 192.);
    *delegate.ivars().state.borrow_mut() = Some(restored);
    delegate.menu();
    delegate.start_clock();
    assert!(
        delegate
            .ivars()
            .state
            .borrow()
            .as_ref()
            .unwrap()
            .clock
            .is_none()
    );
    assert_menu(
        delegate.ivars().state.borrow().as_ref().unwrap(),
        mtm,
        false,
    );
    delegate.cleanup();

    // A removed user pack must fall back to the shipped default on restart.
    fs::rename(
        user_packs.join("recovered-paco"),
        temp.path().join("removed-pack"),
    )
    .unwrap();
    let fallback = App::with_options(
        &delegate,
        Preferences::from_defaults(defaults.clone()),
        roots,
    )
    .unwrap();
    assert_eq!(fallback.brain.pack.id, "default");
    assert_eq!(
        Preferences::from_defaults(defaults.clone()).active,
        "default"
    );
    *delegate.ivars().state.borrow_mut() = Some(fallback);
    delegate.cleanup();
    defaults.removePersistentDomainForName(&suite);
    println!(
        "native imports: installation/rendering/menu, truncated and duplicate rejection, recovery, restart persistence and removed-pack fallback passed"
    );
}
