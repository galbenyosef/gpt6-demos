import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
async function command(args) {
    const process = Gio.Subprocess.new(args, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    return new Promise((resolve,reject) => process.communicate_utf8_async(null,null,(source,result) => {
        try { const [,out,error] = source.communicate_utf8_finish(result); if (!source.get_successful()) throw Error(error); resolve(out); } catch (error) { reject(error); }
    }));
}
function memory(pid) {
    const text = new TextDecoder().decode(GLib.file_get_contents(`/proc/${pid}/status`)[1]);
    return {rss_kib:Number(text.match(/VmRSS:\s+(\d+)/)[1]), peak_kib:Number(text.match(/VmHWM:\s+(\d+)/)[1])};
}
export async function stress(c) {
    const script = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('generate-stress-packs.py').get_path();
    const root = JSON.parse(await command(['python3',script]));
    const original = c.sprite.prepare.bind(c.sprite);
    const records = [{stage:'bundled-before',shell:memory('self'),helper:memory(c.session.bridge.process.get_identifier())}];
    c.sprite.prepare = async (...args) => {
        const texture = await original(...args);
        records.push({stage:`prepared-${args[0].id}-old-texture-retained`,shell:memory('self'),helper:memory(c.session.bridge.process.get_identifier())});
        return texture;
    };
    try {
        for (const id of ['stress-one','stress-two']) {
            await command([`${c.extension.path}/notavirus-gnome`,'import',`${root}/${id}.petpack`]);
            c.enqueue('stress', async s => { await s.bridge.request('reload_packs'); await c.list(s); await c.switchPack(s,id); });
            for (let i=0;i<300 && (c.activeId!==id || c.session.busy);i++) await Scripting.sleep(50);
            if (c.activeId!==id || c.error) throw Error(`Maximum atlas failed: ${c.error}`);
        }
    } finally {
        c.sprite.prepare = original;
        for (const name of ['atlas.png','stress-one.petpack','stress-two.petpack']) Gio.File.new_for_path(`${root}/${name}`).delete(null);
        Gio.File.new_for_path(root).delete(null);
    }
    GLib.file_set_contents('/tmp/notavirus-stress-memory.json',JSON.stringify(records,null,2));
    print(`NOTAVIRUS MAXIMUM ATLAS PASS: ${JSON.stringify(records)}`);
    c.select('gatita');
    for (let i=0;i<150 && c.activeId!=='gatita';i++) await Scripting.sleep(50);
}
