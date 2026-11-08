"""Calibrate a fly-through against each actual Hi3D mesh and inventory its web copy.

Run with the project's NumPy, OpenCV and Pillow environment after exporting the six
GLBs from Blender. Original Hi3D downloads use tightly packed, uncompressed faces.
"""
import hashlib
import importlib.util
import json
import struct
from pathlib import Path

import cv2
import numpy as np

app = Path(__file__).resolve().parents[1]
source = app / 'evidence/canine-production/hi3d-tract/animated'
out = app / 'dist/canine-museum/assets/digestion/channels'
resize_spec = importlib.util.spec_from_file_location('textures',Path(__file__).with_name('resize-gallery-textures.py'))
textures = importlib.util.module_from_spec(resize_spec)
resize_spec.loader.exec_module(textures)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def unpack(raw):
    size = struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+size]), memoryview(raw)[28+size:]

def array(doc, binary, index):
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    kind = {5126:'<f4',5125:'<u4',5123:'<u2'}[acc['componentType']]
    width = {'VEC3':3,'SCALAR':1}[acc['type']]
    offset = view.get('byteOffset',0)+acc.get('byteOffset',0)
    if view.get('byteStride',np.dtype(kind).itemsize*width) != np.dtype(kind).itemsize*width:
        raise ValueError('Unexpected interleaved accessor')
    return np.frombuffer(binary,kind,acc['count']*width,offset).reshape(-1,width)

def camera_path(raw,station):
    doc, binary = unpack(raw)
    primitive = doc['meshes'][0]['primitives'][0]
    verts = array(doc,binary,primitive['attributes']['POSITION'])
    faces = array(doc,binary,primitive['indices']).reshape(-1,3)
    size = verts.max(0)-verts.min(0)
    verts = (verts-(verts.min(0)+size*.5))*(2/size[0])
    # Project the front surface along +Z. A clear disk in each slice leaves
    # room to turn the camera without crossing the modeled floor or ceiling.
    n = 191
    depth = np.full((n,n),-100,np.float32)
    for pts in [verts, (verts[faces[:,0]]+verts[faces[:,1]]+verts[faces[:,2]])/3]:
        x = np.int32((pts[:,0]+1)*(n-1)/2).clip(0,n-1)
        y = np.int32((1-pts[:,1])*(n-1)/2).clip(0,n-1)
        np.maximum.at(depth,(y,x),pts[:,2])
    depth = cv2.dilate(depth,np.ones((3,3),np.uint8))
    grid_y,grid_x=np.mgrid[0:n,0:n]
    x = grid_x*2/(n-1)-1
    y = 1-grid_y*2/(n-1)
    xf=yf=0.
    front = float(size[2]/size[0])
    points=[]
    for z in np.linspace(front+.09,-front*.78,30):
        valid=(depth<z-.055)&((x/.70)**2+(y/.55)**2<1)
        clear=cv2.distanceTransform(valid.astype('B'),cv2.DIST_L2,5)*2/(n-1)
        score=clear-.35*np.hypot(x-xf,y-yf)
        if station=='stomach':
            # Approach the real off-centre pyloric doorway visible on the right.
            u=np.clip((front+.09-z)/(front*1.2),0,1)
            score-=.85*np.hypot(x-.48*u,y+.30*u)
        j,i=np.unravel_index(score.argmax(),score.shape)
        if clear[j,i]<.11:break
        xf,yf=float(x[j,i]),float(y[j,i])
        points.append([xf,yf,float(z)])
    if len(points)<4:
        raise ValueError('Insufficient clearance for a traversable room')
    picks=np.linspace(0,len(points)-1,8).round().astype(int)
    return np.round(np.array(points)[picks],4).tolist(),len(faces)

def main():
    catalog={}
    for station in ['mouth','esophagus','stomach','small-intestine','colon','rectum']:
        folder=source/'models'/station
        raw=(folder/'original.glb').read_bytes()
        path,triangles=camera_path(raw,station)
        web=out/(station+'.glb')
        textures.resize(web,1536)
        payload=web.read_bytes()
        doc,_=unpack(payload)
        web_triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
        catalog[station]=dict(asset_id=(folder/'asset-id.txt').read_text().strip(),
            reference_sha256=digest((source/'references'/station/'reference.png').read_bytes()),
            source_sha256=digest(raw),source_triangles=triangles,web_sha256=digest(payload),
            web_triangles=web_triangles,web_bytes=len(payload),camera_path=path)
    if len({s['source_sha256'] for s in catalog.values()})!=6:raise ValueError('Repeated source mesh')
    (out/'catalog.json').write_text(json.dumps(dict(provider='Hi3D.ai',version='v3.0 high quality',
       license='private',credits_per_model=45,channels=catalog),indent=2)+'\n')
if __name__=='__main__':main()
