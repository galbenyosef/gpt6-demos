import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'NotAVirus', icon_name: 'preferences-desktop-display-symbolic'});
        const companion = new Adw.PreferencesGroup({title: 'Your companion', description: 'Always click-through. Hidden in Activities and fullscreen.'});
        page.add(companion);
        for (const [title, key] of [['Show companion', 'running'], ['Pause animation and movement', 'paused']]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            companion.add(row);
        }
        const size = new Adw.ComboRow({title: 'Size', model: Gtk.StringList.new(['Small', 'Medium', 'Large'])});
        size.selected = Math.max(0, [1, 1.5, 2].indexOf(settings.get_double('size')));
        let syncingSize = false;
        const sizeSignal = settings.connect('changed::size', () => {
            syncingSize = true;
            size.selected = Math.max(0, [1, 1.5, 2].indexOf(settings.get_double('size')));
            syncingSize = false;
        });
        size.connect('notify::selected', () => {
            if (!syncingSize) settings.set_double('size', [1, 1.5, 2][size.selected]);
        });
        companion.add(size);
        const packs = new Adw.PreferencesGroup({title: 'Character packs', description: 'Import a .petpack archive. Your current companion stays available if the pack cannot be loaded.'});
        const row = new Adw.ActionRow({title: 'Import Pack', subtitle: 'Choose a .petpack file from this computer'});
        const button = new Gtk.Button({label: 'Choose File…', valign: Gtk.Align.CENTER});
        row.add_suffix(button);
        row.activatable_widget = button;
        packs.add(row);
        page.add(packs);
        const info = new Adw.PreferencesGroup({description: 'Quit in the paw menu stops the companion and keeps Start available. Disabling the extension removes everything from the desktop. Packs and preferences are preserved.'});
        page.add(info);
        window.add(page);
        let closed = false;
        const cancel = new Gio.Cancellable();
        window.connect('close-request', () => { closed = true; cancel.cancel(); settings.disconnect(sizeSignal); return false; });
        button.connect('clicked', () => {
            const filter = new Gtk.FileFilter({name: 'Character packs (.petpack)'});
            filter.add_pattern('*.petpack');
            const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
            filters.append(filter);
            const dialog = new Gtk.FileDialog({title: 'Import Character Pack', filters, default_filter: filter});
            dialog.open(window, cancel, (source, result) => {
                let file;
                try { file = source.open_finish(result); } catch (error) {
                    if (!closed && !error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED) && !error.matches(Gtk.DialogError, Gtk.DialogError.CANCELLED) && !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        row.subtitle = `Cannot open the file chooser: ${error.message.slice(0, 160)}. Try again.`;
                    return;
                }
                if (!file?.get_path() || closed) return;
                button.sensitive = false;
                row.subtitle = 'Checking and installing the pack…';
                let process;
                try {
                    process = Gio.Subprocess.new([`${this.path}/notavirus-gnome`, 'import', file.get_path()], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
                } catch (error) { row.subtitle = error.message; button.sensitive = true; return; }
                // Complete an already-started atomic import even if the preferences window closes.
                process.communicate_utf8_async(null, null, (child, completed) => {
                    try {
                        const [, stdout, stderr] = child.communicate_utf8_finish(completed);
                        if (!child.get_successful()) throw Error(stderr.trim() || 'Import failed');
                        const {id} = JSON.parse(stdout);
                        if (typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/.test(id)) throw Error('Invalid import response');
                        settings.set_string('import-pack', id);
                        settings.set_uint('import-revision', (settings.get_uint('import-revision') + 1) >>> 0);
                        if (!closed) row.subtitle = 'Pack installed. It will appear when the companion is running.';
                    } catch (error) { if (!closed) row.subtitle = error.message.slice(0, 240); }
                    if (!closed) button.sensitive = true;
                });
            });
        });
    }
}
