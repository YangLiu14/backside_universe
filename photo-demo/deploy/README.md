# Backside Universe 的发布方式

[正式相簿](https://backside-universe.netlify.app/) · [工位背后的假期](https://backside-universe.netlify.app/#desk) · [小狗的内脏博物馆](https://backside-universe.netlify.app/#canine) · [外婆总说，再添一双筷子](https://backside-universe.netlify.app/#grandmas-table) · [铅笔倒带，倒回放学那天](https://backside-universe.netlify.app/#after-school-rewind)

相簿与场景库由同一 Netlify 团队的两个项目提供。2026-11-09 首次上线的相簿发布目录约 236 KiB，工位场景约 202.5 MiB，小狗场景约 142.1 MiB。大小为所有发布文件的合计，实际单次访问只会请求所到达的内容。旧工位站点仍可独立访问。

| 项目 | 内容 | 更新方式 |
| --- | --- | --- |
| `backside-universe` | 相簿页面、样式和播放器入口 | 修改首页代码时单独发布 |
| `backside-universe-scenes` | `/releases/<作品>/<版本>/` 下的场景，以及作品目录与缩略图 | 同一次部署更新作品，保留历史版本 |

版本取自文件相对路径和内容的 SHA-256 摘要。主站将 `/catalog/*` 和 `/releases/*` 转发至资源站，浏览器使用同一域名访问 iframe、WebGL、Web Worker 和媒体。两个最近访问的作品保留运行现场，访问更多作品时会释放最久未使用的场景。主站可以回退到现存的旧版本路径。[Netlify 同源转发](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

## 作品上架流程

新增作品或修改场景时，按下面的顺序发布。只改标题、排序或封面时，从第 1 步更新作品目录，然后直接做第 3 至 5 步。只有首页代码、样式或代理规则有变化时才发布相簿主站。

以下命令从仓库根目录运行，使用 Python 3.11+ 和 Node.js。工位和小狗打包时还需要 Pillow。新机器先从私有备份恢复作品资产和完整的历史场景库，后续每次发布沿用这个库。[资产恢复说明](../docs/ASSETS.md)

### 1. 登记作品并本地试玩

在 `photo-demo/dist/catalog/works.json` 增加一项，顺序就是相簿顺序。选定稳定的 `id`（例如 `grandmas-table`），填写入口、中英文标题、主题和简介，以及封面、背面照片和剧照。图片路径从相簿首页起算。用 `npm --prefix photo-demo run dev` 打开开发版，检查正反面、语言切换和场景互动。[《外婆》的完整条目](../dist/catalog/works.json)

要上架的作品还要在 `photo-demo/deploy/scenes.json` 登记同一 ID、入口和运行文件。《外婆》已有桌面和移动端验收报告时，在带 Pillow 的 Python 环境运行 `python3 photo-demo/cases/grandmas-table/install-album.py`，将对应场景和剧照安装到 `photo-demo/dist/grandmas-table/`。模型、原图、构建输出和部署凭据留在本地或私有备份。[发布文件清单](scenes.json)

### 2. 给这件作品生成版本

```sh
SCENE_STORE="$PWD/photo-demo/evidence/deployment/scene-store"
python3 photo-demo/scripts/release-album.py pack grandmas-table --record --store "$SCENE_STORE"
```

用新作品的 ID 替换 `grandmas-table`。`--record` 在 macOS 或 Linux 上自动更新当前版本并追加历史记录。相同文件重复打包会得到同一版本。手动登记时可省略 `--record`，将打印的版本写入这两份文件。[当前版本](releases.json) · [历史版本](published-scenes.json)

### 3. 导出本次要发布的文件

```sh
SCENE_STORE="$PWD/photo-demo/evidence/deployment/scene-store"
CANDIDATE=$(mktemp -d)
python3 photo-demo/scripts/release-album.py catalog --store "$SCENE_STORE"
python3 photo-demo/scripts/release-album.py export-store --store "$SCENE_STORE" --output "$CANDIDATE/scenes"
python3 photo-demo/scripts/release-album.py app --asset-origin https://backside-universe-scenes.netlify.app --output "$CANDIDATE/app"
```

导出时会核对历史入口、场景内容摘要、目录和图片。输出中的 `scenes/` 包含本次目录、配图和全部已登记版本。`app/` 用于在本地以正式的相簿入口验收。

### 4. 测试这一份候选版本

在当前终端启动预览，保留 `CANDIDATE` 变量供发布时使用。用手机测试时在命令末尾加 `--host 0.0.0.0`，从同一 Wi-Fi 打开 Mac 的局域网 IP 和端口。

```sh
PORT=9993 node photo-demo/scripts/serve.mjs --album "$CANDIDATE/app" --scenes "$CANDIDATE/scenes"
```

在另一个终端执行以下检查。第一条核对目录里的封面、当前版本和所有历史入口。第二条需要 Playwright 和 Chromium，会在浏览器中检查相簿按需加载、切换作品和返回后重进。

```sh
python3 photo-demo/scripts/check-published-scenes.py --origin http://127.0.0.1:9993
MARBLE_BASE_URL=http://127.0.0.1:9993 npm --prefix photo-demo run check:album
```

打开新作品的直达地址（例如 `http://127.0.0.1:9993/#grandmas-table`），完成作品的核心互动，再返回相簿并重进。《外婆》的验收动作是绕到锅后、拉凳入座，再返回。手机检查首次进入、横竖屏和触控。发现问题后修复源码，从受影响的步骤重新生成候选目录。

### 5. 发布并复查

本地验收通过后，在启动预览的终端按 Ctrl+C，使用已登录项目所属团队的 Netlify CLI，将**刚才验收的场景目录**部署到 `backside-universe-scenes`。同一次部署切换作品目录与场景文件。Netlify 按完整快照发布，CLI 只上传服务端缺少的内容。[Netlify 部署命令](https://cli.netlify.com/commands/deploy/) · [文件摘要发布](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#file-digest-method)

```sh
netlify deploy --prod --no-build --site backside-universe-scenes --dir "$CANDIDATE/scenes"
```

如果本次还修改了相簿主站，在场景库发布成功后部署同一候选目录里的 `app/`。

```sh
netlify deploy --prod --no-build --site backside-universe --dir "$CANDIDATE/app"
```

从访客使用的域名复查目录及入口，再打开 `/#<作品 ID>`。把作品条目、运行文件清单、版本记录和相关源码一并提交到 Git。若用 Netlify Drop，可直接把已验收的 `scenes/` 文件夹拖到同一场景库项目。

```sh
python3 photo-demo/scripts/check-published-scenes.py --expect-catalog "$CANDIDATE/scenes/catalog/works.json"
MARBLE_BASE_URL=https://backside-universe.netlify.app npm --prefix photo-demo run check:album
```

## 用 iPhone Safari 验收

工位的触屏版本使用同一份完整实景和模型几何，模型内嵌纹理的最长边为 1024 像素。场景包会生成 `desk-mobile/catalog.json` 和对应的 GLB。用 `npm run dev` 测本地源目录时，恢复资产后先运行 `python3 photo-demo/scripts/build-holiday-site.py --prepare-mobile`，模型更新后重新运行。正式发布的场景包会自动完成这一步。

同一条命令也会为小狗生成 `hi3d-orbit-mobile.glb` 和六个展馆的 `*-detail-mobile.glb`。触屏设备加载最长边 1024 像素的贴图，鼠标设备加载原版身体贴图（8192 像素）和展馆细节贴图（3072 像素）。两者使用相同的网格。

首次打开、两部作品切换和后台恢复都在真机验收。记录机型、iOS 版本、网络、测试时间和最后一条加载提示。需要复测冷启动时，在 Safari 的网站数据中仅移除本项目域名的数据；重访测试保留同一标签页及其缓存。

1. 用 iPhone 打开 Mac 的局域网预览地址，从相簿点工位照片，等「开始放映」可用，点入群岛，拖动画面，返回相簿。
2. 进入小狗博物馆，绕到侧面，返回后再打开工位。留意是否自动重载、卡在同一步，或只在切换作品后失败。
3. 在新标签直接打开同一地址的 `/#desk` 测试深链接。再单独打开相簿中工位照片链接指向的版本，对照相簿嵌入与独立加载。测试后台切回和横竖屏切换。上线后可在正式相簿用蜂窝网络复测首次加载。

Mac 上安装 Selenium 后可用系统自带的 SafariDriver 重复前两步。用数据线连接并解锁 iPhone，在手机的 Safari 高级设置中开启「网页检查器」和「远程自动化」。Mac 首次配置按 [WebKit 的 iOS WebDriver 指引](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/) 操作。脚本默认使用真机，明确指定 `--simulator` 才使用 Xcode 的 iOS 模拟器。

```sh
python3 -m venv .cache/ios-safari-qa
.cache/ios-safari-qa/bin/pip install 'selenium>=4.26,<5'
# 将地址换成当前局域网预览的 IP 和端口
ALBUM_ORIGIN=http://192.168.1.8:9993
.cache/ios-safari-qa/bin/python photo-demo/scripts/check-ios-safari.py --origin "$ALBUM_ORIGIN"
.cache/ios-safari-qa/bin/python photo-demo/scripts/check-ios-safari.py --origin "$ALBUM_ORIGIN" --deep-link desk
```

脚本在 Safari 中激活页面控件，输出每个加载阶段与就绪时间，确认每个作品都请求了适配触屏的 GLB，并检查互动、返回和重进时是否重新创建场景。加 `--native-touch` 可额外验证自动化触点是否命中控件。若 Safari 整个页面进程退出，WebDriver 可能直接报会话中断。手动复现时，先在 Mac Safari 的「开发 → iPhone → 相簿」打开检查器并开始记录 Network 和 Timelines，再在手机点照片。若检查器断开，保留故障时间，到设备日志中对照 WebContent、GPU 或 JetsamEvent 的终止原因。[Web Inspector 设置](https://webkit.org/web-inspector/enabling-web-inspector/) · [Apple 内存终止报告说明](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports)

## 扩容与回滚

作品变多后，资源库也可以迁移到提供 HTTPS 的对象存储与 CDN。按原路径同步 `releases/`，为版本文件提供正确的 MIME、字节范围读取及 `Cache-Control: public, max-age=31536000, immutable`。先验证固定版本的页面、Worker 和模型，再用新源站的地址运行 `app --asset-origin` 并发布相簿。对象存储可以逐版本上传新目录；保留旧版本供既有访客和回滚使用。通过主域名转发的资源流量仍会经过 Netlify，评估成本时应计入这部分流量。

单独回滚一件作品时，从 `published-scenes.json` 选取该作品已发布的版本，只改 `releases.json` 中该作品的值，然后重复上架流程第 3 至 5 步。历史记录和其他作品的当前版本均可继续使用。

### 大规模部署备选：Netlify 相簿 + Cloudflare R2

当前相簿和场景库都使用 Netlify。公开推广前，可用「预计首次进入场景的人次 × 浏览器实测的单次下载字节数」估算月流量，再与团队扣除正式发布后剩余的额度比较。如果模型与视频的下载流量持续逼近预算，可先迁移这些大文件，保留现有相簿网址。

- **费用。** R2 Standard 免收公网下行流量费，按存储量和操作次数计费。2026 年 11 月核对的每月免费额度为 10 GB·月存储、100 万次 A 类操作和 1,000 万次 B 类操作。历史版本也占用存储。[R2 官方定价](https://developers.cloudflare.com/r2/pricing/)
- **迁移。** HTML、脚本和 Worker 继续由 Netlify 同源提供。将 GLB、纹理、SPZ 分块及影音上传到 R2，保留版本化路径，给资产加载器配置 R2 自定义域名，让浏览器直接下载。现有 `app --asset-origin` 会生成 Netlify 代理规则，仅替换其参数仍会消耗 Netlify 下行流量。[R2 公共访问与自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- **验证与回滚。** 为资源域名配置 CORS，允许相簿来源读取文件，并检查 MIME、视频范围请求和版本文件的长期缓存。先在本地测试两个作品，用浏览器网络面板确认大文件由资源域名返回，再发布引用新地址的场景版本。保留旧 Netlify 场景，出现问题时把相簿指回原版本。

若将来连首页一起迁移，可用 Cloudflare Pages 提供静态页面，继续用 R2 提供大文件。Pages 的单文件上限为 25 MiB，当前小狗模型已超过此限制。[Pages 文件限制](https://developers.cloudflare.com/pages/platform/limits/)
