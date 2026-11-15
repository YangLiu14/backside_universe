# 鞋底城的街景如何经得起近看

## 已交付的鞋底小镇 · 三次实机复盘

- **按玩家看得到的层次做几何。** 版本 `d1b39e9331e85b6e` 从桥上回望时，用前景桥栏、中段檐线和转角后露出的屋顶拉开距离。走到药材铺门口则需要实体门框、前柜和后排药柜，横移时三者能依次遮挡。Hi3D 提供店铺主体，内装补上抽屉和拉环。换场景时，先用灰模走一遍远望、贴近和侧移，把精模预算放在会改变轮廓和遮挡关系的位置。[桥面回望](../evidence/universes/sole-city/whole-town-walk/d1b39e9331e85b6e-tail-and-herbal/desktop-bridge.jpg) · [药铺斜视](../evidence/universes/sole-city/whole-town-walk/d1b39e9331e85b6e-tail-and-herbal/herbAngle.jpg) · [药柜装配](../cases/sole-city/viewer/herb-interior.js)
- **按开口和遮挡安排光，再在固定曝光下验暗部。** 同一版药铺从已装配几何烘焙天空可见度，再按店内窗洞和灯具的位置处理局部照明。返修前后，同机位截图中檐额亮度中位数从 27 降到 18，后排药柜从 6 升到 58，门外日照墙面两次都是 118。站在暗檐下，仍能分辨后排抽屉。换场景时也选一个暗部主体和一处室外对照；这些数字是该机位的 8 位图像取样值，各场景依自己的明暗关系判断。移动雨棚、改窗洞后要更新受影响的遮挡烘焙。[同机位采样](../evidence/universes/sole-city/whole-town-walk/d1b39e9331e85b6e-tail-and-herbal/review.json) · [光场生成与更新](../cases/sole-city/STREET_LIGHT_BAKE.md)
- **让表面颜色、起伏和反光来自同一个原因。** 版本 `0768b186f357c551` 依修补边界处理新旧水泥的颜色、粗糙度和细小高差。井盖边的浅坑留水，潮湿的坑岸仍能读出骨料。沿茶楼前同一片水横移，13 个固定水面取样点中有 9 个换了所映的物体；两处站位分别映到对街面馆和转角茶楼。新场景先选一个能检查这种联动的位置，锁定曝光并横移。近处水洼共用实时平面反射，固定、粗糙的表面按可见效果选用更便宜的光照或反射近似。[沿街修补前后对照](../evidence/universes/sole-city/whole-town-walk/0768b186f357c551-concrete-and-reflections/four-standing-views.jpg) · [移动与单独隐去倒影来源的对照](../evidence/universes/sole-city/whole-town-walk/0768b186f357c551-concrete-and-reflections/teahouse-parallax.jpg) · [反射取样记录](../evidence/universes/sole-city/whole-town-walk/0768b186f357c551-concrete-and-reflections/desktop-mirror.json)
- **用发布版本和用户看画面的距离验收。** 版本 `63473a7f93e09889` 在用户贴近鞋底的机位提升清晰度。原照继续决定胎纹起伏，高清颜色贴图补全橡胶颗粒和磨痕，再按原照校色。同角度放大可以分辨前掌槽边和后跟细纹，倒拖后仍能回到完整鞋底。该版桌面浏览器及触屏模拟在预热后的首次绕行中，记录到的静态缓冲上传和新着色程序链接均为零。新作品也应把局部近看、整段行走、回看和性能记录绑到同一版本；如约定真机帧时，另取目标设备实测。[同机位鞋底对比](../evidence/universes/sole-city/qa/63473a7f93e09889/outsole-before-after.jpg) · [发布版本的浏览器报告](../evidence/universes/sole-city/qa/63473a7f93e09889/report.json)

## 最初的参考与样段选择

调研于 2026 年 11 月 13 日。以下记录保留制作当时的判断。画面对照使用 25 秒版《那天，我跑着去买豆浆》。当时选天桥梯脚到豆浆摊为样段。从桥下可以检验街口的纵深，从摊前可以检验一米内的模型与材质，转身登桥又能看见鞋底边界。

## Fable 5.2 的公开案例做到了什么

