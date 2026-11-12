"""Blender batch conversion of a Hi3D master into a lightweight runtime asset."""
import sys
from pathlib import Path
import bpy

source, output = map(Path,sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type=='MESH']
total = sum(len(obj.data.polygons) for obj in meshes)
if total <= 0:
    raise ValueError('Hi3D model contains no faces')
for obj in meshes:
    if total > 150000 and len(obj.data.polygons)>100:
        modifier = obj.modifiers.new('Web mesh', 'DECIMATE')
        modifier.ratio = min(1, max(100/len(obj.data.polygons),150000/total))
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.polygons.foreach_set('use_smooth',[True]*len(obj.data.polygons))
for image in bpy.data.images:
    if image.type=='IMAGE' and max(image.size)>2048:
        factor=2048/max(image.size)
        image.scale(max(1,round(image.size[0]*factor)),max(1,round(image.size[1]*factor)))
        image.pack()
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_draco_mesh_compression_enable=True,
                          export_draco_position_quantization=16,export_draco_texcoord_quantization=14)
