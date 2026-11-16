"""Pack the registered timber surface and remove the replaced foreground shoe."""
import json, sys, shutil
from pathlib import Path
import cv2
import numpy as np
from tread import outsole_texture
from pavement import build_pavement
from PIL import Image

def stage(folder, out):
    with Image.open(folder/'inputs/photo.jpg') as photo:
        photo.crop((40,100,278,708)).save(out/'wood.jpg',quality=94)
        # Neighboring wood from the same plank area replaces only the dark shoe/shadow patch.
        rgb=np.array(photo)
    outsole_texture(rgb, out)
    # Fit inverse depth on bare boards. Storing relative relief preserves projection
    # while giving *both* photographed shoes parallax until the camera crosses the edge.
    raw=np.load(folder/'depth/source-da3-base.npz')['depth']
    small=cv2.resize(raw,(241,161),interpolation=cv2.INTER_AREA)
    yy,xx=np.mgrid[0:161,0:241]
    xy=np.dstack((xx/240,yy/160,np.ones_like(xx)))
    bare=(xx<78)|(xx>171)
    coeff=np.linalg.lstsq(xy[bare],1/small[bare],rcond=None)[0]
    height=np.clip(1-small*(xy@coeff),0,.18)
    support=np.zeros_like(height,np.uint8)
    for points in [[(425,421),(441,351),(468,343),(548,385),(608,461),(668,550),(673,606),(649,658),(602,670),(516,625),(477,556)],
                   [(518,213),(545,171),(603,154),(664,185),(723,227),(786,271),(809,314),(803,350),(788,376),(735,391),(648,350),(566,298)]]:
        positions=np.rint(np.array(points)*[.2,.2]).astype(np.int32)
        cv2.fillPoly(support,[positions],255)
    height*=cv2.GaussianBlur(support,(5,5),.8)/255
    (out/'relief.bin').write_bytes(np.rint(height*65535).astype('<u2').tobytes())
    # Replace the complete foreground silhouette, both tails and its cast shadow.
    # Sample a bare part of the board along its grain, independently of the mate.
    mask=np.zeros(rgb.shape[:2],np.uint8)
    outline=[(415,385),(429,346),(458,337),(493,342),(523,363),(550,392),(576,410),
             (600,425),(637,475),(694,532),(737,578),(737,594),(709,589),
             (675,556),(675,624),(671,699),(657,728),(637,740),(603,738),
             (566,717),(518,685),(486,674),(451,668),(438,651),
             (433,613),(428,577),(419,554),(412,523),(414,476)]
    cv2.fillPoly(mask,[np.array(outline)],255)
    # Continue the board texture beyond the shoe while matching the exposure
    # of its uncovered border. Keep the second shoe and its shadow outside.
    mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))
    # Reuse the grain of the uncovered left-hand board at the same height.
    # Carry its fine detail into the mask and interpolate lighting from bare wood.
    # Subtracting the donor's low frequencies avoids importing its own cast shadow.
    yy,xx=np.indices(mask.shape,dtype=np.float32)
    # Periodically mirror an unobstructed, sunlit strip across the filled
    # area. Sampling at native scale preserves the timber's grain size.
    across=np.mod(xx-(yy-500)*.10,164)
    weave=295+np.minimum(across,164-across)+(yy-500)*.10
    donor=cv2.remap(rgb,weave,yy,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT_101)
    donor=donor.astype(np.float32)
    grain=donor/np.maximum(cv2.GaussianBlur(donor,(0,0),3.5),12)
    detail=np.clip(grain,.68,1.32)
    # Interpolate the illumination from the surrounding bare timber without
    # pulling in the dark rear shoe or the sharp boundary of its shadow.
    usable=np.float32((mask==0)&(rgb.min(2)>45))
    usable[(yy<535)&(xx>565)&(xx<830)]=0
    low=cv2.resize(usable,(150,100),interpolation=cv2.INTER_AREA)
    colors=cv2.resize(rgb*usable[:,:,None],(150,100),interpolation=cv2.INTER_AREA)
    blur=lambda a:cv2.GaussianBlur(a,(0,0),12)
    light=cv2.resize(blur(colors)/np.maximum(blur(low)[:,:,None],.001),
                     (rgb.shape[1],rgb.shape[0]),interpolation=cv2.INTER_CUBIC)
    patch=np.clip(light*detail,0,255)
    alpha=cv2.GaussianBlur(mask,(0,0),4)[:,:,None]/255
    clean=np.uint8(rgb*(1-alpha)+patch*alpha)
    Image.fromarray(clean).save(out/'floor-clean.jpg',quality=96)
if __name__=='__main__':
    from register import calibrate
    from shoe_fit import fit_web_shoe
    folder,out=map(Path,sys.argv[1:])
    stage(folder,out)
    reg=calibrate(folder)
    build_pavement(out,reg["outsoleProfile"])
    fit_web_shoe(out,reg,json.loads((folder/'brief.json').read_text())['anchorsPx'])
    (out/'registration-models.json').write_text(json.dumps(reg))
    dist=Path(__file__).resolve().parents[2]/'dist'
    shutil.copytree(dist/'i18n',out/'i18n',dirs_exist_ok=True)
    (out/'cinema').mkdir(exist_ok=True)
    for name in ('room.js', 'premiere.css', 'loading.js'):
        shutil.copyfile(dist/'cinema'/name,out/'cinema'/name)
    from mobile_delivery import build_mobile_delivery
    build_mobile_delivery(folder, out)
