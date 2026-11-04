# 本地资产与仓库边界

Git 保存源码、校准参数、小型来源元数据、许可证与文字结论。原照片、分割图、纹理、模型、Gaussian 场景、ML 权重、下载归档和运行环境留在本地或私有备份中。

外层根目录 `.gitignore` 管理共享排除规则，`photo-demo/.gitignore` 补充实验页专属规则。本机文件未删除。旧内层仓库曾跟踪的图片/模型历史已随整个 Git 历史移到项目外备份；外层仅纳入源码快照，没有导入这些历史资产，也没有推送。详见 [迁移记录](GIT_MIGRATION.md)。

## 恢复演示

新克隆只含源码。按 [local-assets.json](local-assets.json) 从可信的私有资产备份，将列出的文件恢复到各自相对于仓库根目录的路径，并核对 SHA256。清单只含路径、大小和哈希，不嵌入图片、模型或下载凭据。

| 本地路径 | 用途 / 来源 |
| --- | --- |
| `dist/assets/desk-original.jpg` | 用户提供的原始照片；须恢复同一输入 |
| `dist/assets/desk-depth*.png` | 主 demo 的深度纹理；对应 `desk-depth.json` |
| `dist/assets/objects/*.png` | SAM 遮罩、裁切和原照材质；对应 `objects/manifest.json` |
| `dist/assets/*-hi3d.glb` | 已授权生成并优化的电脑、椅子、灯和纸页模型 |
| `dist/assets/holiday-*.glb` | 已有度假微缩景观模型 |
| `dist/*-lab/assets/desk-gaussian.ply` | 每个独立实验的 Gaussian 场景；对应各自 `scene.json` |
| `dist/occlusion-lab/assets/desk-clean-plate.png` | 已生成的隐藏桌面/百叶窗底图 |
| `dist/solid-object-lab/assets/objects.json` | 生成的电脑/杯子实体几何；可重新运行拟合脚本生成 |
| `dist/gs-lab/vendor/spark.module.js` | Spark 2.4.0 的压缩 ES module，含大型运行载荷 |

已有 Hi3D 模型应从资产备份恢复；不要为恢复 checkout 重复提交收费生成任务。几何校准 JSON、SAM 提示/来源记录和第三方许可证仍在仓库内。

## Spark 运行依赖

版本固定为 `@sparkjsdev/spark@2.4.0`。本地运行文件等同官方包的 `dist/spark.module.min.js`，重命名为 `spark.module.js`。其 SHA256 为：

```text
a2f01f68dbcd5e060d55348f803e509fc789b97904e01b98763fcf0314351aaf
```

恢复命令（在仓库根目录）：

```sh
mkdir -p .cache/spark dist/gs-lab/vendor
npm pack @sparkjsdev/spark@2.4.0 --pack-destination .cache/spark
tar -xOf .cache/spark/sparkjsdev-spark-2.4.0.tgz package/dist/spark.module.min.js > dist/gs-lab/vendor/spark.module.js
shasum -a 256 dist/gs-lab/vendor/spark.module.js
```

Spark 许可证已保留在 `dist/gs-lab/vendor/SPARK-LICENSE.txt`。Three.js 的现有源码模块及许可证继续被跟踪；新增的大型 Spark 发行包留在本地。

## 按依赖顺序重新生成

完整复现需要匹配的原照片、模型权重和工具环境，不能只运行一个前端构建命令恢复全部资产。

1. 先恢复照片，依照 `scripts/segment-objects.py`、`scripts/segment-tabletop.py`、`scripts/prepare-furniture-inputs.py` 的说明准备 SAM 2.1 与输出遮罩。
2. 主 demo 的深度、材质、家具拟合和 GLB 优化见 [MAIN_DEMO.md](MAIN_DEMO.md)。
3. Gaussian 基线见 [实验 README](../experiments/gaussian/README.md)；InfiniSplat CUDA 路径与固定权重版本见 [实验 README](../experiments/infinisplat/README.md)。生成结果通过 `scripts/import-infinisplat-result.py` 导入。
4. 恢复已有干净底图，运行 `scripts/complete-desk-occlusion.py` 生成遮挡补全场景。
5. 运行 `scripts/build-solid-objects.py` 生成实体小样背景和 `objects.json`。

后两步依赖 NumPy、SciPy、Pillow 和 OpenCV；当前本地环境位于 `experiments/gaussian/.venv/`。Python 环境、上游源码 clone、checkpoint 和 CUDA wheel 均不提交。运行脚本里已有的本机工具路径在新环境中需要调整。

## 提交前检查

```sh
git add <需要提交的源码和文档>
npm run check:repo
git diff --cached --stat
```

`check:repo` 无论从哪个目录启动，都检查整个外层仓库索引里的实际对象：拒绝图片/模型/权重/归档、Git 历史备份、本地环境、实验输出及嵌套仓库 gitlink，且每个文件限制为 2 MiB。不要用强制添加绕过忽略规则。媒体文件与大型依赖通过本地资产备份恢复。
