"""Calibrate small rigid objects and rebuild a clean matte desktop from source pixels.
Uses the existing local SAM 2.1 checkpoint for headphone occlusion only.
"""
import json
from pathlib import Path
import cv2
import numpy as np
import torch
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

root=Path(__file__).resolve().parents[1];out=root/'dist/assets/objects'
source=np.asarray(Image.open(root/'dist/assets/desk-original.jpg').convert('RGB'))
c=json.loads((root/'dist/assets/calibration.json').read_text());C=np.array(c['position'])
x,y,z,w=c['quaternion'];R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
f=1739/(2*np.tan(np.deg2rad(c['fov']/2)))
def pixel_point(px,py,height):
    ray=R@np.array([(px-660)/f,-(py-869.5)/f,-1]);return C+ray*((height-C[1])/ray[1])
def project(points):
    v=(points-C)@R;return np.column_stack([660+f*v[:,0]/-v[:,2],869.5-f*v[:,1]/-v[:,2]])
def rect(quad,height):
    points=np.array([pixel_point(px,py,height) for px,py in quad]);xz=points[:,[0,2]]
    box=cv2.boxPoints(cv2.minAreaRect(np.float32(xz)));edges=np.roll(box,-1,axis=0)-box
    index=int(np.argmax(np.linalg.norm(edges,axis=1)));u=edges[index];width=float(np.linalg.norm(u));u=u/width
    if u[0]<0:u=-u
    depth=float(np.min(np.linalg.norm(edges,axis=1)));center=box.mean(axis=0)
    return {'position':[float(center[0]),height,float(center[1])],'width':width,'depth':depth,'yaw':float(np.arctan2(-u[1],u[0])),'sourceQuad':quad}

# Sample only actual visible tabletop interior. Do not stretch the underside or
# Telea's large object-shaped fills across the entire cap.
u,v=np.meshgrid(np.linspace(-1,1,1200),np.linspace(-1,1,500))
world=np.column_stack([u.ravel()*2.1,np.full(u.size,-.008),v.ravel()*.85]);uv=project(world)
mx=uv[:,0].reshape(u.shape).astype('float32');my=uv[:,1].reshape(u.shape).astype('float32')
rgb=cv2.remap(source,mx,my,cv2.INTER_LINEAR)
table=np.array(Image.open(out/'tabletop-mask.png'));table=cv2.erode(table,np.ones((9,9),np.uint8))
foreground=np.maximum.reduce([np.asarray(Image.open(out/(name+'-mask.png'))) for name in ['laptop','cup','book','note','left-objects','phone','chair','arm']])
foreground=cv2.dilate(foreground,np.ones((15,15),np.uint8))
valid=(cv2.remap(table,mx,my,cv2.INTER_NEAREST)>240)&(cv2.remap(foreground,mx,my,cv2.INTER_NEAREST)<10)
valid&=(rgb.mean(axis=2)>150)&(np.ptp(rgb.astype(float),axis=2)<48)
features=np.stack([np.ones_like(u),u,v,u*v,u*u,v*v],axis=-1)
A=features[valid][::4];b=rgb[valid][::4].astype(float)
keep=np.ones(len(A),dtype=bool)
for _ in range(4):
    coefficients=np.linalg.lstsq(A[keep],b[keep],rcond=None)[0]
    error=np.linalg.norm(A@coefficients-b,axis=1);keep=error<np.quantile(error,.86)
clean=features@coefficients
lo=np.quantile(b[keep],.02,axis=0)-4;hi=np.quantile(b[keep],.98,axis=0)+4
clean=np.uint8(np.clip(np.maximum(lo,np.minimum(hi,clean)),0,255))
Image.fromarray(clean).save(out/'desk-surface.png')

# Folded headphone assembly, separate from the tall object and orange book.
crop=[229,762,389,851];x1,y1,x2,y2=crop
predictor=SAM2ImagePredictor(build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml',
 '/tmp/backside-sam2/checkpoints/sam2.1_hiera_tiny.pt',device='mps',apply_postprocessing=False))
parts=[([295,800,370,842],[332,820]),([311,773,379,809],[345,790]),([239,768,307,824],[263,789])]
union=np.zeros(source.shape[:2],np.uint8);scores=[]
with torch.inference_mode():
    predictor.set_image(source[y1:y2,x1:x2])
    for bounds,point in parts:
        masks,confidence,_=predictor.predict(box=np.array(bounds)-[x1,y1,x1,y1],point_coords=np.array([point])-[x1,y1],point_labels=np.array([1]),multimask_output=False)
        union[y1:y2,x1:x2]=np.maximum(union[y1:y2,x1:x2],np.uint8(masks[0])*255);scores.append(float(confidence[0]))
Image.fromarray(union).save(out/'headphones-mask.png')
orange_quad=[[237,802],[348,779],[409,838],[279,860]]
transform=cv2.getPerspectiveTransform(np.float32(orange_quad),np.float32([[0,0],[599,0],[599,399],[0,399]]))
book_rgb=cv2.warpPerspective(source,transform,(600,400));covered=cv2.warpPerspective(cv2.dilate(union,np.ones((7,7),np.uint8)),transform,(600,400))
book_clean=cv2.inpaint(book_rgb,covered,6,cv2.INPAINT_TELEA);Image.fromarray(book_clean).save(out/'orange-book.png')
data={
 'phone':rect([[409,789],[443,781],[472,806],[437,815]],.027),
 'headphoneFront':rect([[302,812],[347,803],[365,820],[321,831]],.15),
 'headphoneRear':rect([[319,782],[355,776],[374,789],[339,801]],.145),
 'orangeBook':rect(orange_quad,.06),
 'headphoneMaskScores':scores,
 'desktop':{'method':'Quadratic illumination fitted only to visible SAM tabletop interior; excludes foreground and underside','validSamples':int(keep.sum()),'rgbRange':[lo.tolist(),hi.tolist()]},
 'limits':'Visible surfaces use original photograph UVs; hidden small-object surfaces are authored geometry.'}
data['orangeBook']['textureHomography']=transform.tolist()
(root/'dist/assets/desk-details-fit.json').write_text(json.dumps(data,indent=2))
print(json.dumps(data,indent=2))
