"""Refine three actual SAM 2.1 masks on object crops and prepare Hi3D inputs.

No generated pixels or extra models: original RGB pixels, SAM alpha, neutral matte.
The small paper object is enlarged only for transport, not reconstructed in 2D.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

parser = argparse.ArgumentParser()
parser.add_argument('--checkpoint', required=True)
parser.add_argument('--device', default='mps')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = root / 'evidence/furniture-inputs'
output.mkdir(exist_ok=True)
photo_path = root / 'dist/assets/desk-original.jpg'
photo = np.array(Image.open(photo_path).convert('RGB'))
predictor = SAM2ImagePredictor(build_sam2(
    'configs/sam2.1/sam2.1_hiera_t.yaml', args.checkpoint,
    device=args.device, apply_postprocessing=False))
items = {
    'chair': {
        'crop': [628, 714, 1278, 1585], 'box': [649, 734, 1257, 1568],
        'positive': [], 'negative': [],
    },
    'lamp': {
        'crop': [1033, 550, 1205, 785], 'box': [1058, 574, 1181, 767],
        'positive': [[1117, 623]], 'negative': [],
    },
    'note': {
        'crop': [738, 622, 838, 713], 'box': [755, 639, 817, 695],
        'positive': [[787, 665], [775, 682], [796, 650]],
        'negative': [[758, 702], [826, 678]],
    },
}
report = []
with torch.inference_mode():
    for name, item in items.items():
        x1, y1, x2, y2 = item['crop']
        rgb = photo[y1:y2, x1:x2]
        predictor.set_image(rgb)
        points = np.array(item['positive'] + item['negative']).reshape(-1, 2) - [x1, y1]
        labels = np.array([1] * len(item['positive']) + [0] * len(item['negative']))
        box = np.array(item['box']) - [x1, y1, x1, y1]
        masks, scores, _ = predictor.predict(
            point_coords=points if len(points) else None, point_labels=labels if len(points) else None, box=box, multimask_output=False)
        selected = int(np.argmax(scores))
        mask = (masks[selected] * 255).astype(np.uint8)
        # Close one-pixel interruptions before removing detached specks.
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        # Remove only detached tiny specks; preserve thin rods and real openings.
        count, components, stats, _ = cv2.connectedComponentsWithStats(mask)
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        mask[components != largest] = 0
        # Fill tiny false holes, and all enclosed holes in the opaque metal lamp.
        gaps, gap_labels, gap_stats, _ = cv2.connectedComponentsWithStats(255 - mask)
        for component in range(1, gaps):
            gx, gy, gw, gh, area = gap_stats[component]
            enclosed = gx > 0 and gy > 0 and gx + gw < mask.shape[1] and gy + gh < mask.shape[0]
            if enclosed and (name == 'lamp' or area < 30):
                mask[gap_labels == component] = 255
        full_mask = np.zeros(photo.shape[:2], dtype=np.uint8)
        full_mask[y1:y2, x1:x2] = mask
        Image.fromarray(full_mask).save(output / f'{name}-sam2-mask.png')
        ys, xs = np.where(mask > 0)
        bounds = [max(0, int(xs.min()) - 8), max(0, int(ys.min()) - 8),
                  min(rgb.shape[1], int(xs.max()) + 9), min(rgb.shape[0], int(ys.max()) + 9)]
        rgba = Image.fromarray(np.dstack([rgb, mask])).crop(bounds)
        rgba.save(output / f'{name}-sam2-cutout.png')
        canvas = Image.new('RGB', (1024, 1024), (238, 238, 235))
        scale = min(896 / rgba.width, 896 / rgba.height)
        resized = rgba.resize((round(rgba.width * scale), round(rgba.height * scale)), Image.Resampling.LANCZOS)
        canvas.paste(resized, ((1024 - resized.width) // 2, (1024 - resized.height) // 2), resized.getchannel('A'))
        canvas.save(output / f'{name}-hi3d.png')
        report.append({'object': name, **item, 'score': float(scores[selected]),
                       'sourceObjectSize': [int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1)],
                       'input': f'{name}-hi3d.png', 'pixels': int((mask > 0).sum())})
        print(name, report[-1]['score'], report[-1]['sourceObjectSize'], flush=True)

manifest = {'model': 'SAM 2.1 Hiera Tiny', 'device': args.device,
            'checkpoint_sha256': hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest(),
            'source_sha256': hashlib.sha256(photo_path.read_bytes()).hexdigest(),
            'objects': report, 'postprocess': 'Crop-local SAM inference, 3px closing, retain largest foreground component and fill enclosed holes under 30px; fill enclosed holes in opaque lamp. Lanczos resize onto neutral RGB matte. No synthetic detail.'}
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
sheet = Image.new('RGB', (1200, 460), '#eeeeeB')
draw = ImageDraw.Draw(sheet)
for i, name in enumerate(items):
    image = Image.open(output / f'{name}-hi3d.png').resize((400, 400), Image.Resampling.LANCZOS)
    sheet.paste(image, (i * 400, 0))
    draw.text((i * 400 + 32, 425), name, fill='#222222')
sheet.save(output / 'sam2-hi3d-inputs.png')
