import test from 'node:test';
import assert from 'node:assert/strict';
import {Lines, validate, MAX_MESSAGE} from '../../gnome/protocol.js';
const frame = {type:'frame', seq:1, generation:1, monitor_generation:2, rect:[-1920,-100,128,128], crop:[0,0,0.25,0.25], flip:false, mirror_offset:0, filter:'linear', phase:'Idle', quiet_for:0.075};
test('bounded streaming handles fragmentation, multiple lines and oversized/truncated input', () => {
    const lines = new Lines();
    assert.deepEqual(lines.push(new TextEncoder().encode('{"a":')), []);
    assert.deepEqual(lines.push(new TextEncoder().encode('1}\n{}\n')), ['{"a":1}', '{}']);
    assert.throws(() => lines.push(new Uint8Array(MAX_MESSAGE + 1).fill(65)));
});
test('renderer boundary rejects unsafe geometry, crops, sequences and enums', () => {
    assert.equal(validate(frame, 1), frame);
    for (const patch of [{seq:2}, {crop:[0.9,0,0.25,0.25]}, {rect:[NaN,0,128,128]}, {rect:[0,0,-1,128]}, {generation:1.5}, {flip:1}, {filter:'cubic'}, {type:'unknown'}])
        assert.throws(() => validate({...frame,...patch}, 1));
});
test('asset boundary contains filenames and dimensions', () => {
    const asset = {type:'asset_ready', seq:1, generation:2, session:'session-abcdef', token:'atlas-2.rgba', width:512,height:512,bytes:1048576,id:'gatita',name:'gatita',filter:'linear'};
    validate(asset, 1);
    for (const patch of [{token:'../../bad'}, {session:'session-../../bad'}, {width:4097}, {bytes:1}, {id:'../bad'}, {generation:Infinity}])
        assert.throws(() => validate({...asset,...patch},1));
});
