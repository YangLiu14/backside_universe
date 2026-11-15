"""Draco transport for an already verified UV-preserving distant scan."""
import sys
import bpy

source, target = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', export_image_format='AUTO',
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=16, export_draco_texcoord_quantization=15,
                          export_draco_normal_quantization=12)
