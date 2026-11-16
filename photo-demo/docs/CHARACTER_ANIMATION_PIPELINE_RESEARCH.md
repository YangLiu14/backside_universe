# 《铅笔倒带》人物动画制作流程调研

调研日期：2026-11-16（Asia/Shanghai）。范围：Hi3D 人物资产、Blender、glTF、Three.js。以下区分官方已说明的能力与本项目的制作建议；本文件是方案研究，不代表三名人物已经完成重绑骨、动作制作或质量验收。

后续制作与逐版验收另见[人物动作实现记录](CHARACTER_MOTION_IMPLEMENTATION.md)。下文保留调研时旧版的真实问题与依据。

## 结论

自然人体动作所需的工具链已经成熟：可变形网格 → 骨架与蒙皮 → 动作制作或重定向 → 手部接触和脚部接地修正 → 烘焙骨骼动画 → 引擎播放。高精度静态人体只是其中一项输入。Blender 的 Rigify 文档明确区分了生成骨架控制器和蒙皮；自动权重文档也明确提醒可能出现不正确变形，仍要修正权重。因此，自动绑骨成功不能等同于动作自然。[Rigify 的职责](https://docs.blender.org/manual/en/5.0/addons/rigging/rigify/introduction.html)、[自动权重的局限](https://docs.blender.org/manual/en/5.2/animation/armatures/skinning/parenting.html)

**本项目建议／推论：** 对近看人物停止用大范围静态顶点位移承担肘、腕、膝的主要运动。保留外观合格的 Hi3D 原始资产，制作可编辑的蒙皮角色；先做一名女生完整行走样段与男生一次持球到出手样段，再扩展第三人。面部表情和局部关节修形仍可使用经制作、验证的 shape keys，不能把所有 morph 一概视为错误。

## 当前项目已确认的问题

对本地版本 `bf576173d6000748` 的真实 GLB 和实际动作函数完成了只读审计，方法、可复现脚本、选区限制与完整数值见[动作审计](../evidence/universes/after-school-rewind/motion-research/AUDIT.md)。

- 五件角色资产均没有 skin、关节权重或动画轨道；目前的肢体动作由网页按坐标范围生成顶点形变。
- 男生在 1.22 秒时，前臂几何选区的局部非退化边长最大为原始的 3.010 倍。身体比例调整后，抬手算法仍保留旧深度常数，又叠加渐变权重和形变外推；这是额外动态拉伸的实证，不代表源模型手部解剖已合格。
- 女生同一个鞋底顶点在 0.6167–3.4000 秒间保持地面上方 12.00–12.36 mm，却水平滑移 1.1177 m。现有算法只补偿脚底高度，人物根节点以独立速度前移，缺少支撑阶段的世界位置约束。
- 实际加载函数探针输入 1 个 SkinnedMesh、1 根骨骼、1 个动画片段，输出全部为 0。静态装配入口重建普通 Mesh 并逐轴归一化；正式角色必须采用保留骨架、绑定矩阵、层级和动作的入口。

此前人物美术通过结论已撤回为 `fix`，当前复核状态是 `next=repair`。原检查主要覆盖截图机位、角色数量、朝向和单个持球锚点，未证明全段动作自然。连续动作的制作与验收要求已补入[场景画质流程](SCENE_ART_WORKFLOW.md#人物从模型到动作)。当前演示的动作尚未替换。

## 从模型开始，先取得合格的变形基础

Blender 官方说明，自动 remesh 一般不能直接提供适合角色变形的最终拓扑；角色通常需要顺着形体重新布置网格。增加面数、自动四边化与“关节能正确弯曲”不是同一件事。[Blender Remeshing / Retopology](https://docs.blender.org/manual/fi/5.2/modeling/meshes/retopology.html)

**本项目建议／推论：** 新角色的生产输入用可清晰识别四肢的 A pose 或 T pose；双臂与躯干、双腿和各手指间留出空间，脚掌朝向统一，人物尺寸和原点一致。A/T pose 是本项目选择的中立姿态形式，Adobe 官方要求的是 neutral/default pose，并没有规定所有输入必须是某一种 T pose。已摆成投篮姿态、手指粘连的静态模型应先修模或重新准备中立姿态，不能指望自动绑骨恢复缺失的手指间隙。[Mixamo 输入要求](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)

**本项目建议／推论：** 原始高模作为外观参照；针对肩、肘、腕、指节、髋、膝、踝做变形网格，保留衣服轮廓、脸型和手指厚度。手部必须有独立的拇指方向、指节转轴与相应权重；贴图细节无法补救几何上融合的指头。重新布面后按新 UV 转移/烘焙外观贴图，并以中性光确认没有接缝和细节损失。首先验收弯肘、转腕、握拳、蹲下、单腿支撑的姿态，再接动作。

## 可采用的三条制作路线

| 路线 | 官方可确认的能力 | 本项目代价与适用性（推论） |
| --- | --- | --- |
| Blender Rigify + 蒙皮修正 + 动作编辑 | Rigify 生成骨架和控制器，包含肢体 IK/FK、手指控制；蒙皮是另一个制作步骤。[Rigify](https://docs.blender.org/manual/en/5.0/addons/rigging/rigify/introduction.html) | 人工准备成本较高，但可直接修改手指、脚底接地、肩肘体积；适合近看男生投篮和最终质量收尾。 |
| Mixamo 自动绑骨 + 动作库 + Blender 修正 | 上传类人模型后自动绑骨；动作库可在上传人物上预览，调速度、手臂间距并下载。[绑骨](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html)、[动作库](https://helpx.adobe.com/creative-cloud/help/animate-characters-mixamo.html) | 适合快速取得走路等基础动作；仍需要目标人物上的接地、比例、手部接触修正。账号可用性必须先实测，不能作为唯一依赖。 |
| Hi3D 官方 Rig & Animate / Rigging & Retargeting 工作流 | 官网列出类人骨架、蒙皮转移、动作适配和可编辑动画的工作流。[Hi3D 官方](https://www.hi3d.ai/agent?category=game-character) | 可用现有资产先验证一个样本；当前会话连接器没有开放对应 rig/animate 调用，不能把网页入口当作已经可调用的 API。输出格式、骨架、手指、动作与费用仍需实际确认。 |

Hi3D 能力边界：本会话主任务的工具审计发现 `mcp__hi3d_intl.get_capabilities` 仅暴露建模与 2D 生图，工具清单没有 rig/animate。这个结论仅适用于当前连接器，不表示 Hi3D 网站没有动画功能。官网的能力描述也不能替代对本项目三名角色的实际变形检查。

### Blender 路线中的关键区别

Rigify 要先把 meta-rig 的骨头放到人物正确部位，再生成控制器；`Basic Human` 不含脸和手指，应使用含手指的 Human 配置或补齐相应组件。自动权重使用 bone heat 分配影响，复杂或靠近的网格可能被错误骨头带动，必须用权重编辑修正。[Rigify 基本流程](https://docs.blender.org/manual/en/latest/addons/rigify/basics.html)、[Armature Deform Parent](https://docs.blender.org/manual/en/5.2/animation/armatures/skinning/parenting.html)

Rigify 提供独立手指 FK 链和可选指尖 IK；文档说明指尖 IK 只是对 FK 的修正，通常先用 FK 摆好手指，再在需要固定指尖时启用 IK。因此“有 IK”并不等于自动得到正确抓握。[Generated Rig Features](https://docs.blender.org/manual/en/4.5/addons/rigging/rigify/rig_features.html)

### Mixamo 输入、许可和局限

Mixamo 的上传格式为 FBX、OBJ 或 ZIP；已有骨架的角色要用 FBX，系统会尝试映射到 Mixamo 骨架。本项目若只有 GLB，需要先经过 Blender 转换。官方要求双足类人、中立姿态、无额外场景物件、没有离体悬空部件、干净网格；大件衣服、头发、道具或极端比例可能让自动绑骨失败。[上传与绑定说明](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html)、[FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)

Adobe FAQ 说明服务凭 Adobe ID 免费使用，角色和动画可免版税用于个人、商业和非营利项目，包括游戏；同页仍写明不向中国国家代码账户以及 Enterprise/Federated ID 提供服务。该页面标注最后更新于 2021-09-14，本次于上述调研日期复核，实际账户可用性尚未测试。[Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)

**未核实事项：** 没有找到上述官方帮助文档对任意自定义角色的逐指绑定质量作出保证；没有在登录后的当前动作库确认适合本镜头的投篮动作。不能承诺点击自动绑骨后，截图中的握球姿态和手指就会自动修好。下载动作后，还须检查骨名、rest pose、骨长、朝向和手指轨道，再进行重定向与编辑。

## 女生滑步与男生手部要分别修什么

Epic 官方把重定向后的滑步列为专门问题：源与目标角色的腿长和站姿不同会造成偏差，Speed Planting 利用脚部速度曲线在应当接地时固定 IK 目标。其 Stride Warping 按移动速度与 root motion 速度的比例调整步幅。这证明“动作重定向”与“接地、步幅校正”是相邻但不同的工序。[Fix Foot Sliding with IK Retargeter](https://dev.epicgames.com/documentation/unreal-engine/fix-foot-sliding-with-ik-retargeter-in-unreal-engine)、[Pose Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/pose-warping-in-unreal-engine)

**女生方案（本项目建议／推论）：** 选择完整的步态动作，含骨盆移动、重心转移、髋膝踝、脚跟到脚尖滚动及相反方向的摆臂。先将动作中的 root 位移与球场路线统一；若使用原地步态，路径速度必须匹配动作的实际步幅和周期。不能独立给人物根节点任意速度，同时播放固定频率的腿部循环。每只脚的支撑段要在世界坐标中保持位置，摆动段离地；在 Blender 中校正并烘焙。两名女生可以共享基础动作，再调整起步相位、步速与转头时机。

**男生方案（本项目建议／推论）：** 先修静态手型和肩肘腕蒙皮，再制作屈膝蓄力、伸腿抬臂、出手、随动回落的连续动作。双手握球阶段以球与手部目标对齐，分别编辑掌心方向、拇指和四指弯曲；出手后球才沿独立轨迹运动，腕部保留自然随动。这里的接触约束必须围绕当前篮球尺寸、男生臂长和机位制作，不能直接假设一个通用动作文件与现有球轨迹吻合。

本项目是固定短段表演，优先在离线制作中完成这些接触修正并烘焙；暂不需要引入整个 Unreal 动画系统。上述 Epic 工具是成熟技术的参考依据，不是本项目已经集成的功能。

## 从 Blender 交付给 Three.js

Blender 的 Bake Action 会逐帧计算包含约束、驱动器和 F-Curve 修改器的最终变换，并形成关键帧；Visual Keying 使用约束作用后的结果。glTF 导出支持物体变换、骨骼姿态和 shape key 数值，不能期待 Blender 的任意物理、材质或控制逻辑原样进入浏览器。[Bake Action](https://docs.blender.org/manual/en/4.5/editors/nla/editing/strip.html)、[glTF 动画支持](https://docs.blender.org/manual/sr/4.5/addons/import_export/scene_gltf2.html)

**交付建议／推论：** 保存可编辑 `.blend`，另导出含网格、skin、骨架和已命名动画的 GLB。把最终变形骨骼、人物 root 与球的运动烘焙，保留统一时长、帧率和出手时刻。优先使用稳定的 TRS 骨骼动画；若使用 B-Bone 等特殊变形，必须另做导出一致性验证。重新导入 GLB，核对起点、中段、末帧及逆序抽帧；不能只在 Blender 源文件中看起来正确就验收。

Three.js 的 `SkinnedMesh` 需要骨架、顶点 skin indices 和 skin weights；加载时应保留这些绑定信息。复制已绑定人物应采用 `SkeletonUtils.clone` 保持 mesh 与复制后骨骼的对应。`SkeletonUtils.retargetClip` 可以按骨名映射等参数重定向，但其 API 不承诺自动修复抓握或接地；本项目最终动作优先离线修正。[SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html)、[SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html)

`AnimationMixer.setTime(t)` 能直接采样某个时刻，其输入受 mixer 的 `timeScale` 影响；`AnimationAction.timeScale < 0` 可以反向播放。需要注意 `clampWhenFinished` 会在末帧把 action 暂停，因此拖动倒带时必须正确处理 action 的 enabled/paused 状态。[AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)、[AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)

**本项目建议／推论：** 以现有可逆时间轴为唯一时间源，把人物、球、表情都映射到同一绝对时间；固定 mixer 的 `timeScale = 1` 后按时间采样。不能让人物靠逐帧累积 delta、篮球靠另一段独立计时。验证顺序播放、直接跳到同一时间、倒放回到同一时间时，骨骼和球的位置一致。绝对时间采样支持可逆播放，但动作本身是否自然仍必须由连续录像和近看验收。

## 建议的落实顺序与尚未解决的条件

1. 资产与加载路径审计已完成；继续在制作阶段检查原始手型和关节拓扑，准备保留绑定关系的独立角色加载入口。
2. 先为一名女生取得合格的中立姿态蒙皮角色，完成一个完整行走周期、路线匹配和脚底接地。用实机侧面连续录像验证，再扩到另一名女生。
3. 男生单独处理手、腕、肩肘，再制作与篮球轨迹匹配的投篮短段；握球、离手前后和跟随动作必须近看。
4. 从可编辑源文件导出 GLB，接入统一时间轴，检查正放、倒放和随机定位，再移除替代这些关节的旧顶点形变。

上述顺序和成本判断为本项目建议。当前仍需验证：Hi3D 网站动画入口的真实输出及当前账号权限、Mixamo 账号可用性、可用动作的适配质量、重新布面与权重修正工作量。未完成这些验证前，不给出“自动处理即可达到 3A 质量”或固定制作时长的承诺。本轮没有提交新的付费生成任务。
