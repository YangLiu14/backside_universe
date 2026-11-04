#!/usr/bin/env python3
"""Official InfiniSplat v1 RGB inference + full-camera lab export.

No source patches, new-view synthesis, photo overlays, or post-hoc hole filling.
Inputs are bundled separately. Run on CUDA after setup-ubuntu.sh.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
CODE_COMMIT = 'be49948e92f828054d98103cd98578fada8ec728'
MODEL_REVISION = '455dc3f21f3b2ddba37df65443112882fc6016d2'
MODEL_SHA = 'd68a8c99109f06a264567766bd52d8d9ba81e51d044d0a966c3336160ea7007d'
PHOTO_SHA = 'a5a2ad89c596347fb97f38b9741b2d5e831f657cefa33b4150d7709c8d9365a0'


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=HERE / 'input/desk-original.jpg')
    parser.add_argument('--camera', type=Path, default=HERE / 'input/camera.json')
    parser.add_argument('--output', type=Path, default=HERE / 'output')
    parser.add_argument('--checkpoint', type=Path, default=HERE / 'checkpoints/infinisplat_rgb.ckpt')
    parser.add_argument('--source', type=Path, default=HERE / 'source/InfiniSplat_v1')
    parser.add_argument('--query-batch-size', type=int, default=80000,
                        help='Only lower if VRAM requires it; keeps the full 1.5M sample budget.')
    parser.add_argument('--inference-size', nargs=2, type=int, metavar=('WIDTH', 'HEIGHT'),
                        help='Explicit shape experiment; default uses official 1536 × 1152. Each dimension must be a multiple of 16.')
    args = parser.parse_args()
    if not 1 <= args.query_batch_size <= 80000:
        parser.error('Query batch size must be in [1, 80000].')
    if args.inference_size and any(n < 256 or n > 2048 or n % 16 for n in args.inference_size):
        parser.error('Inference dimensions must be multiples of 16 between 256 and 2048.')
    if (args.output / 'scene.json').exists():
        parser.error('Output already contains a result; choose a new --output directory.')
    assert sha256(args.input) == PHOTO_SHA, 'Unexpected input photograph'
    assert sha256(args.checkpoint) == MODEL_SHA, 'Checkpoint integrity check failed'
    if not (args.source / 'src/demo/infer_single_image.py').is_file():
        parser.error('Missing official source checkout. Run setup-ubuntu.sh first.')

    import numpy as np
    import torch
    if not torch.cuda.is_available():
        raise SystemExit('This trial uses the official CUDA path. No MPS/CPU fallback is applied.')
    torch.manual_seed(20261103)
    np.random.seed(20261103)
    sys.path.insert(0, str(args.source.resolve()))
    from src.demo.infer_single_image import (
        load_demo_config, load_demo_encoder, load_demo_image_bundle,
        run_single_image_inference, filter_final_gaussian_floaters,
    )
    from src.utils.gaussians import save_ply
    if args.inference_size:
        import src.demo.infer_single_image as demo
        demo.INFERENCE_WIDTH, demo.INFERENCE_HEIGHT = args.inference_size

    device = torch.device('cuda')
    cfg = load_demo_config('infinisplat_hypersim_rgb')
    cfg.model.encoder.implicit_gs_query_batch_size = args.query_batch_size
    bundle = load_demo_image_bundle(image_path=args.input, intrinsics_override_path=args.camera)
    print('Loading official RGB checkpoint…', flush=True)
    encoder = load_demo_encoder(cfg, args.checkpoint, device)
    torch.cuda.synchronize()
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    print(f'Inferring scene at {bundle.inference_image.shape[-1]} × {bundle.inference_image.shape[-2]} resolution…', flush=True)
    prediction = run_single_image_inference(
        encoder, bundle.inference_image, bundle.inference_intrinsics.intrinsics_px, device,
    )
    torch.cuda.synchronize()
    inference_seconds = time.perf_counter() - started
    peak_bytes = torch.cuda.max_memory_allocated()
    raw = prediction['gaussians']
    raw_count = int(raw.mean_vectors.shape[1])
    print(f'Predicted {raw_count:,} Gaussians in {inference_seconds:.2f}s. Filtering/exporting…', flush=True)
    filtered = filter_final_gaussian_floaters(raw).to('cpu')
    xyz = filtered.mean_vectors[0].detach().float().numpy()
    opacity = filtered.opacities[0].detach().float().numpy()
    if not np.isfinite(xyz).all():
        raise RuntimeError('Non-finite Gaussian centers')
    height, width = bundle.original_image_shape
    K = bundle.original_intrinsics.intrinsics_px.detach().cpu().numpy()
    # Both experiments use the same source camera and the same projected pivot
    # anchor. Their estimated depth scales differ; use the new local depth here.
    with args.camera.open() as f:
        camera_spec = json.load(f)
    anchor = np.array(camera_spec['orbit_anchor_uv'], dtype=np.float64)
    uv = xyz[:, :2] / np.maximum(xyz[:, 2:3], 1e-8)
    uv = (uv * np.array([K[0, 0], K[1, 1]]) + np.array([K[0, 2], K[1, 2]])) / [width, height]
    mask = (np.linalg.norm(uv - anchor, axis=1) < .015) & (xyz[:, 2] > 0) & (opacity > .1)
    if int(mask.sum()) < 8:
        raise RuntimeError('Insufficient surface support at the shared orbit anchor')
    depth = float(np.median(xyz[mask, 2]))
    pivot = [float((anchor[0] * width - K[0, 2]) / K[0, 0] * depth),
             float((anchor[1] * height - K[1, 2]) / K[1, 1] * depth), depth]

    args.output.mkdir(parents=True, exist_ok=True)
    ply_path = args.output / 'desk-gaussian.ply'
    ply = save_ply(filtered, float(K[0, 0]), (height, width), ply_path)
    # Official exporter assumes fx=fy and centered principal point. Preserve all
    # 4 camera parameters for this portrait photograph in PLY and viewer metadata.
    ply['intrinsic'].data['intrinsic'][:] = K.flatten()
    ply.write(ply_path)
    meta = {
        'model': 'PLUS-WAVE/InfiniSplat · RGB v1', 'model_revision': MODEL_REVISION,
        'model_sha256': MODEL_SHA, 'code_commit': CODE_COMMIT,
        'model_license': 'Apache-2.0; upstream notices retained',
        'code_license': 'PRL; this run is personal evaluation',
        'source_sha256': PHOTO_SHA, 'source_image': '../../assets/desk-original.jpg',
        'generator': 'InfiniSplat v1 RGB official encoder',
        'representation': 'learned surface-aligned 3D Gaussians', 'gaussian_head': True,
        'width': width, 'height': height, 'original_width': width, 'original_height': height,
        'inference_width': int(bundle.inference_image.shape[-1]),
        'inference_height': int(bundle.inference_image.shape[-2]),
        'inference_shape_policy': 'explicit aspect-ratio experiment' if args.inference_size else 'official default',
        'intrinsics': [float(K[0, 0]), float(K[1, 1]), float(K[0, 2]), float(K[1, 2])],
        'intrinsics_source': 'DA3 baseline estimate, shared for controlled comparison; not calibrated ground truth',
        'inference_intrinsics': bundle.inference_intrinsics.intrinsics_px.tolist(),
        'pivot_opencv': pivot, 'orbit_anchor_uv': anchor.tolist(),
        'coordinate_system': 'OpenCV: x right, y down, z forward; source camera at origin',
        'units': 'Depth Pro predicted metric scale; not surveyed ground truth',
        'depth_range': np.quantile(xyz[:, 2], [.01, .99]).tolist(),
        'gaussian_count': int(xyz.shape[0]), 'raw_gaussian_count': raw_count,
        'gaussian_bytes': ply_path.stat().st_size, 'ply_sha256': sha256(ply_path),
        'inference_seconds': inference_seconds, 'device': torch.cuda.get_device_name(0),
        'cuda_version': torch.version.cuda, 'torch_version': torch.__version__,
        'peak_allocated_gpu_bytes': peak_bytes, 'seed': 20261103,
        'query_batch_size': args.query_batch_size, 'floater_filter': 'official default',
        'inpainting': False, 'photo_overlay': False, 'normalization': False,
        'limitations': ['Single photograph; unseen geometry has no ground-truth validation.',
                        'Learned Gaussian parameters do not guarantee occluded-surface completion.',
                        'No 180-degree reconstruction claim.'],
    }
    with (args.output / 'scene.json').open('w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    freeze = subprocess.run([sys.executable, '-m', 'pip', 'freeze'], capture_output=True, text=True, check=True)
    (args.output / 'environment.txt').write_text(freeze.stdout)
    print(json.dumps({'output': str(args.output), 'count': meta['gaussian_count'],
                      'seconds': inference_seconds, 'peak_gpu_gib': peak_bytes / 2**30}), flush=True)


if __name__ == '__main__':
    main()
