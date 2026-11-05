"""Prepare official 24x480x704 input, retaining original camera estimates."""
import json,math,hashlib
from pathlib import Path
from PIL import Image
out=Path(__file__).resolve().parent/'input'
out.mkdir(exist_ok=True)
source=Path(__file__).resolve().parents[1]/'infinisplat/input/desk-original.jpg'
cam=json.loads((source.parent/'camera.json').read_text())['intrinsics_px']
cameras=[]
angles=list(range(-12,1))+[12*i/11 for i in range(1,12)]
for angle in angles:
 t=math.radians(angle)
 cameras.append(dict(quaternion=[math.cos(t/2),0,math.sin(t/2),0],position=[2.5*math.sin(t),0,2.5*(math.cos(t)-1)],fx=cam[0][0],fy=cam[1][1],cx=cam[0][2],cy=cam[1][2]))
d=dict(image_prompt='trial/input/desk-original.jpg',text_prompt='A photograph of a home office with a white standing desk, an open silver laptop, a blue coffee cup and saucer, books, headphones, desk lamps, window blinds, a grey mesh office chair, a blue striped carpet and a framed red racing car poster.',resolution=[24,480,704],image_index=12,cameras=cameras)
(out/'desk-official.json').write_text(json.dumps(d,indent=2))
im=Image.open(source).convert('RGB');w,h=im.size
scale=max(480/h,704/w);nw,nh=int(704/scale),int(480/scale)
box=[(w-nw)//2,(h-nh)//2,(w-nw)//2+nw,(h-nh)//2+nh]
im.crop(box).resize((704,480)).save(out/'conditioning.png')
meta=dict(source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),source_size=[w,h],crop_box=box,resolution=d['resolution'],angles_deg=angles,source_index=12,seed=20261105,camera_note='DA3 estimated intrinsics; orbit radius is arbitrary scale, not measured geometry',retained_height=nh/h)
(out/'preprocessing.json').write_text(json.dumps(meta,indent=2))
print(json.dumps(meta,indent=2))
# Portrait shape exposed by the pinned official web UI.
d['resolution']=[24,704,480]
(out/'desk-portrait.json').write_text(json.dumps(d,indent=2))
scale=max(704/h,480/w);nw,nh=int(480/scale),int(704/scale)
box=[(w-nw)//2,(h-nh)//2,(w-nw)//2+nw,(h-nh)//2+nh]
im.crop(box).resize((480,704)).save(out/'conditioning-portrait.png')
meta.update(crop_box=box,resolution=d['resolution'],retained_height=nh/h,retained_width=nw/w)
(out/'preprocessing-portrait.json').write_text(json.dumps(meta,indent=2))
