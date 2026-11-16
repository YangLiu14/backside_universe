import sys
import shutil
from pathlib import Path
import json
from register import register
from desk import stage
folder,out=map(Path,sys.argv[1:])
alignment=register(folder)
(out/'alignment.json').write_text(json.dumps(alignment,indent=2))
stage(folder,out,alignment)
shutil.copyfile(folder/'art/broadcast-elm.jpg', out/'broadcast-elm.jpg')
from PIL import Image
shutil.copyfile(folder/'environment-revision/school-plaster.png', out/'school-plaster.png')
shutil.copyfile(folder/'environment-revision/camphor-bark.png', out/'camphor-bark.png')
with Image.open(folder/'environment-revision/sunset-sky-v2.png') as sky:
    sky.convert('RGB').save(out/'school-sky.jpg',quality=96,subsampling=0)

dist = Path(__file__).resolve().parents[2] / 'dist'
shutil.copytree(dist/'i18n', out/'i18n', dirs_exist_ok=True)
(out/'cinema').mkdir(exist_ok=True)
shutil.copyfile(dist/'cinema/room.js', out/'cinema/room.js')

# Keep the same new geometry on touch devices; only the embedded image payloads
# change. The master and the desktop 8K portrait atlas remain untouched.
sys.path.insert(0, str(dist.parent/'scripts'))
from glb_textures import resize
from tree_canopy import separate
from foliage_structure import prepare_foliage
from actor_structure import prepare_actors
from motion_assets import stage_motion
separate(out/'campus-tree.glb',out/'campus-tree.glb',out/'tree-anchors.json')
prepare_foliage(folder,out,dist.parent)
prepare_actors(out)
stage_motion(folder, out)
touch = {}
for role, size in [('interior', 4096), ('console', 2048), ('microphone', 2048), ('announcer', 4096), ('announcer-head', 4096), ('shell', 2048), ('classblock', 4096), ('campus-tree', 2048), ('campus-foliage', 2048), ('shooter',4096), ('walker',4096), ('shooter-head',2048), ('walker-head',2048), ('companion-head',2048)]:
    original = out / (role+'.glb')
    if original.exists():
        target = out / (role+'-touch.glb')
        if not resize(original, size, output=target):
            shutil.copyfile(original, target)
        touch[role] = dict(file=target.name, maxTextureSize=size)
(out/'broadcast-assets.json').write_text(json.dumps(dict(touch=touch), indent=2))
