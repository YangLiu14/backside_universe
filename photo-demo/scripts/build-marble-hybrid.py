#!/usr/bin/env python3
"""Local-only Marble object replacement. Never calls a paid model service.

Read the observed legacy SPZ v2 layout and preserve every retained attribute
byte. Fit support geometry in the registered Marble source camera. Reuse the
previously calibrated closed laptop/cup, plus the registered Hi3D paper model.
"""
from pathlib import Path
import gzip, hashlib, json, struct
import numpy as np
from scipy import ndimage
from scipy.spatial.transform import Rotation
from PIL import Image
import cv2
import importlib.util
spec=importlib.util.spec_from_file_location('completion',Path(__file__).with_name('complete-desk-occlusion.py'))
completion=importlib.util.module_from_spec(spec);spec.loader.exec_module(completion)

APP=Path(__file__).resolve().parents[1]
OUT=APP/'dist/marble-hybrid-lab/assets'
EVIDENCE=APP/'evidence/marble-hybrid'
W,H=1320,1739

def read_spz(path):
    raw=gzip.decompress(path.read_bytes())
    magic,version,n,degree,fractional,flags,reserved=struct.unpack('<IIIBBBB',raw[:16])
    if magic!=0x5053474e or version!=2 or degree!=0 or flags!=0:
        raise ValueError('This extractor is deliberately limited to this observed SPZ v2 degree-0 asset.')
    assert len(raw)==16+n*19
    pos=np.frombuffer(raw,np.uint8,count=n*9,offset=16).reshape(n,3,3).astype(np.int32)
    fixed=pos[:,:,0]+(pos[:,:,1]<<8)+(pos[:,:,2]<<16)
    xyz=np.where(fixed&0x800000,fixed-0x1000000,fixed).astype(float)/2**fractional
    alpha=np.frombuffer(raw,np.uint8,count=n,offset=16+n*9)
    color=np.frombuffer(raw,np.uint8,count=n*3,offset=16+n*10).reshape(n,3)
    scales=np.exp(np.frombuffer(raw,np.uint8,count=n*3,offset=16+n*13).reshape(n,3)/16.-10)
    rot=np.frombuffer(raw,np.uint8,count=n*3,offset=16+n*16).reshape(n,3)/127.5-1
    quat=np.column_stack([rot,np.sqrt(np.maximum(1-np.sum(rot**2,axis=1),0))])
    return raw,xyz,alpha,color,scales,quat

def camera(meta):
    p=meta['calibration']['parameters']
    R=Rotation.from_euler('YXZ',[p['yaw'],p['pitch'],p['roll']],degrees=True).as_matrix()@np.diag([1,-1,-1])
    C=np.array([p['x'],p['y'],p['z']])
    fy=H/(2*np.tan(np.deg2rad(p['fov'])/2));fx=fy*1650.1209716796875/1553.64794921875
    return R,C,np.array([fx,fy,W/2,H/2])

def project(xyz,K): return xyz[:,:2]/xyz[:,2:]*K[:2]+K[2:]
def rays(uv,K): return np.column_stack([(uv[:,0]-K[2])/K[0],(uv[:,1]-K[3])/K[1],np.ones(len(uv))])
def poly(points):
    mask=np.zeros((H,W),np.uint8)
    cv2.fillPoly(mask,[np.rint(np.array(points)*[W/630,H/830]).astype(np.int32)],1)
    return mask.astype(bool)

def plane_fit(points):
    rng=np.random.default_rng(20261104);points=points[rng.choice(len(points),min(9000,len(points)),replace=False)]
    xy=points[:,:2]/points[:,2:];A=np.column_stack([xy,np.ones(len(xy))]);b=1/points[:,2]
    best=np.zeros(len(points),bool)
    for _ in range(600):
        ids=rng.choice(len(points),3,replace=False)
        try: p=np.linalg.solve(A[ids],b[ids])
        except np.linalg.LinAlgError: continue
        inside=np.abs(A@p-b)<.004
        if inside.sum()>best.sum():best=inside
    for _ in range(3):
        p=np.linalg.lstsq(A[best],b[best],rcond=None)[0]
        best=np.abs(A@p-b)<.004
    return p,{'samples':len(points),'inliers':int(best.sum()),'median_inverse_depth_error':float(np.median(np.abs(A[best]@p-b[best])))}

