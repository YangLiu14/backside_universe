# 实验与审阅入口

[项目首页](../../README.md) · [开发指南](DEVELOPMENT.md) · [文档索引](README.md)

这里收录开发机上的作品入口、独立资产审阅页和历史重建实验。先按 [资产恢复说明](ASSETS.md) 恢复相应文件，再在 `photo-demo/` 运行 `npm run dev`；下表路径均相对于 `http://127.0.0.1:9988`。这些页面不保证全部包含在公网发布包中。

## 本地入口一览

| 入口 | 用途与当前结论 |
| --- | --- |
| [小狗身体博物馆](http://127.0.0.1:9988/canine-museum/index.html) | 原照、Marble 房间与 Hi3D 小狗的可逆侧绕；在同一只小狗的右侧打开骨架、进入六个 Hi3D 器官展馆。[制作与恢复](CANINE_MUSEUM.md) |
| `/` | 放映相簿。点击工位或小狗的照片，打开对应的交互作品。 |
| `/legacy.html` | 原照片到桌面度假世界的 4.5 秒体验。 |
| `/legacy.html?view=room` | 固定原照机位，检查家具、材质与场景还原 |
| `/gs-lab/index.html` | BLUNT + DA3 深度推导 Gaussian 基线；遮挡缺失明显 |
| `/infinisplat-lab/index.html` | RTX3090 上运行的单图 InfiniSplat；减少大块空洞，仍有拖影 |
| `/infinisplat-portrait-lab/index.html` | 竖幅输入对照；没有证明明显更好 |
| `/occlusion-lab/index.html` | 分割表面、隐藏桌面与百叶窗补全；保留作对照 |
| `/solid-object-lab/index.html` | 电脑/杯子实体表面与 InfiniSplat 衍生背景混合小样，保留作对照 |
| `/marble-lab/index.html` | Marble 1.1 完整照片真实输出，192 万 Gaussian；±12° 空间基本连续，但杯子等物件明显变形，未达到原照还原目标 |
| `/marble-hybrid-lab/index.html` | 保留 Marble 房间，用校准电脑、蓝杯、书本/Hi3D 纸页与原照纹理替换局部；支持同机位对照、大角度和自由观察，接缝与隐藏面仍待改善 |
| `/marble-refined-lab/index.html` | 修正杯柄、书边和连续桌面补面；同机位切换上一版，近桌±120°路径与自由移动；隐藏面仍为近似 |
| `/marble-transition-lab/index.html` | 主体验：4.8秒绕行至180°，新版洞窟与精细书屋已放在桌面电脑背后；连续靠近、推门、读书页并回到原3DGS |
| `/holiday-assets/index.html` | 逐物件模型与早期试件审阅；部分形态仍需精修，完整蓝杯港湾以主体验为准 |
| `/holiday-assets/laptop-spatial.html` | 电脑背面立体小岛、独立Tripo书屋、约25°屏幕倾角；保留旧版对照 |
| `/holiday-assets/islands-unified.html` | 蓝书、橙书、手机的整体背面展开态，三件实际GLB与旧版对照；可用`#blue-book`、`#orange-book`、`#phone`直达 |
| `/holiday-assets/laptop-unified.html` | 整体洞窟外观，完整电脑/景观/旧版对照；已接入互动书屋入口 |
| `/holiday-assets/bookroom.html` | 默认新版洞窟书屋；开门进入、书页原图放大回到3DGS、再次返回洞窟；`?island=v3`保留旧版 |


## 转场历史快照

| 路径 | 保留目的 |
| --- | --- |
| `/marble-islands-before-sea/index.html` | 加入动态海面之前的群岛对照。 |
| `/marble-transition-restored/index.html` | 后续桌面布局调整前的保留版本。 |
| `/marble-transition-first-pass/index.html` | 实景与度假世界交接的首版转场。 |
| `/holiday-assets/bookroom.html?island=v3` | 旧版书屋外壳与阅读机位对照。 |

`/legacy.html?view=room` 用于固定旧版原照机位检查家具与材质；当前默认作品入口为 `/marble-transition-lab/index.html`。新版本地相簿在 `/`，旧版根入口的 `view` 等参数由相簿兼容跳转。

## 资产审阅与复现记录

- [逐物件资产台账](HOLIDAY_ASSETS.md)：生产覆盖、原件与尚存缺陷。
- [电脑景观与书屋迭代](LAPTOP_MINIATURE_REVISION.md)：分件拼接到统一洞窟的过程。
- [书页循环](BOOKROOM_LOOP.md)：同机位交接、独立审阅页与主桌面的差别。
- [照片重建方案实测](../experiments/flashworld/README.md)与[同条件对照](../experiments/flashworld/COMPARISON_MARBLE.md)。
- [Gaussian 基线](../experiments/gaussian/README.md)与[单图重建实验](../experiments/infinisplat/README.md)。

旧版结论保留在对应记录中，不代表当前主体验的资产、画质或性能。原始输出、截图与逐帧证据保存在本地 `evidence/`，不进入 Git。
