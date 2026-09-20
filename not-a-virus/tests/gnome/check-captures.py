#!/usr/bin/env python3
"""Compare actual GNOME compositor captures to independently sampled atlas frames."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
ROOT = Path(__file__).resolve().parents[2]
CAPTURES = Path('/tmp/notavirus-gnome-captures')
count = 0
worst = {}
for pack in ['paco','gatita','jellyfish-ufo','living-ink']:
    atlas = Image.open(ROOT / f'resources/packs/{pack}/atlas.png').convert('RGBA')
    rows = atlas.height // 128
    errors = []
    for frame in range(4 * rows):
        tile = atlas.crop((frame%4*128,frame//4*128,frame%4*128+128,frame//4*128+128))
        for size in [1,1.5,2]:
            width = int(128*size)
            scaled = tile.resize((width,width), Image.Resampling.NEAREST if pack == 'paco' else Image.Resampling.BILINEAR)
            for side in ['right','left']:
                source = scaled if side=='right' else scaled.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                expected = Image.new('RGBA',(width,width),(24,32,40,255))
                expected.alpha_composite(source)
                actual = Image.open(CAPTURES / f'{pack}-{frame}-{size}-{side}.png').convert('RGB')
                assert actual.size == (width,width)
                difference = ImageChops.difference(actual, expected.convert('RGB'))
                mean = sum(ImageStat.Stat(difference).mean)/3
                maximum = max(high for low,high in difference.getextrema())
                if pack == 'paco' and size == 1.5:
                    # At exact texel boundaries, GPU float interpolation may choose
                    # either adjacent nearest texel. Admit only those tie choices,
                    # not a general image-error tolerance or a shifted reference.
                    source_tile = tile if side == 'right' else tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    composited = Image.new('RGBA', (128,128), (24,32,40,255))
                    composited.alpha_composite(source_tile)
                    reference = composited.convert('RGB').load()
                    pixels = actual.load()
                    choices = []
                    for x in range(width):
                        q, remainder = divmod((2*x+1)*128, 2*width)
                        choices.append([q] if remainder else [q-1,q])
                    for y in range(width):
                        for x in range(width):
                            assert any(max(abs(a-b) for a,b in zip(pixels[x,y],reference[sx,sy])) <= 1
                                for sx in choices[x] for sy in choices[y]), (pack,frame,size,side,x,y)
                else:
                    assert mean < 0.5 and maximum <= 4, (pack, frame, size, side, mean, maximum)
                errors.append(mean)
                count += 1
    worst[pack] = max(errors)
print(f'{count} GNOME frame/size/facing comparisons passed; worst RGB mean error /255: {worst}')
# Negative controls ensure the tolerance cannot hide orientation/frame mistakes.
atlas = Image.open(ROOT / 'resources/packs/gatita/atlas.png').convert('RGBA')
actual = Image.open(CAPTURES / 'gatita-0-1-right.png').convert('RGB')
for wrong in [atlas.crop((0,256,128,384)), atlas.crop((0,0,128,128)).transpose(Image.Transpose.FLIP_TOP_BOTTOM), atlas.crop((0,0,128,128)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)]:
    bg = Image.new('RGBA',(128,128),(24,32,40,255)); bg.alpha_composite(wrong)
    diff = ImageChops.difference(actual,bg.convert('RGB'))
    mean = sum(ImageStat.Stat(diff).mean)/3
    maximum = max(high for low,high in diff.getextrema())
    assert mean >= 2 or maximum > 72, 'Negative control unexpectedly accepted'
print('Wrong-frame, vertical-flip and wrong-facing negative controls rejected')
