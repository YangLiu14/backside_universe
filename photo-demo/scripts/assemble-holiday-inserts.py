"""Assemble generated bases and inset landscapes without changing source GLBs.

Blender --python this.py -- config.json destination.glb
All positions are in Blender Z-up coordinates of the original base.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

config_path,destination=sys.argv[sys.argv.index('--')+1:]
config=json.loads(Path(config_path).read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(config['base']).resolve()))
for obj in list(bpy.context.scene.objects):
    if any(obj.name.startswith(prefix) for prefix in config.get('remove_base_objects',[])):
        bpy.data.objects.remove(obj,do_unlink=True)
base_objects=list(bpy.context.scene.objects)
def tilt_lid(p,blend=False):
    h=config.get('lid_hinge')
    if not h:return p
    weight=1
    if blend:
        weight=max(0,min(1,(p.z-h['blend_z'][0])/(h['blend_z'][1]-h['blend_z'][0])))
        if p.y<h['min_y']:weight=0
    a=h['rotation_x']*weight;c=math.cos(a);s=math.sin(a)
    y,z=p.y-h['pivot'][1],p.z-h['pivot'][2]
    return Vector((p.x,h['pivot'][1]+y*c-z*s,h['pivot'][2]+y*s+z*c))
for obj in base_objects:
    if obj.type!='MESH':continue
    if config.get('preserve_base'):continue
    obj.name='original-object-body'
    bm=bmesh.new();bm.from_mesh(obj.data)
    for box in config.get('recesses',[]):
        low,high=box
        inside=[v for v in bm.verts if all(low[i]<v.co[i]<high[i] for i in range(3))]
        bmesh.ops.delete(bm,geom=inside,context='VERTS')
    if 'screen' in config:
        s=config['screen']
        inside=[v for v in bm.verts if abs(v.co.x)<s['half_width'] and s['z_min']<v.co.z<s['z_max'] and v.co.y<s['cut_y']+s['slope']*v.co.z]
        bmesh.ops.delete(bm,geom=inside,context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    if 'lid_hinge' in config:
        for v in obj.data.vertices:v.co=tilt_lid(v.co,True)
        obj.data.update()

for index,part in enumerate(config['inserts']):
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(part['source']).resolve()))
    imported=[o for o in bpy.context.scene.objects if o not in before]
    meshes=[o for o in imported if o.type=='MESH']
    points=[o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    center=(lo+hi)*.5;size=hi-lo
    for obj in meshes:
        obj.name=part.get('name',f'landscape-insert-{index+1}')
        # Bake object transform before fitting, preserving UVs and materials.
        obj.data.transform(obj.matrix_world);obj.matrix_world.identity()
        theta=part.get('rotation_z',0);c=math.cos(theta);s=math.sin(theta)
        for v in obj.data.vertices:
            p=v.co-center
            if 'fit_height' in part:
                p*=part['fit_height']/size.z
            else:
                p=Vector([p[i]*part['size'][i]/size[i] for i in range(3)])
            p=Vector((p.x*c-p.y*s,p.x*s+p.y*c,p.z))
            tilt=part.get('rotation_x',0);cx=math.cos(tilt);sx=math.sin(tilt)
            p=Vector((p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx))
            v.co=p+Vector(part['center'])
        obj.data.update()

if 'screen' in config:
    s=config['screen'];w=s['half_width'];z0=s['z_min'];z1=s['z_max']
    mesh=bpy.data.meshes.new('restored-screen');mesh.from_pydata([
        (-w,s['face_y']+s['slope']*z0,z0),(w,s['face_y']+s['slope']*z0,z0),
        (w,s['face_y']+s['slope']*z1,z1),(-w,s['face_y']+s['slope']*z1,z1)],[],[(0,1,2,3)])
    uv=mesh.uv_layers.new(name='UVMap')
    for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coord
    ob=bpy.data.objects.new('restored-screen',mesh);bpy.context.scene.collection.objects.link(ob)
    mat=bpy.data.materials.new('Original reference display');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.4
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(s['texture']);tex.image.pack()
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.35
    mesh.materials.append(mat)
    if 'lid_hinge' in config:
        for v in mesh.vertices:v.co=tilt_lid(v.co)
        mesh.update()

if 'rear_cover' in config:
    s=config['rear_cover'];w=s['half_width'];z0=s['z_min'];z1=s['z_max']
    points=[tilt_lid(Vector((x,s['face_y']+s['slope']*z,z))) for x,z in [(-w,z0),(-w,z1),(w,z1),(w,z0)]]
    mesh=bpy.data.meshes.new('clean-rear-cover');mesh.from_pydata(points,[],[(0,1,2,3)])
    ob=bpy.data.objects.new('clean-rear-cover',mesh);bpy.context.scene.collection.objects.link(ob)
    mat=bpy.data.materials.new('Satin aluminum rear');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.56,.59,.62,1);shader.inputs['Metallic'].default_value=.8;shader.inputs['Roughness'].default_value=.35
    mesh.materials.append(mat)

def surface(name,color,roughness=.7):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=roughness
    return mat

def bar(name,a,b,width,height,material):
    a,b=Vector(a),Vector(b);delta=b-a
    bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)*.5)
    ob=bpy.context.object;ob.name=name;ob.rotation_euler=delta.to_track_quat('X','Z').to_euler();ob.scale=(delta.length,width,height);ob.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return ob

for support in config.get('supports',[]):
    mat=surface(support['name'],support.get('color',[.57,.53,.44]))
    bpy.ops.mesh.primitive_cube_add(size=1,location=support['center'])
    ob=bpy.context.object;ob.name=support['name'];ob.scale=support['size'];ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=ob.modifiers.new('Dressed stone edges','BEVEL');bevel.width=.002;bevel.segments=2
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=bevel.name)
    for arch in support.get('arches',[]):
        x,r,z=arch['x'],arch['radius'],arch['spring_z']
        outline=[(x-r,arch['bottom_z']),(x+r,arch['bottom_z'])]
        outline += [(x+r*math.cos(a*math.pi/24),z+r*math.sin(a*math.pi/24)) for a in range(25)]
        y0=support['center'][1]-support['size'][1]/2-.02
        y1=support['center'][1]+support['size'][1]/2+.02
        n=len(outline);verts=[(px,y,pz) for y in [y0,y1] for px,pz in outline]
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh=bpy.data.meshes.new('arch-opening');mesh.from_pydata(verts,[],faces);mesh.update()
        cutter=bpy.data.objects.new('arch-cutter',mesh);bpy.context.scene.collection.objects.link(cutter)
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
        boolean=ob.modifiers.new('Open stone vault','BOOLEAN');boolean.operation='DIFFERENCE';boolean.solver='EXACT';boolean.object=cutter
        bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=boolean.name);bpy.data.objects.remove(cutter,do_unlink=True)
        # Individual radial stones make the vault read as masonry in side views.
        for i in range(11):
            a0=i*math.pi/11+.012;a1=(i+1)*math.pi/11-.012
            rim=[(x+radius*math.cos(a),z+radius*math.sin(a)) for radius,a in [(r,a0),(r+.017,a0),(r+.017,a1),(r,a1)]]
            ys=[y1-.025,y1-.012];vs=[(px,y,pz) for y in ys for px,pz in rim]
            m=bpy.data.meshes.new('arch-stone');m.from_pydata(vs,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);m.materials.append(mat)
            stone=bpy.data.objects.new('foundation-arch-stone',m);bpy.context.scene.collection.objects.link(stone)

if config.get('connections'):
    stone=surface('Pale stone steps',(.57,.53,.44));wood=surface('Weathered cedar',(.32,.20,.105));rail=surface('Bronze railings',(.19,.15,.10),.4)
    for connection in config['connections']:
        points=[Vector(p) for p in connection['points']];width=connection['width'];count=connection.get('segments',12)
        for a,b in zip(points,points[1:]):
            tangent=Vector((b.x-a.x,b.y-a.y,0)).normalized();side=Vector((-tangent.y,tangent.x,0))
            for i in range(count):
                p=a.lerp(b,(i+.5)/count);length=Vector((b.x-a.x,b.y-a.y,0)).length/count
                if connection['type']=='stairs':p.z=a.z+(b.z-a.z)*(i+1)/count
                bar(connection['type']+'-tread',p-tangent*length*.49,p+tangent*length*.49,width,.012 if connection['type']=='stairs' else .006,stone if connection['type']=='stairs' else wood)
                if i%3==0 or i==count-1:
                    for sign in [-1,1]:
                        q=p+side*sign*width*.47
                        bar('railing-post',q,q+Vector((0,0,.03)),.003,.003,rail)
            for sign in [-1,1]:
                offset=side*sign*width*.47+Vector((0,0,.03))
                bar('handrail',a+offset,b+offset,.003,.003,rail)
            if connection['type']=='stairs':
                bar('stair-stringer',a-Vector((0,0,.012)),b-Vector((0,0,.012)),width*.8,.018,stone)

# Preview derivative: original source meshes remain in separate untouched files.
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    if config.get('decimate_inserts_only') and obj in base_objects:continue
    ratio=config.get('preview_decimation',1)
    if ratio<1 and len(obj.data.polygons)>5000:
        bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('Preview mesh reduction','DECIMATE');modifier.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.export_scene.gltf(filepath=str(Path(destination).resolve()),export_format='GLB')
Path(destination).with_suffix('.assembly.json').write_text(json.dumps(config,indent=2))
