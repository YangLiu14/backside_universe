"""Losslessly adapt FlashWorld's f_dc_0..26 SH naming/order to standard 3DGS PLY."""
import argparse,hashlib,json,math
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);a=p.parse_args();directory=a.directory
source=directory/'gaussians.ply';dest=directory/'gaussians-standard.ply'
run=json.loads((directory/'run.json').read_text())
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(8*1024**2),b''):h.update(block)
 return h.hexdigest()
assert digest(source)==run['ply_sha256']
def read_ply(path):
 with path.open('rb') as f:
  assert f.readline()==b'ply\n'
  assert f.readline()==b'format binary_little_endian 1.0\n'
  fields=[];count=None
  while True:
   line=f.readline().decode().strip()
   if line=='end_header':break
   if line.startswith('element vertex '):count=int(line.split()[-1])
   if line.startswith('property '):
    _,kind,name=line.split();assert kind=='float';fields.append((name,'<f4'))
  offset=f.tell()
 assert count and path.stat().st_size==offset+count*np.dtype(fields).itemsize
 return np.memmap(path,mode='r',offset=offset,dtype=fields,shape=(count,))
data=read_ply(source)
coeff_names=[n for n in data.dtype.names if n.startswith('f_dc_')]
assert len(coeff_names)==27
rest_map=[3+coefficient*3+channel for channel in range(3) for coefficient in range(8)]
names=['x','y','z']+[f'f_dc_{i}' for i in range(3)]+[f'f_rest_{i}' for i in range(24)]+['opacity']+[f'scale_{i}' for i in range(3)]+[f'rot_{i}' for i in range(4)]
mapping={name:name for name in names if not name.startswith('f_rest_')}
mapping.update({f'f_rest_{i}':f'f_dc_{j}' for i,j in enumerate(rest_map)})
header='ply\nformat binary_little_endian 1.0\ncomment Lossless SH layout conversion from FlashWorld official PLY\nelement vertex '+str(len(data))+'\n'+''.join('property float '+n+'\n' for n in names)+'end_header\n'
nonfinite={n:0 for n in names}
with dest.open('wb') as f:
 f.write(header.encode())
 for start in range(0,len(data),100000):
  part=data[start:start+100000];out=np.empty(len(part),dtype=[(n,'<f4') for n in names])
  for n,src in mapping.items():
   out[n]=part[src];nonfinite[n]+=int((~np.isfinite(out[n])).sum())
  f.write(out.tobytes())
converted=read_ply(dest)
for n,src in mapping.items():assert np.array_equal(converted[n],data[src],equal_nan=True),n
report=dict(source_sha256=run['ply_sha256'],standard_sha256=digest(dest),gaussian_count=len(data),sh_degree=2,nonfinite=nonfinite,lossless_fields_verified=True,notes='SH coefficients renamed and reordered only. No Gaussian removed, no position/scale/color/opacity altered.')
(directory/'ply-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
