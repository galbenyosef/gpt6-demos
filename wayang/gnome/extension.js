import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const iface = 'org.gnome.Shell.Extensions.Wyang';
const xml = `<node><interface name="${iface}">
<method name="Status"><arg type="s" direction="out"/></method>
<method name="Apply"><arg type="s" direction="in"/><arg type="s" direction="in"/></method>
<method name="Stop"><arg type="s" direction="in"/></method>
</interface></node>`;
const path = '/org/gnome/Shell/Extensions/Wyang';
const tick = (ms, f) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, f);

export default class Wyang extends Extension {
    enable() {
        this.sessions = new Set();
        this.running = new Map();
        this.pending = new Map();
        this.failed = new Set();
        this.paused = false;
        this.settings = this.getSettings();
        this.saved = this.settings.get_value('scenes').deepUnpack();
        this.prefs = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this.manager = global.backend.get_monitor_manager();
        this.power = null;
        const cancel = this.cancel = new Gio.Cancellable();
        Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null,
            'org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig',
            cancel, (_src, res) => {
                try { const proxy = Gio.DBusProxy.new_for_bus_finish(res); if (!cancel.is_cancelled()) this.power = proxy; } catch (_) {}
            });
        this.bus = Gio.DBusExportedObject.wrapJSObject(xml, this);
        this.bus.export(Gio.DBus.session, path);
        this.button = new PanelMenu.Button(0, 'Wyang wallpapers');
        this.button.add_child(new St.Icon({icon_name: 'preferences-desktop-wallpaper-symbolic', style_class: 'system-status-icon'}));
        Main.panel.addToStatusArea(this.uuid, this.button);
        this.rebuildMenu();
        this.mapped = global.window_manager.connect('map', (_wm, actor) => this.match(actor));
        this.layout = Main.layoutManager.connect('monitors-changed', () => this.reconcile());
        this.reconcile();
        this.timer = tick(33, () => {
            for (const s of this.running.values()) this.sample(s);
            return GLib.SOURCE_CONTINUE;
        });
    }

    displays() {
        const displays = [];
        for (const m of this.manager.get_monitors()) {
            const id = m.get_connector();
            const index = this.manager.get_monitor_for_connector(id);
            const geom = Main.layoutManager.monitors[index];
            if (!geom || !m.is_active()) continue;
            const scale = global.display.get_monitor_scale(index);
            displays.push({id, name: m.get_display_name() || id, size: [Math.round(geom.width * scale), Math.round(geom.height * scale)], scale, geom});
        }
        return displays;
    }
    Status() {
        return JSON.stringify({protocol: 1, shell: parseInt(Config.PACKAGE_VERSION),
            displays: this.displays().map(({geom, ...d}) => d), active: [...this.running.keys()],
            reduced: !this.prefs.get_boolean('enable-animations')});
    }
    ApplyAsync([display, scene], invocation) {
        try {
            this.start(display, scene, invocation);
        } catch (e) { invocation.return_dbus_error(iface + '.ApplyFailed', e.message); }
    }
    Stop(display) {
        delete this.saved[display];
        this.persist();
        this.close(this.pending.get(display));
        this.close(this.running.get(display));
        this.rebuildMenu();
    }
    persist() { this.settings.set_value('scenes', new GLib.Variant('a{ss}', this.saved)); }
    rebuildMenu() {
        this.button.menu.removeAll();
        this.button.visible = this.running.size > 0;
        this.button.menu.addAction(this.paused ? 'Resume motion' : 'Pause motion', () => {
            this.paused = !this.paused;
            this.rebuildMenu();
        });
        for (const display of this.running.keys())
            this.button.menu.addAction('Stop wallpaper on ' + display, () => this.Stop(display));
    }
    reconcile() {
        const list = this.displays();
        for (const s of [...this.sessions]) {
            const display = list.find(d => d.id === s.display);
            if (!display) this.close(s);
            else { s.monitor = display; this.place(s); }
        }
        for (const {id} of list) {
            if (this.saved[id] && !this.running.has(id) && !this.pending.has(id) && !this.failed.has(id)) {
                try { this.start(id, this.saved[id], null); } catch (_) { this.failed.add(id); }
            }
        }
        this.rebuildMenu();
    }
    start(display, scene, invocation) {
        if (!/^[a-f0-9]{64}$/.test(scene)) throw Error('Invalid scene identity');
        const monitor = this.displays().find(d => d.id === display);
        if (!monitor) throw Error('Display disconnected');
        this.close(this.pending.get(display));
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE});
        launcher.unsetenv('OPENAI_API_KEY');
        launcher.unsetenv('OPENAI_IMAGE_MODEL');
        launcher.unsetenv('DISPLAY');
        const bin = GLib.build_filenamev([this.path, 'bin', 'wyang-player']);
        let client;
        try {
            client = Meta.WaylandClient.new_subprocess(global.context, launcher, [bin, scene, ...monitor.size.map(String), display]);
        } finally { launcher.close(); }
        const proc = client.get_subprocess();
        const s = {client, proc, display, scene, invocation, monitor, cancel: new Gio.Cancellable(),
            pipe: proc.get_stdin_pipe(), focus: global.display.focus_window, ready: false};
        this.sessions.add(s);
        this.pending.set(display, s);
        this.failed.delete(display);
        s.deadline = tick(20000, () => { s.deadline = 0; this.close(s, 'Player did not present a scene'); return GLib.SOURCE_REMOVE; });
        proc.wait_async(null, (_p, res) => {
            try { proc.wait_finish(res); } catch (_) {}
            if (this.sessions.has(s)) {
                this.failed.add(display);
                this.close(s, 'Wallpaper player exited', true);
                this.rebuildMenu();
            }
        });
        const lines = new Gio.DataInputStream({base_stream: proc.get_stdout_pipe()});
        lines.read_line_async(GLib.PRIORITY_DEFAULT, s.cancel, (_stream, result) => {
            if (!this.sessions.has(s)) return;
            try {
                const [line] = lines.read_line_finish_utf8(result);
                if (line !== 'ready') throw Error('Scene could not be decoded or rendered');
                s.ready = true;
                this.commit(s);
            } catch (e) { this.close(s, e.message); }
        });
    }
    match(actor) {
        const win = actor.meta_window;
        const s = [...this.sessions].find(s => !s.actor && s.client.owns_window(win));
        if (!s) return;
        s.actor = actor;
        win.hide_from_window_list();
        win.stick();
        win.lower();
        win.move_to_monitor(s.monitor.geom.index);
        // Give Shell the mapped window actor itself. A hidden source window can be
        // marked occluded by Mutter and lose its Wayland frame callbacks on resume.
        s.layer = new Clutter.Actor({reactive: false, clip_to_allocation: true, visible: false});
        Main.layoutManager._backgroundGroup.add_child(s.layer);
        actor.get_parent().remove_child(actor);
        // Mutter positions windows inside the work area. Offset their parent so
        // the wallpaper uses the complete monitor, including the panel and Dock.
        s.origin = new Clutter.Actor({reactive: false});
        s.layer.add_child(s.origin);
        s.origin.add_child(actor);
        actor.reactive = false;
        const position = () => s.origin.set_position(-actor.x, -actor.y);
        s.positionSignals = ['notify::x', 'notify::y'].map(signal => actor.connect(signal, position));
        position();
        this.place(s);
        if (win.has_focus() && s.focus) s.focus.activate(global.get_current_time());
        this.commit(s);
    }
    place(s) {
        if (!s.layer) return;
        const {x, y, width, height, index} = s.monitor.geom;
        s.actor.meta_window.move_to_monitor(index);
        s.actor.meta_window.move_resize_frame(false, x, y, width, height);
        s.layer.set_position(x, y);
        s.layer.set_size(width, height);
    }
    commit(s) {
        if (!s.ready || !s.layer || this.pending.get(s.display) !== s) return;
        this.pending.delete(s.display);
        const old = this.running.get(s.display);
        this.running.set(s.display, s);
        this.saved[s.display] = s.scene;
        this.persist();
        if (s.deadline) GLib.Source.remove(s.deadline);
        s.deadline = 0;
        this.sample(s);
        this.close(old);
        s.invocation?.return_value(null);
        s.invocation = null;
        this.rebuildMenu();
    }
    sample(s) {
        const g = s.monitor.geom;
        const powerMode = this.power?.get_cached_property('PowerSaveMode')?.deepUnpack() ?? 0;
        const fullscreen = g.inFullscreen && global.get_window_actors().some(actor => {
            const w = actor.meta_window;
            return ![...this.sessions].some(player => player.actor === actor) &&
                w.get_monitor() === g.index && w.showing_on_its_workspace() && w.is_fullscreen();
        });
        const suspended = Main.sessionMode.isLocked || Main.overview.visible || fullscreen || powerMode > 0;
        s.layer.visible = !suspended;
        const reduced = !this.prefs.get_boolean('enable-animations');
        const [x,y] = global.get_pointer();
        const inside = x >= g.x && y >= g.y && x < g.x + g.width && y < g.y + g.height;
        const pointer = inside && !suspended && !reduced && !this.paused ? [2*(x-g.x)/g.width-1, 2*(y-g.y)/g.height-1] : [0,0];
        const line = JSON.stringify({pointer, size: s.monitor.size, logical: [g.width,g.height],
            suspended: Boolean(suspended), reduced, paused: this.paused}) + '\n';
        if (s.busy || s.last === line) return;
        s.busy = true;
        s.last = line;
        s.pipe.write_all_async(new TextEncoder().encode(line), GLib.PRIORITY_DEFAULT, s.cancel, (pipe, result) => {
            try { pipe.write_all_finish(result); }
            catch (_) { if (this.sessions.has(s)) this.close(s, 'Player disconnected'); }
            s.busy = false;
        });
    }
    close(s, message = 'Playback stopped', exited = false) {
        if (!s || !this.sessions.delete(s)) return;
        if (this.pending.get(s.display) === s) this.pending.delete(s.display);
        if (this.running.get(s.display) === s) this.running.delete(s.display);
        s.invocation?.return_dbus_error(iface + '.ApplyFailed', message);
        s.invocation = null;
        if (s.deadline) GLib.Source.remove(s.deadline);
        s.cancel.cancel();
        if (s.origin && s.actor?.get_parent() === s.origin) {
            for (const signal of s.positionSignals) s.actor.disconnect(signal);
            s.origin.remove_child(s.actor);
            s.actor.opacity = 0;
            global.window_group.add_child(s.actor);
        }
        s.layer?.destroy();
        if (!exited) s.proc.force_exit();
    }
    disable() {
        this.bus.unexport();
        GLib.Source.remove(this.timer);
        this.cancel.cancel();
        global.window_manager.disconnect(this.mapped);
        Main.layoutManager.disconnect(this.layout);
        for (const s of [...this.sessions]) this.close(s);
        this.button.destroy();
        this.power = null;
    }
}
