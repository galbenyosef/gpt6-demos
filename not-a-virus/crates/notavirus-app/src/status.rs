use super::app::Delegate;
use notavirus_pack::Candidate;
use objc2::{MainThreadOnly, rc::Retained, sel};
use objc2_app_kit::*;
use objc2_foundation::{MainThreadMarker, NSSize, NSString, ns_string};
fn item(
    mtm: MainThreadMarker,
    title: &str,
    action: Option<objc2::runtime::Sel>,
    target: &Delegate,
    tag: isize,
    checked: bool,
) -> Retained<NSMenuItem> {
    let item = unsafe {
        NSMenuItem::initWithTitle_action_keyEquivalent(
            NSMenuItem::alloc(mtm),
            &NSString::from_str(title),
            action,
            ns_string!(""),
        )
    };
    unsafe {
        item.setTarget(Some(target));
    }
    item.setTag(tag);
    item.setEnabled(action.is_some());
    item.setState(if checked { 1 } else { 0 });
    item
}
pub fn create(mtm: MainThreadMarker) -> Retained<NSStatusItem> {
    let status = NSStatusBar::systemStatusBar().statusItemWithLength(NSVariableStatusItemLength);
    if let Some(button) = status.button(mtm) {
        let paw = NSImage::imageWithSystemSymbolName_accessibilityDescription(
            ns_string!("pawprint.fill"),
            Some(ns_string!("NotAVirus")),
        )
        .expect("pawprint.fill is available on supported macOS versions");
        paw.setSize(NSSize::new(18., 18.));
        paw.setTemplate(true);
        button.setTitle(ns_string!(""));
        button.setImage(Some(&paw));
        button.setImagePosition(NSCellImagePosition::ImageOnly);
        button.setToolTip(Some(ns_string!("NotAVirus")));
    }
    status
}
pub fn rebuild(
    status: &NSStatusItem,
    target: &Delegate,
    paused: bool,
    scale: f64,
    active: &str,
    packs: &[Candidate],
    failure: Option<&str>,
) {
    let mtm = target.mtm();
    let menu = NSMenu::new(mtm);
    menu.setAutoenablesItems(false);
    menu.addItem(&item(mtm, "NotAVirus", None, target, 0, false));
    menu.addItem(&NSMenuItem::separatorItem(mtm));
    menu.addItem(&item(
        mtm,
        if paused { "Resume" } else { "Pause" },
        Some(sel!(pause:)),
        target,
        0,
        false,
    ));
    menu.addItem(&item(mtm, "Click-through", None, target, 0, true));
    menu.addItem(&NSMenuItem::separatorItem(mtm));
    let pack_menu = NSMenu::new(mtm);
    pack_menu.setAutoenablesItems(false);
    for (i, p) in packs.iter().enumerate() {
        let title = if let Some(reason) = &p.failure {
            format!(
                "{} ({})",
                p.name,
                reason
                    .lines()
                    .next()
                    .unwrap_or("invalid pack")
                    .chars()
                    .take(70)
                    .collect::<String>()
            )
        } else {
            p.name.clone()
        };
        pack_menu.addItem(&item(
            mtm,
            &title,
            p.failure.is_none().then(|| sel!(selectPack:)),
            target,
            i as isize,
            p.id.as_deref() == Some(active) && p.failure.is_none(),
        ));
    }
    pack_menu.addItem(&NSMenuItem::separatorItem(mtm));
    pack_menu.addItem(&item(
        mtm,
        "Open packs folder…",
        Some(sel!(openPacks:)),
        target,
        0,
        false,
    ));
    pack_menu.addItem(&item(
        mtm,
        "Import .petpack…",
        Some(sel!(importPack:)),
        target,
        0,
        false,
    ));
    let parent = item(mtm, "Packs", None, target, 0, false);
    parent.setEnabled(true);
    parent.setSubmenu(Some(&pack_menu));
    menu.addItem(&parent);
    let sizes = NSMenu::new(mtm);
    sizes.setAutoenablesItems(false);
    for (i, (name, value)) in [("Small", 1.), ("Medium", 1.5), ("Large", 2.)]
        .iter()
        .enumerate()
    {
        sizes.addItem(&item(
            mtm,
            name,
            Some(sel!(size:)),
            target,
            i as isize,
            *value == scale,
        ));
    }
    let parent = item(mtm, "Size", None, target, 0, false);
    parent.setEnabled(true);
    parent.setSubmenu(Some(&sizes));
    menu.addItem(&parent);
    if let Some(f) = failure {
        menu.addItem(&item(
            mtm,
            &format!(
                "Pack error: {}",
                f.lines()
                    .next()
                    .unwrap_or("invalid pack")
                    .chars()
                    .take(75)
                    .collect::<String>()
            ),
            None,
            target,
            0,
            false,
        ));
    }
    menu.addItem(&NSMenuItem::separatorItem(mtm));
    menu.addItem(&item(
        mtm,
        "About NotAVirus",
        Some(sel!(about:)),
        target,
        0,
        false,
    ));
    let quit = item(mtm, "Quit", Some(sel!(quit:)), target, 0, false);
    quit.setKeyEquivalent(ns_string!("q"));
    menu.addItem(&quit);
    status.setMenu(Some(&menu));
}
