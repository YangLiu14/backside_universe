#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

# Isolated environment; no sudo, driver changes, or global package installation.
python3 - <<'PY'
import sys
if not (3, 10) <= sys.version_info[:2] < (3, 14):
    raise SystemExit('Use Python 3.10–3.13 for the pinned PyTorch 2.9 wheels.')
PY
nvidia-smi
python3 -m venv --without-pip .venv
if ! .venv/bin/python -m pip --version > /dev/null 2>&1; then
  curl -L --fail --retry 2 --connect-timeout 20 'https://bootstrap.pypa.io/get-pip.py' -o get-pip.py
  .venv/bin/python get-pip.py
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch==2.9.0 torchvision==0.24.0 --index-url https://download.pytorch.org/whl/cu128
# This exact xformers release is published on PyPI, not the cu128 index.
if [ -f wheels/xformers-0.0.33.post1-cp39-abi3-manylinux_2_28_x86_64.whl ]; then
  printf '%s\n' 'a8d72c6272453450eede2ed9aaa14448e6525569e14217573057ded146090db3  wheels/xformers-0.0.33.post1-cp39-abi3-manylinux_2_28_x86_64.whl' | sha256sum --check
  .venv/bin/python -m pip install --no-index --no-deps wheels/xformers-0.0.33.post1-cp39-abi3-manylinux_2_28_x86_64.whl
else
  .venv/bin/python -m pip install xformers==0.0.33.post1 --index-url https://pypi.org/simple
fi
.venv/bin/python -m pip install -r requirements-inference.txt --index-url "${INFINISPLAT_PACKAGE_INDEX:-https://pypi.org/simple}" --report dependency-install.json

if [ ! -d source ]; then
  if [ ! -f source.tar.gz ]; then
    curl -L --fail --retry 2 'https://codeload.github.com/zju3dv/InfiniSplat/tar.gz/be49948e92f828054d98103cd98578fada8ec728' -o source.tar.gz
  fi
  printf '%s\n' '87f31ef12127e55a30714c6b8642e80ae0b95f4870925539e8a0f9193fd92fea  source.tar.gz' | sha256sum --check
  tar -xzf source.tar.gz
  mv InfiniSplat-be49948e92f828054d98103cd98578fada8ec728 source
fi
mkdir -p checkpoints
if [ ! -f checkpoints/infinisplat_rgb.ckpt ]; then
  curl -L --fail --retry 2 'https://huggingface.co/PLUS-WAVE/InfiniSplat/resolve/455dc3f21f3b2ddba37df65443112882fc6016d2/checkpoints/infinisplat_rgb.ckpt?download=true' -o checkpoints/infinisplat_rgb.ckpt.part
  .venv/bin/python - <<'PY'
from pathlib import Path
import hashlib
p = Path('checkpoints/infinisplat_rgb.ckpt.part')
with p.open('rb') as f:
    actual = hashlib.file_digest(f, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else None
if actual is None:
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''): h.update(block)
    actual = h.hexdigest()
assert actual == 'd68a8c99109f06a264567766bd52d8d9ba81e51d044d0a966c3336160ea7007d', actual
p.rename(p.with_suffix(''))
PY
fi
.venv/bin/python - <<'PY'
import torch
assert torch.cuda.is_available(), 'CUDA is unavailable; check the existing NVIDIA driver.'
p = torch.cuda.get_device_properties(0)
print(f'Ready: {p.name}, {p.total_memory / 2**30:.1f} GiB VRAM, torch {torch.__version__}')
PY
