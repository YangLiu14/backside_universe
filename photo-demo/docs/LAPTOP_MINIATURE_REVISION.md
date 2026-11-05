# 电脑背后：真正的微缩世界

## 当前外观：整体洞窟小岛（spatial-v6）

外观入口：<http://127.0.0.1:9988/holiday-assets/laptop-unified.html>。可切换完整电脑、独立洞窟景观、旧版拼接，并从正景、斜后方、侧面、俯看、电脑正面观察。新版互动书屋默认入口为`bookroom.html`，原版入口`bookroom.html?island=v3`仍有效。

用户要求先完成完整概念图，再统一生成，避免各个部分生成后难以拼接。v6的洞窟、书屋、岩岸、灯塔、木桥、台阶、海湾来自**一次Tripo生成**，不再把旧房屋、地形和独立岩洞拼成外观。电脑正面与键盘沿用原硬件网格；整体景观刚性靠近屏幕，沿倾斜背平面裁掉隐藏的重叠部分。

整体任务 `90ff1d50-7391-4e46-93c6-0ce4a47bb97f`，H3.1 detailed几何/纹理/PBR，60积分。源网格1,945,096三角面、4096 PBR纹理；保留未修改源GLB，组合预览2,120,997三角面。未对统一景观减面。独立景观预览保留生成形状，只做等比缩放和朝向调整；电脑组合副本只做刚性平移与隐藏后侧裁切，不拉伸建筑或岩石纹理。

费用追溯：连续岩岸任务60积分，随后独立洞窟任务 `9b7f6c89-10a2-449d-9e9b-60240441813e` 60积分；用户调整路线后，这两件保留为实验资产，未放入v6。统一景观另60，本次修复累计180；Tripo API余额295→115，冻结0。没有重复提交同一任务。

生成参考使用内置imagegen，文件与完整提示词：

- `evidence/holiday-assets-v1/laptop/spatial-v6/unified-reference.png`
- `evidence/holiday-assets-v1/laptop/spatial-v6/unified-reference-prompt.txt`
- `evidence/holiday-assets-v1/laptop/spatial-v6/unified-result.json`
- `evidence/holiday-assets-v1/laptop/spatial-v6/assembly.json`
- `scripts/unified-assembly.json`、`scripts/build-unified-island.py`：可复现装配。

验证：源网格四向材质/白模、组合多视角、三种版本往返切换与390×844视口通过，0页面错误、无横向溢出；原书屋完整进出流程及277个安全退出采样点回归通过。独立网页版约12.7MB、电脑组合约21.7MB；未做真实手机性能验收。

**互动书屋已接入新版洞窟。** <http://127.0.0.1:9988/holiday-assets/bookroom.html>默认加载开洞后的v6外壳，原版通过`?island=v3`保留。露台开门后，视点在同一场景中穿过真实门洞进入原精细书屋，可关门、键盘/屏幕移动、退出并回到全景；没有跳转到另一个室内场景。

新门中心约为世界坐标X=.057/Y=.695，露台Z≈-.037。用`grotto-bookroom.json`统一定义房间到新版世界的变换；房间控制和碰撞沿用已验证的局部坐标，渲染相机同步到世界坐标。原书柜、书桌与软椅保持比例等比缩小为.75，独立门轴、木地板、线脚、灯具与阅读窗复用。真实切出入口、屋内净空和三个窗孔；拱廊夹层外侧用木裙板衔接既有木露台。新露台较窄，绿门向室内开启，停靠点位于露台侧边。

本轮没有新的生成费用，也没有覆盖v6源模型、原家具或v3外壳。新增派生件`assets/bookroom/shell-grotto-v6.glb`；测量、切洞报告、源件哈希和浏览器截图在`evidence/holiday-assets-v1/laptop/bookroom-v6/`。

验证：9条外壳穿门射线通过；浏览器真实门扇关闭时阻挡、打开后通道射线无阻挡。新版307个可行走点均可安全退出；开门/进入/室内关门/退出自动开门/露台关门/返回、键盘及屏幕移动、减少动态、390px视口通过，无脚本错误/横向溢出。旧版277点与同一完整流程回归通过。

