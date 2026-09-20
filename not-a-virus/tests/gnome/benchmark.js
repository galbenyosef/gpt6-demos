// Controlled headless Shell benchmark. Virtual pointer events stay inside this test compositor.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import System from 'system';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const uuid = 'notavirus@local';
function text(path) { return new TextDecoder().decode(GLib.file_get_contents(path)[1]); }
function stats(pid) {
    const stat = text(`/proc/${pid}/stat`).split(') ')[1].split(' ');
    const rss = Number(text(`/proc/${pid}/status`).match(/VmRSS:\s+(\d+)/)[1]) * 1024;
    return {ticks: Number(stat[11]) + Number(stat[12]), rss};
}
export async function ready() {
    for (let i = 0; i < 200; i++) {
        const c = Main.extensionManager.lookup(uuid)?.stateObj?.controller;
        if (c?.error) throw Error(c.error);
        if (c?.session?.ready) return c;
        await Scripting.sleep(50);
    }
    throw Error('Startup timeout');
}
export async function measure(mode, duration, c = null) {
    const pid = c?.session.bridge.process.get_identifier();
    const startShell = stats('self');
    const startHelper = pid ? stats(pid) : null;
    let count = 0;
    const latencies = [];
    let started;
    let pointer;
    let motion = 0;
    let original;
    let apply;
    if (c) {
        original = c.session.bridge.request.bind(c.session.bridge);
        c.session.bridge.request = (type, fields) => {
            if (type === 'sample') started = GLib.get_monotonic_time();
            return original(type, fields);
        };
        apply = c.sprite.apply.bind(c.sprite);
        c.sprite.apply = frame => {
            apply(frame);
            count++;
            latencies.push((GLib.get_monotonic_time() - started) / 1000);
        };
    }
    if (mode === 'chase') {
        pointer = global.stage.get_context().get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const start = GLib.get_monotonic_time();
        motion = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 17, () => {
            const t = (GLib.get_monotonic_time() - start) / 1e6;
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), 640 + 440 * Math.sin(t * 0.9), 380 + 200 * Math.cos(t * 0.7));
            return GLib.SOURCE_CONTINUE;
        });
    }
    const time = GLib.get_monotonic_time();
    await Scripting.sleep(duration * 1000);
    const elapsed = (GLib.get_monotonic_time() - time) / 1e6;
    const endShell = stats('self');
    const endHelper = pid ? stats(pid) : null;
    if (motion) GLib.Source.remove(motion);
    pointer = null;
    if (c) { c.session.bridge.request = original; c.sprite.apply = apply; }
    latencies.sort((a,b) => a-b);
    const result = {mode, seconds:elapsed, hz: count/elapsed, p50_ms:latencies[Math.floor(latencies.length * 0.5)] ?? null, p95_ms:latencies[Math.floor(latencies.length * 0.95)] ?? null, shell_cpu: (endShell.ticks-startShell.ticks)/elapsed, helper_cpu:endHelper ? (endHelper.ticks-startHelper.ticks)/elapsed : 0, shell_rss:endShell.rss, helper_rss:endHelper?.rss ?? 0};
    print(`NOTAVIRUS BENCHMARK ${JSON.stringify(result)}`);
    return result;
}
export async function run() {
    await Scripting.disableHelperAutoExit();
    Main.overview.hide();
    let c = await ready();
    const results = [];
    for (let round=0; round<2; round++) {
        await Main.extensionManager.disableExtension(uuid);
        await Scripting.sleep(2000);
        System.gc();
        results.push(await measure('baseline', 60));
        await Main.extensionManager.enableExtension(uuid);
        c = await ready();
        c.settings.set_boolean('paused', false);
        c.select('gatita');
        await Scripting.sleep(3000);
        results.push(await measure('idle', 60, c));
        results.push(await measure('chase', 60, c));
    }
    GLib.file_set_contents('/tmp/notavirus-benchmark.json', JSON.stringify({environment:'GNOME 50.1 headless virtual 1280x720 60Hz, AMD Cezanne, instrumented Shell, gatita Small; /proc USER_HZ=100', results}, null, 2));
    await Main.extensionManager.disableExtension(uuid);
}
