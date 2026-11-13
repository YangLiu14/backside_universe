"""Estimate the tabletop surface and export a low-resolution context mesh for the near-photo arc."""
import json
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageFilter, ImageOps

def tabletop(folder):
    cache=np.load(folder/'depth/source-da3-base.npz')
    z,K=cache['depth'],cache['intrinsics']
    h,w=z.shape
    v,u=np.mgrid[:h,:w]
    sample=(u>.44*w)&(u<.77*w)&(v>.27*h)&(v<.78*h)&~((v>.35*h)&(u<.685*w))&~((v>.52*h)&(v<.76*h)&(u>.60*w))
    points=np.column_stack([((u-K[0,2])*z/K[0,0])[sample],(-(v-K[1,2])*z/K[1,1])[sample],-z[sample]])
    for _ in range(3):
        center=points.mean(0)
        normal=np.linalg.svd(points-center,full_matrices=False)[2][-1]
        normal*=np.sign(normal[1])
        residual=abs((points-center)@normal)
        points=points[residual<=np.quantile(residual,.8)]
    return normal

def stage(folder,out,align):
    normal=np.array(align['deskNormal'])
    distance=align['deskConstant']
    room=json.loads((folder/'room/registration.json').read_text())
    fx,fy,cx,cy=room['intrinsics'];fx/=room['width'];fy/=room['height'];cx/=room['width'];cy/=room['height']
    z=np.load(folder/'depth/source-da3-base.npz')['depth']
    h,w=66,120
    z=cv2.resize(z,(w,h))
    v,u=np.mgrid[0:h,0:w];u=u/(w-1);v=v/(h-1)
    rays=np.stack([(u-cx)/fx,(cy-v)/fy,-np.ones_like(u)],-1)
    deskDepth=-distance/np.minimum(rays@normal,-.01)
    # Removed subject, pencil ends and their shadow must inherit the desk's depth.
    mask=np.zeros((h,w),np.uint8)
    points=np.array([[.408,.334],[.443,.328],[.534,.433],[.674,.374],[.692,.608],[.805,.727],[.798,.769],[.680,.691],[.440,.789],[.414,.751],[.427,.483],[.467,.461]])
    cv2.fillPoly(mask,[np.int32(points*[w-1,h-1])],255)
    blend=cv2.GaussianBlur(mask.astype(float)/255,(5,5),1)
    z=(1-blend)*z+blend*deskDepth
    (out/'desk-depth.bin').write_bytes(z.astype('<f4').tobytes())
    art=folder/'art'
    with Image.open(art/'clean-desk.png') as plate:
        plate.convert('RGB').save(out/'desk.jpg',quality=94,subsampling=0)
        plate.crop((735,420,1220,680)).convert('RGB').save(out/'grain.jpg',quality=94)

    with Image.open(art/'court.png') as court:
        w,h=court.size
        crop=court.crop((int(.27*w),int(.77*h),int(.62*w),int(.89*h))).convert('RGB')
        crop.save(out/'asphalt.jpg',quality=94)
    # Tile the new reverse view around the desk at its photographic angle of view.
    # This keeps windows and furniture at room scale in the narrow close-up camera.
    with Image.open(art/'classroom.png') as image:
        tile=image.convert('RGB').resize((684,384)).filter(ImageFilter.GaussianBlur(3.0))
        pano=Image.new('RGB',(4096,2048))
        for i in range(6):
            side=tile if i%2==0 else ImageOps.mirror(tile)
            x=i*683
            pano.paste(side.crop((0,0,684,1)).resize((684,780)),(x,0))
            pano.paste(side,(x,780))
            pano.paste(side.crop((0,383,684,384)).resize((684,884)),(x,1164))
        pano.save(out/'ambient.jpg',quality=91)

    with Image.open(art/'campus/environment.png') as plate:
        plate.convert('RGB').save(out/'school-sky.jpg',quality=94)
        w,h=plate.size
        plate.crop((.20*w,.712*h,.66*w,.922*h)).convert('RGB').save(out/'school-ground.jpg',quality=94)
    top=cv2.imread(str(art/'campus/field.png'))
    h,w=top.shape[:2]
    corners=np.float32([[.051,.085],[.944,.085],[.986,.901],[.01,.901]])*[w,h]
    warp=cv2.getPerspectiveTransform(corners.astype('float32'),np.float32([[0,0],[2047,0],[2047,1151],[0,1151]]))
    cv2.imwrite(str(out/'playing-surface.jpg'),cv2.warpPerspective(top,warp,(2048,1152)),[cv2.IMWRITE_JPEG_QUALITY,96])

    with Image.open(art/'campus/gymhall.png') as hall:
        w,h=hall.size
        hall.crop((.07*w,.356*h,.157*w,.573*h)).convert('RGB').save(out/'courtyard-brick.jpg',quality=95)
