"""Remove coarse foliage from a web derivative; retain the Hi3D woody skeleton.

The source model and its UVs are immutable. Attachment points come from the
removed crown, projected onto the retained branch surface, in prepare() space.
"""
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.cluster.vq import kmeans2
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from glb_textures import write_glb


def separate(source, target, anchors):
    data = source.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    binary = bytearray(data[28+size:])

    def array(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        count = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
        dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']])
        return np.ndarray((a['count'], count), dtype=dtype, buffer=binary,
                          offset=view.get('byteOffset', 0)+a.get('byteOffset', 0),
                          strides=(view.get('byteStride', count*dtype.itemsize), dtype.itemsize)).copy()

    primitive = doc['meshes'][0]['primitives'][0]
    pos = array(primitive['attributes']['POSITION'])
    uv = array(primitive['attributes']['TEXCOORD_0'])
    faces = array(primitive['indices']).reshape(-1, 3)
    material = doc['materials'][primitive['material']]
    texture = material['pbrMetallicRoughness']['baseColorTexture']['index']
    bitmap = doc['images'][doc['textures'][texture]['source']]
    view = doc['bufferViews'][bitmap['bufferView']]
    start = view.get('byteOffset', 0)
    image = np.asarray(Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGB'))
    # glTF texture V starts at the top of the embedded image (no image flip).
    color = image[np.clip((uv[:, 1]*image.shape[0]).astype(int), 0, image.shape[0]-1),
                  np.clip((uv[:, 0]*image.shape[1]).astype(int), 0, image.shape[1]-1)]/255
    wood = (color[:, 0] > color[:, 1]*1.055) & (color.max(axis=1) > .16)
    wood |= pos[:, 1] < -.245
    kept = wood[faces].sum(axis=1) >= 2

    # Brown leaf islands are disconnected from the trunk. Weld positional UV
    # seams for connectivity only, without changing any rendering attributes.
    _, welded = np.unique(np.round(pos, 5), axis=0, return_inverse=True)
    edges = welded[faces[kept]]
    rows = np.concatenate([edges[:, 0], edges[:, 1], edges[:, 2]])
    cols = np.concatenate([edges[:, 1], edges[:, 2], edges[:, 0]])
    graph = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(welded.max()+1,)*2).tocsr()
    _, labels = connected_components(graph, directed=False)
    trunk = labels[welded[np.argmin(pos[:, 1])]]
    kept &= (labels[welded[faces]] == trunk).any(axis=1)
    if kept.sum() < 2000 or kept.mean() > .5:
        raise ValueError('Unexpected branch segmentation; inspect before shipping')
    leaves = faces[~kept]
    centers = pos[leaves].mean(axis=1)
    centers = centers[centers[:, 1] > -.23]
    crown, assignment = kmeans2(centers[::5], 48, iter=35, minit='++', seed=17)
    branches = pos[np.unique(faces[kept])]
    _, nearest = cKDTree(branches).query(crown)
    low, high = pos.min(axis=0), pos.max(axis=0)
    center, extent = (low+high)/2, high-low
    attachments = []
    for i, (tip, root) in enumerate(zip(crown, branches[nearest])):
        cluster = centers[::5][assignment == i]
        attachments.append(dict(root=((root-center)/extent).tolist(),
                                tip=((tip-center)/extent).tolist(),
                                radius=float(np.percentile(np.linalg.norm(cluster-tip, axis=1), 85))))
    report = dict(sourceTriangles=len(faces), branchTriangles=int(kept.sum()),
                  native=extent.tolist(), attachments=attachments)
    anchors.write_text(json.dumps(report, indent=2))
    # Unused vertices deliberately retain the original normalization bounds.
    payload = faces[kept].astype('<u4').tobytes()
    binary.extend(b'\0'*(-len(binary) % 4))
    doc['bufferViews'].append(dict(buffer=0, byteOffset=len(binary), byteLength=len(payload), target=34963))
    binary.extend(payload)
    doc['accessors'].append(dict(bufferView=len(doc['bufferViews'])-1, componentType=5125,
                                 count=int(kept.sum()*3), type='SCALAR'))
    primitive['indices'] = len(doc['accessors'])-1
    write_glb(source, target, doc, binary)
    print('Campus tree branches:', report['branchTriangles'], 'triangles;', len(attachments), 'crown anchors')


if __name__ == '__main__':
    import sys
    separate(*map(Path, sys.argv[1:]))
