"""Find the green facade and inspect local surface depths in the v6 source."""
import bpy,numpy as np,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'evidence/holiday-assets-v1/laptop/bookroom-v6'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'evidence/holiday-assets-v1/laptop/spatial-v6/model.glb'))
ob=bpy.data.objects['tripo-unified-grotto-bookhouse-harbor'];m=ob.data
co=np.empty(len(m.vertices)*3,dtype=np.float32);m.vertices.foreach_get('co',co);co=co.reshape(-1,3)
vi=np.empty(len(m.loops),dtype=np.int32);m.loops.foreach_get('vertex_index',vi)
uv=np.empty(len(m.loops)*2,dtype=np.float32);m.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
im=next(i for i in bpy.data.images if i.name.startswith('Color_90ff'))
pixels=np.empty(im.size[0]*im.size[1]*4,dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape(im.size[1],im.size[0],4)
rgb=pixels[(uv[:,1]*im.size[1]).astype(int).clip(0,im.size[1]-1),(uv[:,0]*im.size[0]).astype(int).clip(0,im.size[0]-1),:3]
p=co[vi];green=(rgb[:,1]>rgb[:,0]*1.4)&(rgb[:,1]>rgb[:,2]*1.05)&(p[:,2]>-.03)&(p[:,0]>-.05)&(p[:,0]<.3)
points=p[green];door=p[green&(p[:,0]>.015)&(p[:,0]<.10)&(p[:,2]<.056)];print('DOOR_QUANTILES',np.quantile(door,[0,.05,.5,.95,1],axis=0).tolist());report={'greenBounds':[points.min(0).tolist(),points.max(0).tolist()],'greenMedian':np.median(points,0).tolist(),'points':len(points),'rows':[]}
for z in [-.07,-.04,-.02,0,.02,.04,.06,.08,.10,.12,.14,.16]:
 row=[]
 for x in [-.02,.02,.04,.06,.08,.10,.12,.14,.16,.18,.20,.22,.24,.26,.28]:
  hit,p,n,face=ob.ray_cast((x,1.3,z),(0,-1,0));row.append(round(p.y,4) if hit else None)
 report['rows'].append({'z':z,'yAtX':row})
report['xs']=[-.02,.02,.04,.06,.08,.10,.12,.14,.16,.18,.20,.22,.24,.26,.28]
(out/'measurements.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
