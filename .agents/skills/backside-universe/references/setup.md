# 首次配置制作环境

在仓库根目录操作。新照片制作需要 Git、Python 3.12、Node.js 与 npm、可运行 `codex app-server` 的 Codex CLI，以及能生成概念图的 Codex 工具。下面的命令适用于 macOS 或 Linux 的 shell。较大的 Hi3D 模型通过 Blender 制作网页副本，检查 `blender --version`，或用 `BLENDER_BIN` 指向已安装的 Blender。

## 照片重建

为当前克隆建立独立环境。模型权重在第一次执行 `room` 时按固定版本从 Hugging Face 下载。

```sh
lab=photo-demo/experiments/gaussian
python3.12 -m venv "$lab/.venv"
"$lab/.venv/bin/python" -m pip install -r photo-demo/requirements-depth.txt scipy==1.17.1 requests
```

新克隆还需取得两份上游源码。在同一终端执行下面命令。已有环境先用 `git -C <目录> rev-parse HEAD` 核对版本，已有的正确版本可直接使用。

```sh
git -C "$lab" init --quiet blunt
git -C "$lab/blunt" sparse-checkout set --no-cone /blunt.py /LICENSE
git -C "$lab/blunt" fetch --depth=1 --filter=blob:none https://github.com/SonnyC56/blunt.git b0b8356103dce5871d7b1dad7cec9e68af372096
git -C "$lab/blunt" checkout --detach FETCH_HEAD

git -C "$lab" init --quiet da3-source
git -C "$lab/da3-source" sparse-checkout set src
git -C "$lab/da3-source" fetch --depth=1 --filter=blob:none https://github.com/ByteDance-Seed/Depth-Anything-3.git 3d835ec1a5802d64a8b8b15f817a1ab54809bfe4
git -C "$lab/da3-source" checkout --detach FETCH_HEAD
```

## 网页渲染与验收

取回 Spark 的浏览器模块并校验 SHA-256。安装 Playwright 及其 Chromium，用于验收桌面和触屏操作。

```sh
mkdir -p .cache/spark photo-demo/dist/gs-lab/vendor
npm pack @sparkjsdev/spark@2.4.0 --pack-destination .cache/spark
tar -xOf .cache/spark/sparkjsdev-spark-2.4.0.tgz package/dist/spark.module.min.js > photo-demo/dist/gs-lab/vendor/spark.module.js
echo 'a2f01f68dbcd5e060d55348f803e509fc789b97904e01b98763fcf0314351aaf  photo-demo/dist/gs-lab/vendor/spark.module.js' | shasum -a 256 -c -
npm install --no-save --package-lock=false --prefix photo-demo playwright@1.62.1
./photo-demo/node_modules/.bin/playwright install chromium
```

Linux 上若 Playwright 报告缺少系统库，使用其 `install --with-deps chromium` 命令安装。运行以下本地检查，应看到测试通过。

```sh
./photo-demo/universe --help
photo-demo/experiments/gaussian/.venv/bin/python -m unittest discover -s photo-demo/pipeline -p 'test_*.py'
```

## 绑定 Hi3D 国际站个人账号

在 Codex 中打开并信任此项目。用 `codex mcp get hi3d_intl` 检查项目配置显示 `https://agent.hi3d.ai/mcp`。运行 `codex mcp login hi3d_intl`，由用户在浏览器完成授权，再运行 `./photo-demo/universe setup mcp-account`。此命令只查询账号，首次运行可显示 `matches_local_pin: false`。

在 hi3d.ai 的账户菜单核对登录邮箱，并将昵称和积分与命令输出比对。在本机 `photo-demo/.env.local` 中设置以下两项。首次可从 `photo-demo/.env.example` 复制模板，已有配置时只更新对应字段。

```dotenv
HI3D_ACCOUNT_EMAIL=你的国际站登录邮箱
HI3D_MCP_USER_SHA256=命令返回的完整fingerprint
```

再次运行 `./photo-demo/universe setup mcp-account`，以 `matches_local_pin: true` 确认绑定成功。现在可开一个项目对话，附上照片并调用 `$backside-universe`。
