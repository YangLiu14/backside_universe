"""Install the verified screening in the project album, optionally export its portable edition."""
import argparse
import json
from pathlib import Path
import shutil
import sys

from PIL import Image

app=Path(__file__).resolve().parents[2]
dist=app/'dist'
case=Path(__file__).resolve().parent.name
cli=argparse.ArgumentParser(description=__doc__)
cli.add_argument('--project',type=Path,default=app/'evidence/universes'/case)
cli.add_argument('--portable',type=Path,help='Root for a portable album containing this screening')
args=cli.parse_args()
sys.path.insert(0,str(app/'pipeline'))
from release_files import check_version
release=args.project/json.loads((args.project/'release.json').read_text())['path']
check_version(release)
qa=args.project/'qa'/release.name
report=json.loads((qa/'report.json').read_text())
if report.get('version',release.name) != release.name or report['errors'] or {r['device'] for r in report['report']}!={'desktop','mobile'}:
    raise ValueError('请先在当前版本运行桌面与窄屏验收')
work=dist/case
def copy_screening(source,target):
    shutil.copytree(source,target,dirs_exist_ok=True)
    for legacy in ('wood.jpg','window-view.jpg','textures/supper.webp'):
        if not (source/legacy).is_file():
            (target/legacy).unlink(missing_ok=True)
copy_screening(release,work)
(work/'stills').mkdir(exist_ok=True)
for source,name in [(work/'photo.jpg','pot'),(qa/'desktop-clean-cutaway.jpg','room'),(qa/'desktop-clean-seated.jpg','seat')]:
    with Image.open(source) as im:
        im.thumbnail((800,650));im.save(work/'stills'/(name+'.webp'),quality=85,method=5)
if args.portable:
    target=args.portable.resolve();target.mkdir(parents=True,exist_ok=True)
    copy_screening(work,target/case)
    shutil.copytree(dist/'i18n',target/'i18n',dirs_exist_ok=True)
    cinema=target/'cinema';cinema.mkdir(exist_ok=True)
    for name in ('album.css','album.js'):shutil.copyfile(dist/'cinema'/name,cinema/name)
    (cinema/'album-art').mkdir(exist_ok=True)
    for name in ('paper-grain.webp','projection-booth.webp'):
        shutil.copyfile(dist/'cinema/album-art'/name,cinema/'album-art'/name)
    catalog=json.loads((dist/'catalog/works.json').read_text())
    catalog['works']=[work for work in catalog['works'] if work['id']==case]
    if len(catalog['works']) != 1:
        raise ValueError(f'作品目录缺少 {case}')
    (target/'catalog').mkdir(exist_ok=True)
    (target/'catalog/works.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    shutil.copyfile(dist/'index.html',target/'index.html')
print(work)
