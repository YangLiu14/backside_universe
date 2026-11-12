"""Register the pot outline and prepare photo-derived room textures for this case."""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

app=Path(__file__).resolve().parents[2]
folder=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else app/'evidence/universes/grandmas-table'
photo=np.asarray(Image.open(folder/'inputs/photo.jpg').convert('RGB'))
h,w=photo.shape[:2]
mask=np.full((h,w),cv2.GC_BGD,np.uint8)
box=(295,133,1115,713)
x1,y1,x2,y2=box
mask[y1:y2,x1:x2]=cv2.GC_PR_BGD
hsv=cv2.cvtColor(photo,cv2.COLOR_RGB2HSV)
red=((hsv[:,:,0]<14)|(hsv[:,:,0]>167))&(hsv[:,:,1]>52)
mask[y1:y2,x1:x2][red[y1:y2,x1:x2]]=cv2.GC_FGD
black=np.max(photo,axis=2)<60
mask[y1:y2,x1:x2][black[y1:y2,x1:x2]]=cv2.GC_PR_FGD
cv2.grabCut(photo,mask,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
alpha=np.uint8(mask%2)*255
out=folder/'art';out.mkdir(exist_ok=True)
Image.fromarray(alpha).save(out/'pot-mask.png')
im=Image.fromarray(photo);im.putalpha(Image.fromarray(alpha))
im.crop((265,108,1140,744)).save(out/'pot.png')
# Fill the wall and supporting tabletop using the same row on either side of the pot.
# The full original remains the opening plate. This clean background is used while orbiting.
row_colors=np.zeros((h,w,3),np.float32)
for y in range(h):
    left=np.median(photo[y,:220],axis=0)
    right=np.median(photo[y,1230:],axis=0)
    row_colors[y]=np.linspace(left,right,w)
weight=cv2.dilate(alpha,np.ones((55,55),np.uint8)).astype('f')/255
weight=cv2.GaussianBlur(weight,(0,0),20)[:,:,None]
clean=np.uint8(photo*(1-weight)+row_colors*weight)
Image.fromarray(clean).save(out/'room-plate.jpg',quality=93)
table=out/'interior.png'
if table.exists():
    src=cv2.imread(str(table));quad=np.float32([[157,97],[509,96],[548,210],[83,210]])
    uv=np.float32([[0,0],[511,0],[511,511],[0,511]])
    wood=cv2.warpPerspective(src,cv2.getPerspectiveTransform(quad,uv),(512,512))
    cv2.imwrite(str(out/'wood.jpg'),wood)
