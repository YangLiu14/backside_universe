"""Open the v6 house for the existing interactive bookroom, non-destructively."""
import bpy,bmesh,json,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
out=root/'evidence/holiday-assets-v1/laptop/bookroom-v6';out.mkdir(parents=True,exist_ok=True)
source=root/'evidence/holiday-assets-v1/laptop/spatial-v6/model.glb'
cfg=json.loads((root/'scripts/grotto-bookroom.json').read_text())
scale=Vector(cfg['worldFromRoom']['scale']);translation=Vector(cfg['worldFromRoom']['translation'])
def world(p):return Vector([p[i]*scale[i]+translation[i] for i in range(3)])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
ob=bpy.data.objects['tripo-unified-grotto-bookhouse-harbor'];mesh=ob.data
bm=bmesh.new();bm.from_mesh(mesh);counts={};boxes={}
for name,box in cfg['openingsInRoomCoordinates'].items():
    low,high=[world(v) for v in box];boxes[name]=[list(low),list(high)]
    # Restrict plane splits to the house neighborhood; cave and water faces
    # are not repeatedly subdivided by each door/window plane.
    margin=.005
    for axis in range(3):
        for limit in [low[axis],high[axis]]:
            faces=[f for f in bm.faces if all(max(v.co[i] for v in f.verts)>low[i]-margin and min(v.co[i] for v in f.verts)<high[i]+margin for i in range(3))]
            edges={e for f in faces for e in f.edges};verts={v for f in faces for v in f.verts}
            normal=[0,0,0];normal[axis]=1;point=[0,0,0];point[axis]=limit
            bmesh.ops.bisect_plane(bm,geom=list(verts)+list(edges)+faces,dist=1e-7,plane_co=point,plane_no=normal)
    faces=[f for f in bm.faces if all(low[i]+1e-7<f.calc_center_median()[i]<high[i]-1e-7 for i in range(3))]
    counts[name]=len(faces);bmesh.ops.delete(bm,geom=faces,context='FACES')
    print('CUT',name,counts[name],flush=True)
bm.to_mesh(mesh);bm.free();mesh.update();bpy.context.view_layer.update()
report={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'removedFaces':counts,'openingsWorld':boxes,'configuration':cfg,'doorRays':[]}
for x in [.022,.043,.064]:
    for z in [.060,.090,.120]:
        origin=world((x,.709,z));hit,p,n,face=ob.ray_cast(origin,(0,-1,0))
        blocked=hit and p.y>world((0,.645,0)).y
        report['doorRays'].append({'roomXZ':[x,z],'hitWorld':list(p) if hit else None,'blocked':blocked})
        if blocked:raise RuntimeError('New doorway still blocked')
if counts['entrance']<100:raise RuntimeError('Entrance cut missed facade')
bpy.ops.export_scene.gltf(filepath=str(out/'shell.glb'),export_format='GLB')
(out/'shell-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'output':str(out/'shell.glb'),'removed':counts}))
