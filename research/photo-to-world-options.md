# 从单张实景照片进入可旋转世界：开源方案调研

调研日期：2026-11-03。目标是白色书桌照片的连续视角过渡，以及桌上多个物件共同构成微缩度假世界。以下只核对官方仓库、模型卡和项目页；没有在这张照片上运行模型。速度、显存和质量描述均为作者公布的条件，不能当成本机实测结果。

## 先区分三个能力

- **原图附近的真实视差**：保留照片颜色，估计深度，分层并补齐被遮挡的局部区域。通常最适合“照片刚开始转动”的阶段；它不会凭空获得完整房间背面。[3D Photo Inpainting](https://github.com/vt-vl-lab/3d-photo-inpainting)
- **生成新的相机视角**：根据一张图和目标相机位置生成图片或视频。可以合理补画不可见区域，但输出不一定是能在网页里自由旋转的 3D 资产。[MetaView](https://github.com/KlingAIResearch/MetaView)、[Stable Virtual Camera](https://github.com/Stability-AI/stable-virtual-camera)
- **生成持久的 3D 世界**：把生成视图重建为 3D Gaussian Splatting（3DGS）或网格，再交给网页实时渲染。速度和资产形式更适合交互，但仍须检查源照片一致性、遮挡和大角度缺陷。[FlashWorld](https://github.com/imlixinyang/FlashWorld)、[HY-World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0)

**这些方法都不能证明恢复了照片没有拍到的真实背面。** 对本项目而言，可以把背面设计成创意世界；但不能将生成的背面宣称为实景的准确重建，也不能把演示视频等同于任意角度的稳定 3D。

## 值得优先关注的候选

| 项目 | 已开放与输出 | 对本项目的价值 | 主要边界 |
|---|---|---|---|
| [FlashWorld](https://github.com/imlixinyang/FlashWorld) | 推理代码和权重已发布；单图/文本到 3DGS，可导出 SPZ、PLY 和视频；已有 Spark 网页演示 | 最直接的“照片进入可旋转世界”技术样例，适合比较现有几何场景与生成高斯场景的观感 | 代码 Apache-2.0，但权重 CC-BY-NC-SA-4.0；不是可以无条件用于产品的模型 |
| [MetaView](https://github.com/KlingAIResearch/MetaView) | 代码及权重已发布；输入源图和目标相机位置，输出目标视角图片 | 最接近“由一张照片脑补不同角度真实画面”的要求，可用于研究关键视角 | 单张目标图片不是连续 3D；默认依赖 DA3 Giant/Nested，许可需连同依赖审查 |
| [HY-World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0) | 完整推理流水线与权重已发布；单图/文本到可漫游 3DGS/网格 | 完整场景路线，可覆盖桌面多物件及环境；适合离线制作资产 | 多 GPU 系统，部署重；Tencent 社区许可有地域、规模等条件；完整生成不保证原图每个细节不变 |
| [NVIDIA Lyra 2.0](https://github.com/nv-tlabs/lyra/tree/main/Lyra-2) | 代码和权重已发布；单图与轨迹到视频，再重建 3DGS | 长轨迹、场景记忆和回访一致性，是大幅绕行的效果参考 | H100 级离线生成；权重限制于内部科学研究与开发用途 |
| [HunyuanWorld-Mirror](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror) | 推理、训练代码和权重已发布；图像/视频到深度、相机、点云及高斯 | 可作为生成视图后面的几何重建组件 | 主要是重建器，本身不是完整的未知背面生成器 |

### FlashWorld：最贴近交互形态，但要分清代码和模型许可

官方提供 [Spark 在线演示](https://huggingface.co/spaces/imlixinyang/FlashWorld-Demo-Spark)，CLI 可输出 SPZ/PLY，说明它确实能产生网页可展示的高斯资产。论文标题中的“4 秒”对应 H100/H800；README 的显存表另给出 A800：默认约 8.5 秒、51 GB；卸载 T5 约 16.6 秒、30 GB；再卸载 Transformer 约 20 秒、24 GB；进一步卸载 VAE 约 10 分钟、9 GB。低显存方案不意味着依旧只需数秒。[官方 README](https://github.com/imlixinyang/FlashWorld)

作者指出，CLI 渲染直接使用原始高斯参数，网页演示使用压缩参数，因此网页效果不完全等于离线渲染。可用它检验“真实照片开始具有空间感”的效果上限，但尚未验证这张书桌图的椅子、灯臂、电脑边缘和遮挡是否稳定。[官方 README](https://github.com/imlixinyang/FlashWorld)

GitHub 代码采用 Apache-2.0；官方模型页明确标注 **CC-BY-NC-SA-4.0**。不能据代码许可把权重也判为商业友好。对于产品迭代，应先明确获准用途或取得适当授权。[代码许可](https://github.com/imlixinyang/FlashWorld/blob/main/LICENSE)、[权重许可标注](https://huggingface.co/imlixinyang/FlashWorld)

### MetaView：适合生成关键角度，尚不是一体化网页场景

ECCV 2026 项目，源照片与目标相机 pose 为输入，利用 Depth Anything 3 的几何先验和尺度约束生成目标视图。官方仓库已有推理代码、权重下载与 yaw/pitch/radius 的命令示例，输出为源图和生成图的对照；不只是论文预告。[官方仓库](https://github.com/KlingAIResearch/MetaView)、[官方项目页](https://prototypenx.github.io/MetaView/)

适合先检验 15°、30°、60° 等关键视图是否仍像同一张桌子。把多张结果连接起来还需要验证跨视角一致性，并补上连续相机路径与重建/插值机制；不能直接据单张效果推断完整 180° 转动稳定。

MetaView 自身的官方权重标为 Apache-2.0，但默认流程还要求 Qwen-Image-Edit、DA3-GIANT-1.1 和 DA3NESTED-GIANT-LARGE-1.1；DA3 Giant/Nested 的非商业许可仍会影响整个默认组合。未找到可直接采用的官方最低显存和本场景耗时，因此不做速度承诺。[MetaView 模型卡](https://huggingface.co/Kwai-Kolors/MetaView)、[依赖配置](https://github.com/KlingAIResearch/MetaView)、[DA3 许可表](https://github.com/ByteDance-Seed/Depth-Anything-3)

### HY-World 2.0：完整世界生成路线，适合服务器离线做资产

官方在 2026-05-18 发布完整 WorldGen 推理代码与 WorldStereo 2.0 权重。流程包含全景生成、相机轨迹规划、记忆引导的新视图生成、WorldMirror 2.0 重建，以及 3DGS 优化，最终形成可漫游场景；这比仅输出一条视频更接近交互产品所需。[发布记录与结构](https://github.com/Tencent-Hunyuan/HY-World-2.0)

WorldGen 文档建议至少 4 张 GPU，并说明在 8×H20 上测试；轨迹规划还配置 Qwen3-VL 服务。它是重型离线资产生产管线，不适合直接承诺用户上传后在普通笔记本即时生成。[WorldGen 安装与运行](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/hyworld2/worldgen/README.md)

Tencent 自定义社区许可允许在条件内使用、修改和分发，但地域排除欧盟、英国和韩国，且涉及超过 100 万 MAU 的额外授权条件，并有署名、再分发及输出相关条款。其许可并非简单的“仅非商业”；也不能概括成“全球任意商用”。在本轮候选中，它值得作为符合部署地区与条款前提下的产品研究路线。[HY-World 2.0 许可全文](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/License.txt)

HunyuanWorld-Mirror 可输出深度、相机、点云、法线和 3D 高斯，支持带相机/深度先验的重建及高斯优化；应视为重建组件，不应单独宣称它能正确补全桌面背面。它也有相似的腾讯社区许可条件。[Mirror README](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror)、[Mirror 许可](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror/blob/main/License.txt)

### Lyra 2.0：长路径与记忆一致性的研究参考

2026-04 发布代码与权重，从单图及用户相机轨迹生成带场景记忆的视频，再通过深度与重建生成高斯。官方 H100 80 GB 条件下，80 帧约 9 分钟；使用蒸馏模型约 35 秒，另约 1 分钟完成重建。这里的“生成速度”不等于网页交互帧率，也不是本机测速。[官方 Lyra 2.0 文档](https://github.com/nv-tlabs/lyra/blob/main/Lyra-2/README.md)

代码 Apache-2.0，但权重使用 NVIDIA Internal Scientific Research and Development Model License；其他用途须另行确认适用许可。适合研究效果，不应直接作为消费产品资产流水线的已获许可选项。[模型页](https://huggingface.co/nvidia/Lyra-2.0)、[模型许可](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-internal-scientific-research-and-development-model-license/)

## 视频路线与较早的参考项目

- **Stable Virtual Camera / SEVA**：代码和模型已发布，支持从一个或多个输入视图按目标相机生成新视图；v1.1 修复了早期前景与背景脱离的问题。仓库明确说明非商业许可亦适用于输出，不能直接作为产品主路线。[官方仓库](https://github.com/Stability-AI/stable-virtual-camera)、[模型页](https://huggingface.co/stabilityai/stable-virtual-camera)
- **ViewCrafter**：单图/稀疏图到相机可控视频。官方 A100 40 GB 表中，25 帧、576×1024 约 120 秒、23.5 GB；16 帧同分辨率约 75 秒、18.3 GB。它可做固定过渡路径的研究基线，输出视频后仍需重建才能自由旋转。自己的模型页标 Apache-2.0，但默认依赖 DUSt3R，后者为 CC-BY-NC-SA-4.0。[官方仓库](https://github.com/Drexubery/ViewCrafter)、[模型卡](https://huggingface.co/Drexubery/ViewCrafter_25)、[DUSt3R 许可](https://github.com/naver/dust3r/blob/main/LICENSE)
- **HY-WorldPlay**：通过图像/文字和操作指令流式生成后续视频，研究的是服务端实时世界模型。不能把其“24 FPS”直接理解为导出 3D 后浏览器自由渲染；仓库中部分蒸馏权重仍标待发布。[官方仓库](https://github.com/Tencent-Hunyuan/HY-WorldPlay)
- **WonderWorld**：单图开始交互构建多个相连 3D 场景，对“多物件共同构成一个世界”有概念参考价值；官方要求 48 GB CUDA GPU，首次全景天空生成在 A6000 上约 20 分钟，后可缓存。不是普通网页端即时生成方案。[官方仓库](https://github.com/KovenYu/WonderWorld)

## 更可控的照片起步与网页渲染基础

以下由主线程同步核对的一手资料纳入，供后续组合方案使用：

- **Apple SHARP**：单图预测高斯，官方支持 CPU/MPS/CUDA 预测，提供 PLY；官方视频渲染步骤要求 CUDA，主要强调邻近视角。模型许可明确排除 product development，不能因为不收费就默认可用于产品原型。[仓库](https://github.com/apple-aiml-research/ml-sharp)、[模型许可](https://github.com/apple-aiml-research/ml-sharp/blob/main/LICENSE_MODEL)
- **Depth Anything 3**：Mono-Large、Metric-Large 为 Apache-2.0，可作为原图深度与分层纹理方案的基础；它们不是直接高斯生成模型。具备直接 GS 能力的 Giant/Nested 型号采用非商业许可。[官方模型与许可表](https://github.com/ByteDance-Seed/Depth-Anything-3)
- **3D Photo Inpainting**：MIT 代码，采用分层深度表示并补齐局部颜色/深度遮挡，可导出网格和视频；依赖较旧。适合借鉴“源照片像素保持不动、随相机运动逐步揭开遮挡”的起步方式。[官方仓库](https://github.com/vt-vl-lab/3d-photo-inpainting)
- **Spark**：MIT、与 Three.js 结合的高斯渲染器，可将 splats 与 mesh 放在同一应用。它解决展示，不负责从照片重建。默认 depthWrite=false，若要让高斯场景、桌面物件与 Hi3D 微缩景观互相遮挡，需要实际验证深度代理与混合渲染。[官方仓库与 API](https://github.com/sparkjsdev/spark)

## 对当前 demo 的判断与下一版建议

以下是结合本地实现的设计判断，并非上述论文已经验证的产品效果。

当前 `photo-demo/dist/room.js` 将原图投影到手工近似几何上，同时放置完整照片平面；`photo-demo/dist/app.js` 随绕行角度降低照片平面和投影纹理的权重。度假世界通过 `worldParent` 挂在杯子内部。因此，正面可以与照片吻合，转动后却会暴露几何与材质的近似；继续增加杯中景观细节，无法单独解决这个过渡问题。

**建议把第一阶段改成“整张照片开始具有空间”，第二阶段才揭示桌面共同构成的微缩海岸。** 首要实验应是一个约 3–5 秒、能够正反拖动的体验切片，而不是先扩建完整房间。

### 技术路线的优先级

1. **产品实现基线**：用 Apache-2.0 的 DA3 Mono-Large 或 Metric-Large 估计深度，结合原图纹理、物体边界分层和局部遮挡补全，制作小幅转动的立体照片。保留现有相机标定作为起点，重新验证尺度与边缘。DA3 只提供几何线索；分割、补全和分层仍需实施，补全组件须另选并核对许可。这条路线优先控制原图一致性，不承诺完整 180° 场景。
2. **生成式效果对照**：FlashWorld 的资产形式最贴近交互目标，可在用途获准的条件下比较它与分层照片的真实感和细节漂移。SHARP 可研究公开演示和方法，但其发布权重明确排除产品开发，不能默认用于这次产品原型。
3. **大幅绕行扩展**：若后续必须从原图连续绕到大角度，评估 HY-World 2.0 等联合多视角生成与重建管线。独立生成几张漂亮图片并不等于连续稳定的场景，须检查桌面布局、物体身份与回到原位的一致性。
4. **网页接入**：分层网格可以沿用 Three.js；若采用 3DGS，再引入 Spark，与已有 Hi3D GLB 同场显示。高斯与网格之间的遮挡、阴影和现有 BokehPass 景深都需要单独验证，不能直接假设混合渲染正确。

### 过渡画面应怎样展开

- **起始位置**：保持原照片构图、色彩与物体位置。开始缩放/轻微转动时，由原图纹理和深度产生视差，让杯子、书本和电脑真的出现前后关系。
- **接近桌面**：镜头缓慢降低并靠近杯子与书之间，保留可辨认的物件轮廓。用实际遮挡逐步揭开补全区域；避免依赖整幅照片与几何场景透明叠加来掩盖不对齐。
- **发现背面**：利用书脊、屏幕侧边、杯沿遮住转换边界，在局部逐步引入创意几何和环境光。变化由同一相机与连续进度驱动，往回拖动时能够平滑复原。
- **完整揭晓**：桌面物件仍可辨认，但它们之间已经连成同一片微缩海岸。未知背面由创意设计填充，不宣称是照片原本存在的实景。

### 多物件联动：一片海岸，而非几座孤立的小岛

| 原照片物件 | 微缩世界中的作用 | 联动方式 |
|---|---|---|
| 笔记本电脑及其海面壁纸 | 远处海面与地平线 | 海光沿屏幕方向洒向桌面，与杯边水面形成统一方向 |
| 杯子后方的蓝色书本 | 海岸台地与层叠峭壁 | 书页边缘形成步道，连接书后旅舍和杯边码头 |
| 蓝杯与杯碟 | 港湾与近景海湾 | 保留蓝色轮廓，已有 Hi3D 景观成为海岸中的一个目的地 |
| 右侧暖光台灯 | 整个度假世界的落日光源 | 暖色沿海岸逐步显现，让水面、建筑和桌面物件共享光照变化 |

水面波动、微小船只、灯光变化可以后加；第一轮应先把几处结构与光线连成一个可信空间。

### 对同一张书桌照片的验收实验

- 固定相同的起始构图、输出分辨率和相机路径，与当前 demo 对照。检查杯沿、书角、屏幕边缘等锚点，不能用其他场景的漂亮样例代替验收。
- 小幅左右转动和缩放，观察椅背网格、细灯臂、桌沿及物件背后的新露出区域：是否有空洞、拉伸、重影或浮动。
- 在正转、停留、反向拖动时检查物体身份、纹理、光照是否连续；新视角生成若改变桌面布局，就不能用作无缝过渡。
- 单独检查照片/高斯、网格和 Hi3D 资产的互相遮挡，以及手机上的实际帧率、峰值内存和加载体积。
- 本轮完成的是资料与方案核对；未上传用户照片到上述服务，未运行这些模型，也未改变现有 demo。只有实测后，才能决定是否采用生成式场景作为产品主路线。
