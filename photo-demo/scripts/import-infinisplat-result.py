#!/usr/bin/env python3
"""Import a verified InfiniSplat result into its own local comparison page."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('result', type=Path)
    p.add_argument('--variant', choices=['infinisplat-lab', 'infinisplat-portrait-lab'], default='infinisplat-lab')
    args = p.parse_args()
    source = args.result.resolve()
    meta = json.loads((source / 'scene.json').read_text())
    if meta.get('model_revision') != '455dc3f21f3b2ddba37df65443112882fc6016d2' or not meta.get('gaussian_head'):
        p.error('Expected the pinned InfiniSplat RGB v1 output, not the depth-derived baseline.')
    if meta.get('source_sha256') != digest(ROOT / 'dist/assets/desk-original.jpg'):
        p.error('Result photograph does not match the local reference.')
    if meta.get('ply_sha256') != digest(source / 'desk-gaussian.ply'):
        p.error('Gaussian PLY checksum mismatch.')
    if any(not math.isfinite(x) for x in meta['intrinsics'] + meta['pivot_opencv']):
        p.error('Non-finite camera parameters.')
    if not (meta['intrinsics'][0] > 0 and meta['intrinsics'][1] > 0 and meta['pivot_opencv'][2] > 0):
        p.error('Invalid camera parameters.')
    baseline = ROOT / 'dist/gs-lab'
    target = ROOT / 'dist' / args.variant
    if (target / 'assets/scene.json').exists():
        p.error('An InfiniSplat result already exists; archive it before importing another.')
    (target / 'assets').mkdir(parents=True, exist_ok=True)
    for name in ['desk-gaussian.ply', 'scene.json', 'environment.txt']:
        shutil.copy2(source / name, target / 'assets' / name)
    shutil.copy2(baseline / 'lab.css', target / 'lab.css')
    html = (baseline / 'index.html').read_text()
    html = html.replace('书桌 · Gaussian 验证室', '书桌 · InfiniSplat 对照试验')
    html = html.replace('独立实验 / 01', '独立实验 / 02 · InfiniSplat v1')
    shape_label = '竖幅输入 · 1168 × 1536' if args.variant == 'infinisplat-portrait-lab' else '官方输入 · 1536 × 1152'
    html = html.replace('独立实验 / 02 · InfiniSplat v1', 'InfiniSplat v1 · ' + shape_label)
    html = html.replace('一张书桌，换一个角度。', '换一种方法，再看同一张书桌。')
    html = html.replace('先看真实视差，再决定如何进入背面的世界。', '直接预测 Gaussian 场景，检查绕行时的边缘与遮挡。')
    html = html.replace('02 / Gaussian 场景', '02 / InfiniSplat v1 场景')
    html = html.replace('"./vendor/spark.module.js"', '"../gs-lab/vendor/spark.module.js"')
    html = html.replace('<a href="../">← 背面宇宙</a>', '<a href="../gs-lab/index.html">← 对照：上一版</a>')
    html = html.replace('BLUNT + DA3-BASE · 深度推导的 3DGS。已修正前后景交界处的深度串层，未补全遮挡背景。',
                        'InfiniSplat v1 · 学习型高斯预测。仅有一张照片，背面与被遮挡区域没有真实视角可供验证。')
    html = html.replace('<a href="https://github.com/SonnyC56/blunt">BLUNT · MIT</a> / <a href="https://huggingface.co/depth-anything/DA3-BASE">DA3-BASE · Apache 2.0</a>',
                        '<a href="https://github.com/zju3dv/InfiniSplat/tree/main/InfiniSplat_v1">InfiniSplat v1 · PRL</a> / <a href="https://huggingface.co/PLUS-WAVE/InfiniSplat">官方权重 · Apache 2.0</a>')
    (target / 'index.html').write_text(html)
    js = (baseline / 'lab.js').read_text()
    js = js.replace("${meta.edge_refinement?'边缘修正版 · ':''}", 'InfiniSplat v1 · ')
    js = js.replace('秒深度推理。输出标准 Gaussian PLY，保留相机内参；深度为相对值。',
                    '秒场景推理。使用与基线相同的相机内参；尺度来自深度预测，未经实测标定。')
    (target / 'lab.js').write_text(js)
    (target / 'NOTICE.txt').write_text(
        'InfiniSplat v1 RGB comparison, personal technical evaluation.\n'
        'Source: zju3dv/InfiniSplat, commit be49948e92f828054d98103cd98578fada8ec728 (PRL).\n'
        'Weights: PLUS-WAVE/InfiniSplat, revision 455dc3f21f3b2ddba37df65443112882fc6016d2 (Apache 2.0).\n'
        'Upstream DINOv3 and Depth Pro terms remain applicable.\n'
        'Spark viewer is reused from ../gs-lab/vendor/, see its bundled license.\n'
        'This page has no image overlay, generated background, or depth-of-field hiding holes.\n'
        'Personal evaluation is registration-exempt; future organizational project use requires PRL registration.\n'
    )
    print(f'Imported: http://127.0.0.1:9988/{args.variant}/index.html')


if __name__ == '__main__':
    main()
