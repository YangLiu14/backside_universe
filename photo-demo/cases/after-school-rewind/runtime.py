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

dist = Path(__file__).resolve().parents[2] / 'dist'
shutil.copytree(dist/'i18n', out/'i18n', dirs_exist_ok=True)
(out/'cinema').mkdir(exist_ok=True)
shutil.copyfile(dist/'cinema/room.js', out/'cinema/room.js')
