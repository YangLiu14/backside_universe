# 作品执行手册

以下命令从仓库根目录执行。作品名是短英文 ID，用户给的标题保存在故事规格中。命令支持 `--root /绝对目录` 放在 ID 前。默认工作区是 `photo-demo/evidence/universes/<id>`。负责故事和工具选择的是运行本 Skill 的 Agent。选故事、实现专属玩法和局部返修时，按[体验质量与验收](quality.md)选择机位和检查项。

## 初始化和故事

`./photo-demo/universe radio init /path/to/photo.jpg` 默认选择国际站个人 MCP（`--via mcp`）。已建作品保留原路径，用 `status` 查看。指定浏览器工作区用 `--via web`；开放平台用 `--via api`，在 photo-demo/.env.local 配置开放平台 HI3D_CLIENT_ID 和 HI3D_CLIENT_SECRET。三条路径不会自动切换。可用 `--budget N` 或 UNIVERSE_HI3D_BUDGET 设单作品上限；已建作品用 `budget N`。用户明确授权本作品不限量使用已有积分时用 `budget unlimited`，不会充值。

将 Agent 根据图片和对话生成的 JSON 保存为临时文件，执行 `story /path/to/story.json`。以下字段展示可用的故事规格。

```json
{
  "title": "深夜电台",
  "story": "转到收音机侧面，给小时候的自己点一首歌。",
  "subject": "收音机",
  "box": [0.14, 0.22, 0.83, 0.86],
  "conceptPrompt": "保留米色收音机和刻度盘，背板开口内有可近看的电台桌、麦克风和暖灯。",
  "layout": "insert",
  "revealDeg": 110,
  "handoffDeg": 4,
  "yaw": 0, "pitch": 0, "roll": 0,
  "focus": [0.17, 0.04, -0.15],
  "insertScale": 0.5, "insertYaw": 110,
  "action": "chime",
  "actionLabel": "点歌",
  "actionResult": "收音机响起了回信。"
}
```

box 是 EXIF 校正后原图上的左、上、右、下坐标，范围 0–1。focus 相对主体中心，以主体高度为单位，坐标轴为右、上、向原相机。yaw / pitch / roll 用角度校准正面；revealDeg 决定绕行方向，handoffDeg 根据实景可用视角调整。whole 用一个完整 Hi3D 模型；insert 把 shell 与 interior 装在同一位置，沿最终视线裁出侧窗。内景可以单独修改。内置动作 light / chime / turn 分别点灯、发声、转动观察视角。若故事需要专属行为，在 photo-demo/cases/<案例名>/viewer 中实现播放器，在同级 check.cjs 实现真实交互验收；将 experience 设置为案例名。props 数组列出独立活动组件，concept 保存后用 `part-image <role> <png>` 指定各自的 Hi3D 输入。可参考 grandmas-table 的拉凳、入座与添筷。单个公开场景只包含所需运行资产。

## 创作与审核

运行 `room --method local` 可复用项目的 DA3-BASE / BLUNT 本地环境，产出单图深度 Gaussian、内参和观察目标。首版的实景来自输入原照，背面空间的生成式网格统一交给 Hi3D。依赖安装见 photo-demo/experiments/gaussian/README.md。UNIVERSE_PYTHON 和 UNIVERSE_DEPTH_DEVICE 可指定 Python 与 cpu/cuda/mps。

对 shell 可运行 `shell-image /path/to/cutout.png`。概念图生成后，用 `concept /path/to/concept.png` 登记图片，返回 revision 和本地路径。向用户发实际图片后，执行 `review offered --revision <revision>`。需要等待就 `review hold`，收到明确继续就 `review continue --revision <revision>`。预先要求审核也可在概念图生成前 hold。收到晚到修改，保留旧任务并换新图；只改镜头或故事文案可以继续用原资产。

## 国际站个人 MCP（默认）

