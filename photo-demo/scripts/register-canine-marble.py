"""Fit the actual SPZ's source view to the dog photograph. Run in the gaussian venv."""
from pathlib import Path
import argparse, struct, gzip, json
import cv2
import numpy as np
from scipy.spatial.transform import Rotation as Rot
from scipy.optimize import least_squares
from scipy.ndimage import distance_transform_edt
APP=Path(__file__).resolve().parents[1];A=APP/'dist/canine-museum/assets';D=A/'marble';E=APP/'evidence/canine-production/marble'
def unpack(path):
    data=gzip.decompress(path.read_bytes());magic,ver,n,degree,bits,flags,_=struct.unpack_from('<IIIBBBB',data)
    if (magic,ver)!=(0x5053474e,2):raise ValueError('Unsupported SPZ variant')
    p=np.frombuffer(data,np.uint8,n*9,16).reshape(n,3,3).astype(np.int32)
    xyz=((p[:,:,0]+(p[:,:,1]<<8)+(p[:,:,2]<<16)+0x800000)%0x1000000-0x800000).astype(np.float32)/2**bits
    a=np.frombuffer(data,np.uint8,n,16+n*9)
    colors=np.frombuffer(data,np.uint8,3*n,16+n*10).reshape(n,3)[:,::-1]
    return xyz,a,np.clip((colors.astype(float)-127.5)*(.2820948/.15)+127.5,0,255).astype('B')
