import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(test, message) { if (!test) throw Error(message); }
function child(argv) {
    const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    return new Promise((resolve,reject) => proc.communicate_utf8_async(null,null,(_proc,res) => {
        try { const [,out,err] = proc.communicate_utf8_finish(res);
            if (!proc.get_successful()) throw Error(err); resolve(out.trim());
        } catch (e) { reject(e); }
    }));
}
async function shot(name) {
    const file = Gio.File.new_for_path(GLib.build_filenamev([GLib.getenv('WYANG_TEST_OUTPUT'), name + '.png']));
    const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot(false, stream);stream.close(null);
}
export async function run() {
    await Scripting.disableHelperAutoExit();
    for (const uuid of ['ding@rastersoft.com','ubuntu-dock@ubuntu.com']) {
        if (Main.extensionManager.lookup(uuid)) await Main.extensionManager.enableExtension(uuid);
    }
    Main.overview.hide();
    await Scripting.sleep(700);
    const ext = Main.extensionManager.lookup('wyang@local').stateObj;
    const status=JSON.parse(ext.Status());
    const display=status.displays[0];
    assert(status.shell===50 && display,'Monitor discovery');
    const source=GLib.getenv('WYANG_STAGE_BINARY');
    const root=GLib.build_filenamev([GLib.get_user_data_dir(),'wyang','scenes']);
    const id=await child([source,root,display.id,GLib.build_filenamev([GLib.getenv('WYANG_TEST_OUTPUT'),'export.png']),...display.size.map(String)]);
    const call=(method,...args)=>child(['gdbus','call','--session','--dest','org.gnome.Shell','--object-path','/org/gnome/Shell/Extensions/Wyang','--method','org.gnome.Shell.Extensions.Wyang.'+method,...args]);
    await shot('system-background');
    await call('Apply',display.id,id);
    const s=ext.running.get(display.id);
    assert(s?.ready && s.layer.visible && !s.layer.reactive,'Background placement');
    assert(s.client.owns_window(s.actor.meta_window),'Helper identity');
    assert(s.actor.meta_window.skip_taskbar && !global.display.get_tab_list(Meta.TabList.NORMAL_ALL,null).filter(w => !w.skip_taskbar).includes(s.actor.meta_window),'Alt-Tab exclusion');
    const procId=s.proc.get_identifier();
    await Scripting.sleep(500);assert(s.layer.contains(s.actor),'Surface stayed in the background group');await shot('wallpaper-a');
    await Scripting.sleep(1400);await shot('wallpaper-b');
    await Scripting.sleep(1200);await shot('wallpaper-c');
    try {await call('Apply',display.id,'f'.repeat(64));throw Error('Unexpected success');}
    catch(e){assert(!e.message.includes('Unexpected success'),'Invalid replacement');}
    assert(ext.running.get(display.id)===s && s.layer.visible,'Failed replacement kept prior surface');
    Main.overview.show();await Scripting.sleep(500);assert(!s.layer.visible,'Overview suspension');
    Main.overview.hide();await Scripting.sleep(500);assert(s.layer.visible,'Overview recovery');
    ext.prefs.set_boolean('enable-animations',false);
    await Scripting.sleep(400);await shot('reduced-a');await Scripting.sleep(900);await shot('reduced-b');
    console.log('WYANG_GEOMETRY '+JSON.stringify({surface:s.actor.get_first_child().get_size(), source:s.actor.get_size(), layer:s.layer.get_size(),frame:s.actor.meta_window.get_frame_rect().width, input:s.last}));
    ext.prefs.set_boolean('enable-animations',true);
    await call('Stop',display.id);await Scripting.sleep(500);
    assert(!ext.running.size && !GLib.file_test('/proc/'+procId,GLib.FileTest.EXISTS),'Stop reaped child');
    await shot('restored');
    await call('Apply',display.id,id);
    const second=ext.running.get(display.id).proc.get_identifier();
    await Main.extensionManager.disableExtension('wyang@local');await Scripting.sleep(500);
    assert(!GLib.file_test('/proc/'+second,GLib.FileTest.EXISTS),'Disable reaped child');
    await Main.extensionManager.enableExtension('wyang@local');
    for(let i=0; i<120 && !Main.extensionManager.lookup('wyang@local').stateObj?.running.size; i++) await Scripting.sleep(100);
    const current=Main.extensionManager.lookup('wyang@local').stateObj;
    assert(current.running.has(display.id),'Re-enable restored saved scene');
    await call('Stop',display.id);
    console.log('WYANG_DESKTOP_PASS '+JSON.stringify(display));
}
