"""Fit furniture landmarks to the same calibrated camera; distances are scene units."""
import json,numpy as np
from pathlib import Path
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
root=Path(__file__).resolve().parents[1];c=json.loads((root/'dist/assets/calibration.json').read_text());R=Rotation.from_quat(c['quaternion']).as_matrix();C=np.array(c['position']);f=1739/(2*np.tan(np.deg2rad(c['fov']/2)))
def project(q):
 v=(q-C)@R;return np.stack([660+f*v[:,0]/-v[:,2],869.5-f*v[:,1]/-v[:,2]],1)
def transform(points,x,z,yaw,seat=-.65):
 r=Rotation.from_euler('y',yaw).as_matrix();return np.array(points)@r.T+np.array([x,seat,z])
# Front edge is the edge nearest the desk, not the edge nearest the image bottom.
chair_pixels=np.array([[778,1014],[659,1167],[1022,1111],[933,1274],[956,943],[790,1103],[1165,824],[1202,778]])
def chair_geometry(p):
 x,z,yaw,w,d,bh,hgap,lean,ay,az=p
 points=[[-w/2,0,d/2],[w/2,0,d/2],[-w/2,0,-d/2],[w/2,0,-d/2],[-w*.56,ay,az],[w*.56,ay,az],[0,bh,-d/2-lean],[0,bh+hgap,-d/2-lean-.035]]
 return transform(points,x,z,yaw)
fit=least_squares(lambda p:np.r_[(project(chair_geometry(p))-chair_pixels).ravel(),(p[7]-.35)*12,(p[9]-.05)*6],[.5,2.45,-2.5,1.35,1.37,1.8,.25,.45,.4,.05],bounds=([-1,1.2,-3.2,.9,.9,.65,.15,-.1,.2,-.3],[2,3.8,-1.7,1.8,1.9,2.2,.32,.75,.8,.4]));p=fit.x
# Known old defaults projected against the same landmarks demonstrate the error.
old=[1.156,2.423,-.18,.95,.88,1.01,.25,.04,.25,.13]
chair={'parameters':p.tolist(),'seatY':-.65,'pixels':chair_pixels.tolist(),'projected':project(chair_geometry(p)).tolist(),'rms':float(np.sqrt(np.mean((project(chair_geometry(p))-chair_pixels)**2))),'previous_rms':float(np.sqrt(np.mean((project(chair_geometry(old))-chair_pixels)**2)))}
side_pixels=np.array([[935,792],[1180,845],[882,1055],[1105,1125]])
def side_geo(p):
 x,z,yaw,w,h=p
 return transform([[-w/2,0,0],[w/2,0,0],[-w/2,-h,0],[w/2,-h,0]],x,z,yaw,0)
sfit=least_squares(lambda p:np.r_[(project(side_geo(p))-side_pixels).ravel(),(p[4]-1.6)*40],[2.2,1.18,-.8,1.35,1.6],bounds=([1,0,-1.4,.8,1.3],[4,3,-.2,2.2,1.9]));q=sfit.x
side={'frontCenter':[float(q[0]),0,float(q[1])],'yaw':float(q[2]),'width':float(q[3]),'height':float(q[4]),'depth':1.3,'pixels':side_pixels.tolist(),'projected':project(side_geo(q)).tolist(),'rms':float(np.sqrt(np.mean((project(side_geo(q))-side_pixels)**2)))}
result={'chair':chair,'sideboard':side,'note':'Manually observed visible landmarks; hidden surfaces are authored approximations. Seat/front labels follow chair anatomy, not image top/bottom.'};(root/'dist/assets/furniture-fit.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
