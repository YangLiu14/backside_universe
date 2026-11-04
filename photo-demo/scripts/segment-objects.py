"""SAM 2.1 masks for the source photograph. Offline asset preparation, never browser code.
Run in an environment with official SAM-2, torch, Pillow, numpy, OpenCV.
SAM 3 is NOT used by this script; checkpoint access is not available here.
"""
import argparse,json,hashlib,subprocess
from pathlib import Path
import numpy as np,torch,cv2
from PIL import Image,ImageDraw
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
parser=argparse.ArgumentParser();parser.add_argument('--checkpoint',required=True);parser.add_argument('--device',default='cpu');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'dist/assets/objects';out.mkdir(exist_ok=True)
im=np.array(Image.open(root/'dist/assets/desk-original.jpg').convert('RGB'))
pred=SAM2ImagePredictor(build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml',args.checkpoint,device=args.device,apply_postprocessing=False))
items={
'laptop':([501,631,724,822],[[579,698],[612,790]],[]),
'cup':([748,706,846,772],[[798,737],[793,757],[828,731]],[[785,700]]),
'book':([709,663,860,725],[[742,691],[832,698]],[[786,668],[798,738]]),
'note':([754,636,823,697],[[789,669]],[]),
'lamp':([1027,567,1180,775],[[1117,623],[1103,744],[1103,696]],[]),
'chair':([628,730,1263,1560],[[984,1174],[1153,876],[837,1388]],[[789,931],[658,1345]]),
'left-objects':([230,597,413,872],[[275,677],[323,837]],[]),
'phone':([408,781,475,820],[[444,802]],[]),
'arm':([727,380,933,701],[[764,430],[917,548]],[]),
}
masks={};report=[]
with torch.inference_mode():
 pred.set_image(im)
 for name,(box,pos,neg) in items.items():
  ms,scores,_=pred.predict(point_coords=np.array(pos+neg),point_labels=np.array([1]*len(pos)+[0]*len(neg)),box=np.array(box),multimask_output=False)
  mask=(ms[0]*255).astype('uint8');masks[name]=mask
  Image.fromarray(mask).save(out/(name+'-mask.png'))
  rgba=np.dstack([im,mask]);ys,xs=np.where(mask>0);bounds=[max(0,int(xs.min())-8),max(0,int(ys.min())-8),min(im.shape[1],int(xs.max())+9),min(im.shape[0],int(ys.max())+9)]
  Image.fromarray(rgba).crop(bounds).save(out/(name+'-cutout.png'))
  report.append({'name':name,'box':box,'positive_points':pos,'negative_points':neg,'score':float(scores[0]),'crop':bounds,'pixels':int((mask>0).sum())});print(name,round(float(scores[0]),3),bounds,flush=True)
# This exclusion mask prevents original object pixels leaking onto the desk/walls.
union=np.maximum.reduce(list(masks.values()));union=cv2.dilate(union,np.ones((7,7),np.uint8));Image.fromarray(union).save(out/'foreground-mask.png')
# Rectify original pixels onto physically rectangular surfaces. No invented detail.
fit=json.loads((root/'dist/assets/laptop-fit.json').read_text())
def rectify(name,quad,size,source=im):
 w,h=size;matrix=cv2.getPerspectiveTransform(np.float32(quad),np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]));patch=cv2.warpPerspective(source,matrix,size,flags=cv2.INTER_LANCZOS4);Image.fromarray(patch).save(out/(name+'.png'))
rectify('laptop-screen',fit['screenPixels'],(620,400));rectify('laptop-deck',fit['basePixels'],(640,460))
# Remove the occluding note only for the hidden patch of the book cover; visible pixels remain sourced from the photo.
clean=cv2.inpaint(im,cv2.dilate(masks['note'],np.ones((5,5),np.uint8)),5,cv2.INPAINT_TELEA)
rectify('book-cover',[[712,674],[790,661],[855,698],[779,721]],(600,410),clean)
# Real photographed upholstery sample instead of a flat grey chair.
Image.fromarray(im).crop((1028,853,1072,902)).save(out/'chair-weave.png')
meta={'model':'facebookresearch/sam2 / SAM 2.1 Hiera Tiny','model_license':'Apache-2.0','source':'https://github.com/facebookresearch/sam2','checkpoint_sha256':hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest(),'source_sha256':hashlib.sha256((root/'dist/assets/desk-original.jpg').read_bytes()).hexdigest(),'device':args.device,'objects':report,'note':'Masks inferred locally using point and box prompts; not SAM 3. Crop resolution is limited by the original photo. Book note occlusion inpainted only in rectified texture.'};(out/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
# Contact sheet for review; not part of the shipped page.
sheet=Image.new('RGB',(1000,370),'#dddcd7');d=ImageDraw.Draw(sheet)
for i,name in enumerate(['laptop','book','cup']):
 pic=Image.open(out/(name+'-cutout.png'));pic.thumbnail((300,290));sheet.paste(pic,(i*333+(333-pic.width)//2,35+(290-pic.height)//2),pic);d.text((i*333+24,330),name,fill='#222222')
sheet.save(root/'evidence/sam2-object-cutouts.png')
