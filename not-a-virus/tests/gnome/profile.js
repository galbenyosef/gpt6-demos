// Short diagnostic ablation to distinguish rendering from pipe/control overhead.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {ready, measure} from './benchmark.js';
export async function run() {
    await Scripting.disableHelperAutoExit();
    Main.overview.hide();
    const c = await ready();
    c.select('gatita');
    await Scripting.sleep(3000);
    await measure('idle-profile', 15, c);
    c.sprite.atlas.opacity = 0;
    const apply = c.sprite.apply.bind(c.sprite);
    c.sprite.apply = () => {};
    await measure('transport-only', 15, c);
    c.sprite.apply = apply;
    await Main.extensionManager.disableExtension('notavirus@local');
}
