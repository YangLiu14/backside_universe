"""Build independent, immutable scene packs and the lightweight Backside Universe app."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

APP = Path(__file__).resolve().parents[1]
SOURCE = APP / 'dist'
CONFIG = APP / 'deploy/scenes.json'
PINS = APP / 'deploy/releases.json'
HISTORY = APP / 'deploy/published-scenes.json'


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
        if not (stage / settings['entry']).is_file():
            raise ValueError(f'Missing scene entry for {key}')
        version = digest_tree(stage)
        dest = store / 'releases' / key / version
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            if digest_tree(dest) != version:
                raise ValueError(f'Stored release failed verification: {dest}')
        else:
            stage.rename(dest)
    (store / '_headers').write_text('/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n')
    (store / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Backside Universe</title>'
                                      '<a href="https://backside-universe.netlify.app/">Backside Universe · 放映相簿</a>')
    return version


def published_releases(config, pins):
    published = json.loads(HISTORY.read_text())
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


def verify_store(store, config, pins):
    if (store / '_redirects').exists():
        raise ValueError('Restore the retained release files and remove the obsolete _redirects from the scene store')
    releases = published_releases(config, pins)
    for key, version in releases:
        entry = store / 'releases' / key / version / config[key]['entry']
        if not entry.is_file():
            raise ValueError(f'Missing published scene: {entry}')
    for version in (store / 'releases').glob('*/*'):
        if not version.is_dir() or digest_tree(version) != version.name:
            raise ValueError(f'Invalid release in store: {version}')
    print('All published scenes are present and stored release hashes match.')
    return releases


def zip_store(store, config, pins, output):
    if output.is_relative_to(store) or output.suffix != '.zip':
        raise ValueError('Choose a .zip output outside the scene store')
    releases = verify_store(store, config, pins)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staged = Path(tmp) / 'scenes.zip'
        with zipfile.ZipFile(staged, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for name in ('index.html', '_headers'):
                archive.write(store / name, name)
            for key, version in releases:
                for file in sorted((store / 'releases' / key / version).rglob('*')):
                    if file.is_file():
                        archive.write(file, file.relative_to(store))
        staged.replace(output)


class AlbumLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.works = {}
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'data-work' in attrs:
            key = attrs['data-work']
            if key in self.works:
                raise ValueError(f'Duplicate album entry: {key}')
            self.works[key] = attrs['href']
        if tag == 'img':
            self.images.extend(attrs[k] for k in ('src', 'data-still') if k in attrs)


def build_app(config, pins, origin, target):
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use a public HTTPS asset origin')
    if target.exists() and any(target.iterdir()):
        raise ValueError('Choose an empty app output directory')
    page = (SOURCE / 'index.html').read_text()
    album = AlbumLinks()
    album.feed(page)
    if set(album.works) != set(config):
        raise ValueError('Album links and deploy/scenes.json must describe the same works')
    redirects = []
    for key, settings in config.items():
        version = pins.get(key, '')
        if not re.fullmatch('[0-9a-f]{24}', version):
            raise ValueError(f'Build and pin the release for {key} before publishing the app')
        entry = settings['entry']
        if album.works[key] != './' + entry:
            raise ValueError(f'Album entry URL differs for {key}')
        prefix = f'/releases/{key}/{version}'
        page = page.replace(f'href="./{entry}"', f'href="{prefix}/{entry}"')
        alias = entry.rsplit('/', 1)[0]
        redirects.append(f'/{alias}/* {prefix}/{alias}/:splat 302')
        if key == 'desk':
            redirects.append(f'/legacy.html {prefix}/legacy.html 302')
    redirects.append(f'/releases/* {origin.rstrip("/")}/releases/:splat 200')
    target.mkdir(parents=True, exist_ok=True)
    (target / 'cinema').mkdir()
    for name in ['album.js', 'album.css']:
        shutil.copyfile(SOURCE / 'cinema' / name, target / 'cinema' / name)
    shutil.copytree(SOURCE / 'cinema/album-art', target / 'cinema/album-art', ignore=shutil.ignore_patterns('.*'))
    for url in album.images:
        if not (target / url).is_file():
            raise ValueError(f'Missing album image: {url}')
    (target / 'index.html').write_text(page)
    copy_language_files(target / 'index.html', target)
    (target / '_redirects').write_text('\n'.join(redirects) + '\n')
    (target / '_headers').write_text('/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n'
                                     '/cinema/*\n  Cache-Control: public, max-age=0, must-revalidate\n'
                                     '/\n  Cache-Control: public, max-age=0, must-revalidate\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    pack = commands.add_parser('pack', help='Append a scene to the release store and print its pin')
    config = json.loads(CONFIG.read_text())
    pack.add_argument('work', choices=sorted(config))
    pack.add_argument('--store', type=Path, required=True)
    verify = commands.add_parser('verify-store', help='Check the complete local scene library before a Netlify deploy')
    verify.add_argument('--store', type=Path, required=True)
    archive = commands.add_parser('zip-store', help='Verify and archive all published scene versions for Netlify Drop')
    archive.add_argument('--store', type=Path, required=True)
    archive.add_argument('--output', type=Path, required=True)
    app = commands.add_parser('app', help='Build the album using deploy/releases.json, without reading any 3D assets')
    app.add_argument('--asset-origin', required=True)
    app.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    target = (args.output if args.command == 'app' else args.store).resolve()
    if target == SOURCE or SOURCE in target.parents or target in SOURCE.parents:
        parser.error('Use an output directory outside the source tree')
    if args.command == 'pack':
        print(args.work, build_pack(args.work, config[args.work], target))
    elif args.command == 'verify-store':
        verify_store(target, config, json.loads(PINS.read_text()))
    elif args.command == 'zip-store':
        zip_store(target, config, json.loads(PINS.read_text()), args.output.resolve())
    else:
        pins = json.loads(PINS.read_text())
        published_releases(config, pins)
        build_app(config, pins, args.asset_origin, target)


if __name__ == '__main__':
    main()
