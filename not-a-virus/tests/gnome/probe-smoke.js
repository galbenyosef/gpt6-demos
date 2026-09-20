import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export async function run() {
    Main.overview.hide();
    await Scripting.sleep(1000);
    const extension = Main.extensionManager.lookup('notavirus-probe@local');
    const probe = extension?.stateObj;
    if (!probe?.actor) throw Error(`Probe failed: ${extension?.error}`);
    const actor = probe.actor;
    const [x, y] = global.get_pointer();
    if (Math.abs(actor.x - x - 20) > 1 || Math.abs(actor.y - y - 20) > 1) throw Error('Pointer tracking failed');
    if (actor.reactive || actor.can_focus) throw Error('Reactive sprite');
    const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, actor.x + 64, actor.y + 64);
    if (picked === actor || actor.contains(picked)) throw Error('Sprite intercepts picking');
    Main.overview.show();
    await Scripting.sleep(500);
    if (actor.visible) throw Error('Overview did not hide sprite');
    Main.overview.hide();
    await Scripting.sleep(500);
    if (!actor.visible) throw Error('Sprite did not resume');
    await Main.extensionManager.disableExtension('notavirus-probe@local');
    await Scripting.sleep(100);
    if (probe.actor !== null) throw Error('Disable did not clean up');
    print('NOTAVIRUS PROBE PASS: pointer, non-reactive picking, overview, cleanup');
}
