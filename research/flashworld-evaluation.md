# FlashWorld 单图办公场景试验：官方依据与运行约束

核查日期：2026-11-05。服务器代码提交：`424db4487de308a39e5137afbe85e7568a96193f`。本文为运行前研究，**不代表已生成或验收了本项目场景**；实际运行记录由独立实验目录保存。

## 核心判断

FlashWorld 值得实跑：它用视频扩散先验和蒸馏，在四步去噪过程中直接产生 3D Gaussian 场景。它也会生成单图没有观察到的内容；这些内容不能当作实测重建。论文明确列出的困难包括精细几何、镜面反射和关节物体，正好涉及办公图里的灯臂、椅子、电脑边缘等细结构。[论文方法与局限](https://arxiv.org/html/2510.13678v1)

官方速度不是 RTX 3090 的速度保证。README 宣称 A100/A800 约 7 秒、H100/H800 约 4 秒；另列 A800 实际配置表如下。应分别记录下载、首次初始化/JIT、生成、导出和渲染时间，不能把热态推理数字当成冷启动端到端体验。[官方 README](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/README.md)

| 官方 A800 配置 | 生成耗时 | 显存 |
| --- | ---: | ---: |
| 默认 | 8.5 秒 | 51 GB |
| `--offload_t5` | 16.6 秒 | 30 GB |
| `--offload_t5 --offload_transformer_during_vae` | 20 秒 | 24 GB |
| `--offload_t5 --offload_vae` | 10 分钟 | 9 GB |

3090 可先尝试第三行；实际显存还要给桌面和 CUDA 临时分配留空间。代码的 FP8 线性层在计算能力小于 9.0 时会转回 BF16 做矩阵乘法，因此 3090 缺少原生 FP8 不等于无法运行，但不能据 H100 的吞吐量推测其速度。[量化实现](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/quant.py)

## 输入、裁切与相机

作者在 #30 建议保持 `[24, 480, 704]` 的视图数、高、宽不变，以匹配训练；需要更大图像时调整最终渲染分辨率，而不是直接放大生成分辨率。[作者答复 #30](https://github.com/imlixinyang/FlashWorld/issues/30#issuecomment-3905859750) 但本次固定提交的官方前端又明确提供 `[24, 704, 480]` 竖幅选项，两份官方依据存在张力。因此首轮采用横幅默认；第二轮可以采用官方 UI 的竖幅选项，单独标记尺寸，不应一概宣称竖幅不受支持。[前端 supportedResolutions](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/index.html#L965)

项目输入照片是 1320×1739 竖幅。官方 CLI 按输出宽高比中心裁切后缩放，默认会保留约 1320×900 区域，约 48% 的原始高度被裁掉。第一轮必须保留并展示**实际处理后的输入**，不能用整张原照与裁切生成结果直接声称保真或失真。使用前端提供的 480×704 竖幅选项，则会保留约 1185×1739，仍裁掉约 10% 宽度，并非完整原图。[CLI 图像预处理](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/cli.py)

JSON 字段为 `image_prompt`（路径或 base64）、`text_prompt`、`resolution`、`image_index` 和 `cameras`。每个相机含 `position`、`quaternion`、`fx/fy/cx/cy`；`image_index` 指定哪个轨迹视点与输入图对应。CLI 会根据原图尺寸和中心裁切调整所有相机内参，因此 JSON 的内参必须与传入图像的像素坐标对应，不能先改成生成分辨率又让 CLI 再缩放。[CLI](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/cli.py)

代码读取的旋转是 camera-to-world、四元数顺序 `wxyz`；射线方向使用 OpenGL 约定：前方 −Z，上方 +Y。相机轨迹先相对第一相机变换，再按最大平移距离归一化。绝对尺度不构成实测尺寸依据；作者也说明轨迹尺度会被归一化。[相机与射线实现](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/utils.py)、[作者相机说明 #33](https://github.com/imlixinyang/FlashWorld/issues/33#issuecomment-4073063287)

接入现有查看器时特别注意：`normalize_cameras` 除以 `T_norm + 0.01`；`export_gaussians` 只将位置和尺度乘 `T_norm`，没有应用 `ref_w2c` 的逆变换。导出的场景仍以轨迹第一相机为参考，查看器不能直接照抄原世界坐标相机。必须保存 `ref_w2c`、`T_norm` 和变换后的源视角相机。[归一化及导出代码](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/utils.py)

## 权重与磁盘预算

通过 Hugging Face 官方 API 获取以下文件元数据；这里只列运行加载的目录，不是整个仓库镜像。[FlashWorld 文件 API](https://huggingface.co/api/models/imlixinyang/FlashWorld?blobs=true)、[Wan 文件 API](https://huggingface.co/api/models/Wan-AI/Wan2.2-TI2V-5B-Diffusers?blobs=true)

| 资源 | revision | 大小 |
| --- | --- | ---: |
| FlashWorld `model.ckpt` | `6a8e88c6f88678ac098e4c82675f0aee555d6e5d` | 20,936,494,840 字节 |
| Wan 的 transformer、text_encoder、VAE、tokenizer、scheduler | `b8fff7315c768468a5333511427288870b2e9635` | 34,201,417,901 字节 |
| 以上合计 | 不含 Python/CUDA 环境、下载缓存与输出 | 55,137,912,741 字节 |

FlashWorld checkpoint 的 LFS SHA256：`610a09a11917ae112ea71f2f42291d5c8f11f54ae501ec14a8740f22da2540bd`。

服务器初查根分区仅约 70 GB 空闲，因此直接按原始加载器下载全部资源再装环境比较紧张。`GenerationSystem` 先从 Wan 加载 transformer，随后以 FlashWorld checkpoint 的 `transformer` state dict 完整覆盖；这提供了省去约 20 GB Wan transformer 下载的候选优化：只读 config 构造结构，再 strict 加载 FlashWorld 权重。**这是代码推断，必须核验所有 key/shape 完全匹配，并记录加载器修改；不能假定优化已经成功。** 同时初始化会暂时持有 FP32 模型与 checkpoint，CPU 内存峰值也需实测。[加载器](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/app.py)

## 依赖和实现注意事项

官方锁定 Torch 2.6.0、torchvision 0.21.0、Triton 3.2.0、transformers 4.57.0、numpy 2.2.6，并固定三个 Git 依赖：

- diffusers：`447e8322f76efea55d4769cd67c372edbf0715b8`
- gsplat：`32f2a54d21c7ecb135320bb02b136b7407ae5712`
- spz：`a4fc69e7948c7152e807e6501d73ddc9c149ce37`

应隔离安装；任何偏离官方版本均写进环境快照。gsplat 需要可用的 CUDA 编译环境时，不能把 `nvidia-smi` 的驱动兼容 CUDA 版本误认为已安装 `nvcc`。[requirements.txt](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/requirements.txt)

从源代码看到的具体注意点：

- 不需要安装 Hugging Face 的 `spaces` 包。导入成功会进入 Spaces 模式；该模式有服务器工具链安装分支，不适合照搬为个人服务器安装方式。
- 显式传 `--ckpt`，避免 CLI 硬编码 snapshot 路径与当前缓存布局耦合。
- CLI 的 `--video_fps` 参数未传进 `GenerationSystem.generate`，实际仍使用后者默认 15；若改帧率需修复并记录。
- CLI 的 `start_time/end_time` 没有输出，也没有可靠分离生成与视频渲染；应加同步计时和 GPU 峰值记录。
- CLI 不固定随机种子；受控比较应保存并固定 seed。
- `--video` 会在 `generate` 内渲染完整插值路径，包含在其返回前耗时；首轮可先导出 PLY/SPZ，再单独渲染选定机位。

以上来自本次读取的固定提交代码。[CLI](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/cli.py)、[app.py](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/app.py)

## 许可记录

GitHub 代码标记 Apache-2.0，但官方 Hugging Face 权重仓库标记 **CC-BY-NC-SA-4.0**。这次个人技术研究与此前“只选可产品商用基线”的任务范围不同；不能因为代码 Apache-2.0 就把权重也记为 Apache-2.0。实际产品使用前需单独处理权重许可。[代码 LICENSE](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/LICENSE)、[官方模型卡](https://huggingface.co/imlixinyang/FlashWorld)

## 本项目的建议验收

首轮保持官方分辨率、24 视图与四步去噪，先检验 3090 能否在可接受耗时/显存内产生有效 3DGS。保存输入与实际裁切图、JSON 相机、seed、源码提交、依赖、权重 hash、加载/推理/导出时间、峰值显存与错误日志。

实际质量检查须分开回答：源视角电脑/杯子/灯/椅子是否被改写；±6°、±12°的边缘和背景遮挡是否连贯；更大角度是否出现空洞、漂浮、高斯拖影或失真。导出存在、浏览器能加载或图像连续，不等于原照保真通过。当前没有真实多视角 ground truth，隐藏面只能评价合理性与一致性，不能验证其真实性。

## 加载优化的等价性审查

父实验采用 `accelerate.init_empty_weights(include_buffers=False)` 构造 transformer、`torch.load(mmap=True)` 读取 checkpoint、`load_state_dict(assign=True, strict=True)` 注入全部权重。这是避免冗余 Wan transformer 下载的实现方案。应核查以下条件后再把它描述为仅加载优化：

1. transformer 的 `rope.freqs_cos`、`rope.freqs_sin` 是非持久 buffer，不在 state dict 中；必须由构造函数真正计算，不能遗留 meta。加载后所有参数和 buffer 均须非 meta，RoPE 应为有限值。
2. 原实现将 state dict copy 到 FP32 transformer，而 `assign=True` 保留 checkpoint tensor dtype。若 checkpoint 不是 FP32，必须显式匹配原精度，否则会改变 FP8 量化输入与误差。
3. 原实现对 transformer、recon_decoder 调用 `train()`。代码的注意力 dropout 是 0，VAE 配置 dropout 是 0，recon 的随机 mask 默认关闭；导入的 `EMANorm` 没有实例化。没有发现这份配置下由 train 状态产生的有效 dropout 或 EMA 更新，但仍应保留原状态以减少变量。
4. 初始化会消耗不同的 RNG 序列；必须在完成模型加载/量化后、每次 generate 前重新设置随机种子。生成本身包含 VAE 分布采样、初始噪声与三次再加噪，不能只在脚本最初 seed 后就认为两种加载器输出可比。

这些检查来自固定提交的 [transformer](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/models/transformer_wan.py)、[recon_decoder](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/models/reconstruction_model.py)、[生成实现](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/app.py) 与 [官方 VAE 配置](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/b8fff7315c768468a5333511427288870b2e9635/vae/config.json)。静态审查不能代替实际 strict 加载和 GPU 前向验证。

## 建议的 24 相机小角度轨迹与导出机位

下面是为本项目设计的实验参数，不是作者给定的唯一轨迹。以输入视角为原点，设轨道目标 `(0,0,-1)`，半径 1。24 个角度取 `concat(linspace(-12,0,13), linspace(0,12,12)[1:])`，因此第 12 个零基索引恰为 0°；`image_index=12`。

每个角度 θ 的相机为：

```text
position = (sin θ, 0, cos θ - 1)
quaternion_wxyz = (cos(θ/2), 0, sin(θ/2), 0)
```

这一单调轨迹的第一相机在 −12°，`T_norm = 2*sin(12°) ≈ 0.415823`。归一化轨道半径约 2.348，而导出坐标的统一比例为 `s=T_norm/(T_norm+0.01)≈0.9765`。放大半径大致会被归一化抵消，不能靠任意放大世界单位改变真正的几何视差。轨道目标深度仅为生成控制参数，不能称作测量出的桌面物距。

设原轨迹第一机位为 `(R0,p0)`，任意机位为 `(Ri,pi)`，则用于读取官方导出 PLY 的 camera-to-world 应为：

```text
R_export = transpose(R0) @ Ri
p_export = s * transpose(R0) @ (pi - p0)
```

目标点使用同一平移公式。更稳妥的实现是直接保存 `normalize_cameras` 返回的全部相机，然后把平移乘 `T_norm`，旋转与内参保持不变；源视角从中取第 12 项。若第一相机改动，所有导出机位都须重新计算。[推导依据：相机归一化和导出实现](https://github.com/imlixinyang/FlashWorld/blob/424db4487de308a39e5137afbe85e7568a96193f/utils.py)
