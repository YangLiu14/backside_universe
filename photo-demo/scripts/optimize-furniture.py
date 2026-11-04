"""Keep Hi3D source GLBs untouched; prepare web meshes and calibration samples.
Usage: blender -b -t 6 --python scripts/optimize-furniture.py -- chair source.glb
"""
import json
import sys
from pathlib import Path
import bpy
import numpy as np

name, source_arg = sys.argv[sys.argv.index('--') + 1:]
if name not in ['chair', 'lamp', 'note']:
    raise ValueError('Unknown furniture asset')
root = Path(__file__).resolve().parents[1]
source = Path(source_arg).resolve(strict=True)
target = root / f'dist/assets/{name}-hi3d.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
before = sum(len(o.data.polygons) for o in meshes)
budget = {'chair': 180000, 'lamp': 50000, 'note': 40000}[name]
ratio = min(1, budget / before)
for obj in meshes:
    obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    if ratio < 1 and len(obj.data.polygons) > 128:
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Web mesh reduction', 'DECIMATE')
        modifier.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=modifier.name)
for image in bpy.data.images:
    if max(image.size) > 2048:
        scale = 2048 / max(image.size)
        image.scale(round(image.size[0]*scale), round(image.size[1]*scale))
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB',
    export_image_format='JPEG', export_jpeg_quality=92, export_animations=False,
    export_cameras=False, export_lights=False)

# Surface samples in glTF's Y-up coordinates, with all source node transforms.
rng = np.random.default_rng(42)
triangles = []
for obj in meshes:
    obj.data.calc_loop_triangles()
    verts = np.array([obj.matrix_world @ v.co for v in obj.data.vertices])
    verts = verts[:, [0, 2, 1]] * [1, 1, -1]
    indices = np.array([t.vertices for t in obj.data.loop_triangles])
    triangles.append(verts[indices])
tri = np.concatenate(triangles)
area = np.linalg.norm(np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0]), axis=1)
chosen = tri[rng.choice(len(tri), 18000, p=area/area.sum())]
uv = rng.random((len(chosen), 2)); uv[uv.sum(axis=1) > 1] = 1 - uv[uv.sum(axis=1) > 1]
samples = chosen[:, 0] + uv[:, :1]*(chosen[:, 1]-chosen[:, 0]) + uv[:, 1:]*(chosen[:, 2]-chosen[:, 0])
low, high = tri.reshape(-1, 3).min(axis=0), tri.reshape(-1, 3).max(axis=0)
origin = np.array([(low[0]+high[0])/2, low[1], (low[2]+high[2])/2])
np.savez_compressed(root/f'evidence/{name}-hi3d-geometry.npz', samples=samples-origin, origin=origin, bounds=np.array([low, high]), triangles=tri-origin)
report = {'object':name,'originalBytes':source.stat().st_size,'webBytes':target.stat().st_size,
          'originalFaces':before,'webTriangles':len(tri),'origin':origin.tolist(),
          'size':(high-low).tolist(),'file':target.name}
(root/f'evidence/{name}-hi3d-mesh.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