电脑正面保留原造型，但展开的洞窟岩缘在部分正面视角仍可见，尚未实现从办公形态到洞窟形态的收展。当前是独立资产预览，未接入主桌面的海面或物件联动。

## 原版互动：可进入的海风书屋

原版体验入口：<http://127.0.0.1:9988/holiday-assets/bookroom.html?island=v3>。原有小岛预览页增加了“打开房门，进入海风书屋”入口。

二层绿色房门现在拥有独立门轴；从露台开门后，相机在同一三维场景中穿过真实门洞进入书屋。室内可拖动环顾、使用WASD/方向键或屏幕按钮移动，并可返回露台、关门、回到小岛全景。提供减少动态模式。

Tripo H3.1独立生成三件家具：雕花胡桃木藏书柜、带书本与黄铜台灯的书桌、绿色软包阅读椅。每件30积分，共90，余额385→295，冻结0；原始高精度GLB保留，网页版每件14万三角面和4K PBR纹理。房间的实际尺寸、墙体、木地板、线脚、门轴、窗框和照明在本地精确装配，不把整个房间当作单张生成贴图。

v3外观原件未覆盖。另存开洞后的shell，保留铜穹顶、瓦屋顶、露台和下层海湾。穹顶拱廊后设置通透阅读窗；侧窗可见原有灯塔。门槛与原露台实际高度对齐，用两级室内木台阶衔接较低的房间地面，行走视点随台阶平顺升降；门扇底边调整到露台上方。原网格先沿边界切分三角面再开洞，修正近看锯齿。门关闭时不可通行；自动进出和手动移动共用边界/家具避让规则，路线不平滑穿过障碍。

验证：完整开门—进入—环顾—移动—退出—关门—全景往返；277个室内可行走采样点均找到安全退出路线；关闭门洞与墙体边界检查通过。桌面和390×844视口、屏幕移动按钮、减少动态模式通过，0页面错误、无横向溢出。截图及报告在`evidence/holiday-assets-v1/laptop/bookroom/browser/`，费用、源网格和场景清单在同级目录。

当前是桌面项目中的独立书屋体验页；主桌面海面、物件间光照/云朵联动尚未接入。整组网页模型约59MiB，已验证浏览器窄视口，未完成真实手机性能验收。

## Tripo 独立观景书屋（spatial-v3，前一版）

用户不接受v2上下层重复水景，随后明确允许Hi3D积分不足时改用Tripo3D。上层现改用Tripo新生成的独立书屋：石拱廊、可见书架与长椅、铜色穹顶和瓦屋顶、绿色百叶门、带栏杆的木露台。下层海湾和灯塔沿用既有Hi3D网格；上层复制的水池与崖岸移除，重新装配基座和连接步道。屏幕后仰约25°继续保留。

参考图：Hi3D图片任务 `4eb93a3af59047e897528e1402d1d52e`，3积分。新建筑：Tripo H3.1任务 `91ffbe1f-33a4-4313-8bfb-029d28ca19b5`，detailed几何/纹理、PBR，实际60积分；API余额445→385。原始建筑GLB为1,833,011三角面，4096纹理，另存装配与网页派生件。没有新建API凭证或升级订阅。

当前预览默认加载model-spatial-v3.glb，“对比上一版”加载v2重复水景稿。源网格、参数、费用、单建筑与总装检查图保存在evidence/holiday-assets-v1/laptop/spatial-v3；v1和v2文件保留。

用户明确否定第一版的浮雕效果。旧版不再按“背板山城完成”计；原文件保留作对照。

## 为什么像浮雕

旧版把一整幅带海天背景的山城装进屏幕矩形，装配尺寸0.9×0.06×0.6。深度只有宽度的6.7%，建筑与地形附着在一张竖直面上。增加纹理、楼梯数量或简单拉厚，不能解决这种空间组织问题。

## 已认可的空间稿与本轮迭代

入口：<http://127.0.0.1:9988/holiday-assets/laptop-spatial.html>

