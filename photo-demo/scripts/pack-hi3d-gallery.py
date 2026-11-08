"""Build overview and inspection LODs from one Hi3D GLB. Run with blender -b -P ... -- organ."""
from pathlib import Path
import sys,tempfile
import bpy
root=Path(__file__).resolve().parents[1]
organ=sys.argv[sys.argv.index('--')+1]
if organ not in ('heart','lungs','liver','stomach','kidney','gut'):
    raise ValueError(organ)
source=root/'evidence/canine-production/hi3d-organs'/organ/'original.glb'
out=root/'dist/canine-museum/assets/hi3d-galleries'
with tempfile.TemporaryDirectory() as scratch:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for label,faces,pixels in [('detail',375000,3072),('overview',45000,1024)]:
        total=sum(len(o.data.polygons) for o in meshes)
        for obj in meshes:
            if total>faces:
                mod=obj.modifiers.new('Preserve shell and interior','DECIMATE')
                mod.ratio=faces/total
                bpy.context.view_layer.objects.active=obj
                bpy.ops.object.modifier_apply(modifier=mod.name)
                obj.data.polygons.foreach_set('use_smooth',[True]*len(obj.data.polygons))
        for im in bpy.data.images:
            if not im.has_data or max(im.size)<=pixels:continue
            w,h=im.size[:]
            im.scale(round(w*pixels/max(w,h)),round(h*pixels/max(w,h)))
            im.filepath_raw=str(Path(scratch)/f'{label}-{im.as_pointer()}.jpg')
            im.file_format='JPEG';im.save();im.pack()
        bpy.ops.export_scene.gltf(filepath=str(out/f'{organ}-{label}.glb'),export_format='GLB',
          export_image_format='JPEG',export_jpeg_quality=92,export_draco_mesh_compression_enable=True,
          export_draco_position_quantization=16,export_draco_texcoord_quantization=14,export_draco_normal_quantization=10)
