#!/usr/bin/env python3
"""Register this photograph's visible coat and head; pack its Gaussian for Spark.
Run after the DA3/BLUNT pass (see docs/CANINE_MUSEUM.md). No remote services.
"""
import hashlib, json
from pathlib import Path
import numpy as np
import cv2
from scipy import ndimage
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/canine-museum/assets'
CACHE = ROOT / 'evidence/canine-museum'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
source = OUT/'original.jpg'
meta = json.loads((OUT/'scene.json').read_text())
cachemeta = json.loads((CACHE/'source-da3-base.json').read_text())
assert meta['source_sha256'] == cachemeta['source_sha256'] == digest(source)
assert meta['source_sha256'] == '1c1a19fd7ba6aa9a0f7c538b1b3f94b1da02cdae1261f4f4e46fefa956f3ef0b', 'Landmarks are for the supplied dog photo'
photo = cv2.imread(str(source)); H,W = photo.shape[:2]
d = np.load(CACHE/'source-da3-base.npz')
K = d['intrinsics'].copy(); h,w=d['depth'].shape
K[0]*=W/w; K[1]*=H/h
depth = cv2.resize(d['depth'],(W,H)); room_depth = depth.copy()
# Hand-traced silhouette and neck seam in the unmodified source pixel grid.
outline = [[565,1278],[578,1180],[567,1086],[546,1091],[515,1076],[503,1018],[472,947],[445,872],[450,805],[473,746],[478,679],[474,631],[491,592],[527,562],[547,511],[539,475],[550,419],[565,386],[579,357],[614,330],[642,310],[682,280],[740,264],[810,254],[841,257],[878,273],[895,294],[913,320],[921,344],[943,361],[953,391],[965,413],[969,442],[970,467],[982,489],[987,510],[994,533],[1005,550],[1008,578],[999,596],[979,603],[979,653],[987,678],[978,755],[962,803],[956,898],[946,976],[947,1024],[962,1127],[979,1174],[1022,1195],[1063,1215],[1093,1250],[1105,1278],[1031,1278],[989,1255],[959,1237],[925,1209],[900,1172],[858,1112],[824,1067],[785,1034],[746,1041],[702,1050],[674,1047],[639,1037],[625,1110],[639,1205],[666,1278]]
binary=np.zeros((H,W),np.uint8)
cv2.fillPoly(binary,[np.int32(outline)],1)
gc=np.where(binary,cv2.GC_PR_FGD,cv2.GC_PR_BGD).astype('uint8')
kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(49,49))
gc[cv2.erode(binary,kernel)>0]=cv2.GC_FGD
gc[cv2.dilate(binary,kernel)==0]=cv2.GC_BGD
cv2.setRNGSeed(7)
cv2.grabCut(photo,gc,None,np.zeros((1,65)),np.zeros((1,65)),3,cv2.GC_INIT_WITH_MASK)
mask=np.uint8((gc%2)!=0)
head=np.zeros_like(mask)
cv2.fillPoly(head,[np.int32([[474,220],[1018,220],[1020,605],[951,605],[911,618],[874,637],[823,653],[773,652],[721,628],[673,610],[616,596],[542,595],[498,616],[454,626]])],1)
# Copy valid depths from the same subject across the uncertain depth-edge band.
inside=cv2.erode(mask,np.ones((17,17),np.uint8)).astype(bool)
valid=inside & (depth<.89)
idx=ndimage.distance_transform_edt(~valid,return_distances=False,return_indices=True)
depth=cv2.GaussianBlur(depth[tuple(idx)],(0,0),3)
R=Rotation.from_euler('YX',[-18,-24],degrees=True)
scale=7.
def unproject(u,v,z):
    return R.apply(np.stack([(u-K[0,2])/K[0,0]*z,-(v-K[1,2])/K[1,1]*z,-z],axis=-1))*scale
paws=np.array([[612,1240],[1029,1224]])
origin=np.array([0,.08,.80])-unproject(*paws.T,depth[paws[:,1],paws[:,0]]).mean(0)
# Lightweight source coat and room underlay in the same world as the Gaussian.
blob=bytearray(); parts=[]
def append(ar,dt):
    while len(blob)%4: blob.append(0)
    at=len(blob); blob.extend(np.asarray(ar,dtype=dt).tobytes()); return at
def part(name,pts,uv,tri):
    parts.append(dict(name=name,count=len(pts),indexCount=tri.size,position=append(pts,'<f4'),uv=append(uv,'<f4'),index=append(tri,'<u4')))
