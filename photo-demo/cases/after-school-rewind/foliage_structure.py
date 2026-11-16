"""Derive connected twigs, real leaf junctions and a distant Hi3D leaf mesh."""
import hashlib
import io
import json
import struct
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.cluster.vq import kmeans2
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components


def mesh_data(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc, binary = json.loads(data[20:20+size]), data[28+size:]
    primitive = doc['meshes'][0]['primitives'][0]

    def read(index):
        a = doc['accessors'][index]
        v = doc['bufferViews'][a['bufferView']]
        dim = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']])
        return np.ndarray((a['count'], dim), dtype, buffer=binary,
                          offset=v.get('byteOffset', 0)+a.get('byteOffset', 0),
                          strides=(v.get('byteStride', dim*dtype.itemsize), dtype.itemsize)).copy()

    attributes = {key: read(index) for key, index in primitive['attributes'].items()}
    faces = read(primitive['indices']).reshape(-1, 3)
    texture = doc['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
    image = doc['images'][doc['textures'][texture]['source']]
    view = doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    bitmap = np.asarray(Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGB'))
    uv = attributes['TEXCOORD_0']
    color = bitmap[np.clip((uv[:, 1]*bitmap.shape[0]).astype(int), 0, bitmap.shape[0]-1),
                   np.clip((uv[:, 0]*bitmap.shape[1]).astype(int), 0, bitmap.shape[1]-1)]/255
    return attributes, faces, color


def prepare_foliage(folder, out, app):
    source = out/'campus-foliage.glb'
    attributes, faces, color = mesh_data(source)
    pos = attributes['POSITION']
    wood = (color[:, 0] > color[:, 1]*1.02) & (color.max(axis=1) > .13)
    keep = wood[faces].sum(axis=1) >= 2
    _, weld = np.unique(np.round(pos, 5), axis=0, return_inverse=True)
    edges = weld[faces[keep]]
    rows, cols = edges.ravel(), edges[:, [1, 2, 0]].ravel()
    graph = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(weld.max()+1,)*2).tocsr()
    _, labels = connected_components(graph, directed=False)
    root = labels[weld[np.argmin(pos[:, 1])]]
    keep &= (labels[weld[faces]] == root).any(axis=1)
    if keep.sum() < 100:
        raise ValueError('Independent Hi3D twig is not connected')
    branches = pos[np.unique(faces[keep])]
    leaf_centers = pos[faces[~keep]].mean(axis=1)
    centers, _ = kmeans2(leaf_centers, 12, iter=30, minit='++', seed=29)
    _, nearest = cKDTree(branches).query(centers)
    low, high = pos.min(axis=0), pos.max(axis=0)
    middle = (low+high)/2
    joints = [dict(root=(branch-middle).tolist(), direction=(leaf-branch).tolist())
              for branch, leaf in zip(branches[nearest], centers)]

    converter = app/'node_modules/gltfpack'
    def derivative(ratio, error):
        options = ['-si', ratio, '-se', error, '-gn', '65', '-sv', '-noq']
        digest = hashlib.sha256(source.read_bytes()+' '.join(options).encode()
                                +hashlib.sha256((converter/'library.wasm').read_bytes()).digest()).hexdigest()
        target = folder/'web-meshes'/f'foliage-distant-{digest[:20]}.glb'
        if not target.exists():
            subprocess.run(['node', converter/'cli.js', '-i', source, '-o', target, *options], check=True)
        return mesh_data(target)[:2]
    inner, inner_indices = derivative('0.20', '0.03')
    far, indices = derivative('0.10', '0.06')
    result = dict(center=middle.tolist(), twigIndices=faces[keep].ravel().tolist(), joints=joints,
                  inner={key: value.ravel().tolist() for key, value in inner.items()},
                  innerIndices=inner_indices.ravel().tolist(),
                  far={key: value.ravel().tolist() for key, value in far.items()},
                  farIndices=indices.ravel().tolist(),
                  triangles=dict(near=len(faces), inner=len(inner_indices), far=len(indices), twig=int(keep.sum())))
    (out/'foliage-structure.json').write_text(json.dumps(result, separators=(',', ':')))
    print('Hi3D foliage derivatives:', result['triangles'], ';', len(joints), 'measured twig junctions')


if __name__ == '__main__':
    import sys
    prepare_foliage(*map(Path, sys.argv[1:]))
