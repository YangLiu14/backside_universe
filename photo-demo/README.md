# 背面宇宙 · 桌上的假期

从一张书桌照片进入三维空间，绕到电脑、书本和杯子背后，发现微缩度假世界。当前保留主 demo 与多个独立重建实验，最近工作包括 Marble 桌面海面转场、逐物件 Hi3D/Tripo 资产，以及可开门进入的海风书屋。

本目录是外层 `backside_universe` 仓库的普通子目录，不再维护独立 `.git`。旧历史已离线备份，见 [迁移记录](docs/GIT_MIGRATION.md)。

**仓库保存代码、校准参数、许可和文字记录。照片、纹理、模型、Gaussian PLY、模型权重与实验截图仅保存在本地，不随 Git 分发。** 新克隆需先恢复本地资产，不能直接得到完整演示。

## 本地运行

```sh
npm run dev
```

默认地址为 <http://127.0.0.1:9988/>，可用 `PORT` 覆盖。浏览器代码位于 `dist/`，它是本项目维护的静态源码目录，不是可以直接删除的编译输出。

| 入口 | 用途与当前结论 |
| --- | --- |
| [小狗身体博物馆](http://127.0.0.1:9988/canine-museum/index.html) | 原照、Marble 房间与 Hi3D 小狗的可逆侧绕；在同一只小狗的右侧打开骨架、进入六个 Hi3D 器官展馆。[制作与恢复](docs/CANINE_MUSEUM.md) |
| `/` | 原照片到桌面度假世界的 4.5 秒体验；现有版本保留 |
| `/?view=room` | 固定原照机位，检查家具、材质与场景还原 |
| `/gs-lab/index.html` | BLUNT + DA3 深度推导 Gaussian 基线；遮挡缺失明显 |
| `/infinisplat-lab/index.html` | RTX3090 上运行的单图 InfiniSplat；减少大块空洞，仍有拖影 |
| `/infinisplat-portrait-lab/index.html` | 竖幅输入对照；没有证明明显更好 |
| `/occlusion-lab/index.html` | 分割表面、隐藏桌面与百叶窗补全；保留作对照 |
| `/solid-object-lab/index.html` | 电脑/杯子实体表面与 InfiniSplat 衍生背景混合小样，保留作对照 |
| `/marble-lab/index.html` | Marble 1.1 完整照片真实输出，192 万 Gaussian；±12° 空间基本连续，但杯子等物件明显变形，未达到原照还原目标 |
| `/marble-hybrid-lab/index.html` | 保留 Marble 房间，用校准电脑、蓝杯、书本/Hi3D 纸页与原照纹理替换局部；支持同机位对照、大角度和自由观察，接缝与隐藏面仍待改善 |
| `/marble-refined-lab/index.html` | 修正杯柄、书边和连续桌面补面；同机位切换上一版，近桌±120°路径与自由移动；隐藏面仍为近似 |
| `/marble-transition-lab/index.html` | 主体验：4.8秒绕行至180°，新版洞窟与精细书屋已放在桌面电脑背后；连续靠近、推门、读书页并回到原3DGS |
| `/holiday-assets/index.html` | 10组已生成小物件的模型审阅页；蓝杯暂停，部分形态仍需精修 |
| `/holiday-assets/laptop-spatial.html` | 电脑背面立体小岛、独立Tripo书屋、约25°屏幕倾角；保留旧版对照 |
| `/holiday-assets/islands-unified.html` | 蓝书、橙书、手机的整体背面展开态，三件实际GLB与旧版对照；可用`#blue-book`、`#orange-book`、`#phone`直达 |
| `/holiday-assets/laptop-unified.html` | 整体洞窟外观，完整电脑/景观/旧版对照；已接入互动书屋入口 |
| `/holiday-assets/bookroom.html` | 默认新版洞窟书屋；开门进入、书页原图放大回到3DGS、再次返回洞窟；`?island=v3`保留旧版 |

主桌面电脑已接入完整洞窟与原精细书屋，从群岛到露台共用场景、相机与渲染器，书页原图再交接回Marble实景。绕行中，蓝书白崖、橙书峡谷和手机潮港从各自的桌面位置展开，正反向共用同一水位与深度遮挡。到达 180° 后自动进入群岛自由浏览。拖动可在当前位置环顾，Shift 拖动平移，滚轮沿视线推近拉远；手机可用单指环顾、双指平移或捏合。点击小岛或从右上角选择目的地即可近看，「全景」复位。按住方向键或 WASD 可连续前后左右移动，Q/E 降低或升高，IJKL 可用键盘环顾。选择「桌下 · 潜入海底」可从水下看鱼群、海藻和礁石。停住镜头后海浪仍会流动，「减少动态」可冻结海况。

用户已认可 `marble-refined-lab` 作为基础。独立 `marble-transition-lab` 使用原版房间与 Hi3D 资产，其中杯内码头保留固定正面遮挡约束；电脑背板小镇已由完整洞窟替换，随实景→建模交接显现；桌面在68°–132°逐渐成为海水，把独立物件连成群岛。海面前版本保留在 `marble-islands-before-sea`。调整前版本保留在 `marble-transition-restored`，首版在 `marble-transition-first-pass`；原主 demo 和其他 Marble 对照页保留。外围配准和隐藏容积裁剪仍有局限，详见 `docs/MARBLE_TRANSITION.md`。

## 文档与资产

- [逐物件资产与当前缺陷](docs/HOLIDAY_ASSETS.md)
- [电脑背面空间迭代与可进入书屋](docs/LAPTOP_MINIATURE_REVISION.md)
- [书页回到原空间的循环](docs/BOOKROOM_LOOP.md)
- [FlashWorld实测与复现](experiments/flashworld/README.md)、[与Marble的同条件对照](experiments/flashworld/COMPARISON_MARBLE.md)
- [最近工作与验证结果](docs/PROGRESS.md)
- [本地资产恢复、依赖和 Git 规则](docs/ASSETS.md)
- [本地运行资产清单与 SHA256](docs/local-assets.json)（仅元数据）
- [主 demo 的实现与历次调整](docs/MAIN_DEMO.md)
- [Gaussian 基线复现](experiments/gaussian/README.md)
- [InfiniSplat CUDA 环境与复现](experiments/infinisplat/README.md)
- [Marble 云端接入、任务续接与验收](docs/MARBLE.md)
- [Marble 房间与原照物件混合对照](docs/MARBLE_HYBRID.md)
- [Marble 局部融合修正、近桌绕行与自由移动](docs/MARBLE_REFINED.md)
- [Marble 实景到建模度假世界的独立转场验证](docs/MARBLE_TRANSITION.md)
- [Marble 可复用流程、排错经验与后续 skill 参考](docs/MARBLE_WORKFLOW_REFERENCE.md)——处理机位注册、重影/接缝、实体替换或规划实景到建模交接时阅读

完整截图、逐帧检查和原始输出位于本地 `evidence/`，不提交。关键结论已汇总到文档，源码和固定相机参数用于继续实验。

## 检查

```sh
# 检查暂存区：无图片/模型/本地环境，单文件不超过 2 MiB
npm run check:repo

# Marble 离线任务保护和镜头检查，不需要 API key 或生成资产
npm run check:marble

# 独立度假转场的机位、投影和反向时间线
npm run check:marble-transition

# Marble 本地资产及保全快照就绪后，使用具备 NumPy / Pillow 的 Python
PATH="$PWD/experiments/gaussian/.venv/bin:$PATH" npm run check:marble-assets

# 完整本地资产就绪后：语法、几何、时间线和资产检查
npm run check

# 主桌面洞窟配准、同一相机循环、原路退出和失败恢复
npm run check:desktop-bookroom

# 重建仅在高清洞窟加载失败时使用的备用外壳
blender -b -t 4 --python-exit-code 1 -P scripts/build-grotto-overview.py

# 本地服务和 Playwright 就绪后，检查冷启动、书屋延迟载入与逐顶点书页配准
npm run check:desktop-startup
node scripts/bake-book-pages.cjs
# 换书桌资产时，重新采样两页：node scripts/bake-book-pages.cjs --write

# 从本机留存的 Hi3D / Tripo 原件重建主桌面和书屋高清 GLB
blender -b -t 4 --python-exit-code 1 -P scripts/build-desktop-islands.py -- --hd
node scripts/bake-book-pages.cjs --write

# 启动本地服务后，以 Playwright 验证三岛、弱网回退、窄屏和书屋循环
npm run check:desktop-islands

# 同一浏览器环境下验证自由浏览、触控与书屋往返
npm run check:desk-explore

# 书页取景、原图哈希、独立审阅页重复交接与载入失败恢复
npm run check:bookroom-loop

# 海风书屋完整进出、家具避让与窄屏检查（资产和本机Playwright就绪）
node scripts/check-bookroom.mjs
node scripts/check-unified-island.mjs
node scripts/check-grotto-bookroom-picking.mjs

# 最新实体小样（先启动 localhost；需配置本机 Playwright）
SOLID_RUN=final node scripts/check-solid-objects.cjs
node scripts/check-solid-comparison.cjs
GS_LAB_URL=http://127.0.0.1:9988/solid-object-lab/index.html \
GS_LAB_EVIDENCE=evidence/solid-object-lab/full-check node scripts/check-gaussian-lab.cjs
```

Marble 的浏览器捕获和验收脚本共用可配置的 Playwright/Chromium 入口，运行方法见 [MARBLE.md](docs/MARBLE.md#浏览器检查配置)。较早的实验脚本仍包含开发机路径；这些工具还不是跨平台 CI。

## 目录

- `dist/*.js`：主场景、相机路径、交接、家具与度假景观。
- `dist/*-lab/`：独立验证页；`assets/scene.json` 记录来源与相机，大型资产被忽略。
- `dist/holiday-assets/`：逐物件与书屋页面、参数和小型来源记录；GLB与图片仍仅本地保存。
- `scripts/`：分割、几何拟合、资产转换、局部修正与验证。
- `experiments/`：可追踪的环境说明和运行脚本；环境、下载源码与权重不入库。
- `docs/`：进展、复现边界、资产恢复和历史实现说明。

当前 InfiniSplat 运行范围是个人技术评估。后续组织产品用途需按对应 PRL 条款办理登记；上游许可与第三方通知仍适用，见各实验目录的 `NOTICE.txt`。本仓库不分发模型权重。
