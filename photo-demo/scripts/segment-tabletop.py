from pathlib import Path
import argparse,numpy as np,torch
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);args=p.parse_args();root=Path(__file__).resolve().parents[1]
image=np.array(Image.open(root/'dist/assets/desk-original.jpg'))
predictor=SAM2ImagePredictor(build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml',args.checkpoint,device='mps',apply_postprocessing=False))
with torch.inference_mode():
 predictor.set_image(image)
 masks,scores,_=predictor.predict(box=np.array([130,662,1004,951]),point_coords=np.array([[450,850],[680,835],[913,735],[500,980],[900,830],[998,788],[200,980]]),point_labels=np.array([1,1,1,0,0,0,0]),multimask_output=False)
Image.fromarray(np.uint8(masks[0])*255).save(root/'dist/assets/objects/tabletop-mask.png');print(float(scores[0]))
