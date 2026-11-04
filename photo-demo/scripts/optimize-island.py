"""Build the browser GLB from the untouched Hi3D download.

Run with: blender -b -t 6 --python scripts/optimize-island.py -- /path/to/source.glb
"""

import json
import sys
from pathlib import Path

import bpy


source = Path(sys.argv[sys.argv.index("--") + 1]).resolve(strict=True)
output = Path(__file__).resolve().parents[1] / "dist/assets/holiday-island.glb"
if source == output:
    raise ValueError("Use the downloaded source GLB as input")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
faces_before = sum(len(obj.data.polygons) for obj in meshes)
if not faces_before:
    raise ValueError("The Hi3D download contains no mesh faces")

ratio = min(1, 180_000 / faces_before)
for obj in meshes:
    # Hi3D omits explicit normals. Keep neighboring triangles smooth rather
    # than exporting a separate flat-shaded vertex at every face corner.
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
    if ratio == 1 or len(obj.data.polygons) < 128:
        continue
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Web mesh reduction", "DECIMATE")
    modifier.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=modifier.name)

for image in bpy.data.images:
    width, height = image.size
    if max(width, height) > 2048:
        scale = 2048 / max(width, height)
        image.scale(max(1, round(width * scale)), max(1, round(height * scale)))

bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    export_image_format="JPEG",
    export_jpeg_quality=91,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)
print(json.dumps({
    "faces_before": faces_before,
    "faces_after": sum(len(obj.data.polygons) for obj in meshes),
    "source_bytes": source.stat().st_size,
    "output_bytes": output.stat().st_size,
}))
