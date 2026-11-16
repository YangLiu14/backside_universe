"""Measure the approved independent heads for mounting on animated skeletons."""
import json
import numpy as np
from foliage_structure import mesh_data


def prepare_actors(out):
    result = {}
    for role in ['shooter-head', 'walker-head', 'companion-head']:
        if not (out/(role+'.glb')).exists():
            continue
        attributes, faces, color = mesh_data(out/(role+'.glb'))
        points = attributes['POSITION']
        low, high = points.min(0), points.max(0)
        size, center = high-low, (high+low)/2
        skin = (color[:, 0] > color[:, 1]*1.06) & (color[:, 0] > color[:, 2]*1.12) & (color[:, 0] > .35)
        p = points[skin]
        if len(p) < 100:
            raise ValueError(role+' has no measurable neck skin')
        bottom, top = np.quantile(p[:, 1], [.005, .995])
        neck = p[p[:, 1] < bottom+(top-bottom)*.065].mean(0)
        neck[1] = bottom+(top-bottom)*.02
        face = p[(p[:, 1] > bottom+(top-bottom)*.38) & (p[:, 1] < bottom+(top-bottom)*.73)]
        face_width = np.quantile(face[:, 0], .99)-np.quantile(face[:, 0], .01)
        normalized=(points-center)/size
        face=normalized[faces].mean(1)
        garment=(face[:,1]<-.40)&(face[:,2]>-.10)&(skin[faces].sum(1)<2) if role=='companion-head' else np.zeros(len(faces),dtype=bool)
        result[role] = dict(neck=((neck-center)/size).tolist(), faceWidth=float(face_width), removeTriangles=np.flatnonzero(garment).tolist())
    (out/'actor-structure.json').write_text(json.dumps(result, separators=(',', ':')))
    print('Campus head mounts:', ', '.join(result))
