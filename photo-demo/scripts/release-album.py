"""Build independent, immutable scene packs and the lightweight Backside Universe app."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

APP = Path(__file__).resolve().parents[1]
SOURCE = APP / 'dist'
CONFIG = APP / 'deploy/scenes.json'
PINS = APP / 'deploy/releases.json'
HISTORY = APP / 'deploy/published-scenes.json'
CATALOG = SOURCE / 'catalog/works.json'
STORE_HEADERS = ('/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n'
                 '/catalog/art/*\n  Cache-Control: public, max-age=31536000, immutable\n'
                 '/catalog/works.json\n  Cache-Control: public, max-age=0, must-revalidate\n')


def digest_tree(root):
    digest = hashlib.sha256()
    for file in sorted(p for p in root.rglob('*') if p.is_file()):
        digest.update(file.relative_to(root).as_posix().encode() + b'\0')
        with file.open('rb') as stream:
            digest.update(hashlib.file_digest(stream, 'sha256').digest())
    return digest.hexdigest()[:24]


def copy_scene(settings, target):
    for pattern in settings['files']:
        files = [p for p in SOURCE.glob(pattern) if p.is_file() and
                 not any(part.startswith('.') for part in p.relative_to(SOURCE).parts)]
        if not files:
            raise ValueError(f'Missing runtime input: {pattern}')
        for source in files:
            dest = target / source.relative_to(SOURCE)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
    entry = target / settings['entry']
    entry.write_text(entry.read_text().replace('href="../index.html" data-album-back', 'href="/" data-album-back'))
    copy_language_files(entry, target)


def copy_language_files(entry, target):
    if 'i18n/index.js' in entry.read_text():
        shutil.copytree(SOURCE / 'i18n', target / 'i18n', dirs_exist_ok=True, ignore=shutil.ignore_patterns('.*'))


def build_pack(key, settings, store):
    # Build outside the published directory. Only expose the version once complete.
    if store.exists() and any(store.iterdir()) and not (store / 'releases').is_dir():
        raise ValueError('Use an empty directory or an existing scene release store')
    store.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=store.parent) as tmp:
        stage = Path(tmp) / 'pack'
        stage.mkdir()
        if key == 'desk':
            subprocess.run([sys.executable, str(APP / 'scripts/build-holiday-site.py'),
                            '--screening-pack', '--output', str(stage)], check=True)
        else:
            copy_scene(settings, stage)
            if key == 'canine':
                from glb_textures import prepare_mobile_museum_models
                prepare_mobile_museum_models(SOURCE, stage)
        if not (stage / settings['entry']).is_file():
            raise ValueError(f'Missing scene entry for {key}')
        version = digest_tree(stage)
        dest = store / 'releases' / key / version
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            stage.rename(dest)
        except OSError:
            if not dest.is_dir():
                raise
            if digest_tree(dest) != version:
                raise ValueError(f'Stored release failed verification: {dest}')
        for name, content in [
            ('_headers', STORE_HEADERS),
            ('index.html', '<!doctype html><meta charset="utf-8"><title>Backside Universe</title>'
                           '<a href="https://backside-universe.netlify.app/">Backside Universe · 放映相簿</a>'),
        ]:
            file = Path(tmp) / name
            file.write_text(content)
            file.replace(store / name)
    return version


def published_releases(config, pins, published):
    if set(published) != set(config) or set(pins) != set(config):
        raise ValueError('Scene catalog, pins and publication history must describe the same works')
    releases = []
    for key, versions in published.items():
        if not isinstance(versions, list) or pins[key] not in versions:
            raise ValueError(f'Add the new {key} pin to {HISTORY.name} before publishing')
        if len(set(versions)) != len(versions):
            raise ValueError(f'Duplicate published version for {key}')
        for version in versions:
            if not re.fullmatch('[0-9a-f]{24}', version):
                raise ValueError(f'Invalid published version for {key}: {version}')
            releases.append((key, version))
    return releases


def record_pin(key, version, config):
    # A single checkout on the release Mac may prepare two works at once.
    import fcntl
    lock = os.open(PINS.parent, os.O_RDONLY)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        pins = json.loads(PINS.read_text())
        history = json.loads(HISTORY.read_text())
        versions = history.setdefault(key, [])
        if version not in versions:
            versions.append(version)
        pins[key] = version
        recorded = {work: config[work] for work in pins}
        published_releases(recorded, pins, history)
        catalog_files(recorded, pins)
        # Write history first. An interrupted run can safely record the same pin again.
        with tempfile.TemporaryDirectory(dir=PINS.parent) as tmp:
            for path, value in [(HISTORY, history), (PINS, pins)]:
                if json.loads(path.read_text()) != value:
                    staged = Path(tmp) / path.name
                    staged.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
                    staged.replace(path)
    finally:
        os.close(lock)


def verify_store(store, config, pins):
    if (store / '_redirects').exists():
        raise ValueError('Restore the retained release files and remove the obsolete _redirects from the scene store')
    releases = published_releases(config, pins, json.loads(HISTORY.read_text()))
    for key, version in releases:
        entry = store / 'releases' / key / version / config[key]['entry']
        if not entry.is_file():
            raise ValueError(f'Missing published scene: {entry}')
    for version in (store / 'releases').glob('*/*'):
        if not version.is_dir() or digest_tree(version) != version.name:
            raise ValueError(f'Invalid release in store: {version}')
    print('All published scenes are present and stored release hashes match.')
    return releases


def snapshot_files(store, config, pins):
    releases = verify_store(store, config, pins)
    images = verify_catalog(store, config, pins)
    for name in ('index.html', '_headers', 'catalog/works.json', *images):
        yield Path(name)
    for key, version in releases:
        for file in sorted((store / 'releases' / key / version).rglob('*')):
            if file.is_file():
                yield file.relative_to(store)


def export_store(store, config, pins, output):
    if output.exists() or output.is_relative_to(store) or output.is_relative_to(SOURCE):
        raise ValueError('Choose a new export directory outside the store and source tree')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        snapshot = Path(tmp) / 'scenes'
        for name in snapshot_files(store, config, pins):
            dest = snapshot / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(store / name, dest)
        snapshot.rename(output)


def zip_store(store, config, pins, output):
    if output.is_relative_to(store) or output.suffix != '.zip':
        raise ValueError('Choose a .zip output outside the scene store')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staged = Path(tmp) / 'scenes.zip'
        with zipfile.ZipFile(staged, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for name in snapshot_files(store, config, pins):
                archive.write(store / name, name)
        staged.replace(output)


def catalog_files(config, pins):
    """Resolve only released works. Images have their own immutable URLs."""
    works = []
    images = {}
    seen = set()
    for work in json.loads(CATALOG.read_text())['works']:
        key = work['id']
        if not re.fullmatch('[a-z0-9-]+', key) or key in seen:
            raise ValueError(f'Invalid or duplicate work: {key}')
        seen.add(key)
        if key not in config:
            continue
        entry = config[key]['entry']
        if work['entry'] != './' + entry:
            raise ValueError(f'Catalog entry differs from scene configuration: {key}')
        work['entry'] = f'/releases/{key}/{pins[key]}/{entry}'
        texts = [work['title'], work['theme'], work['description']]
        for image in [work['front'], work['back'], *work['strip']]:
            source = (SOURCE / image['src']).resolve()
            if not source.is_relative_to(SOURCE) or source.suffix not in {'.jpg', '.png', '.webp'}:
                raise ValueError(f'Invalid catalog photo: {source}')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()[:24]
            asset = f'catalog/art/{digest}{source.suffix}'
            images[asset] = source
            image['src'] = '/' + asset
            texts.append(image['caption'])
        texts.extend([work['front']['alt'], work['back']['alt']])
        if any(not all(isinstance(text.get(lang), str) and text[lang].strip() for lang in ('zh', 'en'))
               for text in texts):
            raise ValueError(f'Missing catalog translation: {key}')
        works.append(work)
    if set(config) - seen:
        raise ValueError(f'Missing works in {CATALOG}: {set(config) - seen}')
    return {'works': works}, images


def write_catalog(store, config, pins):
    verify_store(store, config, pins)
    catalog, images = catalog_files(config, pins)
    folder = store / 'catalog'
    (folder / 'art').mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=folder) as tmp:
        staged = Path(tmp)
        for name, source in images.items():
            dest = store / name
            copy = staged / dest.name
            shutil.copyfile(source, copy)
            copy.replace(dest)
        (store / '_headers').write_text(STORE_HEADERS)
        pointer = staged / 'works.json'
        pointer.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
        pointer.replace(folder / 'works.json')
    print(f'Catalog ready with {len(catalog["works"])} works.')


def verify_catalog(store, config, pins):
    catalog, images = catalog_files(config, pins)
    if json.loads((store / 'catalog/works.json').read_text()) != catalog:
        raise ValueError('Rebuild the scene catalog before deploying')
    for name, source in images.items():
        if (store / name).read_bytes() != source.read_bytes():
            raise ValueError(f'Catalog photo differs: {name}')
    return sorted(images)


def build_app(origin, target):
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use a public HTTPS asset origin')
    if target.exists() and any(target.iterdir()):
        raise ValueError('Choose an empty app output directory')
    target.mkdir(parents=True, exist_ok=True)
    (target / 'cinema/album-art').mkdir(parents=True)
    for name in ['album.js', 'album.css']:
        shutil.copyfile(SOURCE / 'cinema' / name, target / 'cinema' / name)
    for name in ['paper-grain.webp', 'projection-booth.webp']:
        shutil.copyfile(SOURCE / 'cinema/album-art' / name, target / 'cinema/album-art' / name)
    shutil.copyfile(SOURCE / 'index.html', target / 'index.html')
    copy_language_files(target / 'index.html', target)
    redirects = [f'/{path}/* {origin.rstrip("/")}/{path}/:splat 200' for path in ('catalog', 'releases')]
    # The old standalone links (including their search parameters) must keep working.
    # A small entry document follows the current pin, even after a catalog-only update.
    for directory, key in [('marble-transition-lab', 'desk'), ('canine-museum', 'canine')]:
        folder = target / directory
        folder.mkdir()
        link = f'<a href="/#{key}">返回相簿</a>'
        redirect = ('<script type="module">const r = await fetch("/catalog/works.json", {cache:"no-cache"});'
                    'const catalog = await r.json();'
                    f'const work = catalog.works.find(w => w.id === "{key}");'
                    'if (work) location.replace(work.entry + location.search + location.hash);</script>')
        (folder / 'index.html').write_text('<!doctype html><meta charset="utf-8">' + link + redirect)
    # Preserve historical asset bookmarks and the original experimental desk entry.
    redirects.extend((APP / 'deploy/legacy-redirects.txt').read_text().splitlines())
    (target / '_redirects').write_text('\n'.join(redirects) + '\n')
    (target / '_headers').write_text(STORE_HEADERS +
        '/cinema/*\n  Cache-Control: public, max-age=0, must-revalidate\n'
        '/\n  Cache-Control: public, max-age=0, must-revalidate\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    pack = commands.add_parser('pack', help='Append a scene to the release store and print its pin')
    config = json.loads(CONFIG.read_text())
    pack.add_argument('work', choices=sorted(config))
    pack.add_argument('--store', type=Path, required=True)
    pack.add_argument('--record', action='store_true', help='Record this pin and retain earlier versions (macOS/Linux)')
    catalog = commands.add_parser('catalog', help='Publish pinned scene entries and album artwork into the scene store')
    catalog.add_argument('--store', type=Path, required=True)
    verify = commands.add_parser('verify-store', help='Check the complete local scene library before a Netlify deploy')
    verify.add_argument('--store', type=Path, required=True)
    export = commands.add_parser('export-store', help='Export registered works and versions for local QA and Netlify CLI')
    export.add_argument('--store', type=Path, required=True)
    export.add_argument('--output', type=Path, required=True)
    archive = commands.add_parser('zip-store', help='Verify and archive all published scene versions for Netlify Drop')
    archive.add_argument('--store', type=Path, required=True)
    archive.add_argument('--output', type=Path, required=True)
    app = commands.add_parser('app', help='Build the album shell, independent of catalog contents')
    app.add_argument('--asset-origin', required=True)
    app.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    target = (args.output if args.command == 'app' else args.store).resolve()
    if target == SOURCE or SOURCE in target.parents or target in SOURCE.parents:
        parser.error('Use an output directory outside the source tree')
    if args.command == 'pack':
        version = build_pack(args.work, config[args.work], target)
        if args.record:
            record_pin(args.work, version, config)
        print(args.work, version)
    elif args.command == 'catalog':
        write_catalog(target, config, json.loads(PINS.read_text()))
    elif args.command == 'verify-store':
        pins = json.loads(PINS.read_text())
        verify_store(target, config, pins)
        verify_catalog(target, config, pins)
    elif args.command == 'zip-store':
        zip_store(target, config, json.loads(PINS.read_text()), args.output.resolve())
    elif args.command == 'export-store':
        export_store(target, config, json.loads(PINS.read_text()), args.output.resolve())
    else:
        build_app(args.asset_origin, target)


if __name__ == '__main__':
    main()
