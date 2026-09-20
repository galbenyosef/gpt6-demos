import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Bridge} from './bridge.js';
import {Sprite} from './sprite.js';
import {geometry} from './geometry.js';
import {Indicator} from './indicator.js';
import {VERSION, validId} from './protocol.js';

export class Controller {
    constructor(extension) {
        this.extension = extension;
        this.settings = extension.getSettings();
        this.connections = [];
        this.layoutGeneration = 1;
        this.packs = [];
        this.error = null;
        this.dead = false;
        this.indicator = new Indicator(this);
        const connect = (object, signal, fn) => this.connections.push([object, object.connect(signal, fn)]);
        connect(this.settings, 'changed::running', () => this.settings.get_boolean('running') ? this.start() : this.stop());
        connect(this.settings, 'changed::paused', () => this.enqueue('pause', async s => {
            await s.bridge.request('set_paused', {paused: this.settings.get_boolean('paused')});
            s.reset = true;
            this.indicator.refresh();
        }));
        connect(this.settings, 'changed::size', () => this.enqueue('size', async s => {
            await s.bridge.request('set_size', {size: this.size});
            s.refresh = true; s.reset = true;
            this.indicator.refresh();
        }));
        connect(this.settings, 'changed::pack', () => {
            const id = this.settings.get_string('pack');
            if (id !== this.activeId) this.select(id);
        });
        connect(this.settings, 'changed::import-revision', () => this.enqueue('import', async s => {
            await s.bridge.request('reload_packs');
            await this.list(s);
            await this.switchPack(s, this.settings.get_string('import-pack'));
            if (this.session === s) this.settings.set_uint('applied-import-revision', this.settings.get_uint('import-revision'));
        }));
        const relocated = () => { this.layoutGeneration++; if (this.session) { this.session.reset = true; this.session.refresh = true; } };
        connect(Main.layoutManager, 'monitors-changed', relocated);
        connect(global.display, 'workareas-changed', relocated);
        connect(global.workspace_manager, 'active-workspace-changed', relocated);
        connect(global.display, 'in-fullscreen-changed', relocated);
        connect(Main.overview, 'showing', () => { this.sprite?.actor.hide(); if (this.session) this.session.reset = true; });
        connect(Main.overview, 'hidden', relocated);
        this.start();
    }
    get size() { const size = this.settings.get_double('size'); return [1, 1.5, 2].includes(size) ? size : 1; }
    start() {
        if (this.dead || this.session || !this.settings.get_boolean('running')) { this.indicator.refresh(); return; }
        this.error = null;
        try {
            this.sprite = new Sprite();
            const s = {cancel: new Gio.Cancellable(), pending: new Map(), busy: false, reset: true, refresh: true, lastTime: 0, lastGeometry: '', ready: false};
            this.session = s;
            s.bridge = new Bridge(this.extension.path, error => {
                if (this.session !== s) return;
                this.error = error.message;
                this.stop();
            });
            this.enqueue('start', async () => {
                const imported = this.settings.get_uint('import-revision') !== this.settings.get_uint('applied-import-revision');
                let id = imported ? this.settings.get_string('import-pack') : this.settings.get_string('pack');
                if (!validId(id)) id = 'default';
                const asset = await s.bridge.request('hello', {version: VERSION, pack: id, size: this.size, paused: this.settings.get_boolean('paused')});
                if (asset.version !== VERSION || asset.build !== this.extension.metadata['version-name']) throw Error('Helper build mismatch. Reinstall this extension.');
                await this.acceptAsset(s, asset);
                if (this.session !== s) return;
                if (imported) this.settings.set_uint('applied-import-revision', this.settings.get_uint('import-revision'));
                await this.list(s);
                s.ready = true;
                this.indicator.refresh();
            });
            this.schedule(17);
        } catch (error) { this.error = error.message; this.stop(); }
        this.indicator.refresh();
    }
    async list(s) {
        const packs = [];
        let offset = 0;
        do {
            const reply = await s.bridge.request('list_packs', {offset});
            if (reply.type !== 'packs') throw Error('Invalid pack list');
            packs.push(...reply.packs);
            if (reply.next !== null && reply.next <= offset) throw Error('Invalid pack pagination');
            offset = reply.next;
            if (packs.length > 4096) throw Error('Too many installed packs');
        } while (offset !== null && this.session === s);
        if (this.session === s) { this.packs = packs; this.indicator.refresh(); }
    }
    async acceptAsset(s, asset) {
        if (asset.type !== 'asset_ready') throw Error('Expected a staged atlas');
        if (s.assetSession && s.assetSession !== asset.session) throw Error('Unexpected asset session');
        s.assetSession = asset.session;
        let image;
        try { image = await this.sprite.prepare(asset, s.cancel); }
        catch (error) {
            if (this.session === s) await s.bridge.request('discard_pack', {generation: asset.generation});
            throw error;
        }
        if (this.session !== s) { image.run_dispose(); return; }
        let reply;
        try { reply = await s.bridge.request('commit_pack', {generation: asset.generation}); }
        catch (error) { image.run_dispose(); throw error; }
        if (this.session !== s) { image.run_dispose(); return; }
        if (reply.type !== 'committed' || reply.generation !== asset.generation || reply.id !== asset.id) { image.run_dispose(); throw Error('Invalid pack commit'); }
        this.sprite.commit(image, asset.generation);
        this.activeId = asset.id;
        this.settings.set_string('pack', asset.id);
        this.error = null;
        s.refresh = true; s.reset = true;
        console.log(`NotAVirus: selected ${asset.id}`);
        this.indicator.refresh();
    }
    async switchPack(s, id) {
        const asset = await s.bridge.request('select_pack', {id});
        await this.acceptAsset(s, asset);
    }
    select(id) {
        this.enqueue('select', s => this.switchPack(s, id));
    }
    enqueue(key, action) {
        if (!this.session) { this.indicator.refresh(); return; }
        this.session.pending.set(key, action); // At most one latest operation per control.
        this.pump();
    }
    async pump() {
        const s = this.session;
        if (!s || s.busy) return;
        const entry = s.pending.entries().next().value;
        if (!entry) return;
        s.pending.delete(entry[0]);
        s.busy = true;
        try { await entry[1](s); }
        catch (error) {
            if (this.session === s) {
                this.error = error.message;
                if (!s.ready) this.stop();
                else {
                    this.settings.set_string('pack', this.activeId);
                    this.indicator.refresh();
                }
            }
        } finally {
            s.busy = false;
            if (this.session === s && s.pending.size) this.pump();
        }
    }
    schedule(delay) {
        if (!this.session || this.dead) return;
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this.timer = 0;
            this.tick();
            const s = this.session;
            if (s) this.schedule(s.hidden || this.settings.get_boolean('paused') ? 250 : 17);
            return GLib.SOURCE_REMOVE;
        });
    }
    tick() {
        const s = this.session;
        if (!s?.ready) return;
        const now = GLib.get_monotonic_time();
        const [pointerX, pointerY] = global.get_pointer();
        if (!s.reset && !s.refresh && !s.pending.size && !s.hidden && now < (s.quietUntil ?? 0)
            && pointerX === s.pointerX && pointerY === s.pointerY) return;
        const sample = geometry(this.layoutGeneration);
        if (!sample) { this.sprite.actor.hide(); s.reset = true; return; }
        s.hidden = !sample.visible;
        if (s.hidden) { this.sprite.actor.hide(); s.reset = true; return; }
        // Compare only layout, not cursor motion, while paused.
        const key = JSON.stringify([sample.monitor, sample.work, sample.monitor_id, sample.monitor_generation]);
        if (s.lastGeometry !== key) { s.refresh = true; s.reset = true; }
        if (s.busy || s.pending.size) { this.pump(); return; }
        if (this.settings.get_boolean('paused') && !s.refresh && !s.reset) { this.sprite.actor.show(); return; }
        sample.dt = s.reset || !s.lastTime ? 0 : Math.min((now - s.lastTime) / 1e6, 0.1);
        sample.reset = s.reset;
        s.pointerX = pointerX; s.pointerY = pointerY;
        s.lastTime = now; s.lastGeometry = key; s.reset = false; s.refresh = false;
        s.busy = true;
        const generation = this.layoutGeneration;
        s.bridge.request('sample', {sample}).then(frame => {
            if (this.session !== s || generation !== this.layoutGeneration) return;
            if (frame.type !== 'frame' || frame.monitor_generation !== generation) throw Error('Invalid simulation response');
            // Visibility can change while the pipe response is in flight.
            if (!geometry(this.layoutGeneration)?.visible) { this.sprite.actor.hide(); s.reset = true; return; }
            s.quietUntil = now + frame.quiet_for * 1e6;
            this.sprite.apply(frame);
            this.sprite.actor.show();
        }).catch(error => {
            if (this.session === s) { this.error = error.message; this.stop(); }
        }).finally(() => { s.busy = false; if (this.session === s) this.pump(); });
    }
    stop() {
        const s = this.session;
        this.session = null;
        if (this.timer) { GLib.Source.remove(this.timer); this.timer = 0; }
        s?.pending.clear();
        s?.cancel.cancel();
        s?.bridge?.destroy();
        this.sprite?.destroy();
        this.sprite = null;
        this.indicator.refresh();
    }
    restart() { this.stop(); this.start(); }
    destroy() {
        this.dead = true;
        for (const [object, id] of this.connections) object.disconnect(id);
        this.connections = [];
        this.stop();
        this.indicator.destroy();
    }
}
