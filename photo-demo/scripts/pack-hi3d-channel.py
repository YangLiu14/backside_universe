"""Export a navigable web copy of a private Hi3D channel. Run in Blender with -- <station>."""
import os
from pathlib import Path
import sys
import tempfile
import bpy

station = sys.argv[sys.argv.index('--') + 1]
if station not in ('mouth', 'esophagus', 'stomach', 'small-intestine', 'colon', 'rectum'):
    raise ValueError(station)
app = Path(__file__).resolve().parents[1]
source = app / 'evidence/canine-production/hi3d-tract/animated/models' / station / 'original.glb'
destination = app / 'dist/canine-museum/assets/digestion/channels'
destination.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(dir=destination) as scratch:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    faces = sum(len(o.data.polygons) for o in meshes)
    if not faces:
        raise ValueError('Hi3D returned an empty scene')
    for obj in meshes:
        modifier = obj.modifiers.new('Web mesh', 'DECIMATE')
        modifier.ratio = min(1, 145000 / faces)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    result=Path(scratch)/'result.glb'
    bpy.ops.export_scene.gltf(filepath=str(result),export_format='GLB',export_image_format='JPEG',
      export_jpeg_quality=90,export_draco_mesh_compression_enable=True,
      export_draco_position_quantization=15,export_draco_texcoord_quantization=14)
    os.replace(result,destination/(station+'.glb'))
