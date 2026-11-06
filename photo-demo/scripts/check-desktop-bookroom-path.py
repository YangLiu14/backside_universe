import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
# Run after: node scripts/check-desktop-bookroom.mjs --export-path
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'dist/holiday-assets/assets/bookroom/shell-grotto-v6.glb'))
ob=bpy.data.objects['tripo-unified-grotto-bookhouse-harbor']
bvh=BVHTree.FromObject(ob,bpy.context.evaluated_depsgraph_get())
path=json.loads((root/'evidence/desktop-bookroom/approach-path.json').read_text())
points=[ob.matrix_world.inverted()@Vector(p) for p in path['samples']]
hits=[];minimum=100
for i,(a,b) in enumerate(zip(points,points[1:])):
 direction=b-a;length=direction.length
 if length>0:
  hit,n,idx,d=bvh.ray_cast(a,direction.normalized(),length)
  if hit is not None:hits.append({'sample':i,'point':list(hit),'distance':d})
for p in points:
 hit,n,idx,d=bvh.find_nearest(p)
 if d is not None:minimum=min(minimum,d)
report={'segments':len(points)-1,'crossings':hits,'minimumSurfaceClearance':minimum}
(root/'evidence/desktop-bookroom/approach-collision.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)

assert not hits, "Exterior approach crosses the generated shell"
assert minimum > .004, "Exterior approach grazes the balcony"
