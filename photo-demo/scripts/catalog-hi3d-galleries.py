"""Record web derivatives beside their private Hi3D originals; paths in the catalog are relative to itself."""
from hashlib import sha256
from pathlib import Path
import io
import json
import re
import struct
from PIL import Image

base = Path(__file__).resolve().parents[1]
evidence = base / 'evidence/canine-production'
runtime = base / 'dist/canine-museum/assets/hi3d-galleries'
def digest(data):
    return sha256(data).hexdigest()

def derivative(path):
    raw = path.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    triangle_count = sum(doc['accessors'][p['indices']]['count']//3
                         for m in doc['meshes'] for p in m['primitives'])
    sizes = []
    for texture in doc['images']:
        v = doc['bufferViews'][texture['bufferView']]
        start = 28+n+v.get('byteOffset', 0)
        with Image.open(io.BytesIO(raw[start:start+v['byteLength']])) as bitmap:
            sizes.append(bitmap.size)
    return dict(file=path.name, triangles=triangle_count, bytes=len(raw), textures=sizes, sha256=digest(raw))

organs = {}
for organ in ['heart', 'lungs', 'liver', 'stomach', 'kidney', 'gut']:
    folder = evidence/'hi3d-organs'/organ
    source = (folder/'original.glb').read_bytes()
    path = json.loads((folder/'asset.json').read_text())[0]['path']
    asset_id = re.search(r'/([a-f0-9]{32})/target/',path)[1]
    geom = json.loads((folder/'geometry.json').read_text())
    organs[organ] = dict(asset_id=asset_id, source_sha256=digest(source), source_bytes=len(source),
                         source_triangles=geom['mesh_triangles'],
                         reference_sha256=digest((evidence/'tripo'/organ/'reference.png').read_bytes()),
                         depth_span_to_width=round(geom['central_depth_span_fraction_width'],4),
                         overview=derivative(runtime/f'{organ}-overview.glb'),
                         detail=derivative(runtime/f'{organ}-detail.glb'))
assert len({r['asset_id'] for r in organs.values()})==6
(runtime/'catalog.json').write_text(json.dumps(dict(provider='Hi3D.ai', model='v3.0 high quality', credits_per_model=45,
                            date='2026-11-08', native_front='+Z', dog_open_side='+X', organs=organs),
                            indent=2,ensure_ascii=False)+'\n')
for key,r in organs.items():
    print(key,r['source_triangles'],r['overview']['triangles'],r['detail']['triangles'],r['depth_span_to_width'])
