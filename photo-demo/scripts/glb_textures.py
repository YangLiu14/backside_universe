"""Resize images embedded in a GLB without re-encoding its compressed geometry."""
import io
import json
import os
import struct
import tempfile
from PIL import Image

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
    doc['buffers'][0]['byteLength'] = len(binary)
    binary.extend(b'\x00'*(-len(binary)%4))
    header = json.dumps(doc,separators=(',',':')).encode()
    header += b' '*(-len(header)%4)
    target = output or path
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as output:
        output.write(struct.pack('<4sIII4s',b'glTF',2,28+len(header)+len(binary),len(header),b'JSON'))
        output.write(header);output.write(struct.pack('<I4s',len(binary),b'BIN\0'));output.write(binary)
        temp = output.name
    os.chmod(temp,path.stat().st_mode & 0o777)
    os.replace(temp,target)
    print(path.name, size, len(binary))
    return True
