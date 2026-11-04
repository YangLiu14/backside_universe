"""Guard against a photograph's dark desk underside being baked onto its white top."""
from pathlib import Path
import numpy as np
from PIL import Image

image=np.asarray(Image.open(Path(__file__).resolve().parents[1]/'dist/assets/objects/desk-surface.png'))
luma=image@np.array([.2126,.7152,.0722])
front=float(luma[-30:].mean());interior=float(luma[100:400,150:1050].mean())
print(f'Front tabletop luminance {front:.2f}; interior {interior:.2f}; ratio {front/interior:.3f}')
assert front/interior>=.8, 'False dark crack: source desk underside leaked onto tabletop texture'
