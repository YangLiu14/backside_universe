# FlashWorld office-photo experiment

Personal research on the user's RTX 3090. See [official-source research](../../../research/flashworld-evaluation.md). Both landscape and portrait CUDA runs completed; see RESULTS.md for measured performance and limitations.

- Server clone: `/home/kloping/projects/3DGS/FlashWorld`
- Source: `424db4487de308a39e5137afbe85e7568a96193f`
- Original image SHA256: `a5a2ad89c596347fb97f38b9741b2d5e831f657cefa33b4150d7709c8d9365a0`
- FlashWorld model: `6a8e88c6f88678ac098e4c82675f0aee555d6e5d`; checkpoint expected SHA256 `610a09a11917ae112ea71f2f42291d5c8f11f54ae501ec14a8740f22da2540bd`.
- Wan model: `b8fff7315c768468a5333511427288870b2e9635`.
- Code Apache-2.0; official FlashWorld model card CC-BY-NC-SA-4.0. This is a personal evaluation, not a commercial-use clearance.

## Reproduce

The scripts run in the existing server clone. They create an isolated `.venv` and a `trial/` directory. No driver, system compiler symlink, or pre-existing environment is changed. `prepare-trial.py` creates `app_trial.py` plus an auditable patch; upstream `app.py` remains untouched.

1. Install Torch 2.6.0 + torchvision 0.21.0 from the official CUDA 12.4 wheel index, then `bash trial/setup-extra.sh`.
2. `HF_HUB_DISABLE_XET=1 uv run --no-project --with huggingface_hub==0.35.3 python trial/download-models.py`.
3. `python3 trial/prepare-trial.py`; copy the original photo and generated input JSON into `trial/input/`.
4. With CUDA environment from `run-server.sh`, run `trial/smoke-render.py` to verify and compile the renderer before measuring inference.
5. `bash trial/run-server.sh --input trial/input/desk-official.json --output trial/output/desk-official`.

`make-input.py` runs locally with Pillow, using the existing InfiniSplat input photograph and DA3 camera estimate. The official default trial uses 24 views, 480 high × 704 wide, four denoising steps, seed 20261105, image index 12, and a −12° to +12° orbit. The source frame is exactly 0°. The arbitrary 2.5-unit radius is a generation control, not a measured distance.

## Explicit adaptations

- `uvicorn==0.37.9` in upstream requirements does not exist in the package index; use 0.37.0. SPZ is optional and omitted for the PLY baseline. SageAttention is optional; first use PyTorch SDPA.
- Skip ~20GB of Wan transformer weights that the FlashWorld checkpoint fully overwrites. Construct from its pinned config with `init_empty_weights(include_buffers=False)`, load the FlashWorld transformer with strict matching, require FP32 checkpoint dtype, and verify no meta parameters/buffers remain. Load checkpoint with `mmap=True`. Decoder retains original strict copy loading.
- Reset the random seed after initialization so changing constructor RNG consumption does not alter generation noise.
- GPU offloading matches the official 24GB combination: text encoding on CPU and transformer off GPU during VAE/decoder stages.
- Generation timing includes text encoding and four-step scene inference; it excludes model loading, download, CUDA compilation, output-view rendering and export. Each is separately recorded when relevant. The first generation remains a cold process and may contain runtime kernel setup.
- Render output views one at a time to bound temporary rendering memory. Keep uncompressed, unpruned official PLY output.
- Exported PLY is in the first trajectory camera frame. `run.json` saves normalized cameras with translation multiplied by `T_norm`, matching the official export, including its `T_norm/(T_norm+0.01)` factor.

The default image is center-cropped from 1320×1739 to `[0,419,1320,1319]`, then resized. Only 51.75% of original height is retained. Compare outputs with `conditioning.png`, not the uncropped original. No true alternate-view ground truth exists.

## Completed runs (2026-11-05)

Both runs succeeded on RTX 3090: default landscape 33.335s and official-UI portrait 31.975s generation, 4,055,040 Gaussians each, 16.027GiB peak allocated / 20.291GiB reserved. Models take another 17.752s / 20.973s to load. See [measured results and visual limitations](RESULTS.md).

Run `standardize-ply.py output/desk-official` (and `desk-portrait`) with NumPy to create the losslessly reordered standard SH PLY. The upstream exporter names all 27 SH values as `f_dc_*`; its original file is retained. Both source and standardized files were checked, every numeric field matches after reordering, and all values are finite. Local `.png`, `.mp4`, and `.ply` assets remain ignored by Git. Server outputs are retained under `trial/output/` as well.