Anthropic 已正式发布 Fable 5.2。下面的作品有实机入口或公开代码。单提示、耗时、人工介入的程度按各作者披露理解；局部画面是否达到这件作品的目标，要看相同光照条件和距离下的结果。[Anthropic 发布说明](https://www.anthropic.com/claude-fable-and-mythos-5-2)

| 案例 | 可核对的结果 | 对鞋底城的借鉴 |
| --- | --- | --- |
| Saltline | 已在浏览器进入雨港关卡。近处箱壁接住侧光，远处有吊机轮廓，地面积水只在部分视角接住亮天空。作者称单次提示、约八小时。镜像提供了完整网页，能直接查看着色器怎样按水深改变水泥纹理、粗糙度和反射。[作者原帖](https://x.com/felixrieseberg/status/2119925633564463609) · [实机](https://realcodebear.github.io/saltline-fable-5.2/) · [着色代码](https://github.com/realcodebear/saltline-fable-5.2/blob/main/index.html#L5539-L5604) | 沿一条视线安排明暗、轮廓与倒影。把这套干湿变化用在井盖旁、豆浆摊前的少数低处。 |
| 雾锁山门 | 歸藏公开了游戏和制作记录。Three.js 负责实时画面，即梦出设定图，Tripo 转模型。作者报告自己试玩了七轮，逐轮指出问题。[作者制作记录](https://github.com/op7418/guizang-game-skill) · [实机入口](https://op7418.github.io/guizang-game-skill/) | 先看清重点道具的参考和轮廓，再检查它从侧后方看是否成立。代码可以组装屋檐、门窗和摊架，实拍负责约束比例、材质和摆位。 |
| 大阪城市沙盒 | 作者使用 OpenStreetMap 的路网和建筑轮廓，以及日本国土地理院的高程和航拍数据。README 也说明，普通建筑外墙按类型生成，实际立面与招牌并未逐栋复原。[项目、数据来源与局限](https://github.com/GitHub30/fable52-gta6#readme) | 地块和遮挡关系能够让整城从远处可信。这里的地块受鞋底纹路约束，要从衢州照片补足跑步时最先看见的底层门面。 |

## 衢州照片与当前实机

桥头实拍中，锅具靠在屋檐下，墙体、树冠和后排建筑遮住部分街口，镜头能读到摊位与整条街的关系。原报道还说明，出摊时会分趟运来桌凳、炉具、锅碗。适合取作参考的是这套摆摊方式，画面可以靠锅勺、台面和接碗的位置把动作交代清楚。[2017 年黄坛口桥头实拍及家属采访](https://m.bjnews.com.cn/detail/1705029528169060.html)

| 当前机位 | 能在画面中核对的问题 | 下一轮可验证的改法 |
| --- | --- | --- |
| 桥下望向摊位 | 路中央直接通向一整块浅蓝背景。两侧建筑虽然各自不同，底层却整齐退在相近的位置。[当前桥下截图](../evidence/universes/sole-city/qa/6b1ea4cbf7be78f5/desktop-street.jpg) | 在鞋底范围内试一个错位街口，让矮房院墙和树冠挡住部分尽头，给豆浆摊留下可辨认的轮廓。转过墙角再显露后排屋顶。 |
| 摊前近看 | 红棚、锅身和柜门都偏暗哑。柜脚与地面的接合处缺少紧贴处的暗部。楼房的几类窗墙共用相同粗糙度，侧向走动时，窗玻璃和白灰墙很难靠反光区分。[当前摊前截图](../evidence/universes/sole-city/qa/6b1ea4cbf7be78f5/desktop-soy-milk.jpg) · [窗墙材质](../cases/sole-city/viewer/architecture.js) | 摊台贴墙靠檐，锅边留递碗的位置。优先给锅沿、杯口、棚边做能从侧面看见的厚度，分别制作布、金属、玻璃的表面。横移时锅沿应有移动的细亮边，棚布保留宽而柔的明暗。 |
| 从路面转看檐下 | 当前已有真实浅坑、独立井盖、局部水面和各自的街景反射。场景由一个方向光和半球光照亮。改进空间集中在干湿交界、遮蔽和檐下的间接光。[铺面与倒影实现](../cases/sole-city/viewer/pavement.js) · [街景灯光](../cases/sole-city/viewer/film.js) | 固定一个雨后清晨的天空和曝光。让白墙的反弹光照见棚下的锅，柜脚贴地处变暗。湿边仍能看清水泥砂粒，低处薄水在掠视时映出檐口。 |

## 可复用的环境美术做法

《最后生还者 Part II》的环境团队在简单体块阶段就结合玩家动线、视线和灯光设计。技术团队的论文区分了静态环境的预烘焙光照与动态物体使用的光照探针。鞋底城可以在建筑升起时逐渐加入檐下和墙根的遮蔽，完整街区才使用最终的间接光，使尚未长出的楼不会提前在路面留下阴影。[环境美术团队访谈](https://80.lv/articles/how-naughty-dog-created-the-immersive-world-of-the-last-of-us-part-ii) · [SIGGRAPH 灯光论文](https://history.siggraph.org/wp-content/uploads/2022/08/2020-Talks-Doghramachi_Lighting-Technology-of-The-Last-of-Us-Part-II.pdf)

Epic 的 City Sample 示范了如何用街道、地块和可复用构件搭建城市。亚洲街巷可对照学生作品《Back Alley》，作者公开了四套模块墙体、重点道具、粗糙度视图和布光过程。适合这里的做法是每家店独立决定开间、进深和营业方式，重复使用窗框、卷帘轨道、雨棚支架，把独立制作的精力留给豆浆摊、转角铺和跑步路线上的地标。[Epic City Sample](https://dev.epicgames.com/documentation/unreal-engine/city-sample-project-unreal-engine-demonstration) · [Back Alley 分解图与过程视频](https://www.therookies.co/entries/40044)

浏览器版可先用 Three.js 已有的粗糙度、法线、环境反射和光照贴图完成这一小段。远处重复的窗框、栏杆可以实例化。把较细的网格和贴图留给能走近的物件，再实测桌面和目标手机的帧时、贴图占用及加载时间。正式片导出的 24 帧/秒属于影片规格。[Three.js 标准材质](https://threejs.org/docs/pages/MeshStandardMaterial.html) · [实例化网格](https://threejs.org/docs/pages/InstancedMesh.html)

## 样段如何验收

1. **固定桥下眼高看向街口。** 用现版和新版同一镜头并排看，只凭灰模也应能分辨前景桥栏、中景摊棚、远景街口。再从桥上回望，检查布景全部收在鞋底内。
2. **沿湿路横移到摊前。** 在同一曝光下录一小段，观察浅水倒影、玻璃与锅沿高光是否随视角变化。从侧面检查收进去的货架、锅沿截面和柜脚接地。
3. **从完整鞋底播放，再倒拖。** 检查第一栋楼升起以前的路面、阴影与倒影。跑完导演镜头，再自由绕到摊位侧后方，用这两段实机录像决定哪些模块值得扩到全街。

## Hi3D 母模怎样进入这段街

当前发布版 `6b1ea4cbf7be78f5` 的两组 GLB 已逐项读取。豆浆摊是独立的 Hi3D 模型。沿街门面共用一份 Hi3D 母模，查看器从中取件，再按店型组装。[街区装配](../cases/sole-city/viewer/city.js) · [店面装配](../cases/sole-city/viewer/storefronts.js)

| 资产 | Hi3D 母模三角面 | 网页版三角面 | 两个版本的材质 |
| --- | ---: | ---: | --- |
| 豆浆摊 | 1,968,558 | 41,338 | 均绑定 8K 底色和 8K 金属度／粗糙度贴图，均未绑定法线贴图 |
| 沿街门面 | 1,967,780 | 92,242 | 均绑定 8K 底色和 8K 金属度／粗糙度贴图，均未绑定法线贴图 |

**先用现有资产定位损失。** 用同一机位、尺度和侧光拍母模与网页模型，先看灰模剪影和侧面，再打开材质。两版都有的粘连、破面或纸片边，要修母模或拆件重做。仅在网页版消失的锅沿、门框和栏杆，优先保留近景轮廓，再把母模的细小表面起伏烘到近景网格的法线贴图。模型在中性灯光下表现良好，却在街里变平，就查棚下补光、反射和接地阴影。实测前保留这三种可能。

**把新增 Hi3D 资产放在镜头会绕过去的地方。** 第一批候选是桥脚的转角店及摊旁相邻的一家铺。每店各给一张实拍主参考与一份尺寸草图，标出开间、门槛、货架进深、雨棚伸出量和安装招牌的位置。转角店需要能从两条街读出的立面。小区门与天桥作为独立地标保留，桥的平台、踏步、扶手和可行走表面分别核对。普通楼层可组合复用 Hi3D 门窗、阳台和屋顶构件，最后按店名另排中文字并贴合实体门楣。

**让宣传片和自由探索共用校过的几何。** 近处保留锅口、栏杆和建筑轮廓，远处再切简化版本。正式片按导出机位选择细节层级，自由探索按屏幕中所占尺寸切换。用同一段桥到摊的往返录像核对切换、阴影、材质和桥面通行，在目标设备记帧时。样段成立后再把已验证的设置扩到其余街区。

## 从 Saltline 的逆光雨港看本版老街

补截的三个视角来自用 Chromium 运行的公开游戏镜像。正对太阳时，箱间水面连成一条亮带。转向侧面后，同一地点的背光钢板很暗，表面的筋条和边缘仍能看清。对照老街时采用玩家上传的主图，另外这三张用来检查换方向之后的质感。[主通道逆光](../evidence/universes/sole-city/saltline-look-study/saltline-live-quayside.jpg) · [转向箱壁](../evidence/universes/sole-city/saltline-look-study/saltline-live-side.jpg) · [堆场侧光](../evidence/universes/sole-city/saltline-look-study/saltline-live-yard.jpg) · [公开实机](https://realcodebear.github.io/saltline-fable-5.2/)

玩家截的这一帧里，左侧同一排箱壁转过一道棱，正面便落入暗部，侧面的每根凸筋却接住窄窄的亮边。中央水面收进亮天空和暗箱体的倒影，两侧的粗糙地面仍看得见颗粒。远处吊机透过暖色空气还能读清桁架。老街版本 `f2df3d1aba6b7b23` 也有桥、遮阳棚和局部积水，但桥下机位最先读到的是两排重复的窗。到摊前，软糊的棚布褶皱比锅口和摞碗的边缘更显眼。[玩家实机原图](../evidence/universes/sole-city/saltline-look-study/saltline-user.png) · [本版街景](../evidence/universes/sole-city/qa/f2df3d1aba6b7b23/desktop-street-facades.jpg) · [本版豆浆摊](../evidence/universes/sole-city/qa/f2df3d1aba6b7b23/desktop-soy-milk.jpg)

1. **先换近看的构件。** 楼上现用六幅窗墙单元图，每幅约 512 像素且包含多扇窗。已有的凹洞和窗台能投影，玻璃后面的东西仍和窗格一起留在图上。先把桥脚一跨立面做成可复用样件，保留合格的 Hi3D 主体，给木框、玻璃和窗内遮挡各自的深度。用中性侧光沿窗横移半米，前框应先遮住窗内一件物体，然后露出它的另一侧。[现有窗墙切片与几何](../cases/sole-city/viewer/architecture.js#L80)
2. **再让衢州的材料各自接光。** 低角度晨光从天桥一侧进街，让棚布压暗柜台，街口亮天在锅沿形成细亮边。给水泥浅坑、湿边、干燥补丁三个位置固定取景。本版已有水坑环境探针，先横移核对水里檐边与实物的相对位置。出现明显漂移的大水面再试局部平面反射。Saltline 的着色器让水深同时改变底色、粗糙度和表面法线，可以借用这一关系，保留老街清晨路面的少量积水。[本版反射采样](../cases/sole-city/viewer/pavement.js#L256) · [Saltline 湿地与反射](https://github.com/realcodebear/saltline-fable-5.2/blob/main/index.html#L5539-L5621)
3. **用往返机位决定能否铺到全城。** 锁定同一眼高、视场角和曝光，走桥下、摊前、桥面回望，再转进支巷。灰模检查窗台、锅沿、桥栏是否有厚度。恢复材质后检查水泥、棚布和金属能否仅凭亮边宽度分辨。最终光照下检查从棚内回望时还看得清街口。将通过的窗墙构件、材质和灯光设置铺进其他街区，用一条未参与调光的支路复验。[本版桥面回望](../evidence/universes/sole-city/qa/f2df3d1aba6b7b23/bridge-return.jpg) · [本版支巷](../evidence/universes/sole-city/qa/f2df3d1aba6b7b23/held-out-alley.jpg)

调光可以先做一次便宜、可逆的实机实验。现版主光按街区坐标计算，太阳仰角约 51°。保留这个版本作对照，固定桥下机位和曝光，试一组沿街偏侧的低角度光，例如 15°、25°。看实际哪一束能擦亮棚边和井盖，同时让早晨的亮天空出现在低处水面里。如果沿街建筑完全挡住直射光，先找天光能穿过的巷口，再定方位。从桥上反看一次，避免只在摊前一个角度成立。[现版主光位置](../cases/sole-city/viewer/film.js#L86) · [参考与桥下实机并排图](../../演示素材/那天，我跑着去买豆浆/Saltline与鞋底老街-光线和地面对照.jpg)
