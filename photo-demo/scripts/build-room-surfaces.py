"""Prepare two CC0 material scans for metric interior surfaces, using FFmpeg."""
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

output = Path(__file__).resolve().parents[1] / 'dist/holiday-assets/assets/island-rooms'
output.mkdir(parents=True, exist_ok=True)

def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'BacksideUniverse asset builder'}), timeout=60) as response:
        return response.read()

with tempfile.TemporaryDirectory() as directory:
    for source, tint in [('plaster_grey_04', 'hue=s=0,eq=contrast=1.09:brightness=0.19'),
                         ('wood_floor_deck', 'hue=s=0.49,eq=gamma=1.36:brightness=0.06:contrast=0.87')]:
        catalog = json.loads(fetch('https://api.polyhaven.com/files/' + source))
        for channel, alternatives in [('color', ('diffuse', 'diff', 'color')), ('normal', ('nor_gl',)), ('rough', ('rough',))]:
            key = next(k for k in catalog if k.lower() in alternatives)
            descriptor = catalog[key]['2k' if channel == 'color' else '1k']['jpg']
            data = fetch(descriptor['url'])
            if hashlib.md5(data).hexdigest() != descriptor['md5']:
                raise ValueError('Incomplete texture download: ' + source)
            original = Path(directory) / 'scan.jpg'
            original.write_bytes(data)
            dest = output / (source + '-' + channel + '.jpg')
            args = ['ffmpeg', '-v', 'error', '-y', '-i', str(original)]
            if channel == 'color':
                args.extend(['-vf', tint])
            subprocess.run(args + ['-frames:v', '1', '-pix_fmt', 'yuvj444p', '-q:v', '3', str(dest)], check=True)
