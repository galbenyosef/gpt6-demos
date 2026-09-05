"""Normalize supplied historical scans. Originals and source credits stay untouched."""
from pathlib import Path
from PIL import Image, ImageOps
import json
root = Path(__file__).resolve().parent.parent
majors = ['fool','magician','high-priestess','empress','emperor','hierophant','lovers','chariot','strength','hermit','wheel-of-fortune','justice','hanged-man','death','temperance','devil','tower','star','moon','sun','judgement','world']
# Shared artwork slots, not a claim of equivalence between historical systems.
etteilla = [78,15,8,3,21,13,7,5,11,18,20,9,12,17,10,14,19,4,6,2,16,1]
ranks = ['ace','two','three','four','five','six','seven','eight','nine','ten','page','knight','queen','king']
for deck in ['rider-waite-tarot','etteilla-tarot']:
    dest = root/'public'/'decks'/deck
    dest.mkdir(parents=True, exist_ok=True)
    source = root/deck/'cards'
    mapping = {}
    for i, name in enumerate(majors):
        pattern = f'RWS Tarot {i:02d} *.jpg' if deck.startswith('rider') else f'{etteilla[i]:02d} *.jpg'
        mapping[name] = next(source.glob(pattern))
    for suit, prefix, start in [('wands','Wands',22),('cups','Cups',36),('swords','Swords',50),('pentacles','Pents',64)]:
        for i, rank in enumerate(ranks):
            pattern = f'{prefix}{i+1:02d}.jpg' if deck.startswith('rider') else f'{start+13-i:02d} *.jpg'
            mapping[f'{rank}-of-{suit}'] = next(source.glob(pattern))
    for name, path in mapping.items():
        with Image.open(path) as img:
            img = ImageOps.exif_transpose(img).convert('RGB')
            img.thumbnail((600,1000), Image.Resampling.LANCZOS)
            img.save(dest/f'{name}.jpg', quality=86, optimize=True)
    (dest/'SOURCE-AND-LICENSE.md').write_text((root/deck/'SOURCE-AND-LICENSE.md').read_text())
    (dest/'source-map.json').write_text(json.dumps({name:p.name for name,p in mapping.items()},indent=2))
print('Prepared 156 normalized card images.')
