#!/usr/bin/env bash
set -euo pipefail
cd /home/kloping/projects/3DGS/FlashWorld
export CUDA_HOME=/usr/local/cuda-12.8
export PATH="$CUDA_HOME/bin:$PATH"
export CC=/usr/bin/gcc-9 CXX=/usr/bin/g++-9
export TORCH_CUDA_ARCH_LIST=8.6 MAX_JOBS=4
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
export OMP_NUM_THREADS=8 MKL_NUM_THREADS=8
export HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1
exec .venv/bin/python trial/run-trial.py "$@"
