"""Install the tested running-shoe film and its photographed album stills."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

from PIL import Image

case = Path(__file__).resolve().parent
app = case.parents[1]
sys.path.insert(0, str(app / "pipeline"))
from art_review import packet
from release_files import check_version

cli = argparse.ArgumentParser(description=__doc__)
cli.add_argument("--project", type=Path, default=app / "evidence/universes/sole-city")
project = cli.parse_args().project.resolve()
release = project / json.loads((project / "release.json").read_text())["path"]
check_version(release)
qa = project / "qa" / release.name
receipt = json.loads((qa / "report.json").read_text())
if (receipt["version"] != release.name or receipt["errors"]
        or {row["device"] for row in receipt["report"]} != {"desktop", "mobile"}):
    raise ValueError("先完成当前跑鞋版本的桌面和触控验收")
if packet(project)["next"] != "reviewed":
    raise ValueError("先复核当前版本的鞋底、街区和路面画面")

work = app / "dist/sole-city"
with tempfile.TemporaryDirectory(dir=work.parent) as temporary:
    stage = Path(temporary) / "screening"
    shutil.copytree(release, stage)
    stills = stage / "stills"
    stills.mkdir()
    sources = {
        "shoes": release / "photo.jpg",
        "sole": qa / "album-sole-city.png",
        "street": qa / "album-street-end.png",
        "breakfast": qa / "album-soy-milk.png",
    }
    for name, source in sources.items():
        with Image.open(source) as image:
            image.thumbnail((1100, 850), Image.Resampling.LANCZOS)
            image.convert("RGB").save(stills / (name + ".webp"), quality=90, method=6)
    previous = Path(temporary) / "previous"
    if work.exists():
        work.rename(previous)
    try:
        stage.rename(work)
    except OSError:
        if previous.exists():
            previous.rename(work)
        raise
print(work)
