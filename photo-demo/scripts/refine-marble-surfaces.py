#!/usr/bin/env python3
"""Local derivative: continuous desktop support + registered material cleanup.

Does not call model APIs or overwrite the retained Marble / first hybrid page.
"""
from pathlib import Path
import gzip, hashlib, importlib.util, json
import numpy as np
from scipy import ndimage
from PIL import Image
import cv2

APP=Path(__file__).resolve().parents[1]
OLD=APP/'dist/marble-hybrid-lab/assets'
OUT=APP/'dist/marble-refined-lab/assets'
EVIDENCE=APP/'evidence/marble-refined'
spec=importlib.util.spec_from_file_location('hybrid',Path(__file__).with_name('build-marble-hybrid.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

def main():
    OUT.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(parents=True,exist_ok=True)
    meta=json.loads((OLD/'scene.json').read_text());K=np.array(meta['intrinsics']);R=np.array(meta['source_camera_to_world']);C=np.array(meta['source_camera_position']);table=np.array(meta['support_plane']);W,H=meta['width'],meta['height']
    raw,xyz,alpha,color,scales,quat=h.read_spz(APP/'dist/marble-lab/assets/desk-full_res.spz')
    world=xyz*meta['semantics_metadata']['metric_scale_factor']*[1,-1,-1]+[0,meta['semantics_metadata']['ground_plane_offset'],0]
    local=(world-C)@R;uv=h.project(local,K);height=(1-local@table)/np.linalg.norm(table)
    ix=np.clip(np.rint(uv[:,0]).astype(int),0,W-1);iy=np.clip(np.rint(uv[:,1]).astype(int),0,H-1)
    valid=(local[:,2]>.5)&(local[:,2]<4)&(uv[:,0]>=0)&(uv[:,0]<W)&(uv[:,1]>=0)&(uv[:,1]<H)
    yy,xx=np.mgrid[:H,:W];rays=np.stack([(xx-K[2])/K[0],(yy-K[3])/K[1],np.ones((H,W))],-1)
    tablemask=h.poly([[62,370],[421,321],[480,366],[98,451]])
    objects=h.poly([[231,313],[312,300],[324,356],[355,380],[274,408],[235,385]])|h.poly([[330,315],[376,303],[424,333],[408,377],[346,377]])
    # Keep the newly observed boundary away from the old object's contact shadow.
    patch=ndimage.binary_dilation(objects,iterations=40)&tablemask
    inner=ndimage.binary_erosion(patch,iterations=12)
    remove=np.zeros(len(xyz),bool);remove[np.fromfile(OLD/'removed-indices.bin',dtype='<u4')]=True
    remove |= valid & inner[iy,ix] & (height>-.16) & (height<.045)
    blue_book=(uv[:,0]>675)&(uv[:,0]<900)&(uv[:,1]>620)&(uv[:,1]<790)&(world[:,1]>.7)&(world[:,1]<1.05)&(world[:,2]>-3)&(world[:,2]<-2)&(color[:,2].astype(int)-color[:,0].astype(int)>10)
    remove |= blue_book
    # Remove thin generated book/handle fringes above the support, with a bounded
    # depth interval: the blind and wall stay in the original Gaussian layer.
    data=bytearray(raw);n=len(xyz);np.frombuffer(data,np.uint8,count=n,offset=16+9*n)[remove]=0
    (OUT/'room-without-objects.spz').write_bytes(gzip.compress(data,compresslevel=6,mtime=0));np.flatnonzero(remove).astype('<u4').tofile(OUT/'removed-indices.bin')
    # Colors are sampled from the same Marble render at this camera. Fill only
    # the occluded patch from its surrounding desktop, then retain the observed
    # boundary exactly. This is a fixed surface texture, not a screen overlay.
    rgb=np.asarray(Image.open(APP/'evidence/marble-lab/registered/render.png').convert('RGB').resize((W,H),Image.Resampling.BICUBIC)).astype(float)/255
    known=ndimage.binary_erosion(tablemask,iterations=24)&~ndimage.binary_dilation(objects,iterations=24)
    known &= (rgb.mean(2)>.67)&(np.ptp(rgb,axis=2)<.19)
    _,nearest=ndimage.distance_transform_edt(~known,return_indices=True)
    field=rgb[nearest[0],nearest[1]]
    field=ndimage.gaussian_filter(field,(20,20,0))
    distance=ndimage.distance_transform_edt(patch)
    blend=np.clip(distance/20,0,1);blend=blend*blend*(3-2*blend)
    # A support boundary can pass underneath the old book. Never blend its
    # photographed foreground back onto the desk: that creates a second book.
    blend=np.maximum(blend,ndimage.binary_dilation(objects,iterations=12))
    field=rgb*(1-blend[:,:,None])+field*blend[:,:,None]
    contacts=np.zeros((H,W),bool)
    for name in ['laptop','cup']:
        contacts|=np.asarray(Image.open(APP/f'dist/assets/objects/{name}-mask.png').convert('L'))>127
    shadow=ndimage.distance_transform_edt(~contacts)
    field*=1-(.045*np.exp(-(shadow/10)**2)*blend)[:,:,None]
    # A continuous height field joins the observed Marble desk at the boundary,
    # while the replacement objects keep their already-calibrated contact plane.
    plane_depth=1/(rays@table)
    hit=valid&tablemask[iy,ix]&~objects[iy,ix]&(abs(height)<.09)&(alpha>120)&(np.max(scales,axis=1)<.04)
    grid=np.full((H,W),np.nan)
    grid[iy[hit],ix[hit]]=local[hit,2]
    finite=np.isfinite(grid);_,near=ndimage.distance_transform_edt(~finite,return_indices=True)
    observed=ndimage.gaussian_filter(grid[near[0],near[1]],3)
    join=np.clip(distance/28,0,1);join=join*join*(3-2*join)
    depth=observed*(1-join)+plane_depth*join
    rgba=np.dstack([np.uint8(np.clip(field,0,1)*255),patch.astype(np.uint8)*255]);Image.fromarray(rgba).save(OUT/'desktop-surface.png')
    # Tiled opaque mesh lets real depth resolve splat/solid intersections.
    py,px=np.where(patch);x0,x1=max(0,px.min()-4),min(W-1,px.max()+4);y0,y1=max(0,py.min()-4),min(H-1,py.max()+4)
    xs=np.arange(x0,x1+4,3).clip(0,W-1);ys=np.arange(y0,y1+4,3).clip(0,H-1);gx,gy=np.meshgrid(xs,ys)
    points=rays[gy,gx]*depth[gy,gx,None];positions=(points.reshape(-1,3)@R.T+C);cols=len(xs);indices=[]
    for row in range(len(ys)-1):
        for col in range(cols-1):
            a=row*cols+col;indices.extend([a,a+1,a+cols,a+1,a+cols+1,a+cols])
    desktop={'positions':positions.round(8).reshape(-1).tolist(),'uv':np.stack([gx/W,1-gy/H],-1).reshape(-1).round(8).tolist(),'indices':indices}
    (OUT/'desktop.json').write_text(json.dumps(desktop,separators=(',',':')))
    original=json.loads((OLD/'objects.json').read_text())
    for part in original['parts']:
        if part['name']=='cup-handle':
            vertices=np.array(part['positions']).reshape(-1,3);vertices[:,1]+=.007
            part['positions']=vertices.round(8).reshape(-1).tolist()
    (OUT/'objects.json').write_text(json.dumps(original,separators=(',',':')))
    # Extend only valid blue-glaze texels into the cup mask border; no white wall
    # pixels enter the handle's material. Rim and coffee retain the original map.
    photo=np.asarray(Image.open(APP/'dist/assets/desk-original.jpg').convert('RGB'))
    cupmask=np.asarray(Image.open(APP/'dist/assets/objects/cup-mask.png').convert('L'))>127
    blue=cupmask&(photo[:,:,2].astype(int)-photo[:,:,:2].max(2).astype(int)>16)
    _,near=ndimage.distance_transform_edt(~blue,return_indices=True)
    glaze=photo[near[0],near[1]];Image.fromarray(glaze).save(OUT/'cup-glaze.png')
    book=np.zeros((H,W),np.uint8);cv2.fillPoly(book,[np.array([[712,674],[790,661],[855,698],[779,721]],np.int32)],1)
    book=ndimage.binary_erosion(book,iterations=2);_,near=ndimage.distance_transform_edt(~book,return_indices=True)
    Image.fromarray(photo[near[0],near[1]]).save(OUT/'book-photo.png')
    meta['parent_removed_by_region']=meta.pop('removed_by_region');meta.pop('support_gaussians',None)
    meta.update({'parent':'../marble-hybrid-lab/','removed_total':int(remove.sum()),'support_kind':'Opaque continuous registered desktop with boundary height/color matching','refinement':{'support_pixels':int(patch.sum()),'extra_removed':int(remove.sum())-meta['removed_total'],'boundary_fade_px':20,'handle_lift_m':.007},'review':{'summary':'已检查 0° 与 ±12°：桌面补片轮廓、书边扁平残影和杯柄色边减少。杯口与纸页薄边仍近似；±120°和自由移动用于探索，桌后及外围仍有缺失。'}})
    (OUT/'scene.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'removed':int(remove.sum()),'support_pixels':int(patch.sum()),'surface_vertices':len(positions),'source_unchanged':hashlib.sha256((APP/'dist/marble-lab/assets/desk-full_res.spz').read_bytes()).hexdigest()==meta['source_spz_sha256']}))

if __name__=='__main__':main()
