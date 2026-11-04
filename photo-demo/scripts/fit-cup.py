import json,numpy as np
from pathlib import Path
from scipy.spatial.transform import Rotation
root=Path(__file__).resolve().parents[1]
c=json.loads((root/'dist/assets/calibration.json').read_text());R=Rotation.from_quat(c['quaternion']).as_matrix();C=np.array(c['position']);f=c['height']/(2*np.tan(np.deg2rad(c['fov']/2)))
from scipy.optimize import least_squares
def project(q):
 v=(q-C)@R;return np.stack([660+f*v[:,0]/-v[:,2],869.5-f*v[:,1]/-v[:,2]],1)
a=np.linspace(0,2*np.pi,100)
def curve(x,z,y,r):return project(np.stack([x+r*np.cos(a),a*0+y,z+r*np.sin(a)],1))
def measure(v):return np.r_[v.mean(0),np.ptp(v,axis=0)]
def residual(p):
 x,z,h,r=p
 return np.r_[measure(curve(x,z,h+.025,r))-np.array([798,721,42,14]),(measure(curve(x,z,.05,r*.8))[:2]-np.array([798,747]))*2]
fit=least_squares(residual,[1.28,.06,.2,.139]);print(fit.x, residual(fit.x));(root/'dist/assets/cup-fit.json').write_text(json.dumps({'position':[float(fit.x[0]),.025,float(fit.x[1])],'height':float(fit.x[2]),'radius':float(fit.x[3])}))
