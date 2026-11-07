"""Blender --background --python package-room-prop.py -- source.glb web.glb"""
import json
import sys
from pathlib import Path

import bpy

source, destination = map(Path, sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
triangles = sum(len(o.data.polygons) for o in meshes)
ratio = min(1, 150000 / triangles)
for obj in meshes:
    if ratio < 1:
        bpy.context.view_layer.objects.active = obj
        simplify = obj.modifiers.new('Interior close view', 'DECIMATE')
        simplify.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=simplify.name)
    obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
for image in bpy.data.images:
    if image.type == 'IMAGE' and max(image.size) > 3072:
        factor = 3072 / max(image.size)
        image.scale(*(round(n * factor) for n in image.size))
destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(destination.resolve()), export_format='GLB',
                          export_image_format='JPEG', export_jpeg_quality=91,
                          export_draco_mesh_compression_enable=True,
                          export_draco_position_quantization=16, export_draco_texcoord_quantization=14)
print(json.dumps({'asset': destination.stem, 'original': triangles,
                  'triangles': sum(len(o.data.polygons) for o in meshes), 'bytes': destination.stat().st_size}))
