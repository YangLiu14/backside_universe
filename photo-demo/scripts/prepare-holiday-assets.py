"""Prepare source crops only; all authored restoration and scenery use Hi3D."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'scripts/holiday-assets-spec.json').read_text())
OUTPUT = ROOT / 'evidence/holiday-assets-v1'
OUTPUT.mkdir(parents=True, exist_ok=True)
photo = Image.open(ROOT / SPEC['source']).convert('RGB')
for asset in SPEC['assets']:
    target = OUTPUT / asset['id']
    target.mkdir(exist_ok=True)
    photo.crop(asset['bbox']).save(target / 'source-crop.png')
    if asset.get('cutout'):
        source = Image.open(ROOT / 'dist/assets/objects' / asset['cutout']).convert('RGBA')
    elif asset.get('mask'):
        source = photo.convert('RGBA')
        source.putalpha(Image.open(ROOT / 'dist/assets/objects' / asset['mask']).convert('L'))
        source = source.crop(asset['bbox'])
    else:
        source = photo.crop(asset['bbox']).convert('RGBA')
    source.thumbnail((860,860), Image.Resampling.LANCZOS)
    scale = min(860/source.width, 860/source.height)
    source = source.resize((round(source.width*scale), round(source.height*scale)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (1024,1024), 'white')
    canvas.alpha_composite(source, ((1024-source.width)//2, (1024-source.height)//2))
    canvas.convert('RGB').save(target/'source-input.png')
print(json.dumps({'assets':len(SPEC['assets']),'output':str(OUTPUT)},ensure_ascii=False))
