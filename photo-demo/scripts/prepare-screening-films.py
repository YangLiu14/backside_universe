"""Encode the two local project recordings for the screening-room previews."""
from pathlib import Path
from subprocess import run

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "dist/style-study/films"
DEST.mkdir(exist_ok=True)


def encode(stem, source, filters, input_opts=()):
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *input_opts,
         "-i", str(source), "-an", "-vf", filters, "-c:v", "libx264",
         "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart",
         str(DEST / f"{stem}.mp4")], check=True)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-i", str(DEST / f"{stem}.mp4"), "-frames:v", "1", "-q:v", "2",
         str(DEST / f"{stem}.jpg")], check=True)


encode("desk", ROOT.parent / "docs/media/desk-to-islands.gif",
       "scale=720:-2", ["-ignore_loop", "1"])
# Remove the original viewer's stage labels at the top and bottom.
encode("canine", ROOT / "dist/canine-museum/assets/hi3d-galleries/museum-tour.mp4",
       "crop=960:610:0:56,scale=800:-2")
