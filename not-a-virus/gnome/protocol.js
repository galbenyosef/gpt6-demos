// Pure validation shared with the Node boundary tests. No GI or Shell imports.
export const VERSION = 1;
export const MAX_MESSAGE = 65536;
export const validId = id => typeof id === 'string' && /^[a-z0-9_-]{1,128}$/.test(id);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const finite = n => Number.isFinite(n) && Math.abs(n) <= 1e6;
const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(finite);
const string = (v, max) => typeof v === 'string' && v.length <= max;
function require(ok) { if (!ok) throw Error('Invalid helper response; restart NotAVirus'); }
export function validate(message, seq) {
    require(message && message.seq === seq && integer(seq));
    switch (message.type) {
    case 'ack': break;
    case 'error': require(string(message.message, 1024)); break;
    case 'committed': require(integer(message.generation) && validId(message.id)); break;
    case 'packs':
        require(Array.isArray(message.packs) && message.packs.length <= 24 && (message.next === null || integer(message.next)));
        for (const p of message.packs)
            require((p.id === null || validId(p.id)) && string(p.name, 512) && (p.error === null || string(p.error, 512)));
        break;
    case 'asset_ready':
        require(integer(message.generation) && validId(message.id) && string(message.name, 512));
        require(typeof message.session === 'string' && /^session-[a-zA-Z0-9]{6,32}$/.test(message.session));
        require(message.token === `atlas-${message.generation}.rgba`);
        require(integer(message.width) && message.width > 0 && message.width <= 4096);
        require(integer(message.height) && message.height > 0 && message.height <= 4096);
        require(message.bytes === message.width * message.height * 4);
        require(['linear', 'nearest'].includes(message.filter));
        break;
    case 'frame': {
        require(integer(message.generation) && integer(message.monitor_generation));
        require(vector(message.rect, 4) && message.rect[2] > 0 && message.rect[3] > 0 && message.rect[2] <= 8192 && message.rect[3] <= 8192);
        require(vector(message.crop, 4));
        const [x, y, w, h] = message.crop;
        require(x >= -1e-9 && y >= -1e-9 && w > 0 && h > 0 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9);
        require(typeof message.flip === 'boolean' && finite(message.mirror_offset));
        require(['nearest', 'linear'].includes(message.filter) && string(message.phase, 32));
        require(Number.isFinite(message.quiet_for) && message.quiet_for >= 0 && message.quiet_for <= 0.075);
        break;
    }
    default: throw Error('Unknown helper response');
    }
    return message;
}
export class Lines {
    constructor() { this.bytes = []; }
    push(chunk) {
        const lines = [];
        for (const byte of chunk) {
            if (this.bytes.length + 1 > MAX_MESSAGE) throw Error('Helper message exceeds 64 KiB');
            if (byte === 10) {
                lines.push(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(this.bytes)));
                this.bytes = [];
            } else { this.bytes.push(byte); }
        }
        return lines;
    }
}
