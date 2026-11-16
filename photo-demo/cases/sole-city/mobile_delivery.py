"""Build optional mobile textures and lossless transport without changing source assets."""

import gzip
import hashlib
import importlib.util
import io
import json
import shutil
import struct
import tempfile
from pathlib import Path

from PIL import Image, __version__ as PILLOW_VERSION


TEXTURE_SIZE = 2048
APP = Path(__file__).resolve().parents[2]
TEXTURE_HELPER = APP / 'scripts/glb_textures.py'


def _sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def _read_glb(path):
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError(f'{path.name}: truncated GLB')
    magic, version, length, json_size, chunk = struct.unpack_from('<4sIII4s', data)
    if magic != b'glTF' or version != 2 or length != len(data) or chunk != b'JSON':
        raise ValueError(f'{path.name}: invalid GLB header')
    binary_start = 28 + json_size
    if binary_start > len(data):
        raise ValueError(f'{path.name}: truncated GLB JSON')
    binary_size, binary_type = struct.unpack_from('<I4s', data, 20 + json_size)
    if binary_type != b'BIN\0' or binary_start + binary_size != len(data):
        raise ValueError(f'{path.name}: expected one embedded binary chunk')
    document = json.loads(data[20:20 + json_size])
    if len(document.get('buffers', [])) != 1 or document['buffers'][0].get('uri'):
        raise ValueError(f'{path.name}: mobile delivery requires an embedded GLB buffer')
    binary = data[binary_start:]
    for view in document.get('bufferViews', []):
        start, size = view.get('byteOffset', 0), view['byteLength']
        if view.get('buffer', 0) != 0 or start < 0 or size < 0 or start + size > len(binary):
            raise ValueError(f'{path.name}: bufferView is outside the embedded buffer')
    return document, binary


def _view_bytes(document, binary, index):
    view = document['bufferViews'][index]
    start = view.get('byteOffset', 0)
    return binary[start:start + view['byteLength']]


def _images(document, binary):
    result = []
    for index, description in enumerate(document.get('images', [])):
        if 'bufferView' not in description:
            raise ValueError('Mobile delivery requires images embedded in the GLB')
        payload = _view_bytes(document, binary, description['bufferView'])
        with Image.open(io.BytesIO(payload)) as bitmap:
            result.append(dict(index=index, bufferView=description['bufferView'],
                               width=bitmap.width, height=bitmap.height,
                               alpha='A' in bitmap.getbands() or 'transparency' in bitmap.info,
                               bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(),
                               mimeType=description.get('mimeType')))
    return result


def _verify_geometry(source, mobile):
    """Check actual geometry bytes, including compressed geometry and sparse data."""
    before, original = _read_glb(source)
    after, derived = _read_glb(mobile)
    before_images, after_images = _images(before, original), _images(after, derived)
    image_views = {image['bufferView'] for image in before_images}
    if image_views != {image['bufferView'] for image in after_images}:
        raise ValueError(f'{source.name}: image bufferViews changed')
    if len(before.get('bufferViews', [])) != len(after.get('bufferViews', [])):
        raise ValueError(f'{source.name}: bufferView count changed')
    for key in set(before) | set(after):
        if key not in ('buffers', 'bufferViews', 'images') and before.get(key) != after.get(key):
            raise ValueError(f'{source.name}: {key} changed while resizing textures')
    for old, new in zip(before.get('images', []), after.get('images', [])):
        if ({k: v for k, v in old.items() if k != 'mimeType'} !=
                {k: v for k, v in new.items() if k != 'mimeType'}):
            raise ValueError(f'{source.name}: image metadata changed')
    if len(before_images) != len(after_images):
        raise ValueError(f'{source.name}: image count changed')
    proof = []
    for index, (old, new) in enumerate(zip(before.get('bufferViews', []), after.get('bufferViews', []))):
        if index in image_views:
            continue
        if ({k: v for k, v in old.items() if k != 'byteOffset'} !=
                {k: v for k, v in new.items() if k != 'byteOffset'}):
            raise ValueError(f'{source.name}: non-image bufferView metadata changed')
        a, b = _view_bytes(before, original, index), _view_bytes(after, derived, index)
        if a != b:
            raise ValueError(f'{source.name}: geometry bufferView {index} changed')
        proof.append(dict(index=index, bytes=len(a), sha256=hashlib.sha256(a).hexdigest()))
    for old, new in zip(before_images, after_images):
        if max(new['width'], new['height']) > TEXTURE_SIZE:
            raise ValueError(f'{source.name}: mobile image exceeds {TEXTURE_SIZE}')
        if old['alpha'] and not new['alpha']:
            raise ValueError(f'{source.name}: texture transparency was removed')
        if max(old['width'], old['height']) <= TEXTURE_SIZE and old['sha256'] != new['sha256']:
            raise ValueError(f'{source.name}: an already small texture was re-encoded')
    return dict(geometryBufferViewsIdentical=True, nonImageBufferViews=proof,
                texturesBefore=before_images, texturesAfter=after_images)


