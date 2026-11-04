import json, math
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

W,H=1320,1739
points=np.array([[-2.1,0,-.85],[2.1,0,-.85],[2.1,0,.85],[-2.1,0,.85]])
pixels=np.array([[137,776],[866,675],[998,788],[198,944]])
def project(p):
    R=Rotation.from_rotvec(p[:3]).as_matrix()
    v=(points-p[3:6])@R.T
    f=H/(2*np.tan(p[6]/2))
    return np.stack([W/2+f*v[:,0]/(-v[:,2]),H/2-f*v[:,1]/(-v[:,2])],axis=1)
C=np.array([-2.8,3.7,7.5]);target=np.array([0,-.35,0]);z=C-target;z/=np.linalg.norm(z)
x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x)
R=np.stack([x,y,z]);p=np.r_[Rotation.from_matrix(R).as_rotvec(),C,.75]
fit=least_squares(lambda p:np.r_[(project(p)-pixels).ravel(), (p[6]-.73)*2],p,max_nfev=3000)
p=fit.x; R=Rotation.from_rotvec(p[:3]).as_matrix()
quaternion=Rotation.from_matrix(R.T).as_quat().tolist()
result={'width':W,'height':H,'position':p[3:6].tolist(),'quaternion':quaternion,'fov':p[6]*180/math.pi,'corners':project(p).tolist(),'rms':float(np.sqrt(np.mean((project(p)-pixels)**2)))}
print(json.dumps(result,indent=2))
with open('dist/assets/calibration.json','w') as f:json.dump(result,f)
