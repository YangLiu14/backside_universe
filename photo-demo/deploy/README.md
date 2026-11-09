# Backside Universe 的发布方式

[正式相簿](https://backside-universe.netlify.app/) · [工位背后的假期](https://backside-universe.netlify.app/#desk) · [小狗的内脏博物馆](https://backside-universe.netlify.app/#canine)

相簿与场景库由同一 Netlify 团队的两个项目提供。2026-11-09 首次上线的相簿发布目录约 236 KiB，工位场景约 202.5 MiB，小狗场景约 142.1 MiB。大小为所有发布文件的合计，实际单次访问只会请求所到达的内容。旧工位站点仍可独立访问。

| 项目 | 内容 | 更新方式 |
| --- | --- | --- |
| `backside-universe` | 相簿、缩略图以及指向各作品版本的链接 | 首页和场景链接重新校验，改首页可单独发布 |
| `backside-universe-scenes` | `/releases/<作品>/<版本>/` 下的脚本、模型、实景、纹理和声音 | 新版本追加到新目录，现有版本保留，版本内文件可缓存一年 |

版本取自文件相对路径和内容的 SHA-256 摘要。主站将 `/releases/*` 转发至资源站，浏览器使用同一域名访问 iframe、WebGL、Web Worker 和媒体。两个最近访问的作品保留运行现场，访问更多作品时会释放最久未使用的场景。主站可以回退到现存的旧版本路径。[Netlify 同源转发](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

## 更新一张照片

以下命令在仓库根目录运行，需要 Python 3.11 或更新版本。构建作品前，按[资产说明](../docs/ASSETS.md)恢复该作品的本地文件。

1. 新照片在 `dist/index.html` 增加相册页，在 [scenes.json](scenes.json) 登记同一 `data-work`、入口和该作品可公开的运行文件。缩略图放入 `dist/cinema/album-art/`。这里的 `dist/` 指 `photo-demo/dist/`。
2. 使用下面的命令只构建要更新的作品。输出会给出版本值。保留完整场景库及其私有备份，包含仍需支持的旧链接。当前开发机保存首发场景库的位置为 `photo-demo/evidence/deployment/scene-store`。

```sh
SCENE_STORE="$PWD/photo-demo/evidence/deployment/scene-store"
python3 photo-demo/scripts/release-album.py pack canine --store "$SCENE_STORE"
```

3. 将输出的版本值写入 [releases.json](releases.json) 对应的作品。核验场景库后，将其发布到资源站。已登录同一团队的 Netlify CLI 可按文件摘要上传，服务端只索取缺少的内容。Netlify 把本次目录当作完整快照，因此发布资源站之前要使用完整镜像。新机器可以从私有备份恢复。浏览器手动上传 ZIP 时需要上传整个资源库。[Netlify 文件摘要发布](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#file-digest-method)

```sh
python3 photo-demo/scripts/release-album.py verify-store --store "$SCENE_STORE"
netlify deploy --prod --no-build --site backside-universe-scenes --dir "$SCENE_STORE"
```

4. 从资源站打开新版本的入口，确认可访问，再构建并发布相簿。仅修改首页或切换回已有版本时，直接执行此步骤。相簿构建只读取预览图、界面文件和发布清单。

```sh
ALBUM_OUTPUT=$(mktemp -d)
python3 photo-demo/scripts/release-album.py app \
  --asset-origin https://backside-universe-scenes.netlify.app --output "$ALBUM_OUTPUT"
netlify deploy --prod --no-build --site backside-universe --dir "$ALBUM_OUTPUT"
```

配置好项目的 Playwright 环境后，可对真正的生产域名运行相簿检查。它会验证首页不请求场景二进制、两个作品可以进入以及再次进入时复用同一个场景。

```sh
MARBLE_BASE_URL=https://backside-universe.netlify.app npm --prefix photo-demo run check:album
```

## 扩容与回滚

作品变多后，资源库也可以迁移到提供 HTTPS 的对象存储与 CDN。按原路径同步 `releases/`，为版本文件提供正确的 MIME、字节范围读取及 `Cache-Control: public, max-age=31536000, immutable`。先验证固定版本的页面、Worker 和模型，再用新源站的地址运行 `app --asset-origin` 并发布相簿。对象存储可以逐版本上传新目录；保留旧版本供既有访客和回滚使用。通过主域名转发的资源流量仍会经过 Netlify，评估成本时应计入这部分流量。

单独回滚一件作品时，将 `releases.json` 对应值改回资源库内的旧版本，再发布相簿。其他作品继续使用各自的版本。
