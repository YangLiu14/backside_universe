#!/usr/bin/env python3
"""Fit an authored side coat around the registered museum. The profile is art,
not a second photograph. A rounded near/far surface and a rolled opening keep
the silhouette, shadow, and parallax useful between the two camera positions.
"""
from pathlib import Path
import hashlib,json
import numpy as np,cv2
from scipy.interpolate import PchipInterpolator,splprep,splev,LinearNDInterpolator,NearestNDInterpolator
from scipy.spatial.transform import Rotation
from scipy import ndimage
ROOT=Path(__file__).resolve().parents[1]; folder=ROOT/'dist/canine-museum/assets'
ref=folder/'profile-reference.png'; rgba=cv2.imread(str(ref),cv2.IMREAD_UNCHANGED)
assert rgba.shape==(1024,1536,4)
digest=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
assert digest(ref)=='41deb011cd16834105e3c09dcb384a06b4d7d86b8d0228ebf466c33586f74640', 'Fitting is specific to the archived art reference'
alpha=rgba[:,:,3]; mask=(alpha>78).astype('uint8');size=(1536,1024)
# Nonuniform registration: keep muzzle, shoulder, seated haunch and paws fixed
# while giving the long side of the torso enough space for the organ cases.
uKnots=[0,65,370,460,550,700,815,905,985,1030,1120,1265,1535]
zKnots=[-2.38,-2.15,-1.71,-1.51,-1.29,-.84,-.40,-.03,.40,.65,.91,1.38,2.1]
U,V=np.meshgrid(np.arange(size[0]),np.arange(size[1]))
Z=PchipInterpolator(uKnots,zKnots)(U)
Y=(998-V)*.00284
# Lift the sloping back over the lumbar gallery without moving the feet/head.
Y+=.22*np.exp(-((Z+.73)/.78)**2)*np.clip(Y/1.1,0,1)
d=cv2.distanceTransform(mask,cv2.DIST_L2,5)
width=.47*np.sqrt(np.clip(d/96,0,1))
# Return at silhouette tangencies; slim the muzzle, paws and tail gradually.
width*=.47+.53*np.clip((Y-.1)/.65,0,1)
width*=1-.48*np.clip((Z-.96)/.41,0,1)
CX=-.06-.14*np.exp(-((Z-.99)/.42)**2-((Y-2.45)/.46)**2)
def cut(poly):
    pts=np.array(poly); tck,_=splprep(pts.T,s=0,per=True,k=3); zz,yy=splev(np.arange(360)/360,tck)
    # Evaluate in the registered sagittal plane so cut, galleries, and skeleton
    # share coordinates. Rasterization is used only to sample that geometry.
    u=np.interp(zz,zKnots,uKnots); vv=(998-(yy-.22*np.exp(-((zz+.73)/.78)**2)*np.clip(yy/1.1,0,1))/.00284)
    im=np.zeros_like(mask);cv2.fillPoly(im,[np.int32(np.stack([u,vv],1))],1);return im
window=cut([[-1.32,.77],[-1.23,1.13],[-.94,1.46],[-.58,1.77],[-.18,1.93],[.23,2.10],[.52,2.12],[.75,1.94],[.83,1.58],[.82,1.23],[.66,1.00],[.32,.89],[-.03,.84],[-.30,.69],[-.56,.53],[-.92,.49],[-1.19,.56],[-1.32,.77]])
leg=cut([[.51,.18],[.43,.43],[.36,.77],[.38,.98],[.51,1.03],[.57,.82],[.64,.56],[.70,.27],[.69,.17],[.51,.18]])
hip=cut([[-1.20,.92],[-1.10,.91],[-.87,.73],[-.71,.61],[-.81,.47],[-1.04,.26],[-1.13,.25],[-1.14,.37],[-.97,.56],[-1.12,.68],[-1.23,.82],[-1.20,.92]])
# Keep the real projection of the upper filter gallery unobstructed at eye level.
kidney_clearance=(((Z+.72)/.34)**2+((Y-1.52)/.19)**2<1).astype('uint8')
aperture=np.maximum.reduce([window,leg,hip,kidney_clearance])
# Sufficient space even where estimated side width is narrow: no fur covers the rooms.
openmask=mask*(1-aperture)
blob=bytearray();parts=[]
def put(a,fmt):
 while len(blob)%4:blob.append(0)
 idx=len(blob);blob.extend(np.asarray(a,dtype=fmt).tobytes());return idx
