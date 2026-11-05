"""Compose diagnostic panels from untouched same-renderer captures."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[2]
out=root/'evidence/flashworld-vs-marble'
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
def panel(items,file):
 images=[Image.open(p).convert('RGB') if isinstance(p,Path) else p for label,p in items]
 w=sum(im.width for im in images);h=max(im.height for im in images)
 canvas=Image.new('RGB',(w,h+44),'#f3f1eb');draw=ImageDraw.Draw(canvas);x=0
 for (label,_),im in zip(items,images):
  draw.text((x+14,12),label,font=font,fill='#252525');canvas.paste(im,(x,44));x+=im.width
 canvas.save(out/file)
source=Image.open(root/'dist/assets/desk-original.jpg').convert('RGB').crop((67,0,1252,1739)).resize((480,704))
source.save(out/'input-crop.png')
panel([('Original input',source),('Marble / source view',out/'marble-0.png'),('FlashWorld / source view',out/'flash-0.png')],'source-comparison.png')
for a in [-12,12]:panel([(f'Marble / {a:+d} deg',out/f'marble-{a}.png'),(f'FlashWorld / {a:+d} deg',out/f'flash-{a}.png')],f'comparison-{a}.png')
# Pixel-for-pixel crops of the 2x renders (no sharpening or upscaling).
for label,box in [('desk',(270,480,700,750)),('chair',(430,600,960,1200))]:
 items=[]
 for name in ['marble','flash']:
  im=Image.open(out/f'{name}-0-2x.png').convert('RGB').crop(box)
  items.append((name+' / 2x render crop',im))
 panel(items,f'{label}-details.png')
metrics={}
for name in ['marble','flash']:
 im=np.asarray(Image.open(out/f'{name}-0.png').convert('RGB'),dtype=float);ref=np.asarray(source,dtype=float)
 metrics[name]={'source_mae_255':float(np.mean(np.abs(im-ref))),'source_psnr_db':float(10*np.log10(255**2/np.mean((im-ref)**2)))}
metrics['caution']='Different calibrated source poses, learned geometry and orbit radii. Source errors mix registration and appearance, and do not measure novel-view stability.'
(out/'source-metrics.json').write_text(json.dumps(metrics,indent=2))
print(json.dumps(metrics,indent=2))
