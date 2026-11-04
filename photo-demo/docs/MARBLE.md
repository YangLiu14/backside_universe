# Marble 1.1 完整书桌验证

入口：<http://127.0.0.1:9988/marble-lab/index.html>。

已于 2026-11-04 完成一次真实生成、机位配准及 ±12° 检查。实际消耗 **1,580 credits**，约 $1.264；没有追加生成。
页面加载原始 full-resolution SPZ，共 **1,920,000 个 Gaussian**。现有主 demo 和其他实验没有被替换。

**本次结论：未达到照片精确还原目标。** 房间和桌面在小幅绕行中基本连续，检查停点没有看到电脑后方的大块空洞；放大后电脑屏幕边缘仍有细小毛边、漂浮纹理。更明显的问题是蓝杯、书上小物件、耳机和椅子的形状已被改写，0° 时就与原照不同。调相机不能修复这些内容差异。此次只评估这张图的可用性，不据此宣称模型整体排名或其他输入的效果。

## 实际生成记录

- Model：`marble-1.1`；seed：`20261104`。
- Operation：`da3055de-ec6e-451c-a5c6-aebf492a651f`。
- World：`4d124ba3-8a9a-4775-a3e1-08511dbc67a9`。
- 费用：普通照片全景生成 80 credits，世界生成 1,500 credits。
- 本地 full-res SPZ 29,803,616 bytes；另保留 500k SPZ、全景图和碰撞网格，不调用额外收费网格导出。
- 每项资产的 SHA256、尺度、机位和目视结论见 `dist/marble-lab/assets/scene.json`。

## 输入与范围

