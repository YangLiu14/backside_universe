"""Assemble the photo album for static hosting or the original desk-only release.

Large SPZ files are split without changing their bytes to fit static hosting.
The generated loader reassembles them before Spark decodes the scene.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SOURCE = APP / 'dist'
CHUNK_BYTES = 16 * 1024 * 1024


def select_assets(desk_only, screening_pack):
    selected = set()

    def collect(directory, predicate=lambda p: True):
        for path in (SOURCE / directory).rglob('*'):
            if path.is_file() and path.name != '.DS_Store' and predicate(path):
                selected.add(path.relative_to(SOURCE))

    for directory in ['i18n', 'marble-transition-lab', 'assets', 'vendor', 'gs-lab/vendor']:
        collect(directory)
    collect('marble-detail', lambda p: p.name in {'room.js', 'room-detail.spz'})
    collect('marble-lab', lambda p: p.name in {'camera.js', 'world-collider.glb'})
    collect('marble-refined-lab', lambda p: p.suffix in {'.js', '.json', '.png', '.jpg', '.spz'})
    collect('holiday-assets', lambda p: p.parent == SOURCE / 'holiday-assets' and p.suffix == '.js')
    collect('holiday-assets/assets/island-rooms')
    collect('holiday-assets/assets/bookroom', lambda p: p.suffix != '.glb' or p.name in {
        'shell-grotto-v6.glb', 'bookcase-hd.glb', 'chair-hd.glb', 'desk-hd.glb'})
    for island in ['blue-book', 'orange-book', 'phone', 'laptop']:
        collect('holiday-assets/assets/' + island, lambda p: p.name.startswith('desktop-') and p.suffix == '.glb')
    for path in SOURCE.glob('*.js'):
        selected.add(path.relative_to(SOURCE))

    collect('cinema', lambda p: not desk_only or p.name in {'premiere.css', 'room.js', 'joysticks.js', 'prepare-model.js'})
    if screening_pack:
        selected.update(map(Path, ['legacy.html', 'style.css']))
    if not desk_only:
        selected.update(map(Path, ['index.html','legacy.html','style.css']))
        # Include the dog tours, voiced galleries and independent model viewer.
        # Raw reconstruction inputs and duplicate production films stay local.
        omitted = {'source-gaussian.ply','inference-reference.jpg','profile-reference.png',
                   'world-pano.jpg','world-collider.glb','photo-to-hi3d.mp4','museum-tour.mp4'}
        collect('canine-museum', lambda p: p.name not in omitted and not p.name.endswith('-mobile.glb'))

    return selected


def prepare_mobile_models(destination, selected):
    from glb_textures import resize

    variants = []
    for path in sorted(selected):
        if path.suffix == '.glb' and path.parts[0] in {'assets', 'holiday-assets'}:
            if resize(SOURCE / path, 1024, output=destination / 'desk-mobile' / path):
                variants.append(path.as_posix())
    directory = destination / 'desk-mobile'
    directory.mkdir(exist_ok=True)
    catalog = directory / 'catalog.json'
    catalog.write_text(json.dumps(variants, indent=2) + '\n')
    return [catalog] + [directory / path for path in variants]


def build(destination, desk_only=False, screening_pack=False):
    if destination == SOURCE or SOURCE in destination.parents:
        raise ValueError('Build into a separate deployment directory')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Use an empty output directory so old assets cannot enter the release')
    destination.mkdir(parents=True, exist_ok=True)
    selected = select_assets(desk_only, screening_pack)
    chunks, manifest = {}, []
    for relative in sorted(selected):
        source, target = SOURCE / relative, destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        data = source.read_bytes()
        if len(data) > 25 * 1024 * 1024 and relative.parts[0] != 'canine-museum':
            if source.suffix != '.spz':
                raise ValueError(f'Unexpected oversized asset: {relative}')
            parts = []
            for offset in range(0, len(data), CHUNK_BYTES):
                part = target.with_name(target.name + f'.part{len(parts)}')
                part.write_bytes(data[offset:offset + CHUNK_BYTES])
                parts.append('/' + part.relative_to(destination).as_posix())
            chunks['/' + relative.as_posix()] = {'parts': parts, 'bytes': len(data)}
            target.unlink(missing_ok=True)
        else:
            shutil.copy2(source, target)
        manifest.append({'path': relative.as_posix(), 'bytes': len(data),
                         'sha256': hashlib.sha256(data).hexdigest()})

    from glb_textures import prepare_grotto_walk
    generated = [prepare_grotto_walk(SOURCE, destination), *prepare_mobile_models(destination, selected)]
    if not desk_only:
        from glb_textures import prepare_mobile_museum_models
        generated.extend(prepare_mobile_museum_models(SOURCE, destination))
    for file in generated:
        data = file.read_bytes()
        manifest.append({'path': file.relative_to(destination).as_posix(), 'bytes': len(data),
                         'sha256': hashlib.sha256(data).hexdigest()})

    (destination / 'marble-detail/chunks.js').write_text('export const chunks = ' + json.dumps(chunks) + ';\n')
    loader = (SOURCE / 'marble-detail/room.js').read_text()
    loader = loader.replace("import {SplatMesh} from '@sparkjsdev/spark';", """import {SplatMesh} from '@sparkjsdev/spark';
