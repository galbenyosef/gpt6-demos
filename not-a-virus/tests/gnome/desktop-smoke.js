import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import System from 'system';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {capture} from './rendering-smoke.js';
import {stress} from './stress-smoke.js';
const uuid = 'notavirus@local';
function assert(value, message) { if (!value) throw Error(message); }
async function until(condition, label) {
    for (let i = 0; i < 150; i++) {
        if (condition()) return;
        await Scripting.sleep(50);
    }
    throw Error(`Timeout: ${label}`);
}
export async function run() {
    await Scripting.disableHelperAutoExit();
    Main.overview.hide();
    await Scripting.sleep(1000);
    const extension = Main.extensionManager.lookup(uuid);
    const get = () => extension.stateObj?.controller;
    await until(() => get()?.session?.ready || get()?.error, 'startup');
    let c = get();
    assert(!c.error, `Startup: ${c.error}`);
    await until(() => c.sprite.actor.visible, 'first frame');
    assert(c.activeId === 'default', 'Default is not gatita');
    assert(c.packs.length === 5, 'Missing bundled packs');
    const focus = global.display.focus_window;
    assert(!c.sprite.actor.reactive && !c.sprite.viewport.reactive && !c.sprite.atlas.reactive, 'Reactive sprite');
    const actor = c.sprite.actor;
    const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, actor.x + 64, actor.y + 64);
    assert(picked !== actor && !actor.contains(picked), 'Sprite intercepts picking');
    for (const id of ['paco', 'gatita', 'jellyfish-ufo', 'living-ink']) {
        c.select(id);
        await until(() => c.activeId === id || c.error, `select ${id}`);
        assert(!c.error, c.error);
        for (const size of [1, 1.5, 2]) {
            c.settings.set_double('size', size);
            await until(() => Math.abs(c.sprite.actor.width - 128 * size) < 1, `size ${size}`);
            await Scripting.sleep(50);
        }
    }
    await capture(c);
    c.select('missing');
    await until(() => c.error, 'failed switch');
    assert(c.activeId === 'living-ink' && c.sprite.actor.visible, 'Failed switch replaced pet');
    c.select('gatita');
    await until(() => c.activeId === 'gatita' && !c.error, 'recovery');
    c.settings.set_double('size', 1.5);
    c.settings.set_boolean('paused', true);
    await Scripting.sleep(700);
    const seq = c.session.bridge.seq;
    await Scripting.sleep(700);
    assert(c.session.bridge.seq === seq, 'Paused state sends simulation requests');
    c.settings.set_double('size', 1);
    await until(() => c.sprite.actor.width === 128, 'paused size update');
    Main.overview.show();
    await Scripting.sleep(700);
    assert(!c.sprite.actor.visible, 'Overview sprite visible');
    const hiddenSeq = c.session.bridge.seq;
    await Scripting.sleep(400);
    assert(c.session.bridge.seq === hiddenSeq, 'Hidden state sends requests');
    Main.overview.hide();
    await until(() => c.sprite.actor.visible, 'resume after overview');
    assert(global.display.focus_window === focus, 'Sprite changed keyboard focus');
    c.indicator.button.menu.open();
    await Scripting.sleep(300);
    const screenshot = new Shell.Screenshot();
    const output = Gio.File.new_for_path('/tmp/notavirus-gnome-desktop.png').replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await screenshot.screenshot(false, output);
    output.close(null);
    c.indicator.button.menu.close();
    // Preferences runs out of process; GTK must never enter the Shell process.
    // The test tool changes the Shell environment after starting the private bus.
    // Give DBus-activated preferences the same isolated settings profile.
    const activation = {};
    for (const key of ['GSETTINGS_BACKEND', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'])
        activation[key] = GLib.getenv(key);
    await new Promise((resolve, reject) => {
        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'UpdateActivationEnvironment',
            new GLib.Variant('(a{ss})', [activation]), null, Gio.DBusCallFlags.NONE, -1, null, (source, result) => {
                try { source.call_finish(result); resolve(); } catch (error) { reject(error); }
            });
    });
    await extension.stateObj.openPreferences();
    await until(() => global.get_window_actors().some(a => /NotAVirus/.test(a.meta_window.get_title() ?? '')), 'preferences window');
    await Scripting.sleep(500);
    const prefsOutput = Gio.File.new_for_path('/tmp/notavirus-gnome-preferences.png').replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await new Shell.Screenshot().screenshot(false, prefsOutput);
    prefsOutput.close(null);
    for (const a of global.get_window_actors())
        if (/NotAVirus/.test(a.meta_window.get_title() ?? '')) a.meta_window.delete(global.get_current_time());
    // Exercise cancellation and generation isolation during rapid controls.
    for (let i = 0; i < 30; i++) { c.select(i % 2 ? 'paco' : 'gatita'); c.settings.set_double('size', i % 2 ? 1 : 2); }
    c.select('gatita'); c.settings.set_double('size', 1);
    await until(() => c.activeId === 'gatita' && !c.session.busy && c.session.pending.size === 0, 'coalesced controls');

    c.settings.set_boolean('running', false);
    await until(() => !c.session && !c.sprite && !c.timer, 'Quit cleanup');
    c.settings.set_boolean('running', true);
    await until(() => c.session?.ready, 'Start');
    assert(c.activeId === 'gatita' && c.settings.get_boolean('paused'), 'Preferences not restored');
    c.session.bridge.process.force_exit();
    await until(() => !c.session && c.error, 'crash handling');
    c.restart();
    await until(() => c.session?.ready, 'crash recovery');
    c.settings.set_boolean('paused', false);
    c.session.bridge.process.send_signal(19); // Stop only our owned test child.
    await until(() => c.session?.bridge.pending, 'stalled request');
    await Scripting.sleep(10500);
    assert(!c.session && c.error?.includes('not responding'), 'Stalled helper did not recover to Restart');
    c.restart();
    await until(() => c.session?.ready, 'stall recovery');
    c.settings.set_boolean('paused', true);
    await stress(c);
    const chromeCount = Main.layoutManager.uiGroup.get_children().length;
    const descriptors = () => {
        const files = Gio.File.new_for_path('/proc/self/fd').enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let count = 0;
        while (files.next_file(null)) count++;
        files.close(null);
        return count;
    };
    System.gc();
    const beforeDescriptors = descriptors();
    for (let i = 0; i < 20; i++) {
        const old = c;
        const pid = c.session.bridge.process.get_identifier();
        await Main.extensionManager.disableExtension(uuid);
        await Scripting.sleep(50);
        await until(() => !GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS), 'helper exit');
        assert(old.dead && !old.session && !old.sprite && !old.timer && old.connections.length === 0, `Disable cleanup ${i}`);
        await Main.extensionManager.enableExtension(uuid);
        await until(() => get()?.session?.ready, `enable cycle ${i}`);
        c = get();
        assert(Main.layoutManager.uiGroup.get_children().length === chromeCount, 'Retained chrome actors');
    }
    System.gc();
    assert(descriptors() <= beforeDescriptors + 2, 'File descriptors retained across lifecycle cycles');
    await Main.extensionManager.disableExtension(uuid);
    await Scripting.sleep(300);
    print('NOTAVIRUS DESKTOP PASS: packs, sizes, failed switch, pause, overview, focus, Quit/Start, crash recovery, 20 lifecycle cycles');
}
