from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'dist/assets/objects';im=np.array(Image.open(root/'dist/assets/desk-original.jpg'))
# Keep the target instance, eliminating tiny unrelated islands in SAM's mask.
for name in ['laptop','cup','book']:
 mask=np.array(Image.open(out/(name+'-mask.png')));n,labels,stats,centroids=cv2.connectedComponentsWithStats(mask);idx=1+np.argmax(stats[1:,cv2.CC_STAT_AREA]);mask=np.uint8(labels==idx)*255;Image.fromarray(mask).save(out/(name+'-mask.png'))
 ys,xs=np.where(mask>0);crop=(max(0,int(xs.min())-8),max(0,int(ys.min())-8),min(1320,int(xs.max())+9),min(1739,int(ys.max())+9));Image.fromarray(np.dstack([im,mask])).crop(crop).save(out/(name+'-cutout.png'))
def warp(quad,size,source):
 w,h=size;m=cv2.getPerspectiveTransform(np.float32(quad),np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]));return cv2.warpPerspective(source,m,size,flags=cv2.INTER_LINEAR)
# Segmented foreground is removed BEFORE texture baking; never project object-shaped holes on walls.
for name,quad,size,masknames in [
 ('desk-surface',[[137,776],[866,675],[998,788],[198,944]],(1200,500),['laptop','cup','book','note','left-objects','phone','chair','arm']),
 ('window-surface',[[0,0],[891,0],[880,1068],[150,1110]],(800,1100),['laptop','cup','book','note','left-objects','phone','chair','arm'])]:
 rgb=warp(quad,size,im);mask=np.maximum.reduce([np.array(Image.open(out/(n+'-mask.png'))) for n in masknames]);masked=warp(quad,size,cv2.dilate(mask,np.ones((9,9),np.uint8)))
 if name=='desk-surface':
  table=warp(quad,size,np.array(Image.open(out/'tabletop-mask.png')))
  masked=np.maximum(masked,np.uint8(table<200)*255)
 clean=cv2.inpaint(rgb,np.uint8(masked>5)*255,8,cv2.INPAINT_TELEA)
 Image.fromarray(clean).save(out/(name+'.png'))
quad=[[712,674],[790,661],[855,698],[779,721]];rgb=warp(quad,(600,410),im);visible=warp(quad,(600,410),np.array(Image.open(out/'book-mask.png')));hidden=np.uint8(visible<240)*255
clean=cv2.inpaint(rgb,cv2.dilate(hidden,np.ones((3,3),np.uint8)),8,cv2.INPAINT_TELEA);Image.fromarray(clean).save(out/'book-cover.png')
sheet=Image.new('RGB',(1000,370),'#dddcd7');d=ImageDraw.Draw(sheet)
for i,name in enumerate(['laptop','book','cup']):
 pic=Image.open(out/(name+'-cutout.png'));pic.thumbnail((300,290));sheet.paste(pic,(i*333+(333-pic.width)//2,35+(290-pic.height)//2),pic);d.text((i*333+24,330),name,fill='#222222')
sheet.save(root/'evidence/sam2-object-cutouts.png')
