import json,numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from pathlib import Path
root=Path(__file__).resolve().parents[1]
c=json.loads((root/'dist/assets/calibration.json').read_text());R=Rotation.from_quat(c['quaternion']).as_matrix();C=np.array(c['position']);f=c['height']/(2*np.tan(np.deg2rad(c['fov']/2)))
base=np.array([[521.5,771],[658,742],[717,781],[575,812.5]])
screen=np.array([[506.5,661],[645.5,639],[658,742],[521.5,771]])
def geom(p):
 x,z,yaw,w,d,tilt=p
 u=np.array([np.cos(yaw),0,-np.sin(yaw)]);v=np.array([np.sin(yaw),0,np.cos(yaw)]);h=np.array([x,.055,z]);a=h-u*w/2;b=h+u*w/2
 rise=np.array([0,np.cos(tilt),0])-v*np.sin(tilt)
 s=np.array([a+rise*w/1.55,b+rise*w/1.55,b,a]);ba=np.array([a,b,b+v*d,a+v*d]);return ba,s

def proj(q):
 p=(q-C)@R
 return np.stack([660+f*p[:,0]/-p[:,2],869.5-f*p[:,1]/-p[:,2]],1)
def fun(p):
 b,s=geom(p);return np.r_[(proj(b)-base).ravel(),(proj(s)-screen).ravel(),(p[4]/p[3]-.69)*10]
fit=least_squares(fun,[.16,-.19,-.02,.8,.58,.15],bounds=([-1,-1,-.7,.5,.3,-.5],[1,1,.7,1.4,1,1.0]));b,s=geom(fit.x)
result={'fit':fit.x.tolist(),'screenAspect':1.55,'basePixels':base.tolist(),'screenPixels':screen.tolist(),'base':b.tolist(),'screen':s.tolist(),'rms':float(np.sqrt(np.mean(fun(fit.x)[:16]**2))),'projectedBase':proj(b).tolist(),'projectedScreen':proj(s).tolist()};print(json.dumps(result,indent=2));(root/'dist/assets/laptop-fit.json').write_text(json.dumps(result,indent=2))
