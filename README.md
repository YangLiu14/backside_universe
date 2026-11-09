# 背后宇宙 · backside-universe

一张照片，不仅可以记录当下的瞬间，也可以承载你再次看见它时的希望与想象。**背后宇宙，让照片的背面生长出可以走进去的 3D 世界。**

[在线体验「工位背后的假期」](https://desk-holiday-universe.netlify.app/) · [本地运行](#本地运行) · [开发文档](photo-demo/docs/README.md)

[![从真实工位绕到海上群岛，伴随日落进入洞窟书屋，再穿过书页回到工位](docs/media/desk-to-islands.gif)](https://desk-holiday-universe.netlify.app/)

绕到照片背后，日常的物件成为岛屿。走进洞窟里的书屋，桌上那一页又把你带回故事的起点。

第一次体验，建议点击「跟随故事」。高清场景首次加载需要一些时间，页面会显示下载进度与准备状态。

## 作品集

| 作品 | 照片背后的世界 | 体验入口 |
| --- | --- | --- |
| **工位背后的假期** | 书桌变成海洋，杯子、书本、手机与电脑成为五座岛。放走一艘纸船，拨掉工作的声音，再从书页回到工位。 | [在线体验](https://desk-holiday-universe.netlify.app/) · [作品现状](PROJECT_STATUS.md) |
| **小狗身体博物馆** | 绕到小狗身侧，发现身体里的六座微缩展馆；沿着食物的旅程，进入器官内部探索。 | 本地体验 · [作品与运行说明](photo-demo/docs/CANINE_MUSEUM.md) |

## 体验亮点

- **亲手发现照片的背面。** 从实景连续绕到微缩世界，通过转动、遮挡与尺度变化逐步揭示它。
- **小动作改变一片天地。** 咖啡的热气凝成云，台灯牵动日出日落，桌面下延伸出海底。
- **走进景物，也走进故事。** 在岛屿间游览，走上楼梯、打开房门，把催促工作的纸条折成纸船送走。
- **回到开始，再次出发。** 书屋里的书页印着原始照片；进入那一页，又回到最初的 3DGS 工位。

## 如何实现

先从照片重建 3D Gaussian Splatting（3DGS）实景，再为照片中的主体及其背后的想象空间建模。将模型的位置、尺度与原始视角对齐后，通过 Three.js 与 Spark 融合实景和网格场景，用连续镜头组织探索、交互与返回。

<picture>
  <source media="(max-width: 600px)" srcset="docs/diagrams/photo-to-world-mobile.svg">
  <img src="docs/diagrams/photo-to-world.svg" alt="照片 → 3DGS 实景 → 微缩世界建模 → Three.js 与 Spark 融合 → 交互与故事；从书页返回原始实景。" width="1064">
</picture>

## 本地运行

需要 Node.js 和支持 WebGL2 的浏览器。**新克隆需先按[资产恢复说明](photo-demo/docs/ASSETS.md)恢复照片、模型、Gaussian 场景与运行依赖**，然后在仓库根目录执行：

```sh
cd photo-demo
npm run dev
```

服务启动后，打开[工位主体验](http://127.0.0.1:9988/marble-transition-lab/index.html)。其他作品入口、环境配置、检查命令与资产审阅见[开发指南](photo-demo/docs/DEVELOPMENT.md)。

## 当前状态与后续方向

工位作品已公开上线，可完成五站故事、岛屿与室内漫步，以及书页返回实景的完整循环。小狗身体博物馆可在恢复资产后本地体验。

接下来优先打磨近距离模型与通路、降低首屏和场景切换的等待，并在真实移动设备上验证完整旅程。[查看项目状态与计划](PROJECT_STATUS.md)。

## 文档

| 想了解什么 | 从这里开始 |
| --- | --- |
| 本地开发与检查 | [开发指南](photo-demo/docs/DEVELOPMENT.md) |
| 恢复完整演示资源 | [资产与依赖](photo-demo/docs/ASSETS.md) |
| 实景与建模如何衔接 | [转场实现](photo-demo/docs/MARBLE_TRANSITION.md) · [书页循环](photo-demo/docs/BOOKROOM_LOOP.md) |
| 制作记录、旧版与研究 | [文档索引](photo-demo/docs/README.md) |

## 致谢与许可

渲染基于 [Three.js](https://github.com/mrdoob/three.js) 与 [Spark](https://github.com/sparkjsdev/spark)。海底动态参考 [Abyssal Living Deep](https://github.com/emollick/abyssal-living-deep)，材质扫描来自 [Poly Haven](https://polyhaven.com/)。

第三方许可证与素材来源见[资产与依赖说明](photo-demo/docs/ASSETS.md)。原始照片、模型及生成素材不随源码仓库分发；仓库目前未设置统一的项目许可证。