1. 在仓库根目录运行 `./photo-demo/universe radio mcp-account`。它不需要已建作品，通过本项目的 `hi3d_intl` 查询 [Hi3D 国际站](https://www.hi3d.ai/zh/explore) 的个人积分。如果尚未授权，使用 `codex mcp login hi3d_intl`。首次绑定或主动更换账号时，在 hi3d.ai 账户菜单核对邮箱、昵称和积分，与命令结果对照；把邮箱与返回的账户指纹分别写入本机 photo-demo/.env.local 的 HI3D_ACCOUNT_EMAIL 和 HI3D_MCP_USER_SHA256。再次运行应返回 `matches_local_pin: true`。MCP 返回用户 ID 而不返回邮箱。已有作品提交前也会检查开户时绑定的账号。
2. `run` 或 `tick` 会上传当前分件的参考图并免费报价。`confirm_mcp_quote` 依次返回角色、key、报价 ID、积分和到期时间。把当前可提交的报价列给用户，在作品剩余预算内，可合并询问一次并写清每项及合计。只在用户明确确认这些具体报价后，对确认的每项执行 `mcp-submit <key> <报价ID>`，再 `run`。预算和审图决定不能替代这一步。报价过期、换图或审核暂停后重新运行，以新报价为准。
3. 已提交任务自动按原任务号查询状态、获取输出并检查 GLB。输入、任务号和原件哈希保留在作品记录中。若提交回执丢失，`reconcile_existing_submission` 表示可能扣费；用 `mcp-recent` 核对当前账户的近期任务，再用 `mcp-recover <key> <任务号>`。只有平台能核对同一报价与任务时才接回；匹配不明就保留记录，不重投，也不改走网页。`status` 只读。

## 显式选择官网或开放平台

`api` 可在有效预算内通过开放平台提交、轮询、下载；`web` 按下面步骤操作已登录的国际站工作区。
1. 用已连接的用户浏览器打开 **https://www.hi3d.ai/zh/workspace** 的 3D 生成页。在官网的账户视图核实指定邮箱。通过可见界面本地上传该任务的参考图，选通用 v3.0、高质、几何与纹理、私有，以页面当前显示的价格计算费用。
2. 用 `web-reserve <role> <官网当前积分> --account <邮箱>` 预留积分。返回 `web_begin_required`、key 和 attempt 时还可以安全退出。续跑用 `tick` 取回同一预留。在官网的生成按钮已经可点、价格和账号已核对时，紧接着执行 `web-begin <key> <attempt> <当前积分> --account <邮箱>`。只有返回 `click_generate_once` 的当次执行者点击一次官网「生成」。记录官网任务卡的资产 ID，并运行 `attach-task <key> <资产ID> --attempt <attempt>`。若报价或预算改变，使用 `web-release <key> <attempt>` 撤销尚未进入点击阶段的预留，再按当前价格登记。修改建模输入或暂停审图会自动释放受影响的未点击预留。
3. 如果出现 `reconcile_existing_submission`，先确认上一次执行者已停止，再按时间、账号和参考图核对官网历史。找到唯一匹配就 attach-task。只有官网明确拒绝了这一次提交、确认未生成任务且未扣费时，执行 `web-release <key> <attempt> --rejected "官网明确的拒绝回执"`，然后重试。任务暂未显示、网络超时或余额看起来没变时保留预留，继续核对。旧版本的 submitting 可能已经点击，attempt 用 `legacy`。已登记任务号就恢复该任务的下载。API 路径仍可用 attach-task 接回已有任务。
4. 官网任务完成后，在带有已登录 Chrome 的 Codex 电脑操作工具中调用仓库的 `captureExport`。将下面的项目目录和 key 换成当前作品的绝对目录与任务 key。首次使用工具时先按工具说明绑定浏览器。导出器自己新开任务标签页，按资产 ID 选中官网任务卡并下载单文件 GLB。Chrome 扩展未报告下载事件时，导出器凭专用标签页的唯一编号读取 Chrome 已完成的下载记录。原件和回执保存在作品根目录旁的 `.hi3d-exports/<资产ID>/`。

```js
const {captureExport} = await import('/项目绝对路径/photo-demo/pipeline/website-export.mjs');
const openTab = url => cua.createBrowserTab('chrome', url, {sessionName:'🎞️ Hi3D 模型导出'});
const projectDirectory = '/项目绝对路径/photo-demo/evidence/universes/作品ID';
await captureExport(openTab, projectDirectory, {key: '当前任务key'});
```

5. 执行 `web-result <key>` 将已验证的原件装入当前作品。用 `reuse <role> --task <资产ID>` 跨作品复用同一工作根目录下的归档。旧素材只有官网任务号时，用同一导出器的 `{task: '资产ID'}` 从已完成的原任务建档，再运行 reuse。原始参考图未知时，回执中的参考图哈希为空。兼容命令 `reuse <role> <glb> --source <国际站模型页>` 会用已登记的哈希逐字节核对文件。早期历史目录可用 `reuse <role> <glb> --catalog-id <id>` 核对已登记的文件。继续 `run` 直到返回 `inspect_keyframes`。

## 交付与复现

`build` 组装版本化的 releases/<版本>/，其中包含 scene.json、原照工作副本、带来源的 GLB、Gaussian 与完整播放器依赖。较重的模型通过 Blender 导出网页副本，原件保留。模板有变化也产生新版本。独立执行 `qa` 可重跑当前版本的实浏览器检查，输出在 qa/<版本>/。需要 Playwright 和 Chromium，支持 PLAYWRIGHT_MODULE 和 CHROMIUM_PATH。使用 `preview --port 9989` 在本机打开 `http://127.0.0.1:9989/`。整个 release 可静态托管。默认预览打开独立页。有同 ID 案例安装器时，`preview` 会将验收过的作品装入开发目录。共用相簿根据 `photo-demo/dist/catalog/works.json` 显示卡片。交付地址以实际从相簿打开的结果为准。重复 QA 会撤下旧通过报告，只有本轮检查均通过才重新生成。

开放平台接口与计价参见 [Hi3D 官方快速开始](https://docs.hi3d.ai/en/api/getting-started/quickstart)、[创建任务](https://docs.hi3d.ai/en/api/api-reference/list/create-task) 和[国际站价格表](https://docs.hi3d.ai/en/api/getting-started/pricing)。生产规格和配置价格变更时同步更新执行器的估算。
