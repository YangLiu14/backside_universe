# Backside Universe 的发布方式

[正式相簿](https://backside-universe.netlify.app/) · [工位背后的假期](https://backside-universe.netlify.app/#desk) · [小狗的内脏博物馆](https://backside-universe.netlify.app/#canine)

相簿与场景库由同一 Netlify 团队的两个项目提供。2026-11-09 首次上线的相簿发布目录约 236 KiB，工位场景约 202.5 MiB，小狗场景约 142.1 MiB。大小为所有发布文件的合计，实际单次访问只会请求所到达的内容。旧工位站点仍可独立访问。

| 项目 | 内容 | 更新方式 |
| --- | --- | --- |
| `backside-universe` | 相簿、缩略图以及指向各作品版本的链接 | 首页和场景链接重新校验，改首页可单独发布 |
| `backside-universe-scenes` | `/releases/<作品>/<版本>/` 下的脚本、模型、实景、纹理和声音 | 新版本追加到新目录，现有版本保留，版本内文件可缓存一年 |

版本取自文件相对路径和内容的 SHA-256 摘要。主站将 `/releases/*` 转发至资源站，浏览器使用同一域名访问 iframe、WebGL、Web Worker 和媒体。两个最近访问的作品保留运行现场，访问更多作品时会释放最久未使用的场景。主站可以回退到现存的旧版本路径。[Netlify 同源转发](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

## 更新一张照片

以下命令在仓库根目录运行，需要 Python 3.11 或更新版本。构建作品前，按[资产说明](../docs/ASSETS.md)恢复该作品的本地文件。工位打包使用 Pillow 生成移动端纹理，请在带有 Pillow 的 Python 环境中运行。

1. 新照片在 `dist/index.html` 增加相册页，在 [scenes.json](scenes.json) 登记同一 `data-work`、入口和该作品可公开的运行文件。缩略图放入 `dist/cinema/album-art/`。这里的 `dist/` 指 `photo-demo/dist/`。
2. 使用下面的命令只构建要更新的作品。输出会给出版本值。保留完整场景库及其私有备份，包含仍需支持的旧链接。当前开发机保存首发场景库的位置为 `photo-demo/evidence/deployment/scene-store`。

```sh
SCENE_STORE="$PWD/photo-demo/evidence/deployment/scene-store"
python3 photo-demo/scripts/release-album.py pack canine --store "$SCENE_STORE"
```

3. 将版本值写入 [releases.json](releases.json)，并追加到 [published-scenes.json](published-scenes.json) 对应作品的列表中。Netlify 将每次部署作为完整快照。发布前从持久库或备份取齐清单中的每个版本，包含它的入口、脚本和资产。已登录同一团队的 Netlify CLI 按摘要上传，服务端只索取缺少的内容。[Netlify 文件摘要发布](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#file-digest-method)

```sh
python3 photo-demo/scripts/release-album.py verify-store --store "$SCENE_STORE"
netlify deploy --prod --no-build --site backside-universe-scenes --dir "$SCENE_STORE"
```

   使用 Netlify Drop 手动发布时，运行以下命令，将生成的 ZIP 上传到 `backside-universe-scenes`。它会先校验新旧版本的内容摘要。主站已代理到资源站，再把资源站的旧路径代理到另一次部署会超过 Netlify 的单次转发限制。[Netlify 转发限制](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/#limitations)

```sh
python3 photo-demo/scripts/release-album.py zip-store --store "$SCENE_STORE" --output .cache/backside-scenes.zip
```

4. 发布资源站后，从**相簿正式域名**检查新旧场景入口和脚本，再构建并发布相簿。仅修改首页或切换回已有版本时，直接执行此步骤。相簿构建只读取预览图、界面文件和发布清单。

```sh
python3 photo-demo/scripts/check-published-scenes.py
ALBUM_OUTPUT=$(mktemp -d)
python3 photo-demo/scripts/release-album.py app \
  --asset-origin https://backside-universe-scenes.netlify.app --output "$ALBUM_OUTPUT"
netlify deploy --prod --no-build --site backside-universe --dir "$ALBUM_OUTPUT"
```

配置好项目的 Playwright 环境后，可对真正的生产域名运行相簿检查。它会验证首页不请求场景二进制、两个作品可以进入以及再次进入时复用同一个场景。

```sh
MARBLE_BASE_URL=https://backside-universe.netlify.app npm --prefix photo-demo run check:album
```

## 用 iPhone Safari 验收

工位的触屏版本使用同一份完整实景和模型几何，模型内嵌纹理的最长边为 1024 像素。场景包会生成 `desk-mobile/catalog.json` 和对应的 GLB。用 `npm run dev` 测本地源目录时，恢复资产后先运行 `python3 photo-demo/scripts/build-holiday-site.py --prepare-mobile`，模型更新后重新运行。正式发布的场景包会自动完成这一步。

首次打开、两部作品切换和后台恢复都在真机验收。记录机型、iOS 版本、网络、测试时间和最后一条加载提示。需要复测冷启动时，在 Safari 的网站数据中仅移除本项目域名的数据；重访测试保留同一标签页及其缓存。

1. 从正式相簿点工位照片，等「开始放映」可用，点入群岛，拖动画面，返回相簿。
2. 进入小狗博物馆，绕到侧面，返回后再打开工位。留意是否自动重载、卡在同一步，或只在切换作品后失败。
3. 在新标签直接打开 `/#desk` 测试深链接。再从[工位独立入口](https://backside-universe.netlify.app/marble-transition-lab/index.html)打开同一版本，对照相簿嵌入与独立加载。单独测试后台切回、横竖屏切换，再用蜂窝网络复测首次加载。每次只改一个条件。

Mac 上安装 Selenium 后可用系统自带的 SafariDriver 重复前两步。用数据线连接并解锁 iPhone，在手机的 Safari 高级设置中开启「网页检查器」和「远程自动化」。Mac 首次配置按 [WebKit 的 iOS WebDriver 指引](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/) 操作。脚本默认使用真机，明确指定 `--simulator` 才使用 Xcode 的 iOS 模拟器。

```sh
python3 -m venv .cache/ios-safari-qa
.cache/ios-safari-qa/bin/pip install 'selenium>=4.26,<5'
.cache/ios-safari-qa/bin/python photo-demo/scripts/check-ios-safari.py
.cache/ios-safari-qa/bin/python photo-demo/scripts/check-ios-safari.py --deep-link desk
```

脚本在 Safari 中激活页面控件，输出每个加载阶段与就绪时间，确认工位请求了移动端 GLB，并检查互动、返回和意外重载。加 `--native-touch` 可额外验证自动化触点是否命中控件。若 Safari 整个页面进程退出，WebDriver 可能直接报会话中断。手动复现时，先在 Mac Safari 的「开发 → iPhone → 相簿」打开检查器并开始记录 Network 和 Timelines，再在手机点照片。若检查器断开，保留故障时间，到设备日志中对照 WebContent、GPU 或 JetsamEvent 的终止原因。[Web Inspector 设置](https://webkit.org/web-inspector/enabling-web-inspector/) · [Apple 内存终止报告说明](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports)

## 扩容与回滚

作品变多后，资源库也可以迁移到提供 HTTPS 的对象存储与 CDN。按原路径同步 `releases/`，为版本文件提供正确的 MIME、字节范围读取及 `Cache-Control: public, max-age=31536000, immutable`。先验证固定版本的页面、Worker 和模型，再用新源站的地址运行 `app --asset-origin` 并发布相簿。对象存储可以逐版本上传新目录；保留旧版本供既有访客和回滚使用。通过主域名转发的资源流量仍会经过 Netlify，评估成本时应计入这部分流量。

单独回滚一件作品时，将 `releases.json` 对应值改回资源库内的旧版本，再发布相簿。其他作品继续使用各自的版本。
