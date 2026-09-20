#!/usr/bin/env python3
"""Synthetic maximum-atlas fixtures; output is temporary and never bundled."""
import json
from pathlib import Path
import tempfile
import zipfile
from PIL import Image, ImageDraw
root = Path(tempfile.mkdtemp(prefix='notavirus-stress-'))
image = Image.new('RGBA',(4096,4096),(0,0,0,0))
ImageDraw.Draw(image).rectangle((16,16,112,112),fill=(40,180,220,255))
image.save(root / 'atlas.png')
for name in ['stress-one','stress-two']:
    manifest = f'''schema = 1
id = "{name}"
name = "Synthetic maximum atlas"
version = 1
tile = [128, 128]
anchor = [64, 116]
filter = "nearest"
[atlas]
file = "atlas.png"
grid = [32, 32]
[behavior]
idle = "idle"
moving = "moving"
[states.idle]
frames = [0]
fps = 1
loop = true
[states.moving]
frames = [0]
fps = 1
loop = true
'''
    with zipfile.ZipFile(root / f'{name}.petpack','w') as z:
        z.writestr('pack.toml',manifest)
        z.write(root / 'atlas.png','atlas.png')
print(json.dumps(str(root)))