import {chunks} from './chunks.js';

async function roomSource(url, onProgress) {
  const root = new URL('../', import.meta.url);
  const absolute = new URL(url, location.href);
  const path = '/' + absolute.pathname.slice(root.pathname.length);
  const split = chunks[path];
  if (!split) return {url, lod: false, onProgress};
  let loaded = 0;
  const buffers = await Promise.all(split.parts.map(async part => {
    const response = await fetch(new URL(part.slice(1), root));
    if (!response.ok) throw new Error('Scene download failed: ' + response.status);
    const reader = response.body.getReader();
    const received = [];
    let length = 0;
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      received.push(value);
      length += value.length;
      loaded += value.length;
      onProgress?.({loaded, total: split.bytes});
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of received) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }));
  if (loaded !== split.bytes) throw new Error('Incomplete scene download');
  const fileBytes = new Uint8Array(loaded);
  let offset = 0;
  for (const bytes of buffers) {
    fileBytes.set(bytes, offset);
    offset += bytes.length;
  }
  return {fileBytes, fileName: path.split('/').pop(), lod: false};
}""")
    loader = loader.replace('new SplatMesh({url, lod: false, onProgress})', 'new SplatMesh(await roomSource(url, onProgress))')
    (destination / 'marble-detail/room.js').write_text(loader)
    page_path = destination / 'marble-transition-lab/index.html'
    page = page_path.read_text()
    # Local reconstruction comparisons are not part of the published collection.
    start = page.index('<p data-local-review>')
    end = page.index('</p>', start) + len('</p>')
    page = page[:start] + page[end:]
    if screening_pack:
        page = page.replace('href="../index.html" data-album-back', 'href="/" data-album-back')
    elif desk_only:
        start = page.index('<a href="../index.html" data-album-back')
        end = page.index('</a>', start) + len('</a>')
        page = page[:start] + '<span></span>' + page[end:]
        (destination / 'index.html').write_text('''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>工位背后的假期 · 背面宇宙</title>
<meta http-equiv="refresh" content="0;url=./marble-transition-lab/index.html"></head>
<body><a href="./marble-transition-lab/index.html">进入工位背后的假期</a></body></html>
''')
    page_path.write_text(page)
    print(json.dumps({'files': len(manifest), 'bytes': sum(f['bytes'] for f in manifest),
                      'splitScenes': len(chunks)}, ensure_ascii=False))
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--output', type=Path)
    target.add_argument('--prepare-mobile', action='store_true', help='Prepare phone models for the local dev server')
    parser.add_argument('--desk-only', action='store_true', help='Build the single work for hosts with a 25 MiB file limit.')
    parser.add_argument('--screening-pack', action='store_true', help='Build the desk as a versioned album scene.')
    args = parser.parse_args()
    if args.prepare_mobile:
        from glb_textures import prepare_grotto_walk
        prepare_grotto_walk(SOURCE, SOURCE)
        prepare_mobile_models(SOURCE, select_assets(True, True))
        if (SOURCE / 'canine-museum/assets/transition/hi3d-orbit.glb').is_file():
            from glb_textures import prepare_mobile_museum_models
            prepare_mobile_museum_models(SOURCE, SOURCE)
    else:
        build(args.output.resolve(), args.desk_only or args.screening_pack, args.screening_pack)
