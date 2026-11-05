"""Fit the generated limestone terrain to the existing house and harbour.

Run in Blender with -- full|shell. Sources are immutable; exports live in v4.
"""
import bpy,bmesh,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]
variant=args[0]
version=args[1] if len(args)>1 else 'v4'
out=root/f'evidence/holiday-assets-v1/laptop/spatial-{version}'
cfg=json.loads((root/('scripts/cavern-assembly.json' if version=='v5' else 'scripts/coastal-assembly.json')).read_text())
source=root/('evidence/holiday-assets-v1/laptop/bookroom/shell.glb' if variant=='shell' else 'evidence/holiday-assets-v1/laptop/spatial-v3/model.glb')
task=json.loads((root/'evidence/holiday-assets-v1/laptop/spatial-v4/terrain-result.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
old_prefixes=('reading-house-foundation','reading-house-stone-terrace','foundation-arch-stone','stairs-tread','bridge-tread','railing-post','handrail','stair-stringer')
removed=[]
for ob in list(bpy.context.scene.objects):
    if ob.name.startswith(old_prefixes):
        removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)
original=list(bpy.context.scene.objects)
for ob in original:
    if ob.name=='landscape-insert-1':ob.location.y+=cfg['harbourOffsetY']
house=bpy.data.objects['tripo-reading-pavilion']
foot=[house.matrix_world@v.co for v in house.data.vertices if (house.matrix_world@v.co).z<-.09]
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=task['model_file'])
terrain=[o for o in bpy.context.scene.objects if o not in before and o.type=='MESH']
sx,sy,sz=cfg['terrainScaleXYZ'];angle=cfg['terrainRotationZ'];c,s=math.cos(angle),math.sin(angle);translation=Vector(cfg['terrainTranslation'])
for ob in terrain:
    ob.name='tripo-continuous-limestone-coast'
    ob.data.transform(ob.matrix_world);ob.matrix_world.identity()
    for v in ob.data.vertices:
        x,y,z=v.co;v.co=Vector((x*sx*c-y*sy*s,x*sx*s+y*sy*c,z*sz))+translation
    bm=bmesh.new();bm.from_mesh(ob.data)
    # The back of the new terrain follows the tilted laptop cover, so it does
    # not protrude through the ordinary front of the laptop.
    rear=cfg['rearCut']
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,rear['yIntercept'],0),plane_no=(0,1,-rear['zSlope']),clear_inner=True,clear_outer=False)
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    bpy.context.view_layer.objects.active=ob
    if len(ob.data.polygons)>cfg['terrainTriangleBudget']:
        mod=ob.modifiers.new('Terrain web detail budget','DECIMATE');mod.ratio=cfg['terrainTriangleBudget']/len(ob.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name)

def terrain_height(x,y):
    heights=[]
    for ob in terrain:
        hit,p,_,_=ob.ray_cast((x,y,.4),(0,0,-1))
        if hit:heights.append(p.z)
    return max(heights) if heights else None

# Fit the rock bed to the original house foundation. Never stretch the
# architecture or its UVs: that created visible vertical streaks in v4.
def smooth(a):
    a=max(0,min(1,a));return a*a*(3-2*a)
fitted_vertices=0;largest_lift=0
step=.008;x0,x1=-.11,.39;y0,y1=.44,.855
nx=math.ceil((x1-x0)/step)+1;ny=math.ceil((y1-y0)/step)+1
heights=[[terrain_height(x0+i*step,y0+j*step) for j in range(ny)] for i in range(nx)]
for ob in terrain:
    bottom=min(v.co.z for v in ob.data.vertices)
    for v in ob.data.vertices:
        x,y,z=v.co
        if not(x0<x<x1 and y0<y<y1):continue
        mask=smooth((x-x0)/.065)*smooth((x1-x)/.065)*smooth((y-y0)/.06)*smooth((y1-y)/.06)
        fi=(x-x0)/step;fj=(y-y0)/step;i=min(nx-2,int(fi));j=min(ny-2,int(fj));u=fi-i;w=fj-j
        samples=[(heights[i][j],(1-u)*(1-w)),(heights[i+1][j],u*(1-w)),(heights[i][j+1],(1-u)*w),(heights[i+1][j+1],u*w)]
        if any(h is None for h,weight in samples):continue
        h=sum(h*weight for h,weight in samples)
        lift=max(0,-.101-h)*mask*smooth((z-bottom)/max(.025,h-bottom))
        if lift>0:
            v.co.z+=lift;fitted_vertices+=1;largest_lift=max(largest_lift,lift)
    ob.data.update()

