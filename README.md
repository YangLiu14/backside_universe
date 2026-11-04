# 背面宇宙

从一张真实的日常照片，发现物品背面的微缩世界。

项目统一由本目录的 Git 仓库管理，`photo-demo/` 是普通源码子目录。代码、校准参数、许可和文档进入 Git；照片、纹理、模型、Gaussian 场景、权重和本地环境通过忽略规则留在本机。

```sh
cd photo-demo
npm run dev
```

主 demo：[http://127.0.0.1:9988/](http://127.0.0.1:9988/)。最新电脑/杯子小样：[实体表面实验](http://127.0.0.1:9988/solid-object-lab/index.html)。

原 demo 保留 4.5 秒照片到微缩度假世界的体验；各单图重建实验独立保留。最新小样只评估 ±12°，隐藏面、其他物件和外围仍存在近似及重影，尚未整合进完整转场。

新克隆需要恢复本地资产才能运行完整演示。说明与入口见 [photo-demo/README.md](photo-demo/README.md)，资产恢复见 [ASSETS.md](photo-demo/docs/ASSETS.md)。

## 项目文档

- [产品概要](PRODUCT.md)与[设计讨论](DESIGN.md)
- [近期实现与验证](photo-demo/docs/PROGRESS.md)
- [照片转三维方案调研](research/photo-to-world-options.md)
- [任务计划](task_plan.md)、[进度日志](progress.md)、[技术发现](findings.md)
- [Git 仓库统一与历史备份](photo-demo/docs/GIT_MIGRATION.md)

提交前从本目录运行 `node photo-demo/scripts/check-repository.mjs`，或在 `photo-demo/` 运行 `npm run check:repo`；两种入口均检查整个外层仓库的暂存区。
