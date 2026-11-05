"""Create web derivatives of successful Tripo furniture; keep source models."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1];slug=sys.argv[sys.argv.index('--')+1]
evidence=root/'evidence/holiday-assets-v1/laptop/bookroom'/slug
result=json.loads((evidence/'result.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=result['model_file'])
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
before=sum(len(o.data.polygons) for o in meshes)
for o in meshes:
 bpy.context.view_layer.objects.active=o
 if before>140000:
  mod=o.modifiers.new('Web detail budget','DECIMATE');mod.ratio=140000/before;bpy.ops.object.modifier_apply(modifier=mod.name)
for im in bpy.data.images:
 if im.type=='IMAGE' and max(im.size)>4096:
  f=4096/max(im.size);im.scale(round(im.size[0]*f),round(im.size[1]*f))
dest=root/'dist/holiday-assets/assets/bookroom'/f'{slug}.glb';dest.parent.mkdir(exist_ok=True,parents=True)
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_image_format='JPEG',export_jpeg_quality=94,export_draco_mesh_compression_enable=True,export_draco_position_quantization=16,export_draco_texcoord_quantization=14)
report={'source':result['model_file'],'taskId':result['task_id'],'cost':result['credits_consumed'],'boundsBlenderZUp':[list(lo),list(hi)],'sourceTriangles':before,'webTriangles':sum(len(o.data.polygons) for o in meshes),'bytes':dest.stat().st_size}
(evidence/'web-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
