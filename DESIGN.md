---
name: 背面宇宙
description: 保留日常照片的真实质感，连续进入蓝杯背面的微缩假期。
colors:
  cup-cobalt: "#0731aa"
  ink: "#eee9de"
  muted: "#b9beb9"
  ground: "#171b1c"
  line: "rgba(238,233,222,.24)"
  action-ink: "#1a2426"
  action-hover: "#fff9e9"
  quiet-surface: "rgba(23,27,28,.56)"
  quiet-hover: "#303838"
  tool-surface: "rgba(23,27,28,.65)"
  tool-hover: "#37423f"
  tool-active: "#e6ddbd"
  focus: "#a9bcff"
  paper: "#f0eee5"
  paper-ink: "#263437"
  paper-body: "#455251"
typography:
  display:
    fontFamily: '"Songti SC","Noto Serif CJK SC",serif'
    fontSize: "clamp(32px,3vw,44px)"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: ".03em"
  headline:
    fontFamily: '"Songti SC","Noto Serif CJK SC",serif'
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.5
  wordmark:
    fontFamily: '"Songti SC","Noto Serif CJK SC",serif'
    fontSize: "21px"
    fontWeight: 400
    letterSpacing: ".16em"
  body:
    fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 2.1
  action:
    fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "13px"
    fontWeight: 400
  quiet:
    fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: ".04em"
  label:
    fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "11px"
    fontWeight: 400
rounded:
  action: "2px"
  feedback: "3px"
  control: "4px"
spacing:
  edge-wide: "40px"
  edge-mobile: "22px"
  wordmark-gap: "12px"
  tools-gap: "8px"
  panel-padding: "30px"
  panel-padding-mobile: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.action-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
    padding: "14px 19px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-quiet:
    backgroundColor: "{colors.quiet-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.quiet}"
    rounded: "{rounded.control}"
    padding: "10px 13px"
  button-quiet-hover:
    backgroundColor: "{colors.quiet-hover}"
  button-tool:
    backgroundColor: "{colors.tool-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  button-tool-hover:
    backgroundColor: "{colors.tool-hover}"
  button-tool-active:
    textColor: "{colors.tool-active}"
  about-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.panel-padding}"
    width: "min(380px,calc(100vw - 48px))"
---

# Design System: 背面宇宙

## Overview

**Creative North Star: "照片的另一面"**

沿用用户选定的白桌、蓝杯照片和既有视觉方向：日常空间是画面的依据，微缩假期在多个物件的背面相连。保留原图的白色、钴蓝和暖灯质感；说明文字安静、短促，界面只帮助人靠近、旋转和返回。

这里记录 `photo-demo/dist` 已实现的视觉语言，合并原有方向，并非新的风格提案或另一次风格共识。照片构图、首屏位置、连续镜头及资产状态属于这个样片，详见 `photo-demo/.impeccable/surface.md`；它们不自动成为未来所有页面的模板。

**Key Characteristics:**

- 原照片提供可信的材质和色彩依据。
- 炭黑底、暖白文字，让作品成为视觉主体。
- 宋体标题配无衬线控件，文字保持轻而清晰。
- 通过连续镜头和真实几何表达深度，UI 控件保持简洁。

## Colors

照片中的白桌、钴蓝陶瓷与暖光构成视觉识别；界面使用克制的暖白和炭黑。

### Primary

- **杯身钴蓝**（`cup-cobalt`）：补建杯身与杯碟的基础材质色。照片投影和光照会改变它的最终像素，不应将其误作截图取色值。
- **暖白动作**（`ink`、`action-ink`、`action-hover`）：当前「绕到背后看看」是暖白底深色字。原有方向中提到的钴蓝动作标识未作为按钮填色实现；不据此虚构蓝色按钮规范。

### Neutral

- **炭黑展陈底**（`ground`）：承接照片以外的视口，也构成浮层控制的暗底基色。
- **暖白与灰绿文字**（`ink`、`muted`）：区分主要内容与补充提示。窄屏中叠在照片上的说明升为暖白。
- **透明暗面**（`quiet-surface`、`tool-surface`）：保持控件在亮桌面和暗背景上的可辨认性；hover 使用对应的不透明深色。
- **细线与状态**（`line`、`tool-active`、`focus`）：分别用于角度进度轨、开关状态和键盘焦点。
- **暖纸说明层**（`paper`、`paper-ink`、`paper-body`）：仅用于需要停下来阅读的作品说明和类似反馈层。

**The Photo Authority Rule.** 原照片的颜色与构图具有优先权；补建材质围绕它衔接，不用统一滤镜改写照片本身。

## Typography

标题与字标使用系统宋体栈，正文和控件使用系统中文无衬线栈，无外部字体请求。宋体提供停顿感，无衬线保证小字号操作可读。

- **Display**：首屏两行文案「生活，／还有另一面。」；保留显式换行，不让第二句再拆成碎行。
- **Headline**：背面揭示文案；字号随窄屏缩小，不通过添加更多文字填满画面。
- **Wordmark**：小型标志加宽字距名称，位于画面边缘。
- **Body**：短句说明；作品面板另用紧凑一些的行高（1.9）。
- **Label / Action / Quiet**：操作、状态与提示。角度采用等宽数字特性，避免每帧数值变化时跳动。

响应式字号覆盖见 Layout。现有系统只建立这些角色，不推导未经实现的字号比例或完整长文排版系统。

## Layout

当前样片是完整视口舞台（`100svh`，最小高度 440px），照片采用 contain 完整显示。宽屏中摄影作品居中，余白为炭黑；字标、说明入口和底部控制贴近外围。舞台没有滚动叙事区或卡片网格。

