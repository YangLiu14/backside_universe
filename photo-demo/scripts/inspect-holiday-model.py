"""Inspect and render an untouched Hi3D GLB; run with Blender --background.

blender -b --python scripts/inspect-holiday-model.py -- source.glb output-directory
Writes four material views and four clay views, plus mesh/texture metadata.
Does not modify or decimate the source model.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

source_arg, output_arg = sys.argv[sys.argv.index('--') + 1:]
source = Path(source_arg).resolve(strict=True)
output = Path(output_arg).resolve()
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
if not meshes:
    raise ValueError('GLB contains no mesh objects')
points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
low = Vector([min(p[i] for p in points) for i in range(3)])
high = Vector([max(p[i] for p in points) for i in range(3)])
center = (low+high)*.5
extent = high-low
if max(extent) <= 0:
    raise ValueError('Model has degenerate bounds')
report = {
    'source':str(source), 'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'bytes':source.stat().st_size, 'boundsBlenderZUp':[list(low),list(high)],
    'sizeBlenderZUp':list(extent), 'meshes':[], 'textures':[],
    'sourceModified':False, 'webDecimation':False,
}
for obj in meshes:
    obj.data.calc_loop_triangles()
    report['meshes'].append({'name':obj.name,'vertices':len(obj.data.vertices),
        'triangles':len(obj.data.loop_triangles),'uvLayers':len(obj.data.uv_layers),
        'materials':[m.name if m else None for m in obj.data.materials]})
for im in bpy.data.images:
    if im.type=='IMAGE':
        report['textures'].append({'name':im.name,'size':list(im.size),'packed':bool(im.packed_file)})
report['triangles']=sum(m['triangles'] for m in report['meshes'])
(output/'mesh-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

roots = [o for o in scene.objects if o.parent is None]
normalizer=bpy.data.objects.new('inspection-normalization',None)
scene.collection.objects.link(normalizer)
for obj in roots:
    obj.parent=normalizer
scale=1.8/max(extent)
normalizer.scale=(scale,)*3
normalizer.location=-center*scale

try:
    scene.render.engine='BLENDER_EEVEE_NEXT'
except TypeError:
    scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1000
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('Neutral studio')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.74,.76,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.view_settings.view_transform='AgX'
scene.view_settings.exposure=0

def aim(obj,target=(0,0,0)):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,energy,size in [
    ('Key',(3,-4,5),650,4),('Fill',(-4,-1,2),400,4),('Rim',(1,4,4),600,3)]:
    lamp=bpy.data.lights.new(name,'AREA');lamp.energy=energy;lamp.shape='DISK';lamp.size=size
    ob=bpy.data.objects.new(name,lamp);scene.collection.objects.link(ob);ob.location=loc;aim(ob)
camdata=bpy.data.cameras.new('Inspection camera');camdata.type='ORTHO';camdata.ortho_scale=2.15
camera=bpy.data.objects.new('Inspection camera',camdata);scene.collection.objects.link(camera);scene.camera=camera
clay=bpy.data.materials.new('Geometry inspection');clay.use_nodes=True
bsdf=clay.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.55,.58,.6,1);bsdf.inputs['Roughness'].default_value=.85
for mode in ['material','clay']:
    scene.view_layers[0].material_override=clay if mode=='clay' else None
    for degrees in [0,90,180,270]:
        angle=math.radians(degrees)
        camera.location=(3*math.sin(angle),-3*math.cos(angle),.65)
        aim(camera)
        scene.render.filepath=str(output/f'{mode}-{degrees:03d}.png')
        bpy.ops.render.render(write_still=True)
print(json.dumps({'triangles':report['triangles'],'bytes':report['bytes'],'output':str(output)}))
