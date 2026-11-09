"""Export the scene stills used by the interface proposals and the screening album."""
from pathlib import Path
from random import Random

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist/style-study/stills"
EVIDENCE = ROOT / "evidence"
ALBUM = ROOT / "dist/cinema/album-art"
CONTACT_FRAMES = {"harbor", "canyon", "heart", "kidney"}

# Crop the recorded stage to remove controls from the previous interface.
ISLANDS = {
    "islands": ("desk-explore/overview.png", (136, 47, 1000, 374)),
    "harbor": ("harbor-waterline/after-cup.png", (210, 65, 1020, 415)),
    "cliff": ("island-stories/desktop-blue-book.jpg", (138, 23, 1100, 492)),
    "canyon": ("island-stories/desktop-orange-book.jpg", (122, 15, 1185, 500)),
    "port": ("desk-explore/phone.png", (160, 56, 1060, 363)),
    "cave": ("desk-explore/cave.png", (145, 50, 1005, 375)),
}


def export(name, source, crop):
    with Image.open(EVIDENCE / source) as image:
        still = image.convert("RGB").crop(crop)
        still.save(OUTPUT / f"{name}.webp", quality=88, method=6)
        if name in CONTACT_FRAMES:
            frame = ImageOps.fit(still, (248, 136), method=Image.Resampling.LANCZOS)
            frame.save(ALBUM / f"{name}.webp", quality=79, method=6)
        elif name in {"islands", "overview"}:
            still.thumbnail((800, 800), Image.Resampling.LANCZOS)
            still.save(ALBUM / f"{name}.webp", quality=83, method=6)


def album_prints():
    for name, source in [("desk", "assets/desk-original.jpg"), ("dog", "canine-museum/assets/original.jpg")]:
        with Image.open(ROOT / "dist" / source) as image:
            frame = ImageOps.fit(ImageOps.exif_transpose(image), (800, 800), method=Image.Resampling.LANCZOS)
            frame.save(ALBUM / f"{name}.webp", quality=82, method=6)

    # Small, seamless transparent grain over the paper colour of each page.
    random = Random(14)
    grain = Image.new("RGBA", (96, 96))
    grain.putdata([(75, 59, 36, random.randrange(15)) for _ in range(96 * 96)])
    grain.save(ALBUM / "paper-grain.webp", lossless=True)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ALBUM.mkdir(parents=True, exist_ok=True)
    album_prints()
    for name, (source, crop) in ISLANDS.items():
        export(name, source, crop)
    for name in ["overview", "heart", "lungs", "liver", "stomach", "kidney", "gut"]:
        frame = "overview" if name == "overview" else f"{name}-near"
        export(name, f"canine-production/hi3d-organs/{frame}.jpg", (90, 15, 944, 661))
