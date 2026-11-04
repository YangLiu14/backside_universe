#!/usr/bin/env python3
"""Check real hybrid assets: source preservation, deletion and registration."""
from pathlib import Path
import gzip,hashlib,json,struct
import numpy as np

APP=Path(__file__).resolve().parents[1];OUT=APP/'dist/marble-hybrid-lab/assets';EVIDENCE=APP/'evidence/marble-hybrid'
meta=json.loads((OUT/'scene.json').read_text());objects=json.loads((OUT/'objects.json').read_text())
source=APP/'dist/marble-lab/assets/desk-full_res.spz'
assert hashlib.sha256(source.read_bytes()).hexdigest()==meta['source_spz_sha256']
a=gzip.decompress(source.read_bytes());b=gzip.decompress((OUT/'room-without-objects.spz').read_bytes());n=struct.unpack_from('<I',a,8)[0]
start=16+n*9;end=start+n
assert len(a)==len(b) and a[:start]==b[:start] and a[end:]==b[end:]
before=np.frombuffer(a,np.uint8,count=n,offset=start);after=np.frombuffer(b,np.uint8,count=n,offset=start)
removed=np.fromfile(OUT/'removed-indices.bin',dtype='<u4');assert len(removed)==meta['removed_total'];assert np.all(after[removed]==0)
kept=np.ones(n,bool);kept[removed]=False;assert np.array_equal(before[kept],after[kept])
R=np.array(meta['source_camera_to_world']);C=np.array(meta['source_camera_position']);K=np.array(meta['intrinsics']);table=np.array(meta['support_plane'])
def local(p):return (np.array(p['positions']).reshape(-1,3)-C)@R
def uv(v,k):return v[:,:2]/v[:,2:]*k[:2]+k[2:]
oldmeta=json.loads((APP/'dist/solid-object-lab/assets/scene.json').read_text());oldK=np.array(oldmeta['intrinsics'])
old={p['name']:p for p in json.loads((APP/'dist/solid-object-lab/assets/objects.json').read_text())['parts']}
errors=[];heights={}
for part in objects['parts']:
    p=local(part);assert np.all(np.isfinite(p));h=(1-p@table)/np.linalg.norm(table)
    assert h.min()>.0005,(part['name'],h.min())
    heights[part['name']]=[float(h.min()),float(h.max())]
    if part['name'] in old:
        q=np.array(old[part['name']]['positions']).reshape(-1,3)
        errors.extend(np.linalg.norm(uv(p,K)-uv(q,oldK),axis=1).tolist())
    if part['name']=='book-cover':assert np.ptp(h)<1e-6
assert max(errors)<.001,max(errors)
snapshot=json.loads((EVIDENCE/'preservation-before.json').read_text());changed=[]
for name,digest in snapshot.items():
    path=APP/'dist'/name
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:changed.append(name)
assert not changed,changed
assets={name:{'bytes':(OUT/name).stat().st_size,'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest()} for name in ['room-without-objects.spz','support.ply','objects.json','removed-indices.bin']}
report={'original_files_checked':len(snapshot),'original_files_changed':changed,'raw_gaussians':n,'selected_for_removal':len(removed),'nonselected_attributes_unchanged':True,'mesh_parts':len(objects['parts']),'source_reprojection_max_px':max(errors),'source_reprojection_vertices':len(errors),'support_heights':heights,'assets':assets}
(EVIDENCE/'asset-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['support_heights','assets']},indent=2))
