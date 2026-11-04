#!/usr/bin/env python3
"""Build explicit hidden desk/blind layers and segmented surface Gaussians.

The generated clean plate supplies ONLY unobserved background texels. Visible
texels use the source photo. All layers live in fixed 3D coordinates and use the
unchanged camera; no view-dependent photo overlay or crossfade is involved.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial.transform import Rotation
import cv2

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']
DTYPE = np.dtype([(f,'<f4') for f in FIELDS])
C0 = np.sqrt(1/(4*np.pi))


def load_ply(path):
    with path.open('rb') as f:
        while True:
            line=f.readline().decode().strip()
            if line.startswith('element vertex '): count=int(line.split()[-1])
            if line=='end_header': break
        return np.fromfile(f,dtype=DTYPE,count=count)


def write_ply(path, data):
    with path.open('wb') as f:
        f.write(('ply\nformat binary_little_endian 1.0\nelement vertex '+str(len(data))+'\n'+''.join('property float '+n+'\n' for n in FIELDS)+'end_header\n').encode())
        data.tofile(f)


def polygon(shape, points):
    m=np.zeros(shape,np.uint8);cv2.fillPoly(m,[np.rint(points).astype(np.int32)],1);return m.astype(bool)


def plane_fit(xy,z,seed=42):
    """RANSAC plane in inverse depth; rejects mixed foreground/background."""
    rng=np.random.default_rng(seed)
    pick=rng.choice(len(z),min(len(z),7000),replace=False)
    A=np.column_stack([xy[pick],np.ones(len(pick))]);target=1/z[pick]
    best=None;best_n=-1
    for _ in range(250):
        ids=rng.choice(len(A),3,replace=False)
        try: p=np.linalg.solve(A[ids],target[ids])
        except np.linalg.LinAlgError: continue
        residual=np.abs(A@p-target)
        inside=residual<.004
        if inside.sum()>best_n:best_n=int(inside.sum());best=inside
    for _ in range(4):
        p=np.linalg.lstsq(A[best],target[best],rcond=None)[0]
        residual=np.abs(A@p-target)
        best=residual<max(.002,2.5*np.median(residual[best]))
    return p,{'samples':len(z),'inliers':int(best.sum()),'sampled':len(A),'median_inverse_depth_error':float(np.median(residual[best]))}


def make_splats(mask, depth, rgb, K):
    """One opaque, surface-aligned Gaussian per source pixel in this layer."""
    fx,fy,cx,cy=K
    y,x=np.where(mask);z=depth[y,x]
    rx=(x-cx)/fx;ry=(y-cy)/fy
    # Differential tangents retain the fitted plane's slope during orbit.
    dzdv,dzdu=np.gradient(depth)
    zu=np.clip(dzdu[y,x],-.03,.03);zv=np.clip(dzdv[y,x],-.03,.03)
    tu=np.column_stack([z/fx+rx*zu,ry*zu,zu])*.68
    tv=np.column_stack([rx*zv,z/fy+ry*zv,zv])*.68
    normal=np.cross(tu,tv);normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-10)
    cov=tu[:,:,None]*tu[:,None,:]+tv[:,:,None]*tv[:,None,:]+normal[:,:,None]*normal[:,None,:]*(.00008**2)
    values,axes=np.linalg.eigh(cov)
    negative=np.linalg.det(axes)<0;axes[negative,:,0]*=-1
    q=Rotation.from_matrix(axes).as_quat()
    data=np.zeros(len(x),DTYPE)
    data['x']=rx*z;data['y']=ry*z;data['z']=z
    colors=(rgb[y,x].astype(np.float32)/255-.5)/C0
    for i in range(3):data['f_dc_'+str(i)]=colors[:,i];data['scale_'+str(i)]=np.log(np.sqrt(np.maximum(values[:,i],1e-12)))
    data['opacity']=np.log(.995/.005)
    data['rot_0']=q[:,3]
    for i in range(3):data['rot_'+str(i+1)]=q[:,i]
    return data


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--without-fill',action='store_true',help='Diagnostic ablation: clean geometry but omit hidden backgrounds.')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'dist/occlusion-lab/assets')
    args=parser.parse_args()
    old=ROOT/'dist/infinisplat-lab/assets'
    out=args.output_dir;out.mkdir(parents=True,exist_ok=True)
    meta=json.loads((old/'scene.json').read_text());K=meta['intrinsics'];fx,fy,cx,cy=K
    photo=np.asarray(Image.open(ROOT/'dist/assets/desk-original.jpg').convert('RGB'))
    H,W=photo.shape[:2]
    plate_path=ROOT/'dist/occlusion-lab/assets/desk-clean-plate.png'
    plate=np.asarray(Image.open(plate_path).convert('RGB').resize((W,H),Image.Resampling.LANCZOS))
    old_data=load_ply(old/'desk-gaussian.ply')
    xyz=np.column_stack([old_data[n] for n in ['x','y','z']])
    u=xyz[:,0]/xyz[:,2]*fx+cx;v=xyz[:,1]/xyz[:,2]*fy+cy
    ix=np.clip(np.rint(u).astype(int),0,W-1);iy=np.clip(np.rint(v).astype(int),0,H-1)
    valid=(u>=0)&(u<W)&(v>=0)&(v<H)&(xyz[:,2]>0)
    yy,xx=np.mgrid[:H,:W];rays=np.stack([(xx-cx)/fx,(yy-cy)/fy,np.ones((H,W))],axis=-1)
    masks={n:np.asarray(Image.open(ROOT/f'dist/assets/objects/{n}-mask.png').convert('L'))>127
           for n in ['laptop','cup','book','note','phone','headphones','left-objects','tabletop']}
    objects=np.logical_or.reduce([m for n,m in masks.items() if n!='tabletop'])
    all_occluders=ndimage.binary_dilation(objects,iterations=3)
    # Restrict repair to the main desk and its immediately revealed backdrop.
    tabletop_full=polygon((H,W),[[136,774],[868,674],[1003,764],[203,954]])
    tabletop=ndimage.binary_erosion(tabletop_full,iterations=12)
    window=np.zeros((H,W),bool);window[590:835,420:880]=True
    back_edge=774+(xx-136)*(674-774)/(868-136)
    # Continue the blind behind the table. Cropping each layer at the same image
    # boundary leaves a gap as soon as their different depths produce parallax.
    window &= (~tabletop_full)|(yy<back_edge+65)
    # The upper window is observed and is used to fit the hidden blind surface.
    window_fit=np.zeros((H,W),bool);window_fit[460:690,380:720]=True
    window_fit &= ~ndimage.binary_dilation(objects,iterations=14)
    table_fit=ndimage.binary_erosion(masks['tabletop'],iterations=10)
    diagnostics={};planes={};layers=[]
    for name,fitmask in [('blind',window_fit),('table',table_fit)]:
        hit=valid & fitmask[iy,ix]
        planes[name],diagnostics[name]=plane_fit(xyz[hit,:2]/xyz[hit,2:3],xyz[hit,2])
    blind_depth=1/np.maximum(rays@planes['blind'],.05)
    table_depth=1/np.maximum(rays@planes['table'],.05)
    # Keep the original desk perimeter geometry so the new top meets its existing
    # front apron. Blend the interior plane to the observed boundary depth.
    hit=valid & masks['tabletop'][iy,ix] & ~ndimage.binary_dilation(objects,iterations=5)[iy,ix]
    hit &= np.abs(xyz[:,2]-table_depth[iy,ix])<.45
    grid=np.full((H,W),np.nan);grid[iy[hit],ix[hit]]=xyz[hit,2]
    known=np.isfinite(grid);_,nearest=ndimage.distance_transform_edt(~known,return_indices=True)
    perimeter_depth=ndimage.gaussian_filter(grid[nearest[0],nearest[1]],sigma=5)
    blend=np.clip((ndimage.distance_transform_edt(tabletop_full)-12)/38,0,1)
    # Nearby visible depth can contain foreground contamination. Under an object
    # use the clean fitted support plane, preventing it from piercing the screen.
    blend=np.maximum(blend,ndimage.gaussian_filter(all_occluders.astype(float),sigma=5))
    blend[all_occluders]=1
    table_depth=table_depth*blend+perimeter_depth*(1-blend)

    # Calibrate generated hidden texels to nearby observed material colors.
    for name,mask,depth,fitmask in [('blind',window,blind_depth,window_fit),('table',tabletop,table_depth,table_fit)]:
        hidden=mask & (all_occluders | (tabletop_full if name=='blind' else False))
        visible=mask & ~hidden
        calibration=fitmask & (photo.mean(axis=2)>140)
        shift=np.median(photo[calibration].astype(float)-plate[calibration].astype(float),axis=0)
        color=photo.copy()
        color[hidden]=np.clip(plate[hidden].astype(float)+shift,0,255).astype(np.uint8)
        layer_mask=visible if args.without_fill else mask
        layers.append(make_splats(layer_mask,depth,color,K))
        diagnostics[name].update({'plane':planes[name].tolist(),'hidden_pixels':int(hidden.sum()),'color_offset':shift.tolist()})

    # Separate screen/base planes prevent depth interpolation through the hinge
    # or into the blind behind the screen.
    fit=json.loads((ROOT/'dist/assets/laptop-fit.json').read_text())
    # A polygon excludes a few antialiased frame pixels and incorrectly assigns
    # them to the keyboard plane. Split by the physical hinge instead.
    hinge_y=771+(xx-521.5)*(742-771)/(658-521.5)
    screen=masks['laptop'] & (yy<hinge_y+1)
    base=masks['laptop'] & ~screen
    for name,mask in [('screen',screen),('base',base)]:
        inside=ndimage.binary_erosion(mask,iterations=8)
        hit=valid & inside[iy,ix]
        p,diagnostics[name]=plane_fit(xyz[hit,:2]/xyz[hit,2:3],xyz[hit,2])
        depth=1/np.maximum(rays@p,.05)
        layers.append(make_splats(mask,depth,photo,K))
        diagnostics[name]['plane']=p.tolist()

    # Rebuild the remaining tabletop silhouettes from their own depth samples,
    # extending only inward estimates into the narrow mixed-depth boundary.
    owned=masks['laptop'].copy()
    for name in ['note','cup','phone','book']:
        mask=masks[name] & ~owned;owned|=mask
        core=ndimage.binary_erosion(mask,iterations=3)
        hit=valid & core[iy,ix]
        grid=np.full((H,W),np.nan)
        # Medians at duplicate projected centers avoid far-side outliers.
        ids=iy[hit]*W+ix[hit];zs=xyz[hit,2];order=np.argsort(ids)
        sid=ids[order];sz=zs[order];unique,starts,counts=np.unique(sid,return_index=True,return_counts=True)
        grid.flat[unique]=np.array([np.median(sz[s:s+n]) for s,n in zip(starts,counts)])
        known=np.isfinite(grid)
        _,nearest=ndimage.distance_transform_edt(~known,return_indices=True)
        depth=grid[nearest[0],nearest[1]]
        depth=ndimage.median_filter(depth,size=3)
        if name!='cup':
            p,plane_stats=plane_fit(xyz[hit,:2]/xyz[hit,2:3],xyz[hit,2])
            depth=1/np.maximum(rays@p,.05)
        else:
            depth=ndimage.gaussian_filter(depth,sigma=3)
        layers.append(make_splats(mask,depth,photo,K))
        diagnostics[name]={'pixels':int(mask.sum()),'depth_median':float(np.median(depth[mask]))}

    preserved=masks['left-objects']|masks['headphones']
    target_objects=np.logical_or.reduce([masks[n] for n in ['laptop','cup','book','note','phone']])
    repaired=(tabletop|window|target_objects)&~preserved
    removed=repaired[iy,ix] & valid
    data=np.concatenate([old_data[~removed],*layers])
    write_ply(out/'desk-gaussian.ply',data)
    metadata={**meta,'generator':'InfiniSplat + segmented surfaces + explicit hidden desk/blind layers',
              'representation':'hybrid learned and reconstructed surface Gaussians',
              'gaussian_count':len(data),'gaussian_bytes':(out/'desk-gaussian.ply').stat().st_size,
              'ply_sha256':hashlib.sha256((out/'desk-gaussian.ply').read_bytes()).hexdigest(),
              'parent_ply_sha256':meta['ply_sha256'],'occlusion_completion':not args.without_fill,
              'completion_texture_sha256':hashlib.sha256(plate_path.read_bytes()).hexdigest(),
              'inpainting':True,'photo_overlay':False,'source_scene_unchanged':False,
              'completion_method':'imagegen hidden texels on fitted 3D planes; per-instance depth edges',
              'removed_gaussians':int(removed.sum()),'added_gaussians':sum(len(a) for a in layers),
              'surface_fit':diagnostics,
              'limitations':['Hidden texels are generated estimates, not observed reality.',
                             'Only the main desk and nearby blind are completed; room perimeter and chair remain imperfect.',
                             'Evaluation restricted to ±12 degrees; not a complete 180-degree scene.']}
    (out/'scene.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    print(json.dumps({'removed':metadata['removed_gaussians'],'added':metadata['added_gaussians'],'total':len(data),'fit':diagnostics},ensure_ascii=False))


if __name__=='__main__':main()
