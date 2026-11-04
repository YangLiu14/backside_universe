"""Register a real Marble render to the source photograph using shared features.

Only fits rigid camera pose and focal length. It never warps scene assets
or substitutes source pixels. Run with experiments/gaussian/.venv/bin/python.
Input: evidence/marble-lab/<capture>/{render.png,reference.png,camera.json}.
Output is a proposal; inspect the new render before accepting into scene.json.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

APP = Path(__file__).resolve().parents[1]


def fit_depth(folder):
    """Refine rigid pose using raycast positions at shared image features."""
    state = json.loads((folder/'camera.json').read_text())
    matches = json.loads((folder/'ray-matches.json').read_text())
    valid = [i for i,s in enumerate(matches['samples']) if s and .3 < s['distance'] < 15]
    if len(valid) < 20:
        raise ValueError('Not enough valid 3D correspondences.')
    xyz = np.array([matches['samples'][i]['point'] for i in valid])
    sp = np.array(matches['source_points'])[valid]
    rp = np.array(matches['render_points'])[valid]
    wr,hr = matches['render_size']; ws,hs = matches['reference_size']
    projection = np.asarray(state['projection']).reshape(4,4,order='F')
    fx0,fy0 = projection[0,0]*wr/2,projection[1,1]*hr/2
    camera = np.asarray(state['camera']).reshape(4,4,order='F')
    flip = np.diag([1,-1,-1]); r0 = camera[:3,:3] @ flip
    c0 = camera[:3,3]
    def project(p):
        rotation = r0 @ Rotation.from_rotvec(p[:3]).as_matrix()
        local = (xyz-(c0+p[3:6])) @ rotation
        return local[:,:2]/np.maximum(local[:,2:],1e-5)*[fx0*(hs/hr)*np.exp(p[6]),fy0*(hs/hr)*np.exp(p[6])]+[ws/2,hs/2]
    reprojection = np.linalg.norm(project(np.zeros(7))-rp,axis=1)
    if np.max(reprojection) > .1:
        raise ValueError(f'Raycast/camera mismatch: {np.max(reprojection)} px')
    solution = least_squares(lambda p:(project(p)-sp).ravel(),np.zeros(7),loss='soft_l1',
                             f_scale=3,max_nfev=300,
                             bounds=([-.3]*3+[-.5]*3+[-.4],[.3]*3+[.5]*3+[.4]))
    errors=np.linalg.norm(project(solution.x)-sp,axis=1)
    rotation=r0 @ Rotation.from_rotvec(solution.x[:3]).as_matrix() @ flip
    yaw,pitch,roll=Rotation.from_matrix(rotation).as_euler('YXZ',degrees=True)
    center=c0+solution.x[3:6]; fy=fy0*(hs/hr)*np.exp(solution.x[6])
    # Median camera-space depth of matches on the desktop determines a physical
    # orbit target. This is inferred geometry, not a measured room dimension.
    local=(xyz-center) @ (rotation @ flip)
    uv=sp/[ws,hs]
    on_desk=(uv[:,0]>.25)&(uv[:,0]<.7)&(uv[:,1]>.37)&(uv[:,1]<.53)&(errors<10)
    distance=float(np.median(local[on_desk,2])) if on_desk.sum()>=5 else state['calibration']['distance']
    parameters={**state['calibration'],'x':float(center[0]),'y':float(center[1]),'z':float(center[2]),
                'yaw':float(yaw),'pitch':float(pitch),'roll':float(roll),
                'fov':float(np.rad2deg(2*np.arctan(hs/(2*fy)))),'distance':distance}
    report={'parameters':parameters,'method':'Shared SIFT features + Gaussian raycast; rigid 6DOF pose and FOV',
            'inliers':len(valid),'median_residual_px':float(np.median(errors)),
            'p90_residual_px':float(np.percentile(errors,90)),
            'initial_median_residual_px':float(np.median(np.linalg.norm(project(np.zeros(7))-sp,axis=1))),
            'render_size':[wr,hr],'reference_size':[ws,hs],'orbit_depth_samples':int(on_desk.sum()),
            'verified':False,'note':'Proposal only. Residuals measure shared features, not overall fidelity or unseen-view accuracy.'}
    (folder/'camera-proposal.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


def fit(folder):
    source = cv2.imread(str(folder/'reference.png'))
    render = cv2.imread(str(folder/'render.png'))
    if source is None or render is None:
        raise ValueError('Missing real source/render captures.')
    state = json.loads((folder/'camera.json').read_text())
    if not state.get('ready') or state.get('angle') != 0:
        raise ValueError('Capture must be a loaded scene at zero degrees.')
    sift = cv2.SIFT_create(nfeatures=10000)
    kr, dr = sift.detectAndCompute(cv2.cvtColor(render, cv2.COLOR_BGR2GRAY), None)
    ks, ds = sift.detectAndCompute(cv2.cvtColor(source, cv2.COLOR_BGR2GRAY), None)
    if dr is None or ds is None:
        raise ValueError('Not enough image features.')
    matches = cv2.BFMatcher().knnMatch(dr, ds, k=2)
    good = [m for m,n in matches if m.distance < .72*n.distance]
    rp = np.float64([kr[m.queryIdx].pt for m in good])
    sp = np.float64([ks[m.trainIdx].pt for m in good])
    if len(good) < 20:
        raise ValueError(f'Only {len(good)} candidate matches; adjust initial camera before fitting.')
    _, mask = cv2.findHomography(rp, sp, cv2.USAC_MAGSAC, 4.0, maxIters=10000, confidence=.999)
    if mask is None or int(mask.sum()) < 15:
        raise ValueError('No reliable global registration; inspect generated scene.')
    valid = mask.ravel().astype(bool)
    rp, sp = rp[valid], sp[valid]
    hr,wr = render.shape[:2]; hs,ws = source.shape[:2]
    projection = np.asarray(state['projection']).reshape(4,4,order='F')
    fx0,fy0 = projection[0,0]*wr/2,projection[1,1]*hr/2
    cx0,cy0 = wr/2,hr/2
    rays = np.column_stack([(rp[:,0]-cx0)/fx0, (rp[:,1]-cy0)/fy0, np.ones(len(rp))])
    ratio0 = fx0/fy0
    def project(params):
        local = Rotation.from_rotvec(params[:3]).inv().apply(rays)
        fy = fy0 * (hs/hr) * np.exp(params[3]); fx=fy*ratio0
        return local[:,:2]/np.maximum(local[:,2:],1e-5)*[fx,fy]+[ws/2,hs/2]
    solution = least_squares(lambda p:(project(p)-sp).ravel(), np.zeros(4),
                             loss='soft_l1',f_scale=2,max_nfev=300,
                             bounds=([-1.2,-1.2,-1.2,-1.2],[1.2,1.2,1.2,1.2]))
    errors=np.linalg.norm(project(solution.x)-sp,axis=1)
    cam=np.asarray(state['camera']).reshape(4,4,order='F')
    cv_flip=np.diag([1,-1,-1])
    rotation=cam[:3,:3] @ cv_flip @ Rotation.from_rotvec(solution.x[:3]).as_matrix() @ cv_flip
    yaw,pitch,roll=Rotation.from_matrix(rotation).as_euler('YXZ',degrees=True)
    fy=fy0 * (hs/hr) * np.exp(solution.x[3])
    parameters={**state['calibration'],'yaw':float(yaw),'pitch':float(pitch),'roll':float(roll),
                'fov':float(np.rad2deg(2*np.arctan(hs/(2*fy))))}
    report={'parameters':parameters,'method':'SIFT/MAGSAC feature registration; rigid orientation + FOV only',
            'candidate_matches':len(good),'inliers':len(rp),
            'median_residual_px':float(np.median(errors)),'p90_residual_px':float(np.percentile(errors,90)),
            'render_size':[wr,hr],'reference_size':[ws,hs],
            'source_points':sp.tolist(),'render_points':rp.tolist(),
            'verified':False,'note':'Proposal only. Shared-feature residuals do not measure unseen-view accuracy.'}
    (folder/'camera-proposal.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ['source_points','render_points']},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture')
    parser.add_argument('--depth',action='store_true',help='Use ray-matches.json to fit camera translation as well')
    args=parser.parse_args()
    (fit_depth if args.depth else fit)(APP/'evidence/marble-lab'/args.capture)