cavern_report=None
if cfg.get('cavern'):
    cc=cfg['cavern'];ct=json.loads((out/'cavern-result.json').read_text())
    before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=ct['model_file'])
    cavern=[o for o in bpy.context.scene.objects if o not in before and o.type=='MESH']
    for ob in cavern:ob.data.transform(ob.matrix_world);ob.matrix_world.identity()
    # The generated grotto faces +X. Rotate so the opening faces +Y.
    points=[v.co for ob in cavern for v in ob.data.vertices]
    low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)]);size=high-low
    for ob in cavern:
        ob.name='tripo-limestone-cavern-shell'
        for v in ob.data.vertices:
            p=v.co.copy();x=-(p.y-(low.y+high.y)*.5)/size.y*cc['width']
            z=cc['bottom']+(p.z-low.z)/size.z*cc['height']
            depth=(p.x-low.x)/size.x
            y=cc['rearIntercept']+cc['rearSlope']*z+cc['rearClearance']+depth*cc['depth']
            v.co=(x,y,z)
        ob.data.update();bpy.context.view_layer.objects.active=ob
        if len(ob.data.polygons)>cc['triangleBudget']:
            mod=ob.modifiers.new('Cavern web detail budget','DECIMATE');mod.ratio=cc['triangleBudget']/len(ob.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name)
    cavern_report={'taskId':ct['task_id'],'sourceBounds':[list(low),list(high)],'sourceSHA256':hashlib.sha256(Path(ct['model_file']).read_bytes()).hexdigest(),'config':cc}

def surface(name,color,roughness=.8):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=roughness
    return mat

wood=surface('Weathered lighthouse walkway',(.25,.16,.085))
rail=surface('Oxidised bronze rails',(.17,.135,.09),.5)
def beam(name,a,b,width,height,mat):
    a,b=Vector(a),Vector(b);delta=b-a
    bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)*.5)
    ob=bpy.context.object;ob.name=name;ob.rotation_euler=delta.to_track_quat('X','Z').to_euler();ob.scale=(delta.length,width,height);ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=ob.modifiers.new('Soft timber edges','BEVEL');bevel.width=.0005;bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name)
    return ob

width=cfg['pathWidth'];path=[Vector(v) for v in cfg['lighthousePath']]
for a,b in zip(path,path[1:]):
    horizontal=Vector((b.x-a.x,b.y-a.y,0));length=horizontal.length;tangent=horizontal.normalized();side=Vector((-tangent.y,tangent.x,0));n=max(6,round(length/.012))
    for i in range(n):
        p=a.lerp(b,(i+.5)/n)
        if abs(a.z-b.z)>.002:p.z=a.z+(b.z-a.z)*(i+1)/n
        p.z-=.0025
        beam('coast-walkway-plank',p-tangent*length/n*.5,p+tangent*length/n*.5,width,.005,wood)
        if i%3==0 or i==n-1:
            for sign in [-1,1]:
                q=p+side*sign*width*.46;beam('coast-rail-post',q,q+Vector((0,0,.030)),.0028,.0028,rail)
    for sign in [-1,1]:
        offset=side*sign*width*.46
        beam('coast-bridge-stringer',a+offset-Vector((0,0,.008)),b+offset-Vector((0,0,.008)),.005,.009,wood)
        beam('coast-handrail',a+offset+Vector((0,0,.028)),b+offset+Vector((0,0,.028)),.003,.003,rail)

bpy.context.view_layer.update()
support=[{'x':x,'y':y,'terrainZ':terrain_height(x,y)} for x in [-.055,.025,.12,.22,.30] for y in [.50,.57,.64,.69]]
report={'variant':variant,'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'terrainTaskId':task['task_id'],'removedObjects':removed,'houseGeometryModified':False,'terrainVerticesFitted':fitted_vertices,'largestTerrainLift':largest_lift,'cavern':cavern_report,'houseFootBounds':[[min(p[i] for p in foot) for i in range(3)],[max(p[i] for p in foot) for i in range(3)]],'terrainSamples':support,'config':cfg,'triangles':0}
for ob in bpy.context.scene.objects:
    if ob.type=='MESH':ob.data.calc_loop_triangles();report['triangles']+=len(ob.data.loop_triangles)
destination=out/('shell.glb' if variant=='shell' else 'model.glb')
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB')
(out/f'{variant}-assembly.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'output':str(destination),'triangles':report['triangles'],'foot':report['houseFootBounds'],'terrainSamples':support}))
