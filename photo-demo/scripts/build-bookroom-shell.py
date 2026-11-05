"""Cut a real entrance and side window; retain the approved v3 source unchanged."""
import bpy,bmesh,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'evidence/holiday-assets-v1/laptop/bookroom';out.mkdir(exist_ok=True,parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'evidence/holiday-assets-v1/laptop/spatial-v3/model.glb'))
ob=bpy.data.objects.get('tripo-reading-pavilion')
if ob is None:raise RuntimeError('Expected approved pavilion mesh')
mesh=ob.data
boxes={
 'entrance':[[.005,.648,.002],[.081,.706,.147]],
 'lighthouse-window':[[-.11,.548,.047],[-.045,.622,.125]],
 # Continue behind the interior lining, so triangles straddling the room's
 # edge cannot poke through its walls. The outer facade remains beyond .670.
 'room-clearance':[[-.069,.511,.005],[.241,.670,.159]],
}
bm=bmesh.new();bm.from_mesh(mesh);counts={}
for name,(low,high) in boxes.items():
 # Split intersecting triangles at the six planes before deleting the inside.
 # Merely deleting by face centre leaves sawtooth edges in close-up views.
 for axis in range(3):
  for limit in [low[axis],high[axis]]:
   normal=[0,0,0];normal[axis]=1
   point=[0,0,0];point[axis]=limit
   bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=point,plane_no=normal,clear_inner=False,clear_outer=False)
 faces=[f for f in bm.faces if all(low[i]<f.calc_center_median()[i]<high[i] for i in range(3))]
 counts[name]=len(faces);bmesh.ops.delete(bm,geom=faces,context='FACES')
bm.to_mesh(mesh);bm.free();mesh.update();bpy.context.view_layer.update()
if counts['entrance']<100:raise RuntimeError('Door cut did not find expected geometry')
report={'removedFaces':counts,'openings':boxes,'sourceUnchanged':True}
for name,origin,direction in [('entrance',[.043,.704,.085],[0,-1,0]),('window',[-.12,.585,.085],[1,0,0])]:
 hit,p,n,face=ob.ray_cast(origin,direction);report[name+'Ray']={'hit':hit,'point':list(p)}
 if hit and ((name=='entrance' and p.y>.64) or (name=='window' and p.x<-.04)):raise RuntimeError(name+' remains blocked')
bpy.ops.export_scene.gltf(filepath=str(out/'shell.glb'),export_format='GLB')
(out/'shell-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
