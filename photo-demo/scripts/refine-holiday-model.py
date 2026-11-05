"""Apply explicit geometry corrections to Hi3D originals, keeping originals intact.

Run in Blender: -- source.glb destination.glb config.json
Config may specify remove_x_above (local coordinates) and scale_xyz.
Corrections are recorded alongside the derived GLB.
"""
import bpy
import bmesh
import json
import sys
import math
from pathlib import Path

source, destination, config_path = sys.argv[sys.argv.index('--')+1:]
config=json.loads(Path(config_path).read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
before=0
after=0
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    before+=len(obj.data.vertices)
    if 'remove_x_above' in config:
        bm=bmesh.new();bm.from_mesh(obj.data)
        remove=[v for v in bm.verts if v.co.x>config['remove_x_above']]
        bmesh.ops.delete(bm,geom=remove,context='VERTS')
        bm.to_mesh(obj.data);bm.free()
    if 'keep_box' in config or 'remove_boxes' in config or 'keep_y_below_plane' in config:
        bm=bmesh.new();bm.from_mesh(obj.data)
        doomed=[]
        for v in bm.verts:
            remove=False
            if 'keep_box' in config:
                lo,hi=config['keep_box']
                remove=not all(lo[i]<=v.co[i]<=hi[i] for i in range(3))
            if 'keep_y_below_plane' in config:
                a,b,c=config['keep_y_below_plane']
                remove=remove or v.co.y>a*v.co.x+b*v.co.z+c
            for lo,hi in config.get('remove_boxes',[]):
                remove=remove or all(lo[i]<=v.co[i]<=hi[i] for i in range(3))
            if remove:doomed.append(v)
        bmesh.ops.delete(bm,geom=doomed,context='VERTS');bm.to_mesh(obj.data);bm.free()
    scale=config.get('scale_xyz',[1,1,1])
    for v in obj.data.vertices:
        theta=config.get('rotation_x',0);c=math.cos(theta);s=math.sin(theta)
        y,z=v.co.y,v.co.z;v.co.y=y*c-z*s;v.co.z=y*s+z*c
        v.co.y+=config.get('shear_y_by_z',0)*v.co.z
        v.co.y+=config.get('shear_y_by_x',0)*v.co.x
        for i in range(3):v.co[i]*=scale[i]
    obj.data.update()
    if 'plain_back' in config:
        spec=config['plain_back'];mat=bpy.data.materials.new(spec.get('name','Unprinted cream paper'));mat.use_nodes=True
        shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=spec.get('color',(.72,.68,.57,1));shader.inputs['Roughness'].default_value=spec.get('roughness',.82);shader.inputs['Metallic'].default_value=spec.get('metallic',0)
        obj.data.materials.append(mat);index=len(obj.data.materials)-1
        for face in obj.data.polygons:
            if face.center.y>spec['min_y'] and face.normal.y>spec['min_normal_y']:
                face.material_index=index
    if 'silver_shell' in config:
        spec=config['silver_shell']
        mat=bpy.data.materials.new('Satin silver restoration');mat.use_nodes=True
        shader=mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(.65,.68,.70,1)
        shader.inputs['Metallic'].default_value=1
        shader.inputs['Roughness'].default_value=.28
        obj.data.materials.append(mat);index=len(obj.data.materials)-1
        for face in obj.data.polygons:
            p=face.center
            radius=math.sqrt(sum((p[i]-spec['center'][i])**2 for i in range(3)))
            if (p.z>spec['min_z'] and radius>spec['radius']) or p.z<spec['base_max_z']:
                face.material_index=index;face.use_smooth=True
    after+=len(obj.data.vertices)
Path(destination).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(Path(destination).resolve()),export_format='GLB')
Path(destination).with_suffix('.refinement.json').write_text(json.dumps({
    'source':str(Path(source).resolve()),'config':config,
    'verticesBefore':before,'verticesAfter':after,
    'sourceModified':False},indent=2))
