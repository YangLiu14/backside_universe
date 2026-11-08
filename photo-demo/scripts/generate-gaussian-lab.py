#!/usr/bin/env python3
"""Local, permissively licensed depth-derived Gaussian baseline, no inpainting.

Uses the official DA3-BASE weights and BLUNT's MIT converter. This does not use
DA3's learned Gaussian head, SHARP, or an occlusion-completion network.
See experiments/gaussian/README.md for pinned source setup and reproduction.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXP = ROOT / 'experiments/gaussian'
DA3_COMMIT = '3d835ec1a5802d64a8b8b15f817a1ab54809bfe4'
MODEL = 'depth-anything/DA3-BASE'
MODEL_REVISION = 'f4a6c9b3c95e41c82048423d3493a81ec3fa810e'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='mps', choices=['mps', 'cpu', 'cuda'])
    parser.add_argument('--process-res', type=int, default=756)
    parser.add_argument('--output-res', type=int, default=1008)
    parser.add_argument('--overlap', type=float, default=.8)
    parser.add_argument('--edge-mode', choices=['original', 'nearest', 'segmented'], default='segmented')
    parser.add_argument('--reuse-depth', action='store_true')
    parser.add_argument('--photo', type=Path, help='New case: source photo; requires a separate output and cache directory.')
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--cache-dir', type=Path)
    parser.add_argument('--pivot-uv', type=float, nargs=2, default=(.53,.455))
    args = parser.parse_args()
    if args.photo and (not args.output_dir or not args.cache_dir or args.edge_mode == 'segmented'):
        parser.error('New photos require --output-dir, --cache-dir, and --edge-mode nearest or original (desk masks are desk-specific).')
    if not all(0 < a < 1 for a in args.pivot_uv): parser.error('pivot must be inside the photo')
    sys.path.insert(0, str(EXP / 'da3-source/src'))
    import cv2
    import numpy as np
    import torch
    from PIL import Image

    image_path = args.photo or ROOT / 'dist/assets/desk-original.jpg'
    source_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()
    destination = args.output_dir or ROOT / 'dist/gs-lab/assets'
    if args.photo:
        previous = destination / 'scene.json'
        if destination.resolve() == (ROOT / 'dist/gs-lab/assets').resolve():
            parser.error('Use a separate output directory for a new photo; the desk baseline is reserved.')
        if previous.exists() and json.loads(previous.read_text()).get('source_sha256') != source_hash:
            parser.error('Output already belongs to another photograph. Choose a separate case directory.')
        previous_run = args.cache_dir / 'source-da3-base.json'
        if previous_run.exists() and json.loads(previous_run.read_text()).get('source_sha256') != source_hash:
            parser.error('Depth cache already belongs to another photograph.')
    original = Image.open(image_path).convert('RGB')
    cache_dir = args.cache_dir or EXP
    cache_dir.mkdir(exist_ok=True, parents=True)
    stem = 'source' if args.photo else 'desk'
    cache_path = cache_dir / f'{stem}-da3-base.npz'
    inference_meta = cache_dir / f'{stem}-da3-base.json'
    if args.reuse_depth:
        cached = np.load(cache_path)
        depth, K = cached['depth'], cached['intrinsics']
        run = json.loads(inference_meta.read_text())
        assert run['source_sha256'] == source_hash, 'Cache belongs to another image'
    else:
        from huggingface_hub import snapshot_download
        from safetensors.torch import load_model
        from depth_anything_3.cfg import create_object, load_config
        from depth_anything_3.registry import MODEL_REGISTRY
        from depth_anything_3.utils.io.input_processor import InputProcessor

        revision = MODEL_REVISION
        model_dir = Path(snapshot_download(MODEL, revision=revision,
                         allow_patterns=['config.json', 'model.safetensors', 'README.md', 'LICENSE*']))
        config = json.loads((model_dir / 'config.json').read_text())
        model = create_object(load_config(MODEL_REGISTRY[config['model_name']]))
        wrapper = torch.nn.Module()
        wrapper.add_module('model', model)
        load_model(wrapper, model_dir / 'model.safetensors', strict=True)
        model = model.to(args.device).eval()
        batch, _, _ = InputProcessor()([original], process_res=args.process_res,
                                       process_res_method='upper_bound_resize', num_workers=1)
        started = time.perf_counter()
        with torch.inference_mode():
            output = model(batch[None].to(args.device).float(), infer_gs=False)
            depth = output['depth'].detach().float().cpu().numpy().squeeze()
            K = output['intrinsics'].detach().float().cpu().numpy().squeeze()
        seconds = time.perf_counter() - started
        assert depth.ndim == 2 and K.shape == (3, 3)
        assert np.isfinite(depth).all() and depth.min() > 0 and np.isfinite(K).all()
        np.savez_compressed(cache_path, depth=depth, intrinsics=K)
        run = dict(model=MODEL, model_revision=revision, model_license='Apache-2.0',
                   source_sha256=source_hash, inference_seconds=seconds, device=args.device,
                   inference_width=depth.shape[1], inference_height=depth.shape[0])
        inference_meta.write_text(json.dumps(run, indent=2))
        print(f'Depth inference: {seconds:.2f}s, {depth.shape}, K={K.tolist()}', flush=True)

    # Keep source framing: resize only, never crop. Gaussian density is separate
    # from network inference resolution, with measured intrinsics scaled to match.
    out_h = args.output_res
    out_w = round(original.width / original.height * out_h)
    dh, dw = depth.shape
    canonical_depth = cv2.resize(depth, (out_w, out_h), interpolation=cv2.INTER_LINEAR)
    pivot_u, pivot_v = out_w * args.pivot_uv[0], out_h * args.pivot_uv[1]
    pivot_depth = float(np.median(canonical_depth[max(0,int(pivot_v)-3):int(pivot_v)+4,max(0,int(pivot_u)-3):int(pivot_u)+4]))
    K = K.copy()
    K[0] *= out_w / dw
    K[1] *= out_h / dh
    depth = cv2.resize(depth, (out_w, out_h), interpolation=cv2.INTER_LINEAR if args.edge_mode == 'original' else cv2.INTER_NEAREST)
    edge_refinement = None
    if args.edge_mode == 'segmented':
        from gaussian_depth_edges import refine_segment_boundaries
        depth, edge_refinement = refine_segment_boundaries(depth, ROOT / 'dist/assets/objects')
    rgb = np.array(original.resize((out_w, out_h), Image.Resampling.LANCZOS))
    spec = importlib.util.spec_from_file_location('blunt', EXP / 'blunt/blunt.py')
    blunt = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(blunt)
    fx, fy, cx, cy = float(K[0, 0]), float(K[1, 1]), float(K[0, 2]), float(K[1, 2])
    focal = (fx + fy) * .5
    gaussians, keep = blunt.depth_to_gaussians(
        rgb, depth, focal, is_metric=True, inpaint=False, return_keep_mask=True,
        overlap_factor=args.overlap, depth_disc_threshold=.1, skip_sky=False, fast_mode=False)
    # BLUNT's is_metric flag means depth rather than disparity here; the model
    # itself is relative-depth. Correct BLUNT's centered/equal-focal assumption.
    yy, xx = np.where(keep)
    if args.edge_mode == 'segmented':
        # BLUNT's median filter ignores instance boundaries. Restore the
        # segment-conditioned samples after its coverage/pruning decision.
        corrected_z = depth[keep].astype(np.float32)
        ratio = corrected_z / gaussians['z']
        for i in range(3):
            gaussians[f'scale_{i}'] += np.log(ratio)
        gaussians['z'] = corrected_z
    z = gaussians['z']
    gaussians['x'] = ((xx - cx) * z / fx).astype(np.float32)
    gaussians['y'] = ((yy - cy) * z / fy).astype(np.float32)
    gaussians['scale_0'] += np.log(focal / fx)
    gaussians['scale_1'] += np.log(focal / fy)
    direction = np.stack([gaussians['x'], gaussians['y'], z], axis=-1)
    direction /= np.linalg.norm(direction, axis=-1, keepdims=True)
    q = np.stack([1 + direction[:, 2], -direction[:, 1], direction[:, 0], np.zeros_like(z)], axis=-1)
    q /= np.linalg.norm(q, axis=-1, keepdims=True)
    for i in range(4):
        gaussians[f'rot_{i}'] = q[:, i].astype(np.float32)
    assert all(np.isfinite(v).all() for v in gaussians.values())
    destination.mkdir(parents=True, exist_ok=True)
    ply_path = destination / f'{stem}-gaussian.ply'
    blunt.write_ply(gaussians, str(ply_path))
    Image.fromarray(rgb).save(destination / 'inference-reference.jpg', quality=95)
    result = dict(**run, generator='BLUNT + complete-intrinsics adapter',
                  representation='depth-derived 3D Gaussian baseline; no learned Gaussian head',
                  code_commit=DA3_COMMIT,
                  blunt_commit=subprocess.check_output(['git', '-C', str(EXP/'blunt'), 'rev-parse', 'HEAD'], text=True).strip(),
                  width=out_w, height=out_h, intrinsics=[fx, fy, cx, cy],
                  gaussian_count=len(z), gaussian_bytes=ply_path.stat().st_size,
                  ply_sha256=hashlib.sha256(ply_path.read_bytes()).hexdigest(),
                  original_width=original.width, original_height=original.height,
                  source_image=os.path.relpath(image_path.resolve(), destination.resolve()),
                  gaussian_file=ply_path.name,
                  coordinate_system='OpenCV: x right, y down, z forward; source camera at origin',
                  units='relative model units, not surveyed meters',
                  pivot_opencv=[(pivot_u-cx)*pivot_depth/fx,(pivot_v-cy)*pivot_depth/fy,pivot_depth],
                  depth_range=[float(z.min()), float(z.max())],
                  inpainting=False, normalization=False, gaussian_head=False,
                  overlap_factor=args.overlap,
                  edge_mode=args.edge_mode,
                  edge_refinement=edge_refinement,
                  limitations=['Single visible surface; no occluded back surfaces recovered.',
                               'Small camera movement exposes missing data and estimated-depth errors.',
                               'Gaussian footprints and source resolution limit sharpness.',
                               'No real additional views exist to validate unseen geometry.'])
    (destination/'scene.json').write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
