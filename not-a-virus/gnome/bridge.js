import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Lines, MAX_MESSAGE, validate} from './protocol.js';

function closeStream(stream) {
    stream.close_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
        try { source.close_finish(result); } catch (_) { /* Pending cancellation closes again from its completion. */ }
    });
}

export class Bridge {
    constructor(path, onFailure) {
        this.onFailure = onFailure;
        this.cancel = new Gio.Cancellable();
        this.seq = 0;
        this.closed = false;
        this.lines = new Lines();
        this.process = Gio.Subprocess.new([`${path}/notavirus-gnome`, 'serve'], Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        this.input = this.process.get_stdin_pipe();
        this.output = this.process.get_stdout_pipe();
        this.stderr = this.process.get_stderr_pipe();
        this.read(this.output, false);
        this.read(this.stderr, true);
        this.process.wait_async(null, (proc, result) => {
            try { proc.wait_finish(result); } catch (_) { /* Owned child already reaped. */ }
            if (!this.closed) this.fail(Error('Companion stopped unexpectedly. Choose Restart.'));
        });
    }
    read(stream, stderr) {
        stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, this.cancel, (source, result) => {
            try {
                const bytes = source.read_bytes_finish(result).get_data();
                if (this.closed) return;
                if (!bytes.length) {
                    if (!stderr) throw Error('Companion connection closed. Choose Restart.');
                    return;
                }
                if (stderr) {
                    // One bounded diagnostic per child; never log pointer/frame traffic.
                    if (!this.stderrLogged) { console.warn(`NotAVirus: ${new TextDecoder().decode(bytes).slice(0, 1024)}`); this.stderrLogged = true; }
                } else {
                    for (const line of this.lines.push(bytes)) {
                        if (!this.pending) throw Error('Unsolicited helper response');
                        const reply = validate(JSON.parse(line), this.pending.seq);
                        if (reply.type !== 'error' && reply.type !== this.pending.expected)
                            throw Error('Helper response does not match the request');
                        const pending = this.pending;
                        this.pending = null;
                        GLib.Source.remove(pending.timeout);
                        if (reply.type === 'error') pending.reject(Error(reply.message));
                        else pending.resolve(reply);
                    }
                }
                this.read(stream, stderr);
            } catch (error) { this.fail(error); }
            finally { if (this.closed) closeStream(source); }
        });
    }
    request(type, fields = {}) {
        if (this.closed || this.pending) return Promise.reject(Error('Companion connection unavailable'));
        const seq = ++this.seq;
        const data = new TextEncoder().encode(`${JSON.stringify({type, seq, ...fields})}\n`);
        if (data.length > MAX_MESSAGE) return Promise.reject(Error('Control message too large'));
        return new Promise((resolve, reject) => {
            const timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => {
                if (this.pending) this.pending.timeout = 0;
                this.fail(Error('Companion is not responding. Choose Restart.'));
                return GLib.SOURCE_REMOVE;
            });
            const expected = {hello: 'asset_ready', select_pack: 'asset_ready', commit_pack: 'committed', list_packs: 'packs', sample: 'frame'}[type] ?? 'ack';
            this.pending = {seq, resolve, reject, timeout, expected};
            this.input.write_all_async(data, GLib.PRIORITY_DEFAULT, this.cancel, (stream, result) => {
                try { stream.write_all_finish(result); } catch (error) { this.fail(error); }
                finally { if (this.closed) closeStream(stream); }
            });
        });
    }
    fail(error) {
        if (this.closed) return;
        const callback = this.onFailure;
        this.destroy(true);
        callback(error);
    }
    destroy(force = false) {
        if (this.closed) return;
        this.closed = true;
        const pending = this.pending;
        this.pending = null;
        if (pending?.timeout) GLib.Source.remove(pending.timeout);
        pending?.reject(Error('Companion connection closed'));
        this.onFailure = null;
        this.cancel.cancel();
        this.lines.bytes = [];
        closeStream(this.input);
        closeStream(this.output);
        closeStream(this.stderr);
        if (force || pending) this.process.force_exit();
        // Idle child exits on EOF; wait_async above reaps it without blocking Shell.
    }
}
