# Independent Gaussian baseline

Preview: http://127.0.0.1:9988/gs-lab/index.html

The existing demo remains at `/`; no original runtime files are changed.

## Method and limits

The selected path is **BLUNT (MIT) + DA3-BASE (Apache 2.0)**. Depth is predicted
from the supplied photograph, then unprojected into anisotropic 3D Gaussians with
position, quaternion, scales, opacity, and degree-zero SH colors. Spark 2.4.0
(MIT) renders the standard Gaussian PLY. This is a **depth-derived baseline**,
not a pretrained Gaussian prediction or learned occlusion-completion model.

There is one visible surface per image location. No image can verify a hidden
back surface; orbiting reveals gaps and erroneous stretched depth. This test
deliberately disables inpainting, background-photo overlays, and depth of field.
It is not a reconstruction suitable for 180-degree exploration.

The edge revision reuses the existing SAM 2.1 instance masks. Native depth is
upsampled without interpolating across foreground/background, and a 5-pixel
silhouette band takes depths from nearby pixels of the same instance. This
removes many intermediate-depth floating strips, but leaves genuine disoccluded
holes empty. RGB, source camera, and the orbit pivot are unchanged. Mask SHA256s
and the edge processing configuration are recorded with the generated asset.
Use `--edge-mode original` to reproduce the pre-fix conversion or `nearest` to
isolate the upsampling change; default is `segmented`.

The adapter preserves the full predicted `fx, fy, cx, cy`, correcting BLUNT's
default equal-focal, centered-camera assumption. A depth/disparity conversion
flag in BLUNT is named `is_metric`; here it selects a depth-valued input only.
**DA3-BASE output remains relative, not metric.** Gaussian density is 765 × 1008;
depth inference uses 574 × 756. More splats do not create new inferred details.

## Reproduction

Use Python 3.12 in an isolated environment. Install the project's
`requirements-depth.txt` plus `scipy==1.17.1`. This run reused matching packages
from the local uv cache via a venv `.pth`; those cache paths are machine-local.
An ordinary fresh pip installation of the pinned requirements is preferable
for another machine. No system Python packages were changed.

Required sources under this directory:

- `blunt/`: https://github.com/SonnyC56/blunt at
  `b0b8356103dce5871d7b1dad7cec9e68af372096` (MIT).
- `da3-source/`: https://github.com/ByteDance-Seed/Depth-Anything-3 at
  `3d835ec1a5802d64a8b8b15f817a1ab54809bfe4` (Apache 2.0).
- Model: https://huggingface.co/depth-anything/DA3-BASE at
  `f4a6c9b3c95e41c82048423d3493a81ec3fa810e` (Apache 2.0).

From `photo-demo/`:

```sh
experiments/gaussian/.venv/bin/python scripts/generate-gaussian-lab.py --device mps
```

The script saves raw depth and intrinsics in this ignored experiments directory.
To repeat the conversion without another model inference, append `--reuse-depth`.
The model revision, source image SHA, PLY SHA, camera, units, and limitations are
saved to `dist/gs-lab/assets/scene.json`.

The viewer's pinned Spark module and license are vendored locally. PLY download
is local; no photograph or scene is sent to an external inference service.

## Checks

`scripts/check-gaussian-lab.cjs` uses the machine's bundled Playwright/Chromium,
captures full and cropped views at 0°, ±3°, ±6°, ±12°, tests drag/return/pause,
checks reverse camera equality and a mobile viewport, and records source-view
RGB difference. That RGB difference is a display/reprojection diagnostic,
not a novel-view accuracy score. Evidence is stored in `evidence/gs-lab/`.

`evidence/gs-baseline-hashes.json` records all pre-existing `dist/` files so the
old demo can be verified unchanged. Research and rejected candidates are in
`evidence/commercial-single-image-gs.md`.
