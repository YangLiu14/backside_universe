"""Build a local review catalog from recorded Hi3D results; never submits tasks."""
import json
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence/holiday-assets-v1'
OUT = ROOT / 'dist/holiday-assets'
OUT.mkdir(exist_ok=True)
state = json.loads((EVIDENCE / 'catalog-state.json').read_text())
catalog = []
for entry in state:
    dest = OUT / 'assets' / entry['id']
    dest.mkdir(parents=True, exist_ok=True)
    paths = {}
    for kind in ['source', 'front', 'back']:
        if kind == 'source':
            src = EVIDENCE / entry['id'] / 'source-input.png'
        else:
            url = entry.get(kind + 'Url')
            if not url:
                continue
            src = EVIDENCE / entry['id'] / (kind + '-catalog.png')
            marker = src.with_suffix('.url')
            if not src.exists() or not marker.exists() or marker.read_text() != url:
                urllib.request.urlretrieve(url, src)
                marker.write_text(url)
        im = Image.open(src).convert('RGB')
        im.thumbnail((1600,1600), Image.Resampling.LANCZOS)
        im.save(dest / (kind+'.jpg'), quality=94)
        paths[kind] = f'assets/{entry["id"]}/{kind}.jpg'
    catalog.append({k:entry.get(k) for k in ['id','name','reviewStatus','reviewNote','frontTask','backTask','model','study']} | paths)
(OUT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2))
print(json.dumps({'assets':len(catalog),'catalog':str(OUT/'catalog.json')},ensure_ascii=False))
