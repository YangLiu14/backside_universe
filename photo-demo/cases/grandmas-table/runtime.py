"""Restore the case's measured pot camera, textures and Mandarin lines for packaging."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

folder, output = map(Path, sys.argv[1:])
case = Path(__file__).resolve().parent
app = case.parents[1]
art = folder / 'art'
art.mkdir(exist_ok=True)
state = json.loads((folder/'run.json').read_text())
if {'pork','greens','fish'}.issubset(state['brief']['props']):
    # Five-model archives still use the projected supper atlas.
    (output/'textures/supper.webp').unlink(missing_ok=True)
inventory = json.loads((app/'docs/local-assets.json').read_text())['files']
for item in inventory:
    asset = Path(item['path'])
    if asset.parent != case.relative_to(app)/'viewer/textures':
        continue
    if asset.name == 'supper.webp' and {'pork','greens','fish'}.issubset(state['brief']['props']):
        continue
    texture = output/'textures'/asset.name
    if not texture.is_file() or hashlib.sha256(texture.read_bytes()).hexdigest() != item['sha256']:
        raise ValueError(f'缺少或损坏的案例贴图：{asset}。请按 docs/ASSETS.md 从试玩包或私有备份恢复。')
concept = state['references'][state['concept']]
shell = state['jobs']['shell-' + state['shell']]
source = folder / shell['file']
signature = [state['source']['working_sha256'], shell['sha256'], concept['interior']]
for name in ('prepare.py','calibrate.py','measure.py'):
    signature.append(hashlib.sha256((case/name).read_bytes()).hexdigest())
signature.append(hashlib.sha256((folder/'room/registration.json').read_bytes()).hexdigest())
cache = art / 'calibration-inputs.json'
images = ('pot-fit.json','room-plate.jpg','wood.jpg')
if not all((art/name).is_file() for name in images) or not cache.exists() or json.loads(cache.read_text()) != signature:
    shutil.copyfile(folder/'inputs'/(concept['interior']+'.png'), art/'interior.png')
    subprocess.run([sys.executable,case/'prepare.py',folder],check=True)
    subprocess.run([os.getenv('BLENDER_BIN','blender'),'-b','--python-exit-code','1','-P',
                    case/'measure.py','--',source,art/'shell-points.npz'],check=True)
    subprocess.run([sys.executable,case/'calibrate.py',folder],check=True)
    cache.write_text(json.dumps(signature))
for stem, line in [('welcome','回来啦？把你的小凳子拉过来。'),('pair','再添一双筷子。')]:
    voice = art / (stem+'.mp3')
    if not voice.is_file():
        with tempfile.TemporaryDirectory() as tmp:
            aiff = Path(tmp)/'line.aiff'
            subprocess.run(['say','-v','Tingting','-r','158','-o',aiff,line],check=True)
            subprocess.run(['ffmpeg','-loglevel','error','-y','-i',aiff,voice],check=True)
for name in ('pot-fit.json','room-plate.jpg','welcome.mp3','pair.mp3'):
    shutil.copyfile(art/name,output/name)
# The same screening-room controls are included in the portable export.
shutil.copytree(app/'dist/i18n',output/'i18n',dirs_exist_ok=True)
(output/'cinema').mkdir(exist_ok=True)
for name in ('premiere.css','room.js','joysticks.js'):
    shutil.copyfile(app/'dist/cinema'/name,output/'cinema'/name)
