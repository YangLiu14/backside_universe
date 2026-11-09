"""Resize images embedded in gallery GLBs in place."""
import sys
from pathlib import Path

from glb_textures import resize


if __name__ == "__main__":
    for item in sys.argv[1:]:
        resize(Path(item))
