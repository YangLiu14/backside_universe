# 3D 资产网站如何展示：SuperSplat、Hi3D、Tripo、Meshy

调研日期：2026-11-15。只查公开的一方文档和产品页面；未登录、未生成任务、未下载大模型，也未测量这些站点登录后查看器的真实网络瀑布。

## SuperSplat：下载更小的展示数据，分级加载

官方当前发布流程把小于100万个Gaussian的场景压成单个SOG；更大场景自动构建分层LOD和Streamed SOG。浏览器先显示最低细节层，再按相机位置请求更细的数据；手机使用较低的同时绘制预算。因此快速出现画面不等于没有传输3D数据，也不等于加载了完整原始PLY。[官方流式加载说明](https://developer.playcanvas.com/user-manual/supersplat/streaming/)

发布场景页可以显示格式与下载体积；允许导出源文件是独立设置。关闭源文件下载按钮不表示查看器没有接收展示数据。[场景页说明](https://developer.playcanvas.com/user-manual/supersplat/scene-page/)

SuperSplat推荐SOG作为运行格式，支持SPZ等导出；实际要按本项目Spark版本核对格式兼容，并做画质对照，不能直接把PlayCanvas的Streamed SOG换进Three.js播放器。[导入导出](https://developer.playcanvas.com/user-manual/supersplat/editor/import-export/)

## 能确定的事实

| 网站 | 一方资料能确认什么 | 不能据此声称什么 |
|---|---|---|
| Hi3D.ai | API 成功结果分别包含封面/预览信息和模型、纹理下载地址；官方导出指南将 GLB 列为在线预览/AR用途 | 未公开核验本站交互查看器的具体资源格式、每次流量、LOD或云渲染实现；不能说每次必下原始模型或固定几十MB |
| Tripo | 免费在线 Viewer 明确在当前浏览器解析模型；任务输出区分模型和 rendered_image；另提供浏览器本地压缩工具 | 免费本地文件 Viewer 的实现不证明 Studio、Gallery 所有页面都使用同一种载荷；未获得登录后网页预览的固定体积 |
| Meshy | 资产列表与点开 Viewer 是不同步骤；API 提供不必下载GLB的多视角缩略图；官方案例展示完整GLB可达16.9–19.4MB | 案例GLB大小不是 Meshy 网站实际交互预览的流量测量，也不能把API里的 preview 生成阶段误认为轻量网页预览格式 |

## Hi3D

官方 API FAQ 说明成功任务包含资产ID、cover/preview信息，以及模型、纹理下载URL，表明封面预览可以与模型文件分开使用。官方导出指南把GLB的用途列为轻量在线预览及AR。它们证明了不同交付物的存在，但没有证明在线查看器每次加载哪个文件。[Hi3D API FAQ](https://docs.hi3d.ai/en/api/getting-started/faq) · [Hi3D导出指南](https://www.hi3d.ai/blog/hi3d-studio-export-formats-one-click-print-guide)

Hi3D的LOD科普说明远处用较低细节模型、近处用较高细节模型，这是通用技术介绍，不能当作其网站已经采用此策略的证据。[LOD科普](https://www.hi3d.ai/zh/ai-faq/what-is-the-significance-of-lod-level-of-detail-in-optimizing-3d-models)

搜索中出现的字节Hi3DGen、hi3d.cc、hi3d.pro与本项目使用的Hi3D.ai不能混为一谈。尤其Hi3DGen源码里“每个模型约40MB”的文字不是Hi3D.ai网站的数据。

## Tripo

Tripo免费在线Viewer明确说明模型在本浏览器中解析，只有选择在线Studio工作流时才上传文件。这个工具支持旋转、平移、缩放和材质/动画检查，直接反驳“网页3D查看器必然在远程服务器渲染”的假设；本地文件本来就在设备上，因此这里没有模型网络下载。[在线Viewer](https://www.tripo3d.ai/3d-tools/3d-viewer)

任务结果文档将模型URL和rendered_image预览图URL分开。它可以支持低流量列表，但文档本身不揭示Studio如何请求这些资源。[任务结果](https://docs.tripo3d.ai/task-query/get-your-task-result.html)

官方压缩工具在浏览器本地处理模型；GLB有压缩模式及场景、材质、动画、边界检查，glTF工具主要压缩JSON格式并保留其他数据字节。压缩不必然等于减面，也不能保证所有文件明显变小。此工具证明官方提供轻量化交付流程，不证明Studio默认为每份预览调用它。[文件压缩工具](https://www.tripo3d.ai/3d-tools/file-compressor)

## Meshy

官方资产管理说明是先浏览列表，再点击某个模型进入Viewer；没有说登录时就加载全部模型。[资产管理](https://docs.meshy.ai/en/webapp/guides/platform/asset-management)

Image-to-3D API可返回四个方向的512×512 PNG缩略图，并明确可用于不下载GLB的多角度预览。它是固定图片，不等于任意视角的可交互3D。[多视角缩略图文档](https://docs.meshy.ai/en/api/image-to-3d)

官方2026-09-28文字生成案例记录了两次实际输出：完整带纹理GLB为16.9–19.4MB，约27.8–40.4万三角形，另有512×512缩略图。这证明生成成品可能达到十几MB；不能把这个导出文件大小说成网站每次查看的实测流量。该API的preview/refine是“先无纹理几何、再生成纹理”的制作阶段，不是“预览版/原始导出版”网络策略。[官方案例与体积](https://www.meshy.ai/developers/cookbook/recipes/generate-3d-model-from-text/)

官方产品模型教程建议在发布到商品网页前减少几何并压缩纹理，说明生成后的资产仍需要面向Web处理。[商品模型教程](https://www.meshy.ai/developers/cookbook/recipes/create-product-model/)

## 对当前项目的含义

“没有点下载按钮”不代表没有数据传输。按钮通常表示保存/导出文件；查看器可在后台接收另一份优化后的展示数据。也不能把登录、列表扫图、点开一个3D模型、导出原文件四种动作混算。

若手机完全不接收3D数据，可用预渲染图片、转台视频或有限机位的图像序列来浏览；它们仍下载图片/视频，且不能完整替代当前作品自由走动、双指转头和任意近看的交互。若保留这些自由交互，就需要把可渲染的数据送到手机，或继续付远程渲染与串流的成本。

最适合当前作品的是：先小封面/可播放预览，明确进入3D才加载；展示资源与原始制作文件分离；几何和贴图压缩；按距离/可见性补细节；缓存重复使用。具体首屏和漫游总量须以项目真实请求测量，不能用这些厂商的宣传词或API导出尺寸来代替。
