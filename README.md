# 背面宇宙

从一张真实的日常照片，发现物品背面的微缩世界。

项目统一由本目录的 Git 仓库管理，`photo-demo/` 是普通源码子目录。代码、校准参数、许可和文档进入 Git；照片、纹理、模型、Gaussian 场景、权重和本地环境通过忽略规则留在本机。

```sh
cd photo-demo
npm run dev
```

主 demo：[http://127.0.0.1:9988/](http://127.0.0.1:9988/)。当前可体验：

- [可进入的海风书屋](http://127.0.0.1:9988/holiday-assets/bookroom.html)：开门、进入、室内走动和退出。
- [逐物件 3D 资产](http://127.0.0.1:9988/holiday-assets/index.html)与[电脑背面小岛](http://127.0.0.1:9988/holiday-assets/laptop-spatial.html)：真实网格、独立微缩景观和约25°屏幕倾角。
- [Marble 桌面海面转场](http://127.0.0.1:9988/marble-transition-lab/index.html)：从实景绕到物件背面，桌面逐步变为海水。

原 demo 和历次重建实验保留。新物件资产与书屋是独立预览，尚未替换进 Marble 转场；完整物件联动仍待整合。FlashWorld 实测与 Marble 对照见[实验记录](photo-demo/experiments/flashworld/README.md)。

新克隆需要恢复本地资产才能运行完整演示。说明与入口见 [photo-demo/README.md](photo-demo/README.md)，资产恢复见 [ASSETS.md](photo-demo/docs/ASSETS.md)。

## 项目文档

- [产品概要](PRODUCT.md)与[设计讨论](DESIGN.md)
- [近期实现与验证](photo-demo/docs/PROGRESS.md)
- [照片转三维方案调研](research/photo-to-world-options.md)
- [任务计划](task_plan.md)、[进度日志](progress.md)、[技术发现](findings.md)
- [Git 仓库统一与历史备份](photo-demo/docs/GIT_MIGRATION.md)

提交前从本目录运行 `node photo-demo/scripts/check-repository.mjs`，或在 `photo-demo/` 运行 `npm run check:repo`；两种入口均检查整个外层仓库的暂存区。
