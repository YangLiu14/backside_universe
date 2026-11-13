"""Fit a physical cassette face to the approved full-frame opening. Lens = Gaussian lens."""
import json, sys
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import least_squares
from desk import tabletop

def register(folder):
    state=json.loads((folder/'run.json').read_text())
    room=json.loads((folder/'room/registration.json').read_text())
    width,height=state['source']['size']
    fx,fy,cx,cy=room['intrinsics']
    K=np.array([[fx*width/room['width'],0,cx*width/room['width']],[0,fy*height/room['height'],cy*height/room['height']],[0,0,1.]])
    # Intersections of straight front edges, not bounding-box extrema or back corners.
    points=np.float64([[-50,31.5,0],[50,31.5,0],[50,-31.5,0],[-50,-31.5,0],[-21.25,1.2,0],[21.25,1.2,0]])
    pixels=np.float64([[741,469],[1127,366],[1141,619],[722,699],[840,549],[1013,507]])
    _,r,t=cv2.solvePnP(points,pixels,K,None)
    def error(p):
        xyz=points.copy();xyz[:,1]*=p[6];return ((cv2.projectPoints(xyz,p[:3],p[3:6],K,None)[0][:,0]-pixels)*np.array([[1],[1],[1],[1],[2],[2]])).flatten()
    p=least_squares(error,[*r[:,0],*t[:,0],1],bounds=([-np.inf]*6+[.88],[np.inf]*6+[1.12])).x
    rot=cv2.Rodrigues(p[:3])[0]; axes=np.diag([1.,-1.,-1.])
    scale=room['pivot_opencv'][2]/p[5]
    def ray(u,v):return np.linalg.solve(K,[u,v,1])
    def at_depth(uv,depth):return rot.T@(ray(*uv)*depth-p[3:6])
    drive=at_depth([1013,507],(rot@points[-1]+p[3:6])[2])
    # Backproject the photographed tip onto the tabletop, supported by the lowest shell corner.
    normal=tabletop(folder)
    corners=np.float64([[x,-31.5*p[6],z] for x in [-50,50] for z in [-5.2,5.2]])
    cornerWorld=((corners@rot.T+p[3:6])@axes.T)*scale
    constant=-float((cornerWorld@normal).min())
    tipRay=axes@ray(1324,696)
    tipDepth=-constant/(tipRay@normal)/scale
    tip=at_depth([1324,696],tipDepth)
    direction=tip-drive
    ratio=least_squares(lambda q:cv2.projectPoints(np.array([drive+q[0]*direction]),p[:3],p[3:6],K,None)[0][0,0]-[713,340],[-1]).x[0]
    front=drive+ratio*direction
    proj=cv2.projectPoints(np.array([drive,front,tip]),p[:3],p[3:6],K,None)[0][:,0]
    ret=dict(matrix=(axes@rot).tolist(),position=(axes@p[3:6]*scale).tolist(),unit=scale,height=63*p[6],
        drive=drive.tolist(),empty=at_depth([840,549],(rot@points[-2]+p[3:6])[2]).tolist(),cap=front.tolist(),tip=tip.tolist(),
        deskNormal=normal.tolist(),deskConstant=constant,projectedAnchors=proj.tolist(),fitRmsPx=float(np.sqrt(np.mean((error(p).reshape(-1,2)/np.array([[1],[1],[1],[1],[2],[2]]))**2))),
        note='Edited single frame. Cassette face fit; pencil depth inferred, not measured.')
    return ret
if __name__=='__main__':Path(sys.argv[2]).write_text(json.dumps(register(Path(sys.argv[1])),indent=2))
