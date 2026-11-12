"""Fit the original camera to the Hi3D pot silhouette, then export the fixed pose."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation

folder=Path(sys.argv[1]).resolve()
art=folder/'art'
raw=np.load(art/'shell-points.npz')
v=raw['points'].astype(float)
# Find the horizontal handle axis from each mesh itself.
cov=np.cov(v[:,[0,2]].T);_,vec=np.linalg.eigh(cov)
direction=vec[:,-1]
yaw=np.arctan2(direction[1],direction[0])
c,s=np.cos(yaw),np.sin(yaw)
spin=np.array([[c,0,s],[0,1,0],[-s,0,c]])
v=v@spin.T
lo,hi=v.min(0),v.max(0);size=hi-lo
center=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2])
base=(v-center)/size
# Fit the projected complete silhouette, including both handle tips and base.
mask=cv2.imread(str(art/'pot-mask.png'),cv2.IMREAD_GRAYSCALE)
h,w=mask.shape
contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
contour=max(contours,key=cv2.contourArea)[:,0,:].astype(float)
meta=json.loads((folder/'room/registration.json').read_text())
fx,fy,cx,cy=meta['intrinsics'];fx,cx=fx*w/meta['width'],cx*w/meta['width'];fy,cy=fy*h/meta['height'],cy*h/meta['height']
angles=np.arange(0,2*np.pi,2*np.pi/64);directions=np.stack([np.cos(angles),np.sin(angles)],1)
expected=(contour@directions.T).max(0)
yaxis=np.array([0,1,0])
hull=base[ConvexHull(base).vertices]
# Keep the Hi3D proportions regularized, with a fixed handle span to set the physical scale.
native=size/size[0]*3.85
def model(p):
    az,el,r,tx,ty,sy,sz=p
    az,el=np.deg2rad([az,el])
    target=np.array([tx,ty,0])
    backward=np.array([np.sin(az)*np.cos(el),np.sin(el),np.cos(az)*np.cos(el)])
    right=np.cross(yaxis,backward);right/=np.linalg.norm(right)
    up=np.cross(backward,right)
    matrix=np.stack([right,up,backward],1)
    pos=target+backward*r
    dimensions=[3.85,sy,sz]
    view=(hull*dimensions-pos)@matrix
    xy=np.stack([fx*view[:,0]/-view[:,2]+cx,cy-fy*view[:,1]/-view[:,2]],1)
    return (xy@directions.T).max(0),pos,target,dimensions,matrix
lid=base[(base[:,1]>.68)&(base[:,1]<.79)][::6]
knob=base[base[:,1]>.94][::3]
feet=base[base[:,1]<.025][::10]
def loss(p):
    silhouette,pos,target,dim,matrix=model(p)
    def pixels(points):
        pts=(points*dim-pos)@matrix
        return np.stack([fx*pts[:,0]/-pts[:,2]+cx,cy-fy*pts[:,1]/-pts[:,2]],1)
    rim,top,bottom=pixels(lid),pixels(knob),pixels(feet)
    marks=np.array([rim[:,0].min()-412,rim[:,0].max()-1010,rim[:,1].min()-140,rim[:,1].max()-506,
                    top[:,0].mean()-713,top[:,1].mean()-204,bottom[:,1].max()-709])
    return np.r_[silhouette-expected,marks*1.8,(p[5]-native[1])*30,(p[6]-native[2])*55,p[0]*.4]
fits=[least_squares(loss,[az,34,6.5,0,1.02,native[1],native[2]],bounds=([-22,22,3,-1,.15,native[1]*.85,native[2]*.90],[22,52,12,1,2.5,native[1]*1.22,native[2]*1.10]),loss='soft_l1',max_nfev=110) for az in (-6,6)]
p=min(fits,key=lambda f:f.cost).x
obs,pos,target,dim,mat=model(p)
out=dict(yaw=float(yaw),center=center.tolist(),nativeSize=size.tolist(),dims=dim,
    position=pos.tolist(),target=target.tolist(),projection=[fx,fy,cx,cy],size=[w,h],
    sourceQuaternion=Rotation.from_matrix(mat).as_quat().tolist(),medianSilhouettePx=float(np.median(abs(obs-expected))),
    photoOrbitTarget=[0,dim[1]*.46,0],estimatedPose=p.tolist())
(art/'pot-fit.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
