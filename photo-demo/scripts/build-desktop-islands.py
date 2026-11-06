"""Build the two desktop LODs. Run with blender -b -t 4 -P scripts/build-desktop-islands.py [-- blue-book ...]."""
import json
import sys
from pathlib import Path

import bpy

root = Path(__file__).resolve().parents[1] / "dist/holiday-assets/assets"
assets = {"blue-book", "orange-book", "phone"}
selected = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sorted(assets)
for asset in selected:
    if asset not in assets:
        raise ValueError(asset)
    folder = root / asset
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(folder / "model-unified-v2.glb"), merge_vertices=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise ValueError(f"Expected the reviewed single-mesh {asset} exterior")
    obj, = meshes
    bpy.context.view_layer.objects.active = obj
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
    for lod, triangles, resolution in [("near", 42000, 1024), ("far", 8500, 512)]:
        modifier = obj.modifiers.new("Desk viewing distance", "DECIMATE")
        modifier.ratio = min(1, triangles / len(obj.data.polygons))
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for image in bpy.data.images:
            if image.type == "IMAGE" and max(image.size) > resolution:
                image.scale(resolution, resolution)
                image.pack()
        path = folder / f"desktop-{lod}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
            export_image_format="JPEG", export_jpeg_quality=86, export_animations=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14, export_draco_texcoord_quantization=12)
        print(json.dumps({"asset": asset, "lod": lod, "faces": len(obj.data.polygons),
                          "bytes": path.stat().st_size}), flush=True)
