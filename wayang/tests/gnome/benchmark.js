import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export async function run(){
    await Scripting.disableHelperAutoExit();
    Main.overview.hide();await Scripting.sleep(800);
    const ext=Main.extensionManager.lookup('wyang@local').stateObj;
    const d=JSON.parse(ext.Status()).displays[0];
    if (d.size[0]!==1920 || d.size[1]!==1080) throw Error('Benchmark requires a 1080p monitor');
    ext.prefs.set_boolean("enable-animations", true);
    const root=GLib.build_filenamev([GLib.get_user_data_dir(),'wyang','scenes']);
    const child=Gio.Subprocess.new([GLib.getenv('WYANG_STAGE_BINARY'),root,d.id],Gio.SubprocessFlags.STDOUT_PIPE);
    const [,out]=child.communicate_utf8(null,null);
    if (!child.get_successful()) throw Error('Scene preparation failed');
    await new Promise((resolve,reject)=>ext.start(d.id,out.trim(),{return_value:resolve,return_dbus_error:(_,msg)=>reject(Error(msg))}));
    const pid=ext.running.get(d.id).proc.get_identifier();
    const path=GLib.build_filenamev([GLib.getenv('WYANG_PROFILE_DIR'),'player-'+pid+'.json']);
    for(let i=0;i<75 && !GLib.file_test(path,GLib.FileTest.EXISTS);i++) {
        if(i===5 || i===55) console.log('WYANG_SAMPLE '+ext.running.get(d.id)?.last);
        await Scripting.sleep(1000);
    }
    if (!GLib.file_test(path,GLib.FileTest.EXISTS)) throw Error('No 60-second measurement');
    ext.Stop(d.id);console.log('WYANG_PROFILE '+path);
}
