"""Create a web texture derivative; preserve the source mesh and source GLB."""
import bpy
import json
import sys
from pathlib import Path

source, destination = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
for obj in bpy.context.scene.objects:
    if obj.type=='MESH':
        # Avoid exporting a separate normal/vertex for every triangle corner.
        obj.data.polygons.foreach_set('use_smooth',[True]*len(obj.data.polygons))
textures=[]
for im in bpy.data.images:
    if im.type != 'IMAGE' or not im.size[0]:
        continue
    original=list(im.size)
    factor=min(1,4096/max(im.size))
    if factor<1:
        im.scale(round(im.size[0]*factor),round(im.size[1]*factor))
    textures.append({'name':im.name,'original':original,'web':list(im.size)})
bpy.ops.export_scene.gltf(filepath=str(Path(destination).resolve()),
    export_format='GLB',export_image_format='JPEG',export_jpeg_quality=92,
    export_normals=False,export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,export_draco_position_quantization=16,
    export_draco_texcoord_quantization=14)
Path(destination).with_suffix('.package.json').write_text(json.dumps({
    'source':source,'textures':textures,'meshDecimated':False,'viewerComputesNormals':True,
    'draco':{'positionQuantization':16,'texcoordQuantization':14},
    'bytes':Path(destination).stat().st_size},indent=2))
