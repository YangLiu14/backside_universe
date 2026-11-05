#!/usr/bin/env bash
set -euo pipefail
cd /home/kloping/projects/3DGS/FlashWorld
export CUDA_HOME=/usr/local/cuda-12.8
export PATH="$CUDA_HOME/bin:$PATH"
export CC=/usr/bin/gcc-9 CXX=/usr/bin/g++-9
export TORCH_CUDA_ARCH_LIST=8.6 MAX_JOBS=4
UV=/home/kloping/.local/bin/uv
# Keep CUDA / PyTorch at the versions used by the official release.
"$UV" pip install --python .venv/bin/python triton==3.2.0 transformers==4.57.0 omegaconf==2.3.0 ninja==1.13.0 numpy==2.2.6 einops==0.8.1 moviepy==1.0.3 opencv-python==4.12.0.88 av==15.1.0 plyfile==1.1.2 ftfy==6.3.1 gradio==5.49.1 accelerate==1.10.1 nanobind==2.9.2 uvicorn==0.37.0 huggingface_hub==0.35.3 jaxtyping rich pandas setuptools wheel packaging imageio-ffmpeg
"$UV" pip install --python .venv/bin/python 'git+https://github.com/huggingface/diffusers.git@447e8322f76efea55d4769cd67c372edbf0715b8'
"$UV" pip install --python .venv/bin/python --no-build-isolation 'git+https://github.com/nerfstudio-project/gsplat.git@32f2a54d21c7ecb135320bb02b136b7407ae5712'
# PLY is the baseline artifact. Optional SPZ is deliberately not required.
"$UV" pip freeze --python .venv/bin/python > trial/environment.txt
.venv/bin/python -c 'import torch,gsplat,transformers,diffusers; print(torch.__version__,torch.version.cuda,torch.cuda.get_device_name()); import app'