def _gzip(source, target):
    # Empty filename and fixed mtime make cache contents independent of staging paths.
    with source.open('rb') as stream, target.open('wb') as output:
        with gzip.GzipFile(filename='', mode='wb', fileobj=output, compresslevel=6, mtime=0) as zipped:
            shutil.copyfileobj(stream, zipped, length=1024 * 1024)


def _verify_gzip(path, expected_sha):
    digest = hashlib.sha256()
    with gzip.open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != expected_sha:
        raise ValueError(f'{path.name}: gzip did not preserve the source bytes')


def _file_record(path):
    return dict(bytes=path.stat().st_size, sha256=_sha(path))


def build_mobile_delivery(folder, out):
    """Keep root assets intact; write desktop/mobile gzip transport and a build report."""
    folder, out = Path(folder), Path(out)
    if not out.is_dir():
        raise ValueError('The prepared scene output directory does not exist')
    module_spec = importlib.util.spec_from_file_location('sole_mobile_glb_textures', TEXTURE_HELPER)
    helper = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(helper)
    signature = hashlib.sha256(json.dumps(dict(
        textureSize=TEXTURE_SIZE, helper=_sha(TEXTURE_HELPER), builder=_sha(Path(__file__)),
        pillow=PILLOW_VERSION, gzipLevel=6), sort_keys=True).encode()).hexdigest()[:24]
    cache = folder / 'web-meshes/mobile-delivery'
    cache.mkdir(parents=True, exist_ok=True)
    mobile = out / 'mobile'
    mobile.mkdir(exist_ok=True)
    report = dict(version=1, textureMaxSize=TEXTURE_SIZE, gzipLevel=6, signature=signature, models=[])
    # Only inspect root source GLBs. Never feed a mobile or gzip result back into the builder.
    for source in sorted(out.glob('*.glb')):
        source_record = _file_record(source)
        key = source_record['sha256'] + '-' + signature
        cached, compressed = cache / (key + '.glb'), cache / (key + '.glb.gz')
        original_compressed = cache / (key + '.original.glb.gz')
        if not original_compressed.exists():
            with tempfile.TemporaryDirectory(dir=cache) as work:
                transport = Path(work) / 'original.glb.gz'
                _gzip(source, transport)
                _verify_gzip(transport, source_record['sha256'])
                transport.replace(original_compressed)
        _verify_gzip(original_compressed, source_record['sha256'])
        shutil.copyfile(original_compressed, source.with_suffix('.glb.gz'))
        if not cached.exists() or not compressed.exists():
            with tempfile.TemporaryDirectory(dir=cache) as work:
                prepared = Path(work) / 'mobile.glb'
                if not helper.resize(source, TEXTURE_SIZE, output=prepared):
                    shutil.copyfile(source, prepared)
                _verify_geometry(source, prepared)
                transport = Path(work) / 'mobile.glb.gz'
                _gzip(prepared, transport)
                _verify_gzip(transport, _sha(prepared))
                prepared.replace(cached)
                transport.replace(compressed)
        proof = _verify_geometry(source, cached)
        mobile_record = _file_record(cached)
        _verify_gzip(compressed, mobile_record['sha256'])
        destination = mobile / source.name
        shutil.copyfile(cached, destination)
        shutil.copyfile(compressed, destination.with_suffix('.glb.gz'))
        if _sha(source) != source_record['sha256']:
            raise ValueError(f'{source.name}: source asset changed during mobile delivery')
        report['models'].append(dict(file=source.name, source=source_record, mobile=mobile_record,
                                     gzip=_file_record(compressed),
                                     originalGzip=_file_record(original_compressed), **proof))
    room = out / 'room.ply'
    if room.is_file():
        source_record = _file_record(room)
        compressed = cache / (source_record['sha256'] + '-' + signature + '.ply.gz')
        if not compressed.exists():
            with tempfile.TemporaryDirectory(dir=cache) as work:
                transport = Path(work) / 'room.ply.gz'
                _gzip(room, transport)
                _verify_gzip(transport, source_record['sha256'])
                transport.replace(compressed)
        _verify_gzip(compressed, source_record['sha256'])
        shutil.copyfile(compressed, out / 'room.ply.gz')
        if _sha(room) != source_record['sha256']:
            raise ValueError('room.ply changed during mobile delivery')
        report['room'] = dict(file=room.name, source=source_record, gzip=_file_record(compressed),
                              decompressedBytesIdentical=True)
    report['totals'] = {key + 'Bytes': sum(model[key]['bytes'] for model in report['models'])
                        for key in ('source', 'mobile', 'gzip', 'originalGzip')}
    # Filenames, public content hashes and dimensions only; no local paths or provider metadata.
    (out / 'delivery-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report
