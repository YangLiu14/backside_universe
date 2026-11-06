"""Build desktop GLBs in their original registered coordinates.

    blender -b -t 4 --python-exit-code 1 -P scripts/build-desktop-islands.py -- --hd
    blender -b -t 4 -P scripts/build-desktop-islands.py -- --legacy orange-book  # fallback assets
"""
import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from register_hd_paper import register_paper

project = Path(__file__).resolve().parents[1]
web = project / "dist"
evidence = project / "evidence"
gallery = web / "holiday-assets/assets"
islands = ("blue-book", "orange-book", "phone")
sources = {
    island: (evidence / "holiday-assets-v1" / island / "unified-v2/source.glb",
             gallery / island / "desktop-visit.glb")
    for island in islands
}
for name in ("holiday-island", "lamp", "chair", "note"):
    sources[name] = (evidence / f"{name}-hi3d-original.glb", web / "assets" / f"{name}-hd.glb")
for name in ("chair", "desk", "bookcase"):
    folder = evidence / "holiday-assets-v1/laptop/bookroom" / name
    sources[f"bookroom-{name}"] = (folder, gallery / "bookroom" / f"{name}-hd.glb")

parser = argparse.ArgumentParser()
quality = parser.add_mutually_exclusive_group()
quality.add_argument("--hd", "--visit", action="store_true", dest="hd")
quality.add_argument("--legacy", action="store_false", dest="hd")
parser.set_defaults(hd=True)
parser.add_argument("assets", nargs="*")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
for asset in args.assets or (sources if args.hd else islands):
    if args.hd:
        if asset not in sources:
            parser.error(f"Unknown HD asset: {asset}")
        source, output = sources[asset]
        if asset.startswith("bookroom-"):
            source, = source.glob("tripo-out/*/model.glb")
        levels = [(output, 320000, 4096)]
    else:
        if asset not in islands:
            parser.error(f"Unknown island: {asset}")
        folder = gallery / asset
        source = folder / "model-unified-v2.glb"
        levels = [(folder / "desktop-near.glb", 42000, 1024), (folder / "desktop-far.glb", 8500, 512)]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)
    obj, = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.context.view_layer.objects.active = obj
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
    for path, triangles, resolution in levels:
        modifier = obj.modifiers.new("Desktop mesh budget", "DECIMATE")
        modifier.ratio = min(1, triangles / len(obj.data.polygons))
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        if asset == "note":
            register_paper(obj, web)
        for image in bpy.data.images:
            limit = resolution
            if args.hd and asset in islands:
                if "_normal" in image.name:
                    limit = 2048
                elif "_rm." in image.name:
                    limit = 1024
            if image.type == "IMAGE" and max(image.size) > limit:
                factor = limit / max(image.size)
                image.scale(max(1, round(image.size[0]*factor)), max(1, round(image.size[1]*factor)))
                image.pack()
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
            export_image_format="JPEG", export_jpeg_quality=94 if args.hd else 86, export_animations=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14, export_draco_texcoord_quantization=14 if args.hd else 12)
        print(json.dumps({"asset": asset, "file": path.name, "faces": len(obj.data.polygons),
                          "bytes": path.stat().st_size}), flush=True)
