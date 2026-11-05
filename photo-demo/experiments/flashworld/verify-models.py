"""Verify downloaded weight bytes against pinned Hugging Face LFS metadata."""
import hashlib,json,urllib.request
from pathlib import Path
paths=json.loads(Path('trial/model-paths.json').read_text())
records=[]
for repo,rev,base in [('imlixinyang/FlashWorld',paths['flash_revision'],str(Path(paths['checkpoint']).parent)),('Wan-AI/Wan2.2-TI2V-5B-Diffusers',paths['wan_revision'],paths['wan_path'])]:
 metadata=json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}/revision/{rev}?blobs=true',timeout=60))
 for item in metadata['siblings']:
  file=Path(base)/item['rfilename']
  expected=item.get('lfs',{}).get('sha256')
  if expected and file.is_file():
   digest=hashlib.sha256()
   with file.open('rb') as f:
    for block in iter(lambda:f.read(16*1024**2),b''):digest.update(block)
   actual=digest.hexdigest();assert actual==expected,(str(file),actual,expected)
   record={'repo':repo,'revision':rev,'file':item['rfilename'],'bytes':file.stat().st_size,'sha256':actual}
   print(json.dumps(record),flush=True);records.append(record)
Path('trial/weight-checksums.json').write_text(json.dumps(records,indent=2))
