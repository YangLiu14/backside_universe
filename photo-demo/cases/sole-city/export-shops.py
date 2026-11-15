"""Extract standalone textured storefront GLBs from the baked city, without remeshing."""
import copy
import json
import struct
import sys
import zipfile
from pathlib import Path


def load(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+size]), memoryview(raw)[28+size:]


def isolate(source, binary, root):
    output = {'asset': source['asset'], 'scene': 0, 'scenes': [{'nodes': [0]}]}
    buffer = bytearray()
    remapped = {}

    def take(kind, index):
        key = (kind, index)
        if key in remapped:
            return remapped[key]
        entry = copy.deepcopy(source[kind][index])
        rows = output.setdefault(kind, [])
        remapped[key] = target = len(rows)
        rows.append(entry)
        if kind == 'nodes':
            if 'children' in entry:
                entry['children'] = [take('nodes', child) for child in entry['children']]
            if 'mesh' in entry:
                entry['mesh'] = take('meshes', entry['mesh'])
        elif kind == 'meshes':
            for prim in entry['primitives']:
                prim['attributes'] = {k: take('accessors', v) for k, v in prim['attributes'].items()}
                for field, table in [('indices', 'accessors'), ('material', 'materials')]:
                    if field in prim:
                        prim[field] = take(table, prim[field])
        elif kind == 'materials':
            def textures(d):
                for k, v in d.items():
                    if isinstance(v, dict):
                        if k.endswith('Texture') and 'index' in v:
                            v['index'] = take('textures', v['index'])
                        else:
                            textures(v)
            textures(entry)
        elif kind == 'textures':
            entry['source'] = take('images', entry['source'])
            if 'sampler' in entry:
                entry['sampler'] = take('samplers', entry['sampler'])
        elif kind in ('accessors', 'images'):
            entry['bufferView'] = take('bufferViews', entry['bufferView'])
        elif kind == 'bufferViews':
            offset = entry.get('byteOffset', 0)
            buffer.extend(bytes((-len(buffer)) % 4))
            entry['byteOffset'] = len(buffer)
            buffer.extend(binary[offset:offset+entry['byteLength']])
        return target

    take('nodes', root)
    top = output['nodes'][0]
    top.pop('translation', None)
    top.pop('scale', None)  # The assembly starts before this shop grows.
    # Shop-local +Z faces the viewer. Keep the proportions used at street level.
    for child in top['children']:
        output['nodes'][child].pop('rotation', None)
    output['buffers'] = [{'byteLength': len(buffer)}]
    for field in ('extensionsUsed', 'extensionsRequired'):
        if field in source:
            output[field] = source[field]
    doc = json.dumps(output, ensure_ascii=False, separators=(',', ':')).encode()
    doc += b' ' * ((-len(doc)) % 4)
    buffer.extend(bytes((-len(buffer)) % 4))
    return (struct.pack('<4sII', b'glTF', 2, 28+len(doc)+len(buffer))
            + struct.pack('<I4s', len(doc), b'JSON') + doc
            + struct.pack('<I4s', len(buffer), b'BIN\0') + buffer)


def export(source_path, zip_path):
    source, binary = load(source_path)
    seen = set()
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=4) as archive:
        for i, node in enumerate(source['nodes']):
            info = node.get('extras', {})
            name = info.get('shopName')
            if name:
                location = '主街' if info['mainStreet'] else '支巷'
            elif info.get('feature') == 'stall':
                location, name = '主街', '清早豆浆摊'
            else:
                continue
            if name in seen:
                raise ValueError('Duplicate shop name: '+name)
            seen.add(name)
            archive.writestr(f'{location}/{name}.glb', isolate(source, binary, i))
    # Both new bridge-side storefronts replace taller residential lots. Older
    # authored releases have the same 26 original shops and breakfast stall.
    added = {node.get('extras', {}).get('hi3dRole') for node in source['nodes']}
    expected = 27 + len(added & {'bridge-corner-shop', 'stall-neighbor-shop'})
    if len(seen) != expected:
        raise ValueError(f'Expected {expected} independent shop models, found {len(seen)}')


if __name__ == '__main__':
    export(*map(Path, sys.argv[1:]))
