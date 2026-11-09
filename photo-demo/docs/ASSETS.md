# 本地资产与仓库边界

Git 保存源码、校准参数、小型来源元数据、许可证、文字结论、README 演示 GIF 与流程图 SVG。原照片、分割图、纹理、模型、Gaussian 场景、ML 权重、下载归档和运行环境留在本地或私有备份中。

外层根目录 `.gitignore` 管理共享排除规则，`photo-demo/.gitignore` 补充实验页专属规则。本机文件未删除。旧内层仓库曾跟踪的图片/模型历史已随整个 Git 历史移到项目外备份；外层仅纳入源码快照，没有导入这些历史资产，也没有推送。详见 [迁移记录](GIT_MIGRATION.md)。

## 恢复演示

新克隆只含源码。按 [local-assets.json](local-assets.json) 从可信的私有资产备份，将列出的文件恢复到各自相对于 `photo-demo/` 的路径，并核对 SHA256。清单只含路径、大小和哈希，不嵌入图片、模型或下载凭据。下表中的路径也相对于 `photo-demo/`。

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

## 高清群岛与书屋

从私有备份恢复高清 GLB 时，核对清单中的 `dist/assets/*-hd.glb`、三座岛各自的 `desktop-visit.glb`，以及 `bookroom/*-hd.glb` 和 `bookroom/shell-grotto-v6.glb`。另有 `desktop-near.glb` 和 `laptop/desktop-grotto.glb` 供加载失败时回退。

从原模重建时，恢复 `evidence/` 下的 Hi3D 原件、三岛的 Tripo 原件和书屋家具原件，再从 `photo-demo/` 运行高清构建脚本。更换书桌模型后，在本地服务运行时重新采样弯曲书页，并用校验命令确认照片与新桌面吻合。[构建与验证命令](DEVELOPMENT.md#检查)

五座岛共用一张 1K 岩石近景细节图。可在 `photo-demo/` 运行 `python3 scripts/build-rock-detail.py`，脚本需要 FFmpeg，会核对原图并将明度、高度和粗糙度打包成 JPEG。应用只请求本地成品。原扫描由 Greg Zaal 摄影、Dario Barresi 处理，采用 CC0 许可。[Poly Haven · Rock Face](https://polyhaven.com/a/rock_face)

群岛室内的八件 Tripo 陈设与六张墙面、地板贴图位于 `dist/holiday-assets/assets/island-rooms/`。原件位置、生成任务号、提示词和原件哈希记录在[陈设清单](../scripts/island-room-props.json)。从备份的原件重建单件家具，例如在 `photo-demo/` 运行以下命令。

```sh
blender --background --python scripts/package-room-prop.py -- evidence/tripo-room-furnishings/hearth/source.glb dist/holiday-assets/assets/island-rooms/hearth.glb
```

石灰灰泥和木地板使用 Poly Haven 的 CC0 扫描。运行 `python3 scripts/build-room-surfaces.py` 可用 FFmpeg 重建调色后的漫反射、法线和粗糙度贴图。[灰泥扫描](https://polyhaven.com/a/plaster_grey_04) · [木板扫描](https://polyhaven.com/a/wood_floor_deck)

## Spark 运行依赖

版本固定为 `@sparkjsdev/spark@2.4.0`。本地运行文件等同官方包的 `dist/spark.module.min.js`，重命名为 `spark.module.js`。其 SHA256 为：

```text
a2f01f68dbcd5e060d55348f803e509fc789b97904e01b98763fcf0314351aaf
```

恢复命令（在仓库根目录）：

```sh
mkdir -p .cache/spark photo-demo/dist/gs-lab/vendor
npm pack @sparkjsdev/spark@2.4.0 --pack-destination .cache/spark
tar -xOf .cache/spark/sparkjsdev-spark-2.4.0.tgz package/dist/spark.module.min.js > photo-demo/dist/gs-lab/vendor/spark.module.js
shasum -a 256 photo-demo/dist/gs-lab/vendor/spark.module.js
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

小狗案例单独恢复：见 [制作与资产清单](CANINE_MUSEUM.md)。

## 提交前检查

```sh
git add <需要提交的源码和文档>
npm --prefix photo-demo run check:repo
git diff --cached --stat
```

`check:repo` 无论从哪个目录启动，都检查整个外层仓库索引里的实际对象：源码单文件限制为 2 MiB；文档媒体仅允许不超过 16 MiB 的 `docs/media/desk-to-islands.gif`，以及 `docs/diagrams/` 下明确列入检查器白名单的两张流程图 SVG（各不超过 128 KiB）。其他图片、MP4、模型、权重、归档、Git 历史备份、本地环境、实验输出及嵌套仓库 gitlink 仍被拒绝。不要用强制添加绕过忽略规则。运行素材与大型依赖通过本地资产备份恢复。

## Marble 试验资产

`dist/marble-lab/assets/` 已保存 World Labs 返回的 full-res SPZ（29.8 MB，192 万 Gaussian）、500k SPZ、全景图与低精度碰撞网格；除小型 `scene.json` 外继续全部忽略。哈希及机位记录在 `scene.json`，资产清单同步记录 SHA256。原始响应与服务下载地址仅在忽略的 `evidence/marble-lab/`；API key 只存放应用根 `.env.local` 或进程环境，不进入静态目录。恢复应使用备份资产或已有 operation 续接下载，不应重新提交付费任务。详见 [MARBLE.md](MARBLE.md)。

`dist/marble-hybrid-lab/assets/` 为本地衍生资产：清理前景的 SPZ、局部支撑面 PLY、复用模型的几何 JSON 和移除索引 BIN。全部继续忽略，仅保留小型 `scene.json`。重建依赖原 Marble 资产、原照、既有 SAM/模型和源机位渲染证据；详见 [MARBLE_HYBRID.md](MARBLE_HYBRID.md)。无需重新收费生成。

`dist/marble-refined-lab/assets/` 是融合修正版独立衍生资产：进一步清理的SPZ、连续桌面网格JSON、支持纹理、杯釉/书封边界纹理、物件几何和移除索引。遵循相同忽略规则，仅小型 `scene.json` 可追踪。具体依赖和重建命令见 [MARBLE_REFINED.md](MARBLE_REFINED.md)。

## 逐物件资产与可进入书屋

`dist/holiday-assets/assets/<物件>/` 的模型和参考图继续只存本地；最新清单已纳入`local-assets.json`。电脑空间各版分别保留，书屋另用`assets/bookroom/shell.glb`与`bookcase.glb`、`desk.glb`、`chair.glb`。`assets/bookroom/scene.json`只保存任务ID、源模型哈希与组件关系，可用于核对已有资产，不能替代模型文件。

恢复这些模型时使用本地/私有备份或已有任务下载，不为恢复checkout重新发起收费生成。门轴、房间、台阶与光照由`bookroom-interior.js`装配，交互由`bookroom.js`和`bookroom-navigation.js`负责。原始高精度网格、开洞/导出记录和浏览器截图位于忽略的`evidence/holiday-assets-v1/`。

Draco解码器是小型浏览器运行依赖，随源码保存；许可和精确文件哈希见`dist/vendor/draco/`。`.tripo/`是本地服务任务上下文，不随Git分发。FlashWorld模型、环境和输出继续留在本地；固定版本及复现方法见`experiments/flashworld/README.md`。