def run(pair=None):
    scene=json.loads((D/'scene.json').read_text()); variant=scene['variants']['full_res'];xyz,alpha,colors=unpack(D/variant['file'])
    reg=json.loads((A/'registration.json').read_text());W,H=reg['source'];w=840;h=round(w*H/W)
    original=cv2.resize(cv2.imread(str(A/'original.jpg')),(w,h),interpolation=cv2.INTER_AREA)
    s=cv2.SIFT_create(nfeatures=5500);ks,ds=s.detectAndCompute(cv2.cvtColor(original,cv2.COLOR_BGR2GRAY),None)
    rawcoords=np.array([k.pt for k in ks]);matcher=cv2.BFMatcher()
    def capture(R,C,F,stride):
        sel=np.arange(0,len(xyz),stride);sel=sel[alpha[sel]>32];local=(xyz[sel]-C)@R
        z=local[:,2];ok=z>.04;uv=local[:,:2]/np.maximum(.04,z[:,None])*F+[w/2,h/2];pix=np.rint(uv).astype(int)
        ok&=(pix[:,0]>=0)&(pix[:,1]>=0)&(pix[:,0]<w)&(pix[:,1]<h);keep=np.flatnonzero(ok)
        linear=pix[keep,1]*w+pix[keep,0];depth=np.full(w*h,np.inf);np.minimum.at(depth,linear,z[keep])
        front=depth[linear]==z[keep];ids=np.full(w*h,-1,np.int32);ids[linear[front]]=sel[keep[front]];ids=ids.reshape(h,w)
        yi,xi=distance_transform_edt(ids<0,return_distances=False,return_indices=True);ids=ids[yi,xi]
        return cv2.GaussianBlur(colors[ids],(3,3),.7),ids
    C=np.zeros(3);fx0=reg['intrinsics'][0][0];fy0=reg['intrinsics'][1][1]
    pano=cv2.imread(str(D/'world-pano.jpg'));ph,pw=pano.shape[:2];yy,xx=np.indices((h,w));pix=np.dstack([xx-w/2,yy-h/2])
    def pano_view(R,F):
        rays=np.dstack([pix/F,np.ones((h,w))])@R.T
        U=pw*(.5+np.arctan2(rays[:,:,0],rays[:,:,2])/(2*np.pi));V=ph*(.5+np.arctan2(rays[:,:,1],np.hypot(rays[:,:,0],rays[:,:,2]))/np.pi)
        return cv2.remap(pano,U.astype('f'),V.astype('f'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP),rays
    best=None
    for pitch,fv in [(33,43),(30,55),(36,35),(27,72),(40,50)]:
        R=Rot.from_euler('x',-pitch,degrees=True).as_matrix();F=np.repeat(h/(2*np.tan(np.deg2rad(fv)/2)),2)
        img,rays=pano_view(R,F);kr,dr=s.detectAndCompute(cv2.cvtColor(img,cv2.COLOR_BGR2GRAY),None)
        good=[m for m,n in matcher.knnMatch(dr,ds,k=2) if m.distance<.76*n.distance]
        if len(good)<12:continue
        u=np.array([kr[m.queryIdx].pt for m in good]);v=rawcoords[[m.trainIdx for m in good]]
        _,mask=cv2.findHomography(u,v,cv2.USAC_MAGSAC,6);keep=mask.ravel().astype(bool);i=np.rint(u[keep]).astype(int);X=rays[i[:,1],i[:,0]]
        if best is None or len(X)>best[0]:best=(len(X),R,F,X,v[keep])
    if best is None or best[0]<15:raise ValueError('Insufficient panorama matches')
    n,R,F,X,uv=best
    def proj(d):
        local=X@(R@Rot.from_rotvec(d[:3]).as_matrix())
        return local[:,:2]/local[:,2:]*F*np.exp(d[3:])+[w/2,h/2]
    sol=least_squares(lambda d:(proj(d)-uv).ravel(),np.zeros(5),loss='soft_l1',f_scale=1.5)
    err=np.linalg.norm(proj(sol.x)-uv,axis=1);R=R@Rot.from_rotvec(sol.x[:3]).as_matrix();F*=np.exp(sol.x[3:])
    panorama,_=pano_view(R,F);cv2.imwrite(str(E/'source-vs-pano.jpg'),np.concatenate([original,panorama],axis=1))
    img,ids=capture(R,C,F,1)
    pano_n=len(X);pano_error=float(np.median(err));browser=None
    if pair:
        ref=cv2.imread(str(pair/'photo.jpg'));actual=cv2.imread(str(pair/'marble-0.jpg'))
        bh,bw=ref.shape[:2];ratio=min(bw/W,bh/H);cw,ch=round(W*ratio),round(H*ratio);x0=(bw-cw)//2;y0=(bh-ch)//2
        kr,dr=s.detectAndCompute(actual,None);ks2,ds2=s.detectAndCompute(ref,None)
        good=[m for m,n in matcher.knnMatch(dr,ds2,k=2) if m.distance<.76*n.distance]
        u=np.array([kr[m.queryIdx].pt for m in good]);v=np.array([ks2[m.trainIdx].pt for m in good])
        keep=(u[:,1]>50)&(u[:,1]<bh-20)&(u[:,0]>x0+5)&(u[:,0]<x0+cw-5);u,v=u[keep],v[keep]
        _,m=cv2.findHomography(u,v,cv2.USAC_MAGSAC,5);u,v=u[m[:,0]>0],v[m[:,0]>0]
        u=(u-[x0,y0])*[w/cw,h/ch];v=(v-[x0,y0])*[w/cw,h/ch]
        if len(u)<12:raise ValueError('Insufficient points shared by the actual render')
        # Use this exact view ray with the local median SPZ depth, for stable
        # reprojection even when the raw point covers several raster pixels.
        X=[];uv=v
        for px,py in u:
            x,y=np.rint([px,py]).astype(int);samples=(xyz[ids[max(0,y-3):y+4,max(0,x-3):x+4]]-C)@R
            X.append(np.array([(px-w/2)/F[0],(py-h/2)/F[1],1.])*np.median(samples[:,:,2])@R.T+C)
        X=np.asarray(X);before=np.linalg.norm(u-v,axis=1)
        def browser_project(d):
            local=(X-(C+d[3:6]))@(R@Rot.from_rotvec(d[:3]).as_matrix())
            return local[:,:2]/local[:,2:]*(F*np.exp(d[6]))+[w/2,h/2]
        sol=least_squares(lambda d:np.r_[(browser_project(d)-uv).ravel(),d[3:6]*30,d[6]*12],np.zeros(7),
              loss='soft_l1',f_scale=2,bounds=([-.10]*3+[-.025]*3+[-.055],[.10]*3+[.025]*3+[.055]))
        d=sol.x;err=np.linalg.norm(browser_project(d)-uv,axis=1);R=R@Rot.from_rotvec(d[:3]).as_matrix();C=C+d[3:6];F*=np.exp(d[6])
        img,ids=capture(R,C,F,1);browser={'matches':len(X),'before_median_px':float(np.median(before)),'after_median_px':float(np.median(err))}
    # Dog anchors known in the authored cutaway establish scale, without
    # changing a single Gaussian. Use robust depth over patches, not one pixel.
    sourceQ=Rot.from_quat(reg['quaternion']).as_matrix();src=np.array(reg['origin']);ratios=[]
    for name,point in reg['anchors'].items():
        q=(np.array(point)-src)@sourceQ*np.array([1,-1,-1]);px,py=np.rint((q[:2]/q[2]*[fx0,fy0]+[W/2,H/2])*[w/W,h/H]).astype(int)
        if not 6<=px<w-6 or not 6<=py<h-6:continue
        patch=(xyz[ids[py-4:py+5,px-4:px+5]]-C)@R;ratios.append(q[2]/np.median(patch[:,:,2]))
    scale=float(np.median(ratios));ff=F*[W/w,H/h]
    record={'world_id':scene['world_id'],'source_sha256':scene['source_sha256'],'full_sha256':variant['sha256'],'method':'SIFT/MAGSAC original-to-Marble panorama; camera orientation and focal fit; full SPZ depth for dog scale',
        'panorama_matches':pano_n,'panorama_median_px':pano_error,'browser_refinement':browser,'raw_center':C.tolist(),'cv_to_raw_quaternion':Rot.from_matrix(R).as_quat().tolist(),'camera_scale':[scale*ff[0]/fx0,scale*ff[1]/fy0,scale],
        'focal_px':ff.tolist(),'depth_anchor_count':len(ratios),'fit_size':[w,h],'inliers':len(X),'median_px':float(np.median(err)),'p90_px':float(np.percentile(err,90))}
    cv2.imwrite(str(E/'source-vs-marble.jpg'),np.concatenate([original,img],axis=1))
    (D/'registration.json').write_text(json.dumps(record,indent=2)+'\n')
    scene['calibration']={'file':'registration.json','method':record['method'],'browser_refinement':browser}
    scene['limitations']=['Single-view generated room and animal; unseen surfaces and fur are inferred.']
    (D/'scene.json').write_text(json.dumps(scene,ensure_ascii=False,indent=2)+'\n')
    (D/'status.json').write_text(json.dumps({'status':'generated','message':'Marble 场景已配准。'},ensure_ascii=False,indent=2)+'\n');print(record)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--browser-pair',type=Path,help='photo.jpg and marble-0.jpg from the initial panorama-only pose');run(parser.parse_args().browser_pair)
