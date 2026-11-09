# 背后宇宙 · 本地应用

这里是照片实景与微缩世界的浏览器应用源码。

[在线放映相簿](https://backside-universe.netlify.app/?lang=zh) · [工位背后的假期](https://backside-universe.netlify.app/?lang=zh#desk) · [小狗的内脏博物馆](https://backside-universe.netlify.app/?lang=zh#canine) · [项目介绍](../README.md)

新克隆需先按[资产恢复说明](docs/ASSETS.md)恢复照片、模型、Gaussian 场景与 Spark 运行库。安装 Node.js 后，在本目录执行：

```sh
npm run dev
```

默认端口为 `9988`。打开[工位主体验](http://127.0.0.1:9988/marble-transition-lab/index.html)或[小狗身体博物馆](http://127.0.0.1:9988/canine-museum/index.html)。

| 内容 | 文档 |
| --- | --- |
| 环境、目录、构建与检查命令 | [开发指南](docs/DEVELOPMENT.md) |
| 本地资产、依赖与许可证 | [资产恢复](docs/ASSETS.md) |
| 独立模型审阅与旧版对照 | [实验与审阅入口](docs/EXPERIMENTS.md) |
| 实现、研究和历史记录 | [完整文档索引](docs/README.md) |

`dist/` 是维护中的静态源码目录，不是可直接删除的编译产物。本目录由外层 Git 仓库统一管理。
