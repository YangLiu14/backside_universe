#!/usr/bin/env python3
"""Regression checks for desktop ghosting, derivative isolation and preservation."""
from pathlib import Path
import gzip,hashlib,json,struct
import numpy as np
from PIL import Image

APP=Path(__file__).resolve().parents[1];OUT=APP/'dist/marble-refined-lab/assets';E=APP/'evidence/marble-refined'
before=json.loads((E/'preservation-before.json').read_text());changed=[n for n,h in before.items() if not (APP/'dist'/n).exists() or hashlib.sha256((APP/'dist'/n).read_bytes()).hexdigest()!=h]
assert not changed,changed
source=gzip.decompress((APP/'dist/marble-lab/assets/desk-full_res.spz').read_bytes());result=gzip.decompress((OUT/'room-without-objects.spz').read_bytes())
n=struct.unpack_from('<I',source,8)[0];start=16+n*9;end=start+n
assert len(source)==len(result) and source[:start]==result[:start] and source[end:]==result[end:]
removed=np.fromfile(OUT/'removed-indices.bin',dtype='<u4');mask=np.ones(n,bool);mask[removed]=False
a=np.frombuffer(source,np.uint8,count=n,offset=start);b=np.frombuffer(result,np.uint8,count=n,offset=start)
assert np.all(b[removed]==0) and np.array_equal(a[mask],b[mask])
texture=np.array(Image.open(OUT/'desktop-surface.png')).astype(int)
ghost=(texture[:,:,3]>128)&(texture[:,:,2]-texture[:,:,0]>20)&(texture[:,:,2]>texture[:,:,1]+8)
assert ghost.sum()==0,'Old blue book/cup has leaked into the support texture again'
desktop=json.loads((OUT/'desktop.json').read_text());v=np.array(desktop['positions']).reshape(-1,3);assert np.all(np.isfinite(v));assert max(desktop['indices'])<len(v)
obj=json.loads((OUT/'objects.json').read_text());assert len(obj['parts'])==9
report={'preserved_files':len(before),'changed_old_files':changed,'removed_gaussians':len(removed),'all_other_spz_attributes_unchanged':True,'blue_foreground_texels_on_desktop':int(ghost.sum()),'surface_vertices':len(v),'mesh_parts':len(obj['parts'])}
(E/'asset-qa.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
