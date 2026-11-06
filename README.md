# 背面宇宙

从一张真实的日常照片，发现物品背面的微缩世界。

项目统一由本目录的 Git 仓库管理，`photo-demo/` 是普通源码子目录。代码、校准参数、许可和文档进入 Git；照片、纹理、模型、Gaussian 场景、权重和本地环境通过忽略规则留在本机。

```sh
cd photo-demo
npm run dev
```

从 3DGS 工位绕到桌面背后，可以自由浏览蓝书白崖、橙书峡谷和手机潮港，再走进电脑洞窟里的书屋，从书页回到起点。[进入主桌面](http://127.0.0.1:9988/marble-transition-lab/index.html)

单件资产也可独立审阅。

- [三件背面展开态](http://127.0.0.1:9988/holiday-assets/islands-unified.html)：蓝书白崖、橙书赤岩峡湾、手机潮汐港；Tripo整体网格与旧版对照。
- [整体洞窟小岛](http://127.0.0.1:9988/holiday-assets/laptop-unified.html)：洞窟、建筑、岩岸与海湾统一生成的外观模型，可与旧版对照。
- [可进入的海风书屋](http://127.0.0.1:9988/holiday-assets/bookroom.html)：已接入新版洞窟，可开门进入、阅读原图书页并回到最初的3DGS空间；支持再次进入的循环。
- [逐物件 3D 资产](http://127.0.0.1:9988/holiday-assets/index.html)与[电脑背面小岛](http://127.0.0.1:9988/holiday-assets/laptop-spatial.html)：真实网格、独立微缩景观和约25°屏幕倾角。

下一步是将台灯高度与群岛日照联动。早期照片转场及重建实验可供对照。[原版 demo](http://127.0.0.1:9988/) · [FlashWorld 与 Marble 实测](photo-demo/experiments/flashworld/README.md)

新克隆需要恢复本地资产才能运行完整演示。说明与入口见 [photo-demo/README.md](photo-demo/README.md)，资产恢复见 [ASSETS.md](photo-demo/docs/ASSETS.md)。

## 项目文档

- [产品概要](PRODUCT.md)与[设计讨论](DESIGN.md)
- [近期实现与验证](photo-demo/docs/PROGRESS.md)
- [照片转三维方案调研](research/photo-to-world-options.md)
- [任务计划](task_plan.md)、[进度日志](progress.md)、[技术发现](findings.md)
- [Git 仓库统一与历史备份](photo-demo/docs/GIT_MIGRATION.md)

提交前从本目录运行 `node photo-demo/scripts/check-repository.mjs`，或在 `photo-demo/` 运行 `npm run check:repo`；两种入口均检查整个外层仓库的暂存区。
