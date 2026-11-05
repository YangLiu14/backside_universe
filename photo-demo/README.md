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
| `/marble-transition-lab/index.html` | 4.8秒连续绕行至180°，共用校准物件，从Marble实景交接到联动度假世界；可逆拖动和同机位检查 |
| `/holiday-assets/index.html` | 10组已生成小物件的模型审阅页；蓝杯暂停，部分形态仍需精修 |
| `/holiday-assets/laptop-spatial.html` | 电脑背面立体小岛、独立Tripo书屋、约25°屏幕倾角；保留旧版对照 |
| `/holiday-assets/bookroom.html` | 连续开门进入二层书屋，室内环顾/移动和返回；独立家具、门轴与碰撞 |

新物件与书屋尚未整体接入Marble转场；它们通过独立页面审阅。

用户已认可 `marble-refined-lab` 作为基础。独立 `marble-transition-lab` 使用原版房间与 Hi3D 资产，并以固定正面遮挡约束把景观藏在物件后方：电脑背板小镇、书后小村、杯内码头随绕行显露；桌面在68°–132°逐渐成为海水，把独立物件连成群岛。海面前版本保留在 `marble-islands-before-sea`。调整前版本保留在 `marble-transition-restored`，首版在 `marble-transition-first-pass`；原主 demo 和其他 Marble 对照页保留。外围配准和隐藏容积裁剪仍有局限，详见 `docs/MARBLE_TRANSITION.md`。

## 文档与资产

- [逐物件资产与当前缺陷](docs/HOLIDAY_ASSETS.md)
- [电脑背面空间迭代与可进入书屋](docs/LAPTOP_MINIATURE_REVISION.md)
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

# 海风书屋完整进出、家具避让与窄屏检查（资产和本机Playwright就绪）
node scripts/check-bookroom.mjs

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
