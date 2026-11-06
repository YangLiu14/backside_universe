"""Export just the opened cavern at desktop viewing distance.

blender -b -t 4 --python-exit-code 1 -P scripts/build-grotto-overview.py
"""
from pathlib import Path

import bpy

assets = Path(__file__).resolve().parents[1] / "dist/holiday-assets/assets"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(assets / "bookroom/shell-grotto-v6.glb"), merge_vertices=True)
cavern = bpy.data.objects["tripo-unified-grotto-bookhouse-harbor"]
bpy.ops.object.select_all(action="DESELECT")
cavern.select_set(True)
bpy.context.view_layer.objects.active = cavern
modifier = cavern.modifiers.new("Desk overview", "DECIMATE")
modifier.ratio = min(1, 130000 / len(cavern.data.polygons))
bpy.ops.object.modifier_apply(modifier=modifier.name)
cavern.data.polygons.foreach_set("use_smooth", [True] * len(cavern.data.polygons))
for material in cavern.data.materials:
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image and max(node.image.size) > 2048:
            node.image.scale(2048, 2048)
            node.image.pack()
output = assets / "laptop/desktop-grotto.glb"
bpy.ops.export_scene.gltf(filepath=str(output), use_selection=True, export_format="GLB",
    export_image_format="JPEG", export_jpeg_quality=88, export_animations=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_texcoord_quantization=14)
print(f"{output.name}: {len(cavern.data.polygons)} faces, {output.stat().st_size} bytes")
