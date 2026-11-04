# 背面宇宙 · 桌上的假期

从一张书桌照片进入三维空间，绕到电脑、书本和杯子背后，发现微缩度假世界。当前同时保留主 demo 与五个独立重建实验，最近完成的是电脑与杯子的实体表面小样。

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
| `/solid-object-lab/index.html` | 最新电脑/杯子实体表面与 Gaussian 背景混合小样，支持同机位切换上一版 |

最新小样针对 ±12°；杯柄和隐藏侧面仍为近似，书本、小物件及外围仍有重影。它不代表已经获得完整的照片级 180° 场景。原主 demo 尚未接入这些独立实验结果。

## 文档与资产

- [最近工作与验证结果](docs/PROGRESS.md)
- [本地资产恢复、依赖和 Git 规则](docs/ASSETS.md)
- [本地运行资产清单与 SHA256](docs/local-assets.json)（仅元数据）
- [主 demo 的实现与历次调整](docs/MAIN_DEMO.md)
- [Gaussian 基线复现](experiments/gaussian/README.md)
- [InfiniSplat CUDA 环境与复现](experiments/infinisplat/README.md)

完整截图、逐帧检查和原始输出位于本地 `evidence/`，不提交。关键结论已汇总到文档，源码和固定相机参数用于继续实验。

## 检查

```sh
# 检查暂存区：无图片/模型/本地环境，单文件不超过 2 MiB
npm run check:repo

# 完整本地资产就绪后：语法、几何、时间线和资产检查
npm run check

# 最新实体小样（先启动 localhost；需配置本机 Playwright）
SOLID_RUN=final node scripts/check-solid-objects.cjs
node scripts/check-solid-comparison.cjs
GS_LAB_URL=http://127.0.0.1:9988/solid-object-lab/index.html \
GS_LAB_EVIDENCE=evidence/solid-object-lab/full-check node scripts/check-gaussian-lab.cjs
```

浏览器检查脚本当前引用开发机的 Playwright/Chromium 路径，离线模型脚本也包含本机工具路径；换机器时须按本机环境调整。这些脚本不属于已配置好的跨平台 CI。

## 目录

- `dist/*.js`：主场景、相机路径、交接、家具与度假景观。
- `dist/*-lab/`：独立验证页；`assets/scene.json` 记录来源与相机，大型资产被忽略。
- `scripts/`：分割、几何拟合、资产转换、局部修正与验证。
- `experiments/`：可追踪的环境说明和运行脚本；环境、下载源码与权重不入库。
- `docs/`：进展、复现边界、资产恢复和历史实现说明。

当前 InfiniSplat 运行范围是个人技术评估。后续组织产品用途需按对应 PRL 条款办理登记；上游许可与第三方通知仍适用，见各实验目录的 `NOTICE.txt`。本仓库不分发模型权重。