def glb_parts(path):
    """Read triangle positions from this existing GLB; preserve its topology."""
    blob=path.read_bytes();assert blob[:4]==b'glTF';offset=12;doc=None;binary=None
    while offset<len(blob):
        length,kind=struct.unpack_from('<II',blob,offset);chunk=blob[offset+8:offset+8+length];offset+=8+length
        if kind==0x4e4f534a:doc=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    def access(i):
        a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        cols={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];item=np.dtype(dtype).itemsize
        return np.ndarray((a['count'],cols),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',cols*item),item)).copy()
    result=[]
    def node(i,parent):
        n=doc['nodes'][i]
        if 'matrix' in n:M=np.array(n['matrix']).reshape(4,4,order='F')
        else:
            M=np.eye(4);M[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));M[:3,3]=n.get('translation',[0,0,0])
        M=parent@M
        if 'mesh' in n:
            for p in doc['meshes'][n['mesh']]['primitives']:
                assert p.get('mode',4)==4
                xyz=access(p['attributes']['POSITION']);xyz=xyz@M[:3,:3].T+M[:3,3]
                indices=access(p['indices']).reshape(-1) if 'indices' in p else np.arange(len(xyz))
                result.append((xyz,indices))
        for child in n.get('children',[]):node(child,M)
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:node(i,np.eye(4))
    return result