- 完整 `dist/assets/desk-original.jpg`，1320 × 1739，不裁切、不拆分物体、不编辑。
- SHA256：`a5a2ad89c596347fb97f38b9741b2d5e831f657cefa33b4150d7709c8d9365a0`。
- 固定 `marble-1.1`，固定 seed 20261104，普通照片输入 `is_pano: false`。
- 不传入度假世界描述。沿用官方图片模式默认 recaption，原图作为唯一图像输入。
- 云端世界显式设为非公开、禁止凭 ID 访问；生成资产下载到本机验证。
- 本次为项目照片的适用性验收，不做或发布供应商竞争排名。商用输出、服务使用及其他限制遵循 [World Labs 条款](https://www.worldlabs.ai/terms-of-service)。

## 本机配置

在 [World Labs API 平台](https://platform.worldlabs.ai/) 创建 key，填入应用根目录 `.env.local`：

```dotenv
WORLD_LABS_API_KEY=填入自己的密钥
```

`.env.local` 已被忽略，不位于提供网页的 `dist/` 下。不要把 key 发到聊天、提交到 Git，或放入浏览器代码。也可以通过进程环境变量配置。脚本只读取指定变量，不执行 dotenv 中的 shell 语句。

截至 2026-11-04，[官方 API 计费](https://docs.worldlabs.ai/api/pricing) 为普通图 80 credits 全景生成＋1,500 credits 世界生成，约 $1.264；API 与网页会员积分独立。脚本在提交前检查余额至少 1,580 credits，不购买积分、不改自动充值设置、不调用额外收费网格导出。

## 执行与续接

以下命令在 `photo-demo/` 下运行：

```sh
python3 scripts/marble-world.py prepare   # 离线请求摘要，不上传/扣费
python3 scripts/marble-world.py generate  # 首次提交一次；已有任务则只续接
```

任务记录在忽略的 `evidence/marble-lab/job.json`。收费 POST 前先落盘提交状态，并使用进程锁防止并行重复生成。若提交响应丢失，不会自动重试 POST；到平台找回原任务 ID 后：

```sh
python3 scripts/marble-world.py resume --operation-id 原任务ID
```

若已有 operation ID，重新执行 `generate` 只轮询该任务、补下载已有资产。原始响应和下载地址只留在 `evidence/`；网页仅加载本地 SPZ、原照与筛选后的元数据。原照片哈希不一致时拒绝提交。

## 原图对齐与绕行

根据 [官方渲染文档](https://docs.worldlabs.ai/api/rendering-spz) 应用服务返回的 `metric_scale_factor` 和 `ground_plane_offset`，然后从 Marble OpenCV 坐标转为 Three.js 坐标；不能直接套用 InfiniSplat 的世界坐标或绕行中心。

初始全景机位向上偏移，不能直接用作照片参考角度。使用 SIFT/MAGSAC 筛选共同特征，再对这些特征做 Gaussian 射线查询，只拟合相机六自由度和垂直 FOV，不对场景或图片做二维变形。最终 128 个共同特征的中位投影残差为 4.90 px、90 分位为 9.82 px（630 × 830 渲染尺寸）；这些是参与拟合特征上的误差，不是整张照片的质量分数。

经目视检查的默认机位为：位置 `(-0.00433, 1.70216, -0.02684)`，yaw `0.0011°`、pitch `-28.2444°`、roll `0.17335°`，垂直 FOV `76.7446°`。绕行半径 `2.3266` 来自 19 个桌面特征的生成深度中位数，未经真实测量；页面仍提供人工校准、按 world ID 保存和导出记录。没有真实机位或新视角实拍真值，不能标为精确标定。

验收时先调整多个锚点共同对齐（电脑屏幕/底座、杯子、桌沿、书本），记录可见残差；再锁定相机参数检查 ±6°、±12°。左右画面采用相同图像裁切范围。轨道绕固定三维点，返回同一角度应得到相同机位与图像。

原照始终显示于左侧；右侧原照按钮仅用于 0° 校准，开始拖动或播放即退出。正常绕行无原图叠加、无景深/后期模糊、无手工物件替换。保留 [Spark 的标准 Gaussian 抗锯齿](https://sparkjs.dev/docs/spark-renderer/)（`blurAmount: 0.3`，协方差滤波并修正不透明度），避免窄屏像素采样造成额外缺口；这不是画面后期虚化。洋红色检查透明/未覆盖区域，不代表所有重影都能自动识别。

## 验证和资产

```sh
python3 scripts/test-marble-runner.py     # 无网络：一次提交、断点恢复、余额保护
node scripts/check-marble-camera.mjs     # 固定中心轨道、连续性、原路返回
node scripts/check-marble-lab.cjs         # 有资产才执行真实渲染检查；否则只检查等待页
```

生成后资产位于 `dist/marble-lab/assets/`，除小型 `scene.json` 之外均忽略。原图复用已有本地文件，无复制进 Git。浏览器截图、完整服务响应及原版本 121 个文件的保全哈希记录在 `evidence/marble-lab/`，不会提交。

已完成四种观察范围 × 七个角度，共 28 个真实渲染停点；往返同角度的相机和图像像素一致，拖动、键盘、播放暂停及窄屏布局检查通过，无 JS 错误。本机 `.env.local` 的网页路径返回 404。窄屏检查不等同于手机真机性能测试。

配准过程可复查：`scripts/capture-marble.cjs` 保存实际页面截图与相机，`scripts/fit-marble-camera.py` 拟合旋转/FOV，增加 `--depth` 后使用 `ray-matches.json` 拟合位置。候选参数默认标为未验证，必须目视检查后才能写入场景记录；所有证据位于本地 `evidence/marble-lab/`。

此输出作为原始基线保留。后续复用同一个世界完成了[实体替换](MARBLE_HYBRID.md)与[局部融合修正](MARBLE_REFINED.md)，没有重复付费生成。用户已认可融合版，并决定后续向背面绕行时交接到建模世界；复用流程与边界见 [Marble 工作流参考](MARBLE_WORKFLOW_REFERENCE.md)。原始输出的物件保真限制仍成立。

## 浏览器检查配置

`capture-marble.cjs` 和 `check-marble-lab.cjs` 共用 `scripts/marble-browser.cjs`，优先使用本机可解析的 `playwright` 包及其默认 Chromium。可按本机安装位置设置：

```sh
export PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright
export CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium
export MARBLE_BASE_URL=http://127.0.0.1:9988
npm run check:marble-browser
```

三个变量均可省略；包也可通过 `NODE_PATH` 解析，macOS 自动启用 Metal，其他系统不强加该后端。脚本不下载浏览器或生成资产。先启动本地服务、恢复 Spark 和已有场景资产；生成标记存在但资产缺失时应恢复资产，不能把加载失败当作等待页通过。

`npm run check:marble` 只执行离线任务保护与两套相机数学检查，使用临时测试输入，不依赖私有照片、key、浏览器或数值 Python 环境。`check:marble-assets` 另需本地场景、旧文件保全快照及 NumPy/Pillow；这两套检查都不会发起收费请求。
