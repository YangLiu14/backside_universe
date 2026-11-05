"""Download pinned weights, avoiding Wan transformer weights overwritten by FlashWorld."""
import json
from pathlib import Path
from huggingface_hub import snapshot_download, hf_hub_download
WAN_REV = 'b8fff7315c768468a5333511427288870b2e9635'
FLASH_REV = '6a8e88c6f88678ac098e4c82675f0aee555d6e5d'
# Two repositories can download concurrently; shard concurrency is limited.
from concurrent.futures import ThreadPoolExecutor

def wan():
 return snapshot_download('Wan-AI/Wan2.2-TI2V-5B-Diffusers', revision=WAN_REV,
  allow_patterns=['vae/*','text_encoder/*','tokenizer/*','scheduler/*','transformer/config.json'], max_workers=3)
def flash():
 return hf_hub_download('imlixinyang/FlashWorld', 'model.ckpt', revision=FLASH_REV)
with ThreadPoolExecutor(max_workers=2) as pool:
 a,b=pool.submit(wan),pool.submit(flash)
 result={'wan_path':a.result(),'checkpoint':b.result(),'wan_revision':WAN_REV,'flash_revision':FLASH_REV}
Path('trial/model-paths.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result),flush=True)