用户已认可水平岛屿的空间方向，本轮要求补充中上部景物并恢复屏幕倾角。保留下层海湾，复用既有Hi3D网格增加上层水景平台与承托崖岸，新增折返石阶、栏杆及灯塔栈桥；各景物等比缩放，平台保持水平。显示屏绕铰链后仰约25°（与键盘内侧夹角约115°），键盘底座保持原位。角度参照照片观感设置，并非单张照片的精确测量值。

页面提供斜后方、侧面、背面俯看、电脑正面四个预设，以及“对比上一版 / 返回本次改版”。已认可稿继续保留在model-spatial-study.glb，本轮另存model-spatial-v2.glb。装配配置、原网格、检查图与浏览器记录在evidence/holiday-assets-v1/laptop/spatial-v2。

这是复用现有资产的空间验证稿，尚未重新制作山城建筑。它与原稿分别保存，没有把另一件物件的海湾伪称为新生成的电脑专属山城。

## Hi3D 下一版建模指令

先生成一座独立的立体海岸山城小岛，之后与电脑装配。建模参考不包含电脑、相框或竖直展示板，避免模型把整个场景压成墙面。参考相机使用偏高的后侧45度，必须同时看到建筑屋顶、两面墙、地面厚度与多个景物之间的缝隙。

建议生成提示词：

> A freestanding miniature Mediterranean island town, a complete three-dimensional tabletop diorama viewed from an elevated three-quarter angle. A horizontal irregular limestone island with three staggered elevation levels. Four separate complete ivory guesthouses with full side and rear walls and terracotta roofs, placed at different depths with visible lanes between them. A real open stone arch bridge spans an empty ravine, daylight and the far bank visible through the arch. A continuous stepped path climbs from a tiny harbor and wooden jetty at the front to the highest house. Terrain, buildings and bridge have substantial volumetric depth. The island has a clear front, sides and back. All structures are physically supported, precise miniature scale, detailed shutters, balconies, railings, roof tiles and stonework. Neutral studio background. No laptop, no picture frame, no vertical backing panel, no sky wall, no painted sea horizon, no relief plaque, no buildings fused into a flat cliff face. Show only the standalone miniature island.

景观随后装到电脑后侧，使用等比缩放。前景码头、中景拱桥、后景坡地与房屋形成三层真实距离；不要再把景观的纵深压缩来适应原显示屏厚度。正面遮挡靠布局和展开状态处理。

## 验收

- 背侧45度可见建筑屋顶和侧墙；纯侧面仍能看到完整岛屿轮廓及地面进深。
- 旋转30度时，前景遮住的后方景物发生可辨认的显露变化。
- 桥洞有真实穿透的空隙；房屋之间有地面、通道和距离。
- 没有围住整幅景观的竖直矩形背板或海天贴片。
- 所有房屋和桥体被地面支撑，不悬浮，不只是屋顶、正面墙的裁片。
- 电脑正面保持普通物件读法；允许背面展开，源照片机位需要另行检查。

上一轮查询Hi3D余额为2。本轮复用既有网格，无新收费请求；新的专属山城网格尚未生成。旧版文件、已认可空间稿均保留。

本轮验证：最终GLB测得屏幕后仰24.9739°；四向材质/几何检查与网页四视角通过。新版110网格、3,900,639三角面；与上一版往返切换成功，无页面脚本错误；390×844视口无横向溢出，未做真实手机性能测试。原认可版文件哈希未变化。

### v3最终验证
单建筑与总装四向检查、浏览器四视角、新旧往返均通过；新版142网格/3,064,553三角面，屏幕后仰24.9739°。初装屋脊外露与悬空基座已修正，支撑有两个真实贯通拱洞。390×844视口无横向溢出、0脚本错误；非真实手机性能测试。

## 书页回到起点

书屋已增加摊开书页上的原始输入照片。走近后可放大进入原Marble 3DGS，并从群岛再次返回洞窟。保留所有原模型，详情与验证见[书页循环](BOOKROOM_LOOP.md)。
