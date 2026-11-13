"""Install a tested cassette screening and its matching photographic prints."""
import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image

case = Path(__file__).resolve().parent
app = case.parents[1]
sys.path.insert(0, str(app / 'pipeline'))
from release_files import check_version

cli = argparse.ArgumentParser(description=__doc__)
cli.add_argument('--project', type=Path, default=app/'evidence/universes'/case.name)
project = cli.parse_args().project
release = project / json.loads((project/'release.json').read_text())['path']
check_version(release)
qa = project/'qa'/release.name
report = json.loads((qa/'report.json').read_text())
if (report['version'] != release.name or report['errors']
        or {entry['device'] for entry in report['report']} != {'desktop', 'mobile'}):
    raise ValueError('请先完成当前穿窗版本的桌面和触控验收')

work = app/'dist'/case.name
with tempfile.TemporaryDirectory(dir=work.parent) as temp:
    stage = Path(temp)/'screening'
    shutil.copytree(release, stage)
    stills = stage/'stills'
    stills.mkdir()
    for name in ('desk', 'cassette', 'studio', 'court'):
        source = release/'photo.jpg' if name == 'desk' else qa/f'album-{name}.png'
        with Image.open(source) as image:
            image.thumbnail((1024, 800), Image.Resampling.LANCZOS)
            image.convert('RGB').save(stills/f'{name}.webp', quality=89, method=6)
    previous = Path(temp)/'previous'
    if work.exists():
        work.rename(previous)
    try:
        stage.rename(work)
    except OSError:
        if previous.exists():
            previous.rename(work)
        raise
print(work)
