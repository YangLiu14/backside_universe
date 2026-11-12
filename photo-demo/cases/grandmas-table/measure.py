"""Read the actual Blender-imported Hi3D pot in glTF Y-up coordinates for camera fitting."""
import sys
from pathlib import Path
import bpy
import numpy as np

source, dest = map(Path,sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
vertices=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    values=np.empty(len(obj.data.vertices)*3,dtype=np.float32)
    obj.data.vertices.foreach_get('co',values)
    m=np.array(obj.matrix_world)
    xyz=values.reshape(-1,3)@m[:3,:3].T+m[:3,3]
    vertices.append(xyz[:,[0,2,1]]*[1,1,-1])
all_points=np.concatenate(vertices)
sample=all_points[::max(1,len(all_points)//90000)]
np.savez_compressed(dest,points=sample,minimum=all_points.min(0),maximum=all_points.max(0))
