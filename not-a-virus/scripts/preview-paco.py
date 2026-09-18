#!/usr/bin/env python3
"""Create a self-contained review page from the actual shipped manifest/atlas."""
from pathlib import Path
import argparse
import base64
import json
import tomllib

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', nargs='?', default='paco', choices=['paco', 'gatita'])
pack_id = parser.parse_args().pack
pack = root / 'resources/packs' / pack_id
manifest = tomllib.loads((pack / 'pack.toml').read_text())
atlas = base64.b64encode((pack / 'atlas.png').read_bytes()).decode()
page = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__NAME__ · animation review</title>
<style>
:root {color-scheme:light dark;font:16px/1.5 system-ui;background:#ece9e3;color:#272921}
body{max-width:900px;margin:48px auto;padding:0 24px}h1{font-size:32px;margin:0}p{max-width:66ch}
.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:end;margin:28px 0}
label{display:grid;gap:6px}button,select{font:inherit;padding:8px 12px;border:1px solid #666b60;border-radius:6px;background:#fff;color:#272921}
button:focus-visible,select:focus-visible{outline:3px solid #1966b2;outline-offset:3px}
#stage{height:340px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #b4b5ad}
canvas{image-rendering:__FILTER__}small{display:block;margin:12px 0;color:#4e544a}
@media(prefers-color-scheme:dark){:root{background:#20251f;color:#f4f0e9}small{color:#b8c3b5}}
</style>
<h1>__NAME__</h1><p>Animation review from the shipped pack. This page previews the frames without opening the desktop companion.</p>
<div class="controls"><label>Animation<select id="clip"></select></label>
<label>Size<select id="size"><option value="1">Small · 128 pt</option><option value="1.5">Medium · 192 pt</option><option value="2">Large · 256 pt</option></select></label>
<label>Facing<select id="face"><option value="1">Right</option><option value="-1">Left</option></select></label>
<label>Background<select id="bg"><option value="#ffffff">Light</option><option value="#232b25">Dark</option><option value="#c5d8e7">Blue</option></select></label>
<button id="play" type="button">Pause</button><button id="restart" type="button">Restart</button></div>
<div id="stage"><canvas aria-label="__NAME__ animation preview" width="128" height="128"></canvas></div>
<small id="position" aria-live="off"></small>
<p>__DESCRIPTION__</p>
<p>This is an artwork preview. Native rendering, movement, click-through and desktop behavior are verified separately.</p>
<script>
const pack=__PACK__, img=new Image(), canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const clip=document.querySelector('#clip'),size=document.querySelector('#size'),face=document.querySelector('#face'),play=document.querySelector('#play');
const labels={sit_and_wipe:'Sit and wipe',huffing_run:'Huffing run',stand_up:'Stand up',sit_down:'Sit down',turn_around:'Turn around',doze:'Doze',play_roll_purr:'Play, roll and purr',bound:'Bound',crouch:'Crouch',settle:'Settle',tail_flick:'Tail flick',curl_up_asleep:'Curl up asleep',stretch:'Stretch'};
for(const key of Object.keys(pack.states)){let o=document.createElement('option');o.value=key;o.textContent=labels[key]||key;clip.append(o)}
let elapsed=0,last=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
function state(){const s=pack.states[clip.value], d=s.durations_ms||s.frames.map(()=>1000/s.fps),total=d.reduce((a,b)=>a+b,0);let t=s.loop===false?Math.min(elapsed,total-0.001):elapsed%total,i=0;while(i<d.length-1&&t>=d[i]){t-=d[i++]}return [s.frames[i],i,total]}
function draw(){const [n,i,total]=state(),scale=Number(size.value);canvas.width=canvas.height=128*scale;ctx.imageSmoothingEnabled=pack.filter==='linear';ctx.save();if(face.value==='-1'){ctx.translate(canvas.width,0);ctx.scale(-1,1)}ctx.drawImage(img,n%pack.atlas.grid[0]*128,Math.floor(n/pack.atlas.grid[0])*128,128,128,0,0,canvas.width,canvas.height);ctx.restore();document.querySelector('#position').textContent=`Frame ${i+1} of ${pack.states[clip.value].frames.length} · ${Math.round(total)} ms ${pack.states[clip.value].loop===false?'one-shot':'loop'}`}
function tick(now){if(last&&playing&&!document.hidden)elapsed+=Math.min(now-last,100);last=now;draw();requestAnimationFrame(tick)}
function sync(){play.textContent=playing?'Pause':'Play'}
clip.onchange=()=>{elapsed=0;draw()};size.onchange=face.onchange=draw;
document.querySelector('#bg').onchange=e=>document.querySelector('#stage').style.background=e.target.value;
play.onclick=()=>{playing=!playing;sync()};document.querySelector('#restart').onclick=()=>{elapsed=0;draw()};
sync();img.onload=()=>requestAnimationFrame(tick);img.src='data:image/png;base64,__ATLAS__';
</script></html>'''
output = root / 'art' / pack_id / 'preview.html'
name = 'Paco' if pack_id == 'paco' else 'gatita'
description = ('Idle includes a sweat wipe; start and stop show the effort of getting up and sitting down. Turns use a brief front view. Dozing is silent.' if pack_id == 'paco' else 'Paw play leads into a roll and quiet breathing. A quick crouch starts the bounding chase; landing leads into a tail flick. Curled sleep wakes with a stretch. Purring is visual and silent. This page previews each clip separately; the app chains Settle into Tail flick.')
output.write_text(page.replace('__PACK__', json.dumps(manifest)).replace('__ATLAS__', atlas).replace('__NAME__', name).replace('__FILTER__', 'auto' if manifest['filter'] == 'linear' else 'pixelated').replace('__DESCRIPTION__', description))
print(output)
