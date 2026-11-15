"""Stage a local timing preview before the final Hi3D parts arrive."""
import json, shutil
from pathlib import Path
from runtime import stage

case=Path(__file__).resolve().parent
app=case.parents[1]
folder=app/'evidence/universes/sole-city'
out=folder/'timing-preview'
shutil.copytree(case/'viewer',out,dirs_exist_ok=True)
shutil.copytree(app/'dist/vendor',out/'vendor',dirs_exist_ok=True,ignore=shutil.ignore_patterns('abyssal','mesh-bvh'))
shutil.copyfile(folder/'inputs/photo.jpg',out/'photo.jpg')
spec=json.loads((case/'story.json').read_text())
spec['photo']='photo.jpg'
(out/'scene.json').write_text(json.dumps(spec,ensure_ascii=False))
stage(folder,out)
print(out)
