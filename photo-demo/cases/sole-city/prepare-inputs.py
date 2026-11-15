"""Separate the approved photo subject and six independent mesh references."""
import argparse
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("photo", type=Path)
p.add_argument("sheet", type=Path)
p.add_argument("output", type=Path)
args = p.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
photo = cv2.imread(str(args.photo))
if photo.shape[:2] != (800, 1200):
    raise ValueError("Mask coordinates refer to the original 1200 × 800 photograph")
# The heel and mesh upper of the foreground shoe. Loose lace tails can lie flat in the photo.
outline = [[425,422],[430,384],[443,353],[460,344],[486,345],[511,362],[538,387],[568,405],
           [585,427],[594,451],[620,481],[641,505],[658,539],[668,573],[670,600],[664,630],
           [647,650],[626,661],[603,667],[575,661],[547,648],[520,630],[500,604],[487,570],
           [476,548],[464,524],[453,498],[441,469],[428,450]]
region = np.zeros(photo.shape[:2], np.uint8)
cv2.fillPoly(region, [np.array(outline)], 255)
kernel = np.ones((9,9), np.uint8)
mask = np.zeros_like(region)
mask[cv2.dilate(region,kernel)>0] = cv2.GC_PR_BGD
mask[region>0] = cv2.GC_PR_FGD
mask[cv2.erode(region,kernel,iterations=2)>0] = cv2.GC_FGD
cv2.grabCut(photo,mask,None,np.zeros((1,65)),np.zeros((1,65)),4,cv2.GC_INIT_WITH_MASK)
alpha = np.uint8((mask%2)*255)
rgba = Image.fromarray(cv2.cvtColor(photo,cv2.COLOR_BGR2RGB)).convert('RGBA')
rgba.putalpha(Image.fromarray(alpha))
rgba.crop((411,331,684,680)).save(args.output/"shell.png")
with Image.open(args.sheet) as sheet:
    # The tower's ground floor extends several pixels below the nominal half-sheet boundary.
    for role,box in {"interior":(0,0,512,510),"tower":(515,0,1018,535),"shops":(1025,0,1536,518),
                     "bridge":(0,535,511,1024),"gate":(514,545,1020,1024),"stall":(1024,535,1536,1024)}.items():
        sheet.crop(box).save(args.output/(role+".png"))
