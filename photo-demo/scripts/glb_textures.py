"""Resize images embedded in a GLB without re-encoding its compressed geometry."""
import io
import json
import os
import shutil
import struct
import tempfile
from PIL import Image


def prepare_mobile_museum_models(source, destination):
    assets = source / 'canine-museum/assets'
    originals = [assets / 'transition/hi3d-orbit.glb', *sorted((assets / 'hi3d-galleries').glob('*-detail.glb'))]
    outputs = []
    for original in originals:
        mobile = destination / original.relative_to(source).with_name(original.stem + '-mobile.glb')
        if not resize(original, 1024, output=mobile):
            mobile.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, mobile)
        outputs.append(mobile)
    return outputs


def resize(path, size=None, *, output=None):
    if size is None:
        size = 1024 if path.stem.endswith('-overview') else 3072
    data = path.read_bytes()
    count = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+count])
    start = 28+count
    replacements = {}
    for image in doc.get('images', []):
        index = image['bufferView']
        view = doc['bufferViews'][index]
        pos = start + view.get('byteOffset', 0)
        with Image.open(io.BytesIO(data[pos:pos+view['byteLength']])) as bitmap:
            if max(bitmap.size) <= size:
                continue
            bitmap.thumbnail((size,size), Image.Resampling.LANCZOS, reducing_gap=2)
            out = io.BytesIO()
            if output is not None and ('A' in bitmap.getbands() or 'transparency' in bitmap.info):
                bitmap.convert('RGBA').save(out, format='PNG')
                image['mimeType'] = 'image/png'
            else:
                bitmap.convert('RGB').save(out, format='JPEG', quality=90, subsampling=0)
                image['mimeType'] = 'image/jpeg'
            replacements[index] = out.getvalue()
    if not replacements:
        return False
    binary = bytearray()
    for index,view in enumerate(doc['bufferViews']):
        pos = start+view.get('byteOffset',0)
        payload = replacements.get(index,data[pos:pos+view['byteLength']])
        binary.extend(b'\x00'*(-len(binary)%4))
        view['byteOffset'],view['byteLength'] = len(binary),len(payload)
        binary.extend(payload)
    write_glb(path, output or path, doc, binary)
    print(path.name, size, len(binary))
    return True


def write_glb(path, target, doc, binary):
    doc['buffers'][0]['byteLength'] = len(binary)
    binary.extend(b'\x00'*(-len(binary)%4))
    header = json.dumps(doc,separators=(',',':')).encode()
    header += b' '*(-len(header)%4)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as output:
        output.write(struct.pack('<4sIII4s',b'glTF',2,28+len(header)+len(binary),len(header),b'JSON'))
        output.write(header);output.write(struct.pack('<I4s',len(binary),b'BIN\0'));output.write(binary)
        temp = output.name
    os.chmod(temp,path.stat().st_mode & 0o777)
    os.replace(temp,target)


def prepare_grotto_walk(source, destination):
    """Reuse the decimated cave in its authored frame, without downloading its textures."""
    directory = 'holiday-assets/assets/laptop'
    original = source / directory / 'desktop-grotto.glb'
    target = destination / directory / 'walk-surface.glb'
    data = original.read_bytes()
    count = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+count])
    images = {image['bufferView'] for image in doc.pop('images', [])}
    for key in ('materials', 'textures', 'samplers'):
        doc.pop(key, None)
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            primitive.pop('material', None)
    offsets, views, binary = {}, [], bytearray()
    for index, view in enumerate(doc['bufferViews']):
        if index in images:
            continue
        start = 28 + count + view.get('byteOffset', 0)
        offsets[index] = len(views)
        views.append({**view, 'byteOffset': len(binary)})
        binary.extend(data[start:start+view['byteLength']])
        binary.extend(b'\0' * (-len(binary) % 4))
    for accessor in doc['accessors']:
        if 'bufferView' in accessor:
            accessor['bufferView'] = offsets[accessor['bufferView']]
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            draco = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if draco:
                draco['bufferView'] = offsets[draco['bufferView']]
    doc['bufferViews'] = views
    write_glb(original, target, doc, binary)
    return target
