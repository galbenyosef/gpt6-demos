import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Sprite {
    constructor() {
        this.actor = new Clutter.Actor({reactive: false, visible: false, clip_to_allocation: true});
        this.viewport = new Clutter.Actor({reactive: false, clip_to_allocation: true});
        this.atlas = new Clutter.Actor({reactive: false});
        this.viewport.set_pivot_point(0.5, 0.5);
        this.viewport.add_child(this.atlas);
        this.actor.add_child(this.viewport);
        Main.layoutManager.addChrome(this.actor, {affectsStruts: false});
        this.generation = 0;
    }
    async prepare(asset, cancellable) {
        const runtime = GLib.getenv('XDG_RUNTIME_DIR');
        if (!runtime || !GLib.path_is_absolute(runtime)) throw Error('A GNOME user runtime directory is required');
        const file = Gio.File.new_for_path(`${runtime}/notavirus/${asset.session}/${asset.token}`);
        const stream = await new Promise((resolve, reject) => {
            file.read_async(GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                try { resolve(source.read_finish(result)); } catch (error) { reject(error); }
            });
        });
        const data = new Uint8Array(asset.bytes);
        let offset = 0;
        try {
            while (true) {
                const chunk = await new Promise((resolve, reject) => {
                    stream.read_bytes_async(Math.min(65536, asset.bytes - offset + 1), GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                        try { resolve(source.read_bytes_finish(result).get_data()); } catch (error) { reject(error); }
                    });
                });
                if (!chunk.length) break;
                if (offset + chunk.length > asset.bytes) throw Error('Atlas exceeds validated byte length');
                data.set(chunk, offset);
                offset += chunk.length;
            }
        } finally {
            stream.close_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try { source.close_finish(result); } catch (_) { /* Child may be gone. */ }
            });
        }
        const bytes = GLib.Bytes.new(data.subarray(0, offset));
        if (bytes.get_size() !== asset.bytes) throw Error('Atlas byte length does not match validated image');
        if (cancellable.is_cancelled()) throw Error('Texture upload cancelled');
        const image = new St.ImageContent({preferred_width: asset.width, preferred_height: asset.height});
        image.set_bytes(global.stage.get_context().get_backend().get_cogl_context(), bytes, Cogl.PixelFormat.RGBA_8888, asset.width, asset.height, asset.width * 4);
        return image;
    }
    commit(image, generation) {
        const previous = this.image;
        this.atlas.set_content(image);
        this.image = image;
        previous?.run_dispose();
        this.generation = generation;
        this.lastFrame = null;
    }
    apply(frame) {
        if (frame.generation !== this.generation) return;
        const [x, y, width, height] = frame.rect;
        const [u, v, w, h] = frame.crop;
        const previous = this.lastFrame;
        const resized = !previous || previous.rect[2] !== width || previous.rect[3] !== height;
        if (!previous || previous.rect[0] !== x || previous.rect[1] !== y)
            this.actor.set_position(x, y);
        if (resized) {
            this.actor.set_size(width, height);
            this.viewport.set_size(width, height);
            this.atlas.set_size(width / w, height / h);
        }
        if (!previous || previous.flip !== frame.flip) this.viewport.set_scale(frame.flip ? -1 : 1, 1);
        if (!previous || previous.flip !== frame.flip || previous.mirror_offset !== frame.mirror_offset)
            this.viewport.set_position(frame.flip ? frame.mirror_offset : 0, 0);
        if (resized || !previous || previous.crop.some((value, index) => value !== frame.crop[index]))
            this.atlas.set_position(-u * width / w, -v * height / h);
        if (!previous || previous.filter !== frame.filter) {
            const filter = frame.filter === 'nearest' ? Clutter.ScalingFilter.NEAREST : Clutter.ScalingFilter.LINEAR;
            this.atlas.set_content_scaling_filters(filter, filter);
        }
        this.lastFrame = frame;
    }
    destroy() {
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
        this.image?.run_dispose();
        this.image = null;
        this.atlas = null;
        this.viewport = null;
        this.actor = null;
    }
}