def surface(name,selector,step):
    yy,xx=np.mgrid[0:H:step,0:W:step]; active=selector[yy,xx].astype(bool)
    grid=np.full(active.shape,-1); grid[active]=np.arange(active.sum())
    a,b,c,e=grid[:-1,:-1],grid[:-1,1:],grid[1:,:-1],grid[1:,1:]
    tri=np.concatenate([np.stack([a,c,b],2).reshape(-1,3),np.stack([b,c,e],2).reshape(-1,3)])
    tri=tri[(tri>=0).all(1)].astype(np.uint32)
    u,v=xx[active],yy[active]; z=depth[v,u]
    xyz=unproject(u,v,z)+origin; uv=np.stack([u/(W-1),1-v/(H-1)],1)
    part(name,xyz,uv,tri)
# Exposed background just outside the coat is estimated from adjacent wall and rug.
# Render it behind the real splats; observed source colors remain unchanged.
small=(W//3,H//3)
bgmask=cv2.dilate(cv2.resize(mask,small,interpolation=cv2.INTER_NEAREST),np.ones((7,7),np.uint8))
bg=cv2.inpaint(cv2.resize(photo,small,interpolation=cv2.INTER_AREA),bgmask,7,cv2.INPAINT_TELEA)
cv2.imwrite(str(OUT/'room-underlay.jpg'),bg,[cv2.IMWRITE_JPEG_QUALITY,90])
valid_bg=cv2.dilate(mask,np.ones((29,29),np.uint8))==0
bgidx=ndimage.distance_transform_edt(~valid_bg,return_distances=False,return_indices=True)
yy,xx=np.mgrid[0:H:20,0:W:20];xx[:,-1]=W-1;yy[-1,:]=H-1
bz=room_depth[tuple(bgidx)][yy,xx]+.028
xyz=unproject(xx.ravel(),yy.ravel(),bz.ravel())+origin
uv=np.stack([xx.ravel()/(W-1),1-yy.ravel()/(H-1)],1)
grid=np.arange(xx.size).reshape(xx.shape)
tri=np.stack([grid[:-1,:-1],grid[1:,:-1],grid[:-1,1:],grid[:-1,1:],grid[1:,:-1],grid[1:,1:]],-1).reshape(-1,3)
part('underlay',xyz,uv,tri)
surface('coat',mask*(1-head),6)
(OUT/'visible-coat.bin').write_bytes(blob)
# Convert the standard PLY to the fixed-width .splat layout. All covariance axes,
# orientations and colors survive; color/opacity/quaternions are quantized to bytes.
ply=OUT/meta['gaussian_file']
assert digest(ply)==meta['ply_sha256']
with ply.open('rb') as f:
    while f.readline().strip()!=b'end_header': pass
    g=np.fromfile(f,'<f4').reshape(-1,17)
assert np.isfinite(g).all() and len(g)==meta['gaussian_count']
packed=np.zeros((len(g),32),'u1')
packed[:,:12]=g[:,:3].copy().view('u1').reshape(-1,12)
packed[:,12:24]=np.exp(g[:,10:13]).astype('<f4').view('u1').reshape(-1,12)
packed[:,24:27]=np.uint8(np.clip(np.rint((.5+.2820947918*g[:,6:9])*255),0,255))
packed[:,27]=np.rint(255/(1+np.exp(-g[:,9])))
packed[:,28:32]=np.clip(np.rint(g[:,13:17]*128+128),0,255)
packed.tofile(OUT/'room.splat')
out=dict(source=[W,H],intrinsics=K.tolist(),origin=origin.tolist(),quaternion=R.as_quat().tolist(),scale=scale,parts=parts,
         anchors={n:(unproject(np.array([u]),np.array([v]),np.array([depth[v,u]]))[0]+origin).round(4).tolist() for n,u,v in [
             ('crown',780,271),('nearEye',715,402),('nose',904,480),('chin',890,568),('ear',579,483),('chest',739,840),('neck',760,625),('nearPaw',612,1240),('farPaw',1029,1224)]},
         files={p.name:dict(sha256=digest(p),bytes=p.stat().st_size) for p in [source,OUT/'room.splat',OUT/'visible-coat.bin',OUT/'room-underlay.jpg']})
(OUT/'registration.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(out['anchors'],len(blob),len(g),'splats')
