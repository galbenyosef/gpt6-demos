// Offscreen-in-the-test-compositor pixel regression; never shipped in the extension.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export async function capture(c) {
    c.settings.set_boolean('paused', true);
    await Scripting.sleep(350);
    const directory = '/tmp/notavirus-gnome-captures';
    GLib.mkdir_with_parents(directory, 0o700);
    const background = new St.Widget({x: 300, y: 200, width: 256, height: 256, style: 'background-color: rgb(24, 32, 40);', reactive: false});
    Main.layoutManager.addChrome(background, {affectsStruts: false});
    const screenshot = new Shell.Screenshot();
    let count = 0;
    try {
        for (const id of ['paco', 'gatita', 'jellyfish-ufo', 'living-ink']) {
            c.select(id);
            for (let i = 0; i < 150 && (c.activeId !== id || c.session.busy || c.session.pending.size); i++) await Scripting.sleep(50);
            if (c.error || c.activeId !== id) throw Error(`Capture pack failed: ${c.error}`);
            await Scripting.sleep(300);
            Main.layoutManager.uiGroup.set_child_below_sibling(background, c.sprite.actor);
            const rows = id === 'gatita' ? 6 : 4;
            for (let frame = 0; frame < 4 * rows; frame++) {
                for (const size of [1, 1.5, 2]) {
                    for (const flip of [false, true]) {
                        c.sprite.apply({type:'frame', generation:c.sprite.generation, rect:[300,200,128*size,128*size], crop:[(frame%4)/4,Math.floor(frame/4)/rows,1/4,1/rows], flip, mirror_offset:0, filter:id === 'paco' ? 'nearest' : 'linear'});
                        c.sprite.actor.show();
                        // screenshot_area may reuse the previous framebuffer: wait for a paint.
                        await Scripting.sleep(40);
                        const path = `${directory}/${id}-${frame}-${size}-${flip ? 'left' : 'right'}.png`;
                        const output = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                        await screenshot.screenshot_area(300,200,128*size,128*size,output);
                        output.close(null);
                        count++;
                    }
                }
            }
        }
    } finally { Main.layoutManager.removeChrome(background); background.destroy(); }
    print(`NOTAVIRUS CAPTURE PASS: ${count} native frame/size/facing captures`);
}
