"""Extract small furniture materials from source pixels; never modify the source."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'dist/assets/desk-original.jpg').convert('RGB')
output = root / 'dist/assets/objects'
corners = np.float32([[769, 648], [810, 650], [808, 676], [767, 675]])
destination = np.float32([[0, 0], [255, 0], [255, 255], [0, 255]])
transform = cv2.getPerspectiveTransform(corners, destination)
paper = cv2.warpPerspective(np.array(source), transform, (256, 256))
Image.fromarray(paper).save(output / 'memo-paper.png')
source.crop((1240, 961, 1314, 1002)).resize((256, 160), Image.Resampling.LANCZOS).save(output / 'cabinet-wood.png')
