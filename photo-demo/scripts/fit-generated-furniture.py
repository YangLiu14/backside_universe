"""Fit actual generated geometry to source SAM silhouettes using one photo camera.

Uniform scale, yaw and tabletop/floor contact preserve generated proportions.
Silhouette loss is an alignment aid, not a claim to recover hidden geometry.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, binary_erosion, map_coordinates
from scipy.optimize import differential_evolution, minimize
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

parser=argparse.ArgumentParser();parser.add_argument('name',choices=['chair','lamp','note']);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];name=args.name
data=np.load(root/f'evidence/{name}-hi3d-geometry.npz')
model=data['samples'];size=data['bounds'][1]-data['bounds'][0]
c=json.loads((root/'dist/assets/calibration.json').read_text())
camera=np.array(c['position']);rotation=Rotation.from_quat(c['quaternion']).as_matrix()
f=1739/(2*np.tan(np.deg2rad(c['fov']/2)));shrink=3
mask=np.array(Image.open(root/f'evidence/furniture-inputs/{name}-sam2-mask.png').resize((440,580),Image.Resampling.NEAREST))>0
outside=distance_transform_edt(~mask)
ys,xs=np.where(mask);edge=np.where(mask & ~binary_erosion(mask))
rng=np.random.default_rng(42)
ix=rng.choice(len(xs),min(1300,len(xs)),replace=False)
ex=rng.choice(len(edge[0]),min(600,len(edge[0])),replace=False)
target=np.concatenate([np.column_stack([xs[ix],ys[ix]]),np.column_stack([edge[1][ex],edge[0][ex]])])
points=model[::4]
config={
 'chair':{'ground':-1.60,'xz':[[-.5,1.8],[1.4,3.4]],'height':[2.6,3.8]},
 'lamp':{'ground':.025,'xz':[[2.2,3.5],[-.1,1.15]],'height':[.65,1.35]},
 'note':{'ground':.058,'xz':[[1.25,1.78],[-.95,-.3]],'height':[.16,.45]},
}[name]
def project(p,samples=points):
 x,z,yaw,scale=p;co,si=np.cos(yaw),np.sin(yaw)
 matrix=np.array([[co,0,si],[0,1,0],[-si,0,co]])
 world=(samples*scale)@matrix.T+[x,config['ground'],z]
 v=(world-camera)@rotation
 return np.column_stack([660+f*v[:,0]/-v[:,2],869.5-f*v[:,1]/-v[:,2]])/shrink
bounds=[*config['xz'],[-np.pi,np.pi],[h/size[1] for h in config['height']]]
target_bounds=np.array([xs.min(),ys.min(),xs.max(),ys.max()])
def objective(p):
 uv=project(p)
 distance=map_coordinates(outside,[uv[:,1],uv[:,0]],order=1,mode='constant',cval=200)
 nearest=cKDTree(uv).query(target)[0]
 bbox=np.r_[uv.min(axis=0),uv.max(axis=0)]
 return np.mean(distance**2)*.75+np.mean(nearest**2)+np.mean((bbox-target_bounds)**2)*.12
solution=differential_evolution(objective,bounds,seed=42,maxiter=65,popsize=10,tol=.003,polish=False)
refined=minimize(objective,solution.x,method='Powell',bounds=bounds,options={'maxiter':160,'xtol':1e-5,'ftol':1e-5})
p=refined.x if refined.fun<solution.fun else solution.x
fit={'name':name,'file':f'{name}-hi3d.glb','position':[float(p[0]),config['ground'],float(p[1])],
     'yaw':float(p[2]),'scale':float(p[3]),'sourceOrigin':data['origin'].tolist(),
     'loss':float(objective(p)),'method':'SAM silhouette fit, uniform scale + yaw, fixed support height',
     'sourceSize':size.tolist(),'limits':'Single-view alignment only; unknown back surfaces are generated.'}
(root/f'evidence/{name}-hi3d-fit.json').write_text(json.dumps(fit,indent=2))
# Diagnostic full-frame projection: blue source mask, orange sampled 3D surface.
im=Image.open(root/'dist/assets/desk-original.jpg').convert('RGB').resize((660,870))
overlay=Image.new('RGBA',im.size);draw=ImageDraw.Draw(overlay)
uv=project(p,model)*shrink/2
for u,v in uv[::2]:
 if 0<=u<660 and 0<=v<870:draw.point((round(u),round(v)),fill=(255,145,35,170))
Image.alpha_composite(im.convert('RGBA'),overlay).convert('RGB').save(root/f'evidence/{name}-hi3d-fit-overlay.png')
print(json.dumps(fit,indent=2))
