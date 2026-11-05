"""Place one Tripo-generated environment on the retained laptop hardware.

No separate terrain, house, lighthouse or cavern meshes are assembled here.
The source environment is immutable; only its hidden rear contact is fitted.
"""
import bpy,bmesh,json,hashlib,math
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
out=root/'evidence/holiday-assets-v1/laptop/spatial-v6'
cfg=json.loads((root/'scripts/unified-assembly.json').read_text())
task=json.loads((out/'unified-result.json').read_text())
source=root/'evidence/holiday-assets-v1/laptop/spatial-v3/model.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
keep={'original-object-body','restored-screen','clean-rear-cover'}
for ob in list(bpy.context.scene.objects):
    if ob.type=='MESH' and ob.name not in keep:bpy.data.objects.remove(ob,do_unlink=True)
hardware=[o for o in bpy.context.scene.objects if o.type=='MESH']
hardware_bounds={o.name:[[min((o.matrix_world@Vector(p))[i] for p in o.bound_box) for i in range(3)],[max((o.matrix_world@Vector(p))[i] for p in o.bound_box) for i in range(3)]] for o in hardware}
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=task['model_file'])
world=[o for o in bpy.context.scene.objects if o not in before and o.type=='MESH']
for ob in world:ob.data.transform(ob.matrix_world);ob.matrix_world.identity()
points=[v.co for ob in world for v in ob.data.vertices]
low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
size=high-low
scale=cfg['width']/size.y
contact_vertices=0
for ob in world:
    ob.name='tripo-unified-grotto-bookhouse-harbor'
    for v in ob.data.vertices:
        p=v.co.copy()
        x=-(p.y-(low.y+high.y)*.5)*scale
        z=(p.z-low.z)*scale+cfg['bottom']
        depth=(p.x-low.x)*scale
        y=cfg['rearIntercept']+depth
        v.co=(x,y,z)
    ob.data.update()
# The standalone viewer shows the generated shape with only uniform scale
# and rotation. Hardware contact fitting is exclusive to the assembled copy.
bpy.ops.object.select_all(action='DESELECT')
for ob in world:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'environment.glb'),export_format='GLB',use_selection=True)
for ob in world:ob.data.calc_loop_triangles()
generated_triangles=sum(len(ob.data.loop_triangles) for ob in world)
# Seat the rigid environment into the lid and trim only the hidden overlap.
# Do not stretch vertices or UVs to bridge the contact: retain the generated
# stone and architecture shapes throughout the visible front and sides.
for ob in world:
    for v in ob.data.vertices:v.co.y-=cfg['contactOffsetY']
    bm=bmesh.new();bm.from_mesh(ob.data)
    result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,cfg['rearIntercept']+cfg['rearClearance'],0),plane_no=(0,1,-cfg['rearSlope']),clear_inner=True,clear_outer=False)
    cut_edges=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    contact_vertices=len(result['geom_cut'])
    if cut_edges:
        cap=bpy.data.materials.new('Hidden limestone contact');cap.diffuse_color=(.46,.40,.31,1);cap.use_nodes=True
        cap.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.46,.40,.31,1)
        cap.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95
        ob.data.materials.append(cap)
        filled=bmesh.ops.holes_fill(bm,edges=cut_edges,sides=0)
        for face in filled['faces']:face.material_index=len(ob.data.materials)-1
    bm.to_mesh(ob.data);bm.free();ob.data.update()
bpy.context.view_layer.update()
def bounds(objects):
    p=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
    return [[min(v[i] for v in p) for i in range(3)],[max(v[i] for v in p) for i in range(3)]]
def triangles(objects):
    n=0
    for o in objects:o.data.calc_loop_triangles();n+=len(o.data.loop_triangles)
    return n
report={'taskId':task['task_id'],'credits':task['credits_consumed'],'sourceEnvironmentSHA256':hashlib.sha256(Path(task['model_file']).read_bytes()).hexdigest(),'sourceLaptopSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'uniformScale':scale,'config':cfg,'sourceBounds':[list(low),list(high)],'environmentBounds':bounds(world),'hardwareBounds':hardware_bounds,'contactCutElements':contact_vertices,'environmentTriangles':generated_triangles,'triangles':triangles(world+hardware),'separateLandscapePartsAdded':False}
bpy.ops.export_scene.gltf(filepath=str(out/'model.glb'),export_format='GLB')
(out/'assembly.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
