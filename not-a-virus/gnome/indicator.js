import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class Indicator {
    constructor(controller) {
        this.controller = controller;
        this.button = new PanelMenu.Button(0, 'NotAVirus');
        this.button.add_child(new St.Icon({gicon: Gio.FileIcon.new(controller.extension.dir.get_child('icons/notavirus-symbolic.svg')), style_class: 'system-status-icon'}));
        Main.panel.addToStatusArea(controller.extension.uuid, this.button);
    }
    refresh() {
        const c = this.controller;
        const menu = this.button.menu;
        menu.removeAll();
        const item = (label, action, parent = menu) => {
            const row = new PopupMenu.PopupMenuItem(label);
            if (action) row.connect('activate', action); else row.setSensitive(false);
            parent.addMenuItem(row);
            return row;
        };
        item('NotAVirus');
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        if (c.session) {
            item(c.settings.get_boolean('paused') ? 'Resume' : 'Pause', () => c.settings.set_boolean('paused', !c.settings.get_boolean('paused')));
            item('Click-through').setOrnament(PopupMenu.Ornament.CHECK);
            const packs = new PopupMenu.PopupSubMenuMenuItem('Packs');
            menu.addMenuItem(packs);
            for (const p of c.packs) {
                const label = p.error ? `${p.name} — ${p.error.split('\n')[0].slice(0, 70)}` : p.name;
                const row = item(label, p.error ? null : () => c.select(p.id), packs.menu);
                if (!p.error && p.id === c.activeId) row.setOrnament(PopupMenu.Ornament.CHECK);
            }
            const sizes = new PopupMenu.PopupSubMenuMenuItem('Size');
            menu.addMenuItem(sizes);
            for (const [label, size] of [['Small', 1], ['Medium', 1.5], ['Large', 2]]) {
                const row = item(label, () => c.settings.set_double('size', size), sizes.menu);
                if (c.size === size) row.setOrnament(PopupMenu.Ornament.CHECK);
            }
        } else {
            item(c.error ? 'Restart' : 'Start', () => {
                c.settings.set_boolean('running', true);
                c.start();
            });
        }
        if (c.error) item(`Companion error: ${c.error.split('\n')[0].slice(0, 120)}`);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        item('Open Packs Folder…', () => {
            const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'notavirus', 'packs']);
            GLib.mkdir_with_parents(path, 0o700);
            Gio.AppInfo.launch_default_for_uri_async(Gio.File.new_for_path(path).get_uri(), global.create_app_launch_context(0, -1), null, (_source, result) => {
                try { Gio.AppInfo.launch_default_for_uri_finish(result); } catch (error) { Main.notifyError('Cannot open packs folder', error.message); }
            });
        });
        item('Import Pack…', () => c.extension.openPreferences());
        item('About NotAVirus', () => Main.notify('NotAVirus', 'gatita, Paco, Jellyfish UFO and Living Ink follow your pointer. Always click-through and offline. Hidden in Activities and fullscreen. Quit stops the pet; Start brings it back. Disable the extension to remove the paw menu.'));
        item('Preferences…', () => c.extension.openPreferences());
        if (c.session) item('Quit', () => c.settings.set_boolean('running', false));
    }
    destroy() { this.button.destroy(); }
}
