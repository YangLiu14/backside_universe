# 小狗身体博物馆

[原照片与 Hi3D 小狗的虚实转场](http://127.0.0.1:9988/canine-museum/index.html) · [侧面剖景](http://127.0.0.1:9988/canine-museum/index.html?angle=90) · [原始 Marble 场景](http://127.0.0.1:9988/canine-museum/cutaway.html?view=marble)。本地运行 `npm --prefix photo-demo run dev`。

照片转场使用 Hi3D 原始模型的 244,000 面网页副本，以及从 500,000 个 Marble Gaussian 中移除旧狗后保留的 486,295 个。模型接过原照时使用源机位投影，继而过渡到自身材质。墙面、踢脚线和局部地毯按可见平面拟合，爪部按地毯落脚，阴影由网格投影得到。0° 显示原照；正反向共用同一条相机轨迹。[相机、对应点和落脚参数](../dist/canine-museum/assets/transition/dog-fit.json)。

## 观察段：已生产

Marble 1.1 接收完整 1706 × 1279 原照，world ID 为 `43181bd2-fd62-435f-9a7b-7d151c83a01c`，实际消耗 1580 个 World Labs 积分。宽屏使用 1,920,000 个 Gaussian，窄屏使用 500,000 个。照片只负责首帧；纯 Marble 入口在 0° 也直接显示 SPZ。单图生成会改变脸部、地毯细节和原照看不到的房间。主展台保留 Hi3D 的皮毛、头部与四肢，只在朝向来访者的胸腹侧面打开一个窗口。肋骨与脊椎是为展示制作的解剖示意网格。

[原图、操作号、模型、SPZ 文件和 SHA-256](../dist/canine-museum/assets/marble/scene.json) · [相机配准](../dist/canine-museum/assets/marble/registration.json)。打包时复制整个 `dist/canine-museum/assets/`、Three.js 与 Spark 的本地 vendor 文件。原始私有服务回执和浏览器验收图在 `evidence/canine-production/`。恢复已生成的 Marble 操作使用 `python3 scripts/marble-world.py resume --case canine`（工作目录 `photo-demo`），不需要再生成一个世界。配准用 `experiments/gaussian/.venv/bin/python scripts/register-canine-marble.py`，再用未经二次配准的实拍/渲染截图对做 `--browser-pair evidence/canine-production/marble/first-pose`；脚本使用场景全景特征和 SPZ 实际深度。最终质量以在浏览器中载入 SPZ 的画面对照为准。

## 剖面段：六个 Hi3D 独立展馆

2026-11-08 在 Hi3D.ai 网页工作区以六张独立参考图各生成一件私有高质 v3.0 带材质模型，每件 45 积分，合计 270。原始文件是六个不同的 GLB，每件约 197–198 万三角面。六张参考图仅用于建模，观众看到的前景与内景均来自网格。同一原件分别导出约 4.5 万面的全景模型和约 37.5 万面的近景模型。近看时仅保留当前展馆的高清纹理。

在主展台向右绕行，58° 后胸腹开始打开，86° 完成；到达 90° 即可在全景或馆内自由环绕、平移和缩放。鼠标拖动环绕、滚轮朝指针位置推近，右键或 Shift 拖动平移；触屏单指环绕，双指捏合或张开缩放，双指同向移动平移。往某个展馆靠近时会载入高清网格，也可以直接点编号或馆名进入。馆内双击或双点展品，把环绕中心设在其表面。返回全景可恢复入馆前的机位；「复位视角」回到标准构图。按住方向键连续环绕，按住 W/S 前后移动、A/D 左右平移、Q/E 上下平移，松键即停、R 复位、Esc 返回。

| 器官 | 直接进入 | 近景可见 |
| --- | --- | --- |
| 心脏 | [心跳钟楼](http://127.0.0.1:9988/canine-museum/index.html?gallery=heart) | 钟楼的齿轮架、摆锤和侧边楼梯 |
| 肺 | [呼吸风琴厅](http://127.0.0.1:9988/canine-museum/index.html?gallery=lungs) | 中央风琴管、演奏台与两侧楼座 |
| 肝脏 | [琥珀光廊](http://127.0.0.1:9988/canine-museum/index.html?gallery=liver) | 独立标本台、拱柱和后层陈列龛 |
| 胃 | [旋流陶坊](http://127.0.0.1:9988/canine-museum/index.html?gallery=stomach) | 前排工作台、侧面器皿架和后方窑口 |
| 肾脏 | [双泉水务馆](http://127.0.0.1:9988/canine-museum/index.html?gallery=kidney) | 两个水务厅、中央拱桥和蓄水池 |
| 肠道 | [回廊档案馆](http://127.0.0.1:9988/canine-museum/index.html?gallery=gut) | 阅读桌、书架、回廊和楼梯 |

[六馆资产目录](../dist/canine-museum/assets/hi3d-galleries/catalog.json) 记录 Hi3D 资产编号、原件与参考图哈希、网页 GLB 面数及贴图尺寸。逐件的原始 GLB、Hi3D 页面回执、白模和左右 30° 证据图位于 `evidence/canine-production/hi3d-organs/<id>/`，网页截屏位于上一级。白模从无贴图的网格深度计算，可分辨前排展品与展厅后壁。原始参考留在 `evidence/canine-production/tripo/<id>/reference.png`，早期 Tripo 方案只做过报价；现行剖面不依赖它。

从已有原件重建：在仓库根目录依次运行 `blender -b -P photo-demo/scripts/pack-hi3d-gallery.py -- heart`（另五件替换 ID），再执行 `python3 photo-demo/scripts/resize-gallery-textures.py photo-demo/dist/canine-museum/assets/hi3d-galleries/*.glb` 和 `python3 photo-demo/scripts/catalog-hi3d-galleries.py`（需 Pillow）。`prepare-hi3d-flank.py` 使用原始小狗几何重算右侧开口，不需再次生成或扣费。

## 食物的第一视角之旅

[消化路线图](http://127.0.0.1:9988/canine-museum/index.html?map=food)按这只坐姿狗的口鼻、胸腹与骨盆位置标出六站。点图上的站名可以从该段开始。进入[食物视角](http://127.0.0.1:9988/canine-museum/index.html?tour=food)后，按播放可听普通话旁白。沿途可拖动转头、暂停、按站跳转、拖动进度或退出，退出后返回进来时的机位。六个展馆来自已有 Hi3D 模型。六段通道分别使用 Hi3D.ai 的私有动画风格网格，管腔内的镜头按原模型的可通行深度校准。分段预载，下载过程中使用轻量示意模型。

到达胸腔、上腹和肠道附近时，观察窗打开，镜头看到小狗身上已装配的 Hi3D 网格。默认在各处首次经过时暂停。点场馆或入口标签可以入馆自由浏览，换成该馆的讲解。返回后恢复原来的路线位置、朝向和播放状态。在自动停靠点可继续看另一馆，或按「继续前行」。取消「到馆停靠」即可连续播放。可直接打开[胸腔停靠点](http://127.0.0.1:9988/canine-museum/index.html?tour=food&stop=chest)。观察窗和入馆路线是博物馆的观展设计。

[从胃部大厅开始](http://127.0.0.1:9988/canine-museum/index.html?tour=food&station=stomach)，按播放靠近陶土窑门。胸腔用黄铜管与风琴厅衔接，腹腔用木饰与水绿色釉面衔接档案馆、水务馆。两侧共用相同的立体门框。开门时在同一画面中渲染通道和狗身上的展馆。六个通道各花费 45 个 Hi3D 积分。[模型来源、哈希与镜头轨迹](../dist/canine-museum/assets/digestion/channels/catalog.json)

恢复原件和动画参考图到 `evidence/canine-production/hi3d-tract/animated/` 后，可在 `photo-demo/` 运行 `blender -b -P scripts/pack-hi3d-channel.py -- stomach`，依次替换为其余五个站点 ID。随后用项目的 NumPy、OpenCV、Pillow 环境运行 `python scripts/catalog-hi3d-channels.py` 生成移动端贴图及镜头轨迹。

口腔 → 食管 → 胃 → 小肠 → 大肠 → 直肠与肛门。小肠站讲解胆汁、胰液和营养吸收。讲解参考[华盛顿州立大学兽医教学医院的犬消化系统图谱](https://hospital.vetmed.wsu.edu/2022/03/10/digestive-system-of-the-dog/)及[默沙东兽医手册的犬消化系统介绍](https://www.merckvetmanual.com/dog-owners/digestive-disorders-of-dogs/introduction-to-digestive-disorders-of-dogs)。音频和字幕随页面保存在 `assets/digestion/`。

## 流程技能与验收

[从实拍到 Gaussian 的配准](../../.agents/skills/photo-gaussian-registration/SKILL.md)、[实体剖面和展品嵌入](../../.agents/skills/miniature-cutaway/SKILL.md)、[可逆的绕行和观展](../../.agents/skills/reversible-photo-orbit/SKILL.md)。其来源是[工位制作记录](MARBLE_WORKFLOW_REFERENCE.md)；本案的源相机、揭示方向和器官布局独立校准。

使用本地服务与 Playwright/Chromium，运行 `npm --prefix photo-demo run check:hi3d-galleries` 及 `SMALL=1 npm --prefix photo-demo run check:hi3d-galleries`。检查六个入口、高清模型替换、鼠标滚轮和右键平移、模拟双指手势、表面对焦、复位、返回入馆前机位和原照。另有 `check:canine-museum` 供原始 Marble、配准和历史 Tripo 校验页使用。

历史：首版用 DA3/BLUNT 从单图深度制作 369,941 个 Gaussian，器官为程序化外形与带内景贴图的凹面。其本地数据留存供对照，现行展台不引用。

食物路线用 `npm --prefix photo-demo run check:digestive-tour` 验证。六个展馆的停靠、进入和原位返回用 `npm --prefix photo-demo run check:tour-gallery-visits` 验证。两个命令都支持 `SMALL=1` 切换到手机视口。本地模型、普通话旁白和导览影片的恢复路径及 SHA-256 收录在[本地资产清单](local-assets.json)。
