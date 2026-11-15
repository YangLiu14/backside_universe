# 工位背后的假期 · 公网部署

2026-11-08 发布，Netlify 生产站点公开，访客无需登录。

[打开工位背后的假期](https://desk-holiday-universe.netlify.app/)

首页进入当前的五岛主桌面。工位漫步、动态海洋、蓝杯纸船、蓝书望远镜、橙书书签、手机静音、各岛室内和洞窟书页返回均包含在发布包内。

## 公开站点与更新

- Netlify 项目名称为 `desk-holiday-universe`，Site ID 为 `04571cf0-835f-4d2b-aeb7-42575fa301f4`。
- 首次生产部署为 `6af025c63d3f045d71fc4839`，通过 Netlify Drop 上传运行目录的 ZIP 发布。
- 生产及预览访问权限均为 Public。
- 管理入口为 https://app.netlify.com/projects/desk-holiday-universe/overview ，更新时将新的运行目录 ZIP 上传到该项目。
- Netlify 使用既有账号。默认计划会显示 Powered by Netlify 标记。

## Sites 备用发布记录

Sites 同样保存并成功发布了版本 4，权限为 public。但是本次从命令行与普通 Chrome 访问 `chatgpt.site` 域名时，Cloudflare 都返回了 403 拦截页。Worker 错误日志为空，因此最终交付采用已经能打开页面的 Netlify 网址。


- Sites project 为 `appgprj_6ae938db60ec8191b74d950c79f18dc3`，配置记录在 `photo-demo/.openai/hosting.json`。
- 版本 4 的发布源码提交为 `fb372cc4846e5eb6aee4aae5e154ba10ee384e95`。这是 Sites 运行源码仓库的提交，与主项目仓库的提交分别管理。
- 发布成功的 deployment 为 `appgdep_6af0248fe408819188f77d42b06b09bd`。
- 运行资源约 203 MiB。发布归档保留高清资源，排除了历史重建实验、其他作品和原始模型制作档案。

## 构建方式

在主项目根目录执行以下命令，目标目录需为空。

```sh
python3 photo-demo/scripts/build-holiday-site.py --output /absolute/path/to/empty/dist
```

当前默认构建会生成双作品相簿，包含工位与小狗的页面、脚本、模型、贴图和导览音频，可用于 Netlify 等静态托管。两个作品的独立地址仍可直接访问。构建文件在本地生成，公开站点的版本取决于最近一次实际上传。

要为原有 Sites 单作品站点生成限大小的工位包，请加 `--desk-only`。双作品包包含超过 25 MiB 的独立小狗模型及下载短片。两份超出限制的 SPZ 按 16 MiB 分块，发布版 `marble-detail/room.js` 并行下载并按顺序还原原始字节，再交给 Spark 解码。该处理不减高斯点数，不重新压缩场景。原版完整文件继续留在本地。

源代码和恢复清单同步到 Sites 源码仓库，模型、照片、SPZ 分块和 Spark 运行库随构建归档上传。Sites 更新沿用同一 project，通过保存版本、部署流程发布。Netlify 更新则把构建器输出目录压缩为 ZIP，再上传到上述现有 Netlify 项目。仅推送主项目 Git 仓库不能恢复这些本地资产。

## 发布检查

发布包在本地独立端口通过了工位及五岛步行、触屏移动、五站故事循环、室内陈设与进出、加载失败后的重试和退出检查。SPZ 分块通过逐字节还原校验。公开 Netlify 首页在无 Cookie 请求下返回 HTTP 200；无登录浏览器完成了触屏与减少动态模式下的五站旅程，并从书页回到工位。

首屏需要下载高清 3DGS 和模型，等待时间随网络和设备变化。当前机器的普通 Chrome 首次访问曾停在“正在准备转场画面”，自动化浏览器完成了初始化及完整循环；常规浏览器的首屏体验仍需继续优化。后续可在此基础上继续优化资源调度。移动视口的浏览器检查已覆盖，真实手机 GPU 性能仍需另行实测。

[Cloudflare 静态资源限制](https://developers.cloudflare.com/workers/platform/limits/) · [本地资产恢复](ASSETS.md)

## 首次加载提示更新

2026-11-08 更新生产站点，使用居中的加载面板展示实景下载百分比、已下载容量与等待时间。百分比按 SPZ 实际收到的字节计算，分块下载采用流式进度。下载结束后切换为解码、搭建群岛和准备画面的状态提示，准备阶段使用不定进度条。加载完成后自动收起；失败显示重新加载按钮。

慢下载时的中间进度、资源解码后的阶段切换、加载完成、手机窄屏、错误与重试已在发布包中验证。更新通过现有 Netlify 项目的 Drop 入口发布，共更新 5 个运行文件。
