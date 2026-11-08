"""Locate the flank opening on the original Hi3D mesh. Uses the Gaussian Python environment."""
import json
import struct
from pathlib import Path
import cv2
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.spatial import cKDTree

assets = Path(__file__).resolve().parents[1] / 'dist/canine-museum/assets'
out = assets / 'hi3d-galleries'
out.mkdir(exist_ok=True)
with (assets / 'dog/hi3d-dog.glb').open('rb') as stream:
    stream.seek(12)
    length, _ = struct.unpack('<II', stream.read(8))
    doc = json.loads(stream.read(length))
    data_start = stream.tell() + 8
    primitive = doc['meshes'][0]['primitives'][0]
    acc = doc['accessors'][primitive['attributes']['POSITION']]
    view = doc['bufferViews'][acc['bufferView']]
    stream.seek(data_start + view.get('byteOffset', 0) + acc.get('byteOffset', 0))
    vertices = np.frombuffer(stream.read(12 * acc['count']), '<f4').reshape(-1, 3)
# Contour in the native dog's longitudinal and vertical coordinates.
anchors = np.array([[.293,.117],[.267,.171],[.211,.192],[.147,.171],[.073,.136],
    [-.019,.102],[-.119,.062],[-.204,.020],[-.251,-.035],[-.252,-.102],[-.207,-.143],
    [-.130,-.154],[-.041,-.158],[.050,-.154],[.141,-.135],[.216,-.095],[.273,-.036],[.302,.043]])
closed = np.vstack([anchors,anchors[0]])
lengths = np.r_[0,np.cumsum(np.linalg.norm(np.diff(closed,axis=0),axis=1))]
zy = CubicSpline(lengths,closed,bc_type='periodic')(np.linspace(0,lengths[-1],144,endpoint=False))
tree = cKDTree(vertices[:,[2,1]])
ring=[]
for z,y in zy:
    idx = tree.query_ball_point([z,y],.006)
    ring.append([round(float(np.percentile(vertices[idx,0],97)),5), round(float(y),5),round(float(z),5)])
(out/'rim.json').write_text(json.dumps(ring,separators=(',',':'))+'\n')
mask = np.zeros((600,720),'uint8')
pixels = np.column_stack([(.5+zy[:,0]/1.1)*720,(.5-zy[:,1]/.96)*600])
cv2.fillPoly(mask,[np.rint(pixels*256).astype('int32')],255,lineType=cv2.LINE_AA,shift=8)
cv2.imwrite(str(out/'flank-mask.png'),mask)
