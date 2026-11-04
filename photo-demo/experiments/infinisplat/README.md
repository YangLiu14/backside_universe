# InfiniSplat v1: independent desk-photo trial

Status: **both CUDA runs completed and browser-verified on 2026-11-04**. The user confirmed personal
technical evaluation on 2026-11-03. This use is exempt from PRL project
registration. Future organizational product development/testing requires
registration; see `../../evidence/infinisplat-v1-license.md`.

The original demo and BLUNT + DA3 Gaussian lab are preserved. No InfiniSplat
page is presented as a result until a real, checksum-verified PLY is imported.

## Runtime

Use the user's Ubuntu RTX 3090 as an inference worker, while the Mac continues
to serve and view the demo. No desktop migration is needed. Do not modify
drivers or install global Python packages. The setup creates `.venv/` locally. Ubuntu without `ensurepip` is supported
with an isolated PyPA pip bootstrap; no apt installation is required.

Official sources:

- [InfiniSplat v1 install](https://github.com/zju3dv/InfiniSplat/blob/be49948e92f828054d98103cd98578fada8ec728/InfiniSplat_v1/INSTALL.md):
  PyTorch 2.9.0, torchvision 0.24.0, xformers 0.0.33.post1, CUDA 12.8 wheels.
  The exact xformers wheel is fetched from its official PyPI release, since
  the CUDA 12.8 index does not publish it.
- [Official RGB checkpoint](https://huggingface.co/PLUS-WAVE/InfiniSplat/tree/455dc3f21f3b2ddba37df65443112882fc6016d2):
  3,142,241,921 bytes, SHA256
  `d68a8c99109f06a264567766bd52d8d9ba81e51d044d0a966c3336160ea7007d`.
- Source commit: `be49948e92f828054d98103cd98578fada8ec728`.

On this Mac, source and RGB weights are downloaded and integrity checked.
Inference ran on the user-authorized Ubuntu RTX 3090, without an MPS port.
The first run produced 1,476,727 Gaussians in 1.739 seconds of GPU inference,
peaking at 5.162 GiB allocated GPU memory. Loading/export are excluded.
Results: http://127.0.0.1:9988/infinisplat-lab/index.html. A separately labeled
1168 × 1536 portrait-shape run is at `/infinisplat-portrait-lab/index.html`.
Both remain visibly imperfect at ±12°; see
`../../evidence/infinisplat-lab/findings.md` for screenshots and conclusions.

## Ubuntu commands

Run inside the extracted `infinisplat-desk-trial/` directory:

```sh
bash setup-ubuntu.sh
.venv/bin/python -u run-desk.py 2>&1 | tee inference.log
```

The bundle contains the exact input photograph and `input/camera.json`.
The installer downloads only the RGB checkpoint, not the LiDAR checkpoint.
If the verified checkpoint was copied from the Mac into `checkpoints/`,
the download is skipped; the runner still verifies its full checksum.

The default remains the official 1,500,000 samples, 1536 × 1152 inference
resolution, and default floater filtering. If peak VRAM exceeds availability,
lower **only query chunk size**, e.g. `--query-batch-size 20000`; record this
in the run metadata. Do not reduce the sample count or input resolution silently.
24 GB suitability and actual runtime will be verified on the machine, not assumed.

## Camera and comparison

The source photo is 1320 × 1739. Preserve the complete four-parameter camera
estimate from the DA3 baseline. This is an estimated camera, not physical
calibration. The official model internally resizes the photo; scale the camera
with that resize and render the final result at the original aspect ratio.

The official PLY exporter writes a simplified equal-focal centered camera.
Our adapter restores the full original intrinsics in the exported PLY and JSON;
it does not change Gaussian geometry, color, size, or opacity. Both viewers
use the same normalized pivot anchor `(0.53, 0.455)` at the new scene's inferred
local depth, avoiding arbitrary scale differences in the orbit comparison.

Output includes `desk-gaussian.ply`, `scene.json`, and `environment.txt`.
After transferring `output/` back to this directory on the Mac, from `photo-demo/`:

```sh
python3 scripts/import-infinisplat-result.py experiments/infinisplat/output
GS_LAB_URL=http://127.0.0.1:9988/infinisplat-lab/index.html \
GS_LAB_EVIDENCE=evidence/infinisplat-lab node scripts/check-gaussian-lab.cjs
```

This creates a separate `/infinisplat-lab/index.html`, reusing the same renderer
and controls as the previous lab. Inspect 0°, ±6°, ±12° and all four crops,
checking source alignment, laptop/arm-lamp/chair silhouettes, newly exposed
background, and deterministic reverse dragging. Any existing artifacts remain
visible: no photo overlay, inpainting, or blur is added to hide failures.

No genuine alternate views are available as ground truth. Source-view MAE and
alpha coverage are diagnostics, not proof of correct hidden geometry. Learned
Gaussians do not guarantee reconstruction of the back of the room, and this
trial makes no 180-degree claim.
