#!/usr/bin/env python3
"""Estimate local DA3 depth without uploading the source photograph.

Python 3.12. Install requirements-depth.txt into an isolated environment, then:
  git clone https://github.com/ByteDance-Seed/Depth-Anything-3 /tmp/da3
  git -C /tmp/da3 checkout 3d835ec1a5802d64a8b8b15f817a1ab54809bfe4
  python scripts/generate-depth.py --da3-source /tmp/da3

Uses the official core model + official input processor directly. This avoids
importing unrelated CUDA-only 3DGS exporters through the high-level API on Mac.
The checkpoint is loaded strictly; the network and its weights are unmodified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--da3-source", type=Path, required=True)
    parser.add_argument("--input", type=Path, default=Path("dist/assets/desk-original.jpg"))
    parser.add_argument("--output", type=Path, default=Path("dist/assets/desk-depth.png"))
    parser.add_argument("--model", default="depth-anything/DA3-SMALL")
    parser.add_argument("--revision", default=None)
    parser.add_argument("--process-res", type=int, default=1008)
    parser.add_argument("--device", choices=["auto", "mps", "cpu", "cuda"], default="auto")
    args = parser.parse_args()
    sys.path.insert(0, str(args.da3_source.resolve() / "src"))

    import cv2
    import numpy as np
    from PIL import Image
    import torch
    from huggingface_hub import snapshot_download
    from safetensors.torch import load_model
    from depth_anything_3.cfg import create_object, load_config
    from depth_anything_3.registry import MODEL_REGISTRY
    from depth_anything_3.utils.io.input_processor import InputProcessor

    if args.model not in {"depth-anything/DA3-SMALL", "depth-anything/DA3-BASE",
                          "depth-anything/DA3MONO-LARGE", "depth-anything/DA3METRIC-LARGE"}:
        raise ValueError("Select an explicitly verified Apache-2.0 checkpoint.")
    revision = args.revision or ("e08cab65ca0ec38e7826075418411ab90cab4da3"
                                if args.model == "depth-anything/DA3-SMALL" else "main")
    model_dir = Path(snapshot_download(args.model, revision=revision,
                                     allow_patterns=["config.json", "model.safetensors", "README.md", "LICENSE*"]))
    config = json.loads((model_dir / "config.json").read_text())
    model = create_object(load_config(MODEL_REGISTRY[config["model_name"]]))
    # Safetensors stores shared LayerNorm tensors once. load_model restores the
    # existing aliases and still strictly validates every independent parameter.
    wrapper = torch.nn.Module()
    wrapper.add_module("model", model)
    load_model(wrapper, model_dir / "model.safetensors", strict=True)
    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(device).eval()
    image = Image.open(args.input).convert("RGB")
    batch, _, _ = InputProcessor()([image], process_res=args.process_res,
                                  process_res_method="upper_bound_resize", num_workers=1)
    start = time.perf_counter()
    with torch.inference_mode():
        output = model(batch[None].to(device).float(), infer_gs=False)
        depth = output["depth"].detach().float().cpu().numpy().squeeze()
    seconds = time.perf_counter() - start
    if depth.ndim != 2 or not np.isfinite(depth).all() or float(depth.min()) <= 0:
        raise RuntimeError("Model produced invalid depth; refusing to create an asset.")
    native_shape = depth.shape
    depth = cv2.resize(depth, image.size, interpolation=cv2.INTER_CUBIC)
    depth = np.maximum(depth, 1e-6)
    disparity = 1.0 / depth
    low, high = np.percentile(disparity, [1, 99])
    normalized = np.clip((disparity - low) / (high - low), 0, 1)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.rint(normalized * 65535).astype(np.uint16)).save(args.output)
    browser_path = args.output.with_stem(args.output.stem + "-8bit")
    Image.fromarray(np.rint(normalized * 255).astype(np.uint8)).save(browser_path)
    source_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    commit = subprocess.check_output(["git", "-C", str(args.da3_source), "rev-parse", "HEAD"], text=True).strip()
    samples = {name: float(normalized[y, x]) for name, x, y in [
        ("background_blind", 600, 300), ("laptop_screen", 580, 700),
        ("blue_book", 760, 698), ("blue_cup", 798, 736),
        ("lamp_shade", 1110, 615), ("chair", 1050, 1050),
        ("foreground_book", 216, 1510)] if x < image.width and y < image.height}
    metadata = {
        "model": args.model, "model_revision": model_dir.name,
        "model_license": "Apache-2.0", "model_url": "https://huggingface.co/" + args.model,
        "code_repository": "https://github.com/ByteDance-Seed/Depth-Anything-3", "code_commit": commit,
        "source_image": args.input.name, "source_sha256": source_hash,
        "width": image.width, "height": image.height,
        "inference_width": native_shape[1], "inference_height": native_shape[0],
        "device": device, "inference_seconds": round(seconds, 3),
        "primary_file": args.output.name, "primary_bits": 16,
        "browser_file": browser_path.name, "browser_bits": 8,
        "encoding": "normalized inverse depth (disparity); white=near, black=far",
        "texture_color_space": "linear data / THREE.NoColorSpace; do not apply sRGB decoding",
        "orientation": "matches source pixels; top-left origin; no crop or flip",
        "decode": "v=sample/65535 (16-bit) or sample/255 (8-bit); inverse_depth=low+v*(high-low); depth=1/inverse_depth",
        "low": float(low), "high": float(high), "clipped_percentiles": [1, 99],
        "units": "relative model depth, not surveyed meters",
        "samples_normalized": samples,
        "limitations": ["Single-view estimate, not measured geometry or full 3D reconstruction.",
                        "Occluded surfaces are not inpainted or recovered.",
                        "Fine lamp arms, chair mesh, glossy surfaces and depth boundaries may be inaccurate.",
                        "Use restrained camera motion; this asset cannot support faithful 180-degree rotation."],
    }
    args.output.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "device": device, "seconds": seconds,
                      "shape": list(native_shape), "samples": samples}, ensure_ascii=False))


if __name__ == "__main__":
    main()