- **宽屏**：header 顶部 32px、左右使用 `edge-wide`；首屏文字位于左侧 5vw、顶部 34%，最大宽度 310px。底部距离为 28px 与安全区 inset 中的较大值。
- **宽度至 1100px**：首屏文字移到左下，离左 32px、底部 135px，标题 36px；手势说明隐藏，背面标题 25px。
- **纵向或接近方形（宽高比不超过 6:5）**：文字靠下，背面信息靠上；这条规则也覆盖宽度大于手机的竖屏设备。
- **宽度至 600px**：header 与 footer 左右使用 `edge-mobile`；首屏文字左 25px、底部 128px、最大宽度 270px，标题 32px。标题保留手工换行，每行不再自动折行；背面标题为 22px、单行。底部控件隐藏可见文字但保留无障碍名称，工具按钮最小触控范围为 44×44px。面板 padding 切换为 `panel-padding-mobile`。

图像 contain、摄影机视野适配和舞台裁剪必须共同维护；不能只用 CSS 放大图片来掩盖照片与三维的交接。精确断点、镜头计算和层级见 sidecar 与 surface brief。

## Elevation & Depth

主要深度来自三维场景的遮挡、视差、阴影和光照。UI 默认没有卡片阴影；仅作品说明使用 `0 16px 45px #0005` 抬离场景。叠在影像上的揭示文案及底部文字使用文字阴影维持对比，不增加大面积装饰玻璃层。

照片匹配时保持图像细节；绕到背面后启用以桌面共同海岸为焦点的景深，让房间退后。海水与环境动态服务于微缩比例和停留感。环境动态可暂停；系统偏好减少动态时默认暂停环境更新，并取消界面 CSS 动画与过渡、直接更新镜头状态。声音默认关闭。

**The Continuous Space Rule.** 靠近、旋转和返回都由同一场景、同一渲染摄影机及连续状态计算，不能把入口和背面做成两张互不相干的画面切换。

## Shapes

控件是近乎方正的小矩形：主操作用 `rounded.action`，次要控件与作品说明用 `rounded.control`。图标是细描边线形，主箭头为 20px，工具图标为 17px。字标的双重开口轮廓与杯子的隐藏开口呼应，不扩大成装饰图案。

场景沿用摄影物件的曲面：陶瓷杯身、杯碟、把手和前景椅子都有圆弧轮廓。椅子的坐垫、靠背、头枕使用圆角挤出面和弯曲框架；不能用方盒子替代它的主要剪影。微缩景观保持低矮不对称岸线、石阶、棕榈和小屋的可辨认比例。

## Components

### Buttons

主操作「绕到背后看看」使用暖白底、右箭头和宽松的文字—图标间隔（35px）；hover 在 0.2s 内提亮并向右移动 3px。手机减小 padding 至 12px 16px，间隔为 23px，字号 12px。

「关于这张照片」使用透明暗底，hover 变为实色。底部工具采用更深的透明底，hover 提亮；启用状态只变为暖色文字。焦点是独立、清楚的 2px 浅蓝 outline，外移 6px。主按钮、次按钮和工具按钮无需彼此共享完全相同的尺寸。

### Navigation and controls

字标链接回当前入口。底部依次为状态文字、细进度线、实际绕行角度，以及「原照片」、环境动态和海浪声。返回是一个镜头操作；环境动态开关不禁用手动旋转或缩放。声音由用户主动开启。具体键盘和触摸行为见 surface brief。

### About and feedback

作品说明是右上暖纸面板，包含作品短文、样片边界、实际资产来源与键盘说明；关闭按钮位于右上，Escape 可关闭。它是可关闭说明区，不应文档化为已实现焦点锁定的模态对话框。

加载提示位于下方中央，准备完成后淡出。错误反馈保留原照片并提供「重新打开」。加载文案和作品说明使用日常语言；技术来源和限制如实说明，避免重建术语进入主操作流程。

### Photo-to-space stage

原图、对应深度的照片平面、投影材质和补建几何按连续状态交接。先靠近蓝杯，再绕向隐藏开口；杯子始终是同一空间的锚点。背面文案随实际绕转进度出现，而不是独立定时字幕。该签名交互的参数及诚实边界记录在 surface brief。

## Do's and Don'ts

### Do:

- **Do** 保留用户照片的完整构图、白桌、钴蓝杯与暖灯质感。
- **Do** 让文字和控制围绕影像退到边缘，保留明确的焦点、返回和暂停操作。
- **Do** 将旋转、缩放、文字揭示、投影淡出和景深关联到同一连续状态。
- **Do** 按实际加载资产给出来源，并将补建空间与照片记录的事实区分。

### Don't:

- **Don't** 把当前暖白主按钮记成未实现的蓝色按钮。
- **Don't** 用切换场景或裁切原图替代照片到蓝杯的连续路径。
- **Don't** 把照片投影和人工补建描述成已经实现单张照片自动全视角重建。
- **Don't** 把当前手工景观与 Hi3D 小屋组合描述成已经完成的新 Hi3D 整座景观。

## 2026-11-03 实际绕行更新

当前运行版本以 `photo-demo/.impeccable/surface.md` 为准。用户反馈小视角方案像照片上叠景观，因此改为4.5秒、真正绕核心物件180°的三维路径。原照和DA3深度仅承担早期靠近，局部柔焦交接在进度30%完成，侧面和背面完全由几何承接。电脑背壳、书页台地、杯后开口及固定栈道组成共同海岸；台灯提供暖光。宽屏终点FOV47°，纵屏72°。保留界面视觉身份、可逆滑块与暂停返回。

背面空间是依据照片设计补建；早期交接仍有投影边缘重影，材质尚未达到照片级一致。本版只在9988端口本地预览，旧云端地址未更新。
