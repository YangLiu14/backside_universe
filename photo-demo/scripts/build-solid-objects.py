#!/usr/bin/env python3
"""Calibrate closed laptop/cup surfaces in the existing Gaussian camera frame.

Writes a new background PLY, never modifies the reference experiment. Dimensions
are inferred from the photograph, not measured. Texture projection happens in
the viewer with a fixed source-camera visibility test.
"""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
import importlib.util
spec=importlib.util.spec_from_file_location('completion',Path(__file__).with_name('complete-desk-occlusion.py'))
completion=importlib.util.module_from_spec(spec);spec.loader.exec_module(completion)
load_ply,write_ply=completion.load_ply,completion.write_ply

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/solid-object-lab/assets'

def norm(x): return x/np.linalg.norm(x)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    source=ROOT/'dist/occlusion-lab/assets'
    meta=json.loads((source/'scene.json').read_text())
    K=meta['intrinsics'];fx,fy,cx,cy=K
    W,H=meta['width'],meta['height']
    def ray(p):
        p=np.asarray(p);return np.stack([(p[...,0]-cx)/fx,(p[...,1]-cy)/fy,np.ones(p.shape[:-1])],-1)
    def project(p): return np.stack([p[...,0]/p[...,2]*fx+cx,p[...,1]/p[...,2]*fy+cy],-1)
    def on_plane(px,p):
        r=ray(px);return r/(r@p)[...,None]
    planes={n:np.array(meta['surface_fit'][n]['plane']) for n in ['table','screen','base']}
    up=-norm(planes['table']);initial_up=up.copy();right=norm(np.array([1.,0,0])-up*up[0]);initial_right=right.copy();forward=np.cross(right,up)
    fit=json.loads((ROOT/'dist/assets/laptop-fit.json').read_text())
    base=on_plane(fit['basePixels'],planes['base'])
    # Preserve exact image anchors while forcing the lid and base to share hinge.
    hinge=norm(base[1]-base[0]);screen_normal=norm(planes['screen']-hinge*np.dot(planes['screen'],hinge))
    screen_plane=screen_normal/np.dot(screen_normal,base[0])
    screen=on_plane(fit['screenPixels'],screen_plane);screen[2]=base[1];screen[3]=base[0]
    parts=[]
    def add(name,vertices,triangles,color,object_id):
        parts.append({'name':name,'positions':np.asarray(vertices).round(8).reshape(-1).tolist(),'indices':np.asarray(triangles).reshape(-1).tolist(),'color':color,'object':object_id})
    def slab(name,quad,thickness,color):
        # Input polygon winding faces the original camera. Extrude away from it.
        normal=norm(np.cross(quad[1]-quad[0],quad[2]-quad[0]))
        if normal@quad.mean(0)>0:normal=-normal
        v=np.concatenate([quad,quad-normal*thickness])
        ids=[[0,1,2],[0,2,3],[4,6,5],[4,7,6]]
        for i in range(4):j=(i+1)%4;ids.extend([[i,i+4,j+4],[i,j+4,j]])
        add(name,v,ids,color,'laptop')
    slab('laptop-lid',screen,.009,[.24,.25,.25])
    slab('laptop-base',base,.019,[.60,.61,.60])

    # Cup and saucer: fit visible rim measurements in the exact source camera.
    a=np.linspace(0,2*np.pi,128,endpoint=False)
    def ring(center,r): return center+r*(np.cos(a)[:,None]*right+np.sin(a)[:,None]*forward)
    def measure(points):
        p=project(points);return np.r_[p.mean(0),np.ptp(p,axis=0)]
    def unpack(p):
        nonlocal up,right,forward
        up=Rotation.from_rotvec(initial_right*p[5]).apply(initial_up)
        right=norm(np.array([1.,0,0])-up*up[0]);forward=np.cross(right,up)
        uv=p[:2];center=on_plane(uv,planes['table']);return center,p[2],p[3],p[4]
    def residual(p):
        c,h,r,s=unpack(p)
        return np.r_[measure(ring(c+up*(h+.006),r))-np.array([798,721,43,14]),
                     measure(ring(c+up*.005,s))-np.array([797,752,87,31]),
                     (measure(ring(c+up*.01,r*.83))[:2]-np.array([798,751]))*.7]
    solution=least_squares(residual,[798,754,.059,.045,.087,0],bounds=([788,745,.025,.02,.05,-.25],[808,767,.13,.08,.13,.25]))
    center,height,radius,saucer=unpack(solution.x)
    # Lathed profiles form cup wall + rounded rim + inside + closed bottom.
    def lathe(name,profile,color):
        vertices=[]
        for r,h in profile:vertices.extend(ring(center+up*h,max(r,1e-6)))
        triangles=[];N=len(a)
        for row in range(len(profile)-1):
            for k in range(N):
                j=(k+1)%N;b=row*N;triangles.extend([[b+k,b+j,b+N+j],[b+k,b+N+j,b+N+k]])
        add(name,vertices,triangles,color,'cup')
    lip=height+.006
    lathe('saucer',[(0,.001),(saucer*.28,.001),(saucer*.95,.004),(saucer,.007),(saucer*.99,.010),(saucer*.88,.010),(saucer*.60,.006),(0,.006)], [.035,.16,.40])
    lathe('cup-wall',[(0,.006),(radius*.76,.006),(radius*.85,.011),(radius*.90,lip*.45),(radius,lip-.002),(radius*.99,lip),(radius*.94,lip+.001),(radius*.89,lip-.002),(radius*.83,.012),(0,.012)], [.025,.12,.32])
    lathe('coffee',[(0,lip-.010),(radius*.88,lip-.010)], [.17,.12,.07])
    # Complete oval handle. Its far half naturally disappears behind the cup wall.
    direction=norm(right*.96+forward*.28);perp=norm(np.cross(direction,up))
    ha=np.linspace(0,2*np.pi,96,endpoint=False);tube=np.linspace(0,2*np.pi,16,endpoint=False)
    hcenter=center+direction*(radius*.98)+up*(lip*.60)
    hr=radius*.37;hv=lip*.32;tr=radius*.15
    vertices=[]
    for t in ha:
        q=hcenter+direction*(hr*np.cos(t))+up*(hv*np.sin(t))
        outer=norm(direction*np.cos(t)+up*np.sin(t))
        for b in tube:vertices.append(q+tr*(np.cos(b)*outer+np.sin(b)*perp))
    triangles=[]
    for i in range(len(ha)):
        for j in range(len(tube)):
            v=i*len(tube)+j;u=i*len(tube)+(j+1)%len(tube);w=((i+1)%len(ha))*len(tube)+j;z=((i+1)%len(ha))*len(tube)+(j+1)%len(tube)
            triangles.extend([[v,u,z],[v,z,w]])
    add('cup-handle',vertices,triangles,[.025,.10,.27],'cup')

    # Remove both object layers and old splats whose projected support crosses
    # their source silhouettes, only in the foreground depth interval.
    data=load_ply(source/'desk-gaussian.ply')
    xyz=np.column_stack([data[n] for n in ['x','y','z']]);uv=project(xyz)
    ix=np.clip(np.rint(uv[:,0]).astype(int),0,W-1);iy=np.clip(np.rint(uv[:,1]).astype(int),0,H-1)
    yy,xx=np.mgrid[:H,:W];allrays=ray(np.stack([xx,yy],-1));table_z=1/(allrays@planes['table'])
    scales=np.column_stack([np.exp(data[f'scale_{i}']) for i in range(3)])
    q=np.column_stack([data['rot_'+str(i)] for i in [1,2,3,0]])
    # Project covariance to image space, including each Gaussian's orientation.
    R=Rotation.from_quat(q).as_matrix();cov=(R*scales[:,None,:])@np.swapaxes(R*scales[:,None,:],1,2)
    J=np.zeros((len(data),2,3));J[:,0,0]=fx/xyz[:,2];J[:,1,1]=fy/xyz[:,2];J[:,0,2]=-fx*xyz[:,0]/xyz[:,2]**2;J[:,1,2]=-fy*xyz[:,1]/xyz[:,2]**2
    c2=J@cov@np.swapaxes(J,1,2);extent=3*np.sqrt(np.maximum(np.linalg.eigvalsh(c2)[:,-1],0))
    remove=np.zeros(len(data),bool);stats={};candidates={}
    for name in ['laptop','cup']:
        mask=np.asarray(Image.open(ROOT/f'dist/assets/objects/{name}-mask.png').convert('L'))>127
        distance=ndimage.distance_transform_edt(~mask)
        overlap=distance[iy,ix]<np.minimum(extent+2,24)
        if name=='laptop':
            depth=1/(allrays@screen_plane);deck=1/(allrays@planes['base']);hinge_y=771+(xx-521.5)*(742-771)/(658-521.5);depth=np.where(yy<hinge_y,depth,deck)
            foreground=xyz[:,2]<np.minimum(depth[iy,ix]+.035,table_z[iy,ix]-.008)
        else:
            # Do not remove the completed desk below the saucer.
            foreground=xyz[:,2]<table_z[iy,ix]-.013
        selected=overlap&foreground;remove|=selected;candidates[name]=selected
    # Match hidden tabletop colors to their actual observed neighbourhood.
    # This edits Gaussian SH colors; no new photograph or raster is synthesized.
    photo=np.asarray(Image.open(ROOT/'dist/assets/desk-original.jpg').convert('RGB')).astype(float)/255
    visible_table=np.asarray(Image.open(ROOT/'dist/assets/objects/tabletop-mask.png').convert('L'))>127
    tabletop=ndimage.binary_erosion(completion.polygon((H,W),[[136,774],[868,674],[1003,764],[203,954]]),iterations=12)
    object_count=sum(int(np.asarray(Image.open(ROOT/f'dist/assets/objects/{n}-mask.png').convert('L')).astype(bool).sum()) for n in ['laptop','note','cup','phone'])+meta['surface_fit']['book']['pixels']
    table_end=len(data)-object_count;table_start=table_end-int(tabletop.sum())
    is_table=(np.arange(len(data))>=table_start)&(np.arange(len(data))<table_end)
    # Ownership wins over the depth heuristic: the completed table has already
    # been separated from foreground objects. Pruning its slightly warped edge
    # by the foreground threshold creates a one-pixel crescent-shaped hole.
    remove[is_table]=False
    stats={name:int((candidate&remove).sum()) for name,candidate in candidates.items()}
    color_repairs={}
    for name in ['laptop','cup']:
        mask=np.asarray(Image.open(ROOT/f'dist/assets/objects/{name}-mask.png').convert('L'))>127
        region=ndimage.binary_dilation(mask,iterations=18)
        boundary=ndimage.binary_dilation(mask,iterations=35)&~ndimage.binary_dilation(mask,iterations=8)&visible_table
        sy,sx=np.where(boundary);ox,oy=np.mean(sx),np.mean(sy)
        A=np.column_stack([np.ones(len(sx)),(sx-ox)/100,(sy-oy)/100])
        rgb=photo[sy,sx];keep=np.ones(len(sx),bool)
        for _ in range(4):
            coeff=np.linalg.lstsq(A[keep],rgb[keep],rcond=None)[0]
            err=np.linalg.norm(A@coeff-rgb,axis=1);keep=err<np.quantile(err,.78)
        target=region[iy,ix]&is_table&~remove
        B=np.column_stack([np.ones(target.sum()),(uv[target,0]-ox)/100,(uv[target,1]-oy)/100])
        colors=np.clip(B@coeff,0,1)
        if name=='cup':
            support=-up/np.dot(-up,center)
            points=allrays[iy[target],ix[target]]/(allrays[iy[target],ix[target]]@support)[:,None]
            offset=points-center;radial=np.sqrt((offset@right)**2+(offset@forward)**2)
            shadow=.17*np.exp(-(np.maximum(radial-saucer*.87,0)/(saucer*.17))**2)
            colors*=1-shadow[:,None]
        feather=np.clip((18-ndimage.distance_transform_edt(~mask)[iy[target],ix[target]])/12,0,1)[:,None]
        current=np.column_stack([data['f_dc_'+str(j)][target]*np.sqrt(1/(4*np.pi))+.5 for j in range(3)])
        colors=current*(1-feather)+colors*feather
        for j in range(3):data['f_dc_'+str(j)][target]=(colors[:,j]-.5)/np.sqrt(1/(4*np.pi))
        color_repairs[name]=int(target.sum())
        if name=='cup':
            # One shared local support plane prevents the tilted saucer from
            # intersecting the former depth sheet and leaving a pale second rim.
            cup_plane=-up/np.dot(-up,center)
            corrected=1/(allrays@cup_plane)
            depth_grid=table_z.copy();depth_grid[iy[is_table],ix[is_table]]=data['z'][is_table]
            support_weight=feather[:,0]*np.clip((iy[target]-730)/9,0,1)
            depth_grid[iy[target],ix[target]]=data['z'][target]*(1-support_weight)+corrected[iy[target],ix[target]]*support_weight
            color_grid=np.zeros((H,W,3),np.uint8);color_grid[iy[target],ix[target]]=np.rint(colors*255).astype(np.uint8)
            region_mask=np.zeros((H,W),bool);region_mask[iy[target],ix[target]]=True
            replacements=completion.make_splats(region_mask,depth_grid,color_grid,K)
            # make_splats is in row-major source-pixel order, matching the table layer.
            assert len(replacements)==int(target.sum())
            data[target]=replacements
    write_ply(OUT/'desk-gaussian.ply',data[~remove])
    object_data={'coordinateSystem':'OpenCV x-right y-down z-forward','parts':parts,'cupFit':{'parameters':solution.x.tolist(),'residualPixels':residual(solution.x).tolist(),'up':up.tolist()},'laptopFit':{'base':base.tolist(),'screen':screen.tolist(),'hingeGap':float(np.linalg.norm(screen[2]-base[1])+np.linalg.norm(screen[3]-base[0]))},'removed':stats,'removedTotal':int(remove.sum()),'backgroundColorRepairs':color_repairs}
    (OUT/'objects.json').write_text(json.dumps(object_data,separators=(',',':')))
    outmeta={**meta,'generator':'Fixed opaque photo-projected laptop/cup surfaces + cleaned occlusion-completed Gaussian background','gaussian_count':int((~remove).sum()),'gaussian_bytes':(OUT/'desk-gaussian.ply').stat().st_size,'ply_sha256':hashlib.sha256((OUT/'desk-gaussian.ply').read_bytes()).hexdigest(),'parent_ply_sha256':meta['ply_sha256'],'solid_objects':True,'object_geometry':'objects.json','removed_object_gaussians':int(remove.sum())}
    (OUT/'scene.json').write_text(json.dumps(outmeta,ensure_ascii=False,indent=2))
    print(json.dumps({'cupFit':object_data['cupFit'],'removed':stats,'total':len(data)-int(remove.sum()),'parts':len(parts),'hingeGap':object_data['laptopFit']['hingeGap']},indent=2))

if __name__=='__main__':main()
