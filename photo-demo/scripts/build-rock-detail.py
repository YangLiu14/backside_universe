"""Pack the three CC0 Rock Face maps into one locally served walking detail tile."""
import hashlib
import subprocess
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

base = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_face/"
maps = {"diff": "220c637db6056b45e7c0a17e6ed8514e",
        "disp": "d62dbfc8ac05ec72c2b66f862028c03c",
        "rough": "9c0ebb95db6ce5ec16abca0899e506a2"}
output = Path(__file__).resolve().parents[1] / "dist/assets/coastal-rock-detail.jpg"

with tempfile.TemporaryDirectory() as temp:
    rgb = bytearray(1024 * 1024 * 3)
    for channel, (kind, expected) in enumerate(maps.items()):
        filename = f"rock_face_{kind}_1k.jpg"
        with urlopen(Request(base + filename, headers={"User-Agent": "BacksideUniverse asset builder"}), timeout=40) as response:
            jpg = response.read()
        if hashlib.md5(jpg).hexdigest() != expected:
            raise ValueError("Source map has changed: " + filename)
        path = Path(temp) / filename
        path.write_bytes(jpg)
        gray = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-vf", "scale=1024:1024",
                                       "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", "-"])
        # Recenter the scan so that it adds relief without changing the
        # underlying rock's authored colour or average roughness at a distance.
        mid = sum(gray) / len(gray)
        lut = bytes(max(0, min(255, round(128 + i - mid))) for i in range(256))
        rgb[channel::3] = gray.translate(lut)
    packed = Path(temp) / "rock.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1024x1024",
                    "-i", "-", "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "3",
                    "-pix_fmt", "yuvj444p", str(packed)], input=rgb, check=True)
    output.write_bytes(packed.read_bytes())