# Pair eye corners, blaze, ear tips, nose, lip and neck in the two views.
# The face moves on ONE surface; two separately fading faces produce a second nose.
pairs=np.array([
 [0,0,465,250],[1535,0,1000,245],[0,540,467,746],[1535,540,999,791],
 [1085,24,778,266],[1041,37,686,288],[1150,39,846,275],[1191,62,890,297],
 [1002,68,627,324],[952,111,576,382],[928,164,548,449],[926,208,548,501],
 [961,253,554,548],[982,259,603,557],[1003,219,632,526],[1007,121,640,376],
 [1058,129,688,405],[1081,130,716,404],[1098,130,739,400],[1076,110,706,371],
 [1174,88,871,343],[1184,87,882,343],[1192,90,892,345],
 [1208,138,875,431],[1210,166,852,472],[1234,176,905,482],[1259,161,947,453],
 [1268,200,979,512],[1245,233,960,558],[1200,248,908,596],[1146,235,792,563],
 [1092,215,738,526],[1144,258,826,603],[1004,280,641,603],[959,302,541,611],
 [1192,305,975,631],[1143,371,941,679],[955,389,603,676],[860,347,506,650],
 [1045,463,768,778],[1190,457,981,777],[736,477,483,732]
 ],float)
warp=LinearNDInterpolator(pairs[:,:2],pairs[:,2:]);nearest=NearestNDInterpolator(pairs[:,:2],pairs[:,2:])
source_folder=ROOT/'evidence/canine-museum'; raw=np.load(source_folder/'source-da3-base.npz')
registration=json.loads((folder/'registration.json').read_text())
src_w,src_h=registration['source'];K=np.array(registration['intrinsics'])
src_depth=cv2.resize(raw['depth'],(src_w,src_h))
valid=(src_depth<.69); idx=ndimage.distance_transform_edt(~valid,return_distances=False,return_indices=True)
src_depth=cv2.GaussianBlur(np.clip(src_depth[tuple(idx)],.494,.600),(0,0),12)
R=Rotation.from_quat(registration['quaternion'])
def face_attributes(uu,vv):
 points=np.stack([uu,vv],1);xy=warp(points);bad=~np.isfinite(xy[:,0]);xy[bad]=nearest(points[bad])
 x0,y0=xy.T;z0=src_depth[np.clip(y0.astype(int),0,src_h-1),np.clip(x0.astype(int),0,src_w-1)]
 srcpos=R.apply(np.stack([(x0-K[0,2])*z0/K[0,0],-(y0-K[1,2])*z0/K[1,1],-z0],1))*registration['scale']+registration['origin']
 return srcpos,np.stack([x0/(src_w-1),1-y0/(src_h-1)],1)
step=3
v,u=np.mgrid[0:size[1]:step,0:size[0]:step]
def surface(name,visible,x,reverse=False):
 keep=visible[v,u].astype(bool);grid=np.full(keep.shape,-1);grid[keep]=np.arange(keep.sum())
 a,b,c,e=grid[:-1,:-1],grid[:-1,1:],grid[1:,:-1],grid[1:,1:]
 ii=np.stack([a,c,b,b,c,e],axis=-1).reshape(-1,3);ii=ii[(ii>=0).all(1)]
 if reverse:ii=ii[:,::-1]
 U0,V0=u[keep],v[keep];pos=np.stack([x[V0,U0],Y[V0,U0],Z[V0,U0]],1);uv=np.stack([U0/1535,1-V0/1023],1)
 srcpos,srcuv=face_attributes(U0,V0)
 head=np.clip((.48-V0/1023)/.18,0,1)
 # Preserve the proportions of the reference head independently of the long flank.
 pos[:,2]+=(1.32-pos[:,2])*.19*head
 parts.append(dict(name=name,count=len(pos),indexCount=ii.size,position=put(pos,'<f4'),uv=put(uv,'<f4'),index=put(ii,'<u4'),
                   sourcePosition=put(srcpos,'<f4') if not reverse else None,sourceUv=put(srcuv,'<f4') if not reverse else None))
# Far surface closes around the skull. Close the near cut by retreating the lip
# into the wood liner over the last few millimetres, like the edge of a specimen.
bevel=cv2.distanceTransform(openmask,cv2.DIST_L2,5)
edge=cv2.dilate(aperture,np.ones((43,43),np.uint8)).astype(float)
near=CX-width+.11*edge*(1-np.clip(bevel/17,0,1))**2
surface('flank',openmask,near);surface('far',mask,CX+width,True)
# An intact removable coat closes the cut until the viewer turns to the flank.
surface('cover',mask*cv2.dilate(aperture,np.ones((9,9),np.uint8)),near-.003)
target=folder/'flank.bin';target.write_bytes(blob)
tex=folder/'flank.webp';cv2.imwrite(str(tex),rgba,[cv2.IMWRITE_WEBP_QUALITY,94])
(folder/'flank.json').write_text(json.dumps(dict(source='Generated side reference; not an observed view.',parts=parts,files={p.name:dict(bytes=p.stat().st_size,sha256=digest(p)) for p in [ref,target,tex]}),indent=2)+'\n')
print(len(blob),'bytes',[(p['name'],p['count']) for p in parts])
