"""Sample masters in glTF world axes for shoe, sole and landmark registration."""
import json,sys
from pathlib import Path
import bpy
import numpy as np
folder,out=map(Path,sys.argv[sys.argv.index('--')+1:])
sys.path.insert(0,str(Path(__file__).resolve().parent))
from register import REGISTRATION_ROLES
jobs=json.loads((folder/'run.json').read_text())['jobs']
samples={}
for job in jobs.values():
    if job['role'] not in REGISTRATION_ROLES or job['status']!='ready':continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(folder/job['file']))
    parts=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        xyz=np.empty(len(obj.data.vertices)*3,dtype=np.float32)
        obj.data.vertices.foreach_get('co',xyz)
        xyz=xyz.reshape(-1,3)[::max(1,len(obj.data.vertices)//12000)]
        m=np.array(obj.matrix_world)
        xyz=xyz@m[:3,:3].T+m[:3,3]
        parts.append(xyz[:,[0,2,1]]*[1,1,-1])
    samples[job['role']]=np.vstack(parts)
np.savez_compressed(out,**samples)