def main():
    OUT.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(parents=True,exist_ok=True)
    meta=json.loads((APP/'dist/marble-lab/assets/scene.json').read_text())
    source=APP/'dist/marble-lab/assets/desk-full_res.spz'
    assert hashlib.sha256(source.read_bytes()).hexdigest()==meta['variants']['full_res']['sha256']
    raw,xyz,alpha,color,scales,quat=read_spz(source)
    R,C,K=camera(meta);scale=meta['semantics_metadata']['metric_scale_factor'];ground=meta['semantics_metadata']['ground_plane_offset']
    world=xyz*scale*[1,-1,-1]+[0,ground,0]
    local=(world-C)@R;uv=project(local,K)
    ix=np.clip(np.rint(uv[:,0]).astype(int),0,W-1);iy=np.clip(np.rint(uv[:,1]).astype(int),0,H-1)
    valid=(local[:,2]>.2)&(local[:,2]<6)&(uv[:,0]>=0)&(uv[:,0]<W)&(uv[:,1]>=0)&(uv[:,1]<H)&(alpha>80)
    masks={
      'laptop':poly([[233,316],[310,303],[320,357],[351,378],[273,404],[239,382]]),
      'cup':poly([[360,330],[390,328],[400,340],[408,361],[397,371],[355,369],[350,356]]),
      'note':poly([[360,309],[377,303],[394,309],[399,331],[392,343],[357,341]])}
    tabletop=poly([[62,379],[421,330],[480,366],[98,451]])
    exclusions=poly([[102,378],[155,365],[198,405],[133,426]])|poly([[333,324],[369,315],[421,338],[384,350]])|poly([[198,381],[220,376],[226,391],[203,396]])|poly([[139,360],[208,349],[220,367],[146,381]])
    excluded=ndimage.binary_dilation(np.logical_or.reduce(list(masks.values()))|exclusions,iterations=12)
    ids=valid&tabletop[iy,ix]&~excluded[iy,ix]&(np.max(scales,axis=1)*scale<.03)
    table,stats=plane_fit(local[ids])
    print(json.dumps({'K':K.tolist(),'table':table.tolist(),'fit':stats,'table_candidates':int(ids.sum()),'height_range':np.percentile(world[ids,1],[10,50,90]).tolist()}),flush=True)
    np.savez_compressed(EVIDENCE/'geometry.npz',world=world.astype(np.float32),local=local.astype(np.float32),uv=uv.astype(np.float32),scales=scales.astype(np.float32),alpha=alpha,color=color,quat=quat.astype(np.float32))
    (EVIDENCE/'support.json').write_text(json.dumps({'R':R.tolist(),'C':C.tolist(),'K':K.tolist(),'table':table.tolist(),'fit':stats},indent=2))
    for name,m in masks.items():Image.fromarray(m.astype(np.uint8)*255).save(EVIDENCE/(name+'-region.png'))
    # Remove the generated foreground volume, not the wall / entire camera ray.
    height=(1-local@table)/np.linalg.norm(table)
    bookcorners=[[338,324],[367,318],[412,336],[380,347]]
    bookmask=poly(bookcorners)
    blue_points=(color[:,2].astype(float)>color[:,0].astype(float)+8)
    bookids=valid&bookmask[iy,ix]&blue_points&(local[:,2]>2.48)&(local[:,2]<2.82)&(alpha>100)
    bookplane,bookstats=plane_fit(local[bookids])
    masks['book']=poly([[333,322],[369,311],[418,334],[385,356]])
    remove=np.zeros(len(xyz),bool);counts={}
    for name,mask in masks.items():
        distance=ndimage.distance_transform_edt(~mask)
        extent=np.clip(np.max(scales,axis=1)*scale*K[0]/np.maximum(local[:,2],.1)*2.5,2,14)
        near=distance[iy,ix]<extent+3
        zmax={'laptop':2.51,'cup':2.56,'note':2.87,'book':2.92}[name]
        minheight={'laptop':-.035,'cup':-.032,'note':-.045,'book':-.065}[name]
        chosen=near&(height>minheight)&(height<.36)&(local[:,2]>.8)&(local[:,2]<zmax)
        remove|=chosen;counts[name]=int(chosen.sum())
    # Alter only opacity bytes. World positions, color, size, orientation and
    # all non-selected opacities remain byte-for-byte equal after decompression.
    result=bytearray(raw);n=len(xyz);aa=np.frombuffer(result,np.uint8,count=n,offset=16+n*9)
    aa[remove]=0
    assert raw[:16+n*9]==result[:16+n*9] and raw[16+n*10:]==result[16+n*10:]
    assert np.array_equal(aa[~remove],alpha[~remove])
    (OUT/'room-without-objects.spz').write_bytes(gzip.compress(result,compresslevel=6,mtime=0))
    np.flatnonzero(remove).astype('<u4').tofile(OUT/'removed-indices.bin')
    # Add fixed 3D support only in exposed object footprints. Fit a local color
    # gradient from existing neutral Marble desk samples, not an overlaid photo.
    yy,xx=np.mgrid[:H,:W];raygrid=np.stack([(xx-K[2])/K[0],(yy-K[3])/K[1],np.ones((H,W))],-1)
    depth=1/(raygrid@table)
    render=np.asarray(Image.open(APP/'evidence/marble-lab/registered/render.png').convert('RGB').resize((W,H)))
    fillparts=[];fillcounts={}
    # The fitting polygon intentionally excludes the obscured rear edge. The
    # actual desk continues behind the book; include that narrow strip when
    # repairing removed splats, otherwise it leaves a triangular see-through gap.
    supporttable=poly([[62,370],[421,321],[480,366],[98,451]])
    for name in ['laptop','cup','book']:
        mask=ndimage.binary_dilation(masks[name],iterations=14)&supporttable if name!='book' else ((ndimage.binary_dilation(masks['book'],iterations=22)&supporttable)|bookmask)
        # The table support stops at the back edge and never overwrites the book.
        if name!='book':mask &= ~((ndimage.binary_dilation(masks['book'],iterations=22)&supporttable)|bookmask)
        neighborhood=tabletop&~excluded&~ndimage.binary_dilation(masks['book'],iterations=12)
        py,px=np.where(neighborhood);rgb=render[py,px].astype(float)/255
        neutral=(np.ptp(rgb,axis=1)<.18)&(np.mean(rgb,axis=1)>.60)
        px=px[neutral];py=py[neutral];rgb=rgb[neutral]
        A=np.column_stack([np.ones(len(px)),(px-W/2)/W,(py-H/2)/H])
        coeff=np.linalg.lstsq(A,rgb,rcond=None)[0]
        for _ in range(3):
            residual=np.linalg.norm(A@coeff-rgb,axis=1);keep=residual<np.quantile(residual,.8)
            coeff=np.linalg.lstsq(A[keep],rgb[keep],rcond=None)[0]
        field=np.clip(np.stack([np.ones((H,W)),(xx-W/2)/W,(yy-H/2)/H],-1)@coeff,0,1)
        # Soft contact shading is baked into the fixed support, never camera-facing.
        originalmask=np.asarray(Image.open(APP/f'dist/assets/objects/{name}-mask.png').convert('L'))>127
        dist=ndimage.distance_transform_edt(~originalmask)
        field*=1-(.08*np.exp(-(dist/8)**2))[:,:,None]
        piece=completion.make_splats(mask,depth,np.uint8(field*255),K)
        feather=np.minimum(ndimage.distance_transform_edt(mask)[mask]/5,1)*.995
        piece['opacity']=np.log(np.clip(feather,.01,.995)/np.clip(1-feather,.005,.99))
        fillparts.append(piece);fillcounts[name]=len(piece)
    completion.write_ply(OUT/'support.ply',np.concatenate(fillparts))
    # Reuse the previous mesh topology. Ray-preserving camera conversion keeps
    # its calibrated source silhouette. Per-object scale seats it on this desk.
    oldmeta=json.loads((APP/'dist/solid-object-lab/assets/scene.json').read_text())
    old=json.loads((APP/'dist/solid-object-lab/assets/objects.json').read_text())
    oldK=np.array(oldmeta['intrinsics']);parts=[];mapping={}
    for name in ['laptop','cup']:
        candidates=[p for p in old['parts'] if p['object']==name]
        verts=np.concatenate([np.array(p['positions']).reshape(-1,3) for p in candidates])
        # Lowest original part establishes contact; all child parts share mapping.
        oldtable=np.array(oldmeta['surface_fit']['table']['plane'])
        oldheight=(1-verts@oldtable)/np.linalg.norm(oldtable)
        bottom=verts[oldheight<np.min(oldheight)+.004].mean(0)
        bottomuv=project(bottom[None],oldK)[0];r=rays(bottomuv[None],K)[0]
        newz=1/(r@table);factor=newz/bottom[2]
        diagonal=np.array([oldK[0]/K[0],oldK[1]/K[1],1])*factor
        mapped_height=(1-(verts*diagonal)@table)/np.linalg.norm(table)
        lift=max(0,.0006-float(mapped_height.min()))
        mapping[name]={'diagonal':diagonal.tolist(),'contact_pixel':bottomuv.tolist(),'minimum_support_correction':lift}
        for part in candidates:
            points=np.array(part['positions']).reshape(-1,3)*diagonal
            heights=(1-points@table)/np.linalg.norm(table)+lift
            viewrays=points/points[:,2:]
            points=viewrays*((1-heights*np.linalg.norm(table))/(viewrays@table))[:,None]
            worldpoints=points@R.T+C
            parts.append({**part,'positions':worldpoints.round(8).reshape(-1).tolist()})
    # Hi3D note registration already lives in the main demo's world coordinates.
    original=json.loads((APP/'dist/assets/calibration.json').read_text())
    fit=json.loads((APP/'dist/assets/generated-furniture-fit.json').read_text())['note']
    oldR=Rotation.from_quat(original['quaternion']).as_matrix()@np.diag([1,-1,-1]);oldC=np.array(original['position'])
    f=H/(2*np.tan(np.deg2rad(original['fov'])/2));oldnoteK=np.array([f,f,W/2,H/2])
    height_scale=.38
    def map_note_world(vertices,clamp_outline=False):
        oldpoints=(vertices-oldC)@oldR;uv=project(oldpoints,oldnoteK)
        if clamp_outline:
            nx=np.clip(np.rint(uv[:,0]).astype(int),0,W-1);ny=np.clip(np.rint(uv[:,1]).astype(int),0,H-1)
            outside=~sam[ny,nx];uv[outside]=np.column_stack([nearest[1,ny[outside],nx[outside]],nearest[0,ny[outside],nx[outside]]]).astype(float)
        else:outside=np.zeros(len(vertices),bool)
        nr=rays(uv,K);heights=(vertices[:,1]-.006)*height_scale+.0006
        points=nr*((1-heights*np.linalg.norm(table))/(nr@table))[:,None]
        return points@R.T+C,outside
    # Reuse the original book's calibrated support plane with the note. A
    # shared transform prevents a photo-aligned note floating above Marble's
    # differently inferred book. Restore the exposed old footprint as desktop.
    bookpixels=np.array([[712,674],[790,661],[855,698],[779,721]],float)
    bookrays=rays(bookpixels,oldnoteK)@oldR.T
    bookworld=oldC+bookrays*((.058-oldC[1])/bookrays[:,1])[:,None]
    lower=bookworld-[0,.052,0]
    bookverts,_=map_note_world(np.concatenate([bookworld,lower]))
    parts.append({'name':'book-cover','object':'book','color':[.09,.23,.36],'positions':bookverts[:4].round(8).reshape(-1).tolist(),'indices':[0,1,2,0,2,3]})
    ids=[4,6,5,4,7,6]
    for k in range(4):j=(k+1)%4;ids.extend([k,k+4,j+4,k,j+4,j])
    parts.append({'name':'book-pages','object':'book','color':[.76,.74,.67],'positions':bookverts.round(8).reshape(-1).tolist(),'indices':ids})
    # Constrain the old Hi3D silhouette to the already-observed SAM outline.
    # This only shifts vertices across source rays; their inferred depth and
    # mesh connectivity remain intact. Never project background onto paper.
    sam=np.asarray(Image.open(APP/'dist/assets/objects/note-mask.png').convert('L'))>127
    _,nearest=ndimage.distance_transform_edt(~sam,return_indices=True)
    yaw=Rotation.from_euler('y',fit['yaw']).as_matrix();note_adjusted=0;total_note=0
    for i,(vertices,indices) in enumerate(glb_parts(APP/'dist/assets/note-hi3d.glb')):
        oldworld=((vertices-np.array(fit['sourceOrigin']))*fit['scale'])@yaw.T+fit['position']
        worldnote,outside=map_note_world(oldworld,True)
        parts.append({'name':f'hi3d-paper-{i}','object':'note','color':[.79,.74,.62],'positions':worldnote.round(8).reshape(-1).tolist(),'indices':indices.tolist()})
        note_adjusted+=int(outside.sum());total_note+=len(vertices)
    (OUT/'objects.json').write_text(json.dumps({'parts':parts,'mapping':mapping},separators=(',',':')))
    metadata={'source_world_id':meta['world_id'],'source_spz_sha256':meta['variants']['full_res']['sha256'],
        'calibration':meta['calibration'],'semantics_metadata':meta['semantics_metadata'],
        'source_image':'../../assets/desk-original.jpg','width':W,'height':H,'intrinsics':K.tolist(),
        'source_camera_to_world':R.tolist(),'source_camera_position':C.tolist(),
        'support_plane':table.tolist(),'support_fit':stats,'removed_total':int(remove.sum()),'removed_by_region':counts,
        'support_gaussians':fillcounts,'note':{'registration':fit,'mapping':'Photo-ray preserved; shared support-plane height re-registration','height_scale':height_scale,'silhouette_adjusted_vertices':note_adjusted,'vertices':total_note,'source_glb_sha256':hashlib.sha256((APP/'dist/assets/note-hi3d.glb').read_bytes()).hexdigest()},
        'limits':['Single-view geometry and new surfaces are inferred.','The book support is registered together with the paper model.','Photo projection applies only to source-visible mesh surfaces.','Original Marble and all earlier demos remain unchanged.'],
        'generation_cost_credits':0,'pipeline':'Marble room + existing calibrated opaque objects + fixed source photo projection',
        'review':{'summary':'已检查 0° 与 ±12°：电脑屏幕、键盘、杯子和纸页恢复原照细节。杯柄、书本边缘和桌面补面仍有接缝；大角度会露出推断表面，固定半径绕行还可能穿墙。'}}
    (OUT/'scene.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({'removed':counts,'unique':int(remove.sum()),'support':fillcounts,'mapping':mapping}),flush=True)

if __name__=='__main__':main()
