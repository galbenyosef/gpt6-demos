import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
export default class Probe extends Extension {
    enable() {
        this.actor = new St.Icon({gicon: Gio.FileIcon.new(this.dir.get_child('preview.png')), icon_size: 128, reactive: false, can_focus: false});
        Main.layoutManager.addChrome(this.actor, {affectsStruts: false});
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 17, () => {
            const [x, y] = global.get_pointer();
            this.actor.set_position(x + 20, y + 20);
            this.actor.visible = !Main.overview.visible;
            return GLib.SOURCE_CONTINUE;
        });
    }
    disable() {
        GLib.Source.remove(this.timer);
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
        this.actor = null;
    }
}
