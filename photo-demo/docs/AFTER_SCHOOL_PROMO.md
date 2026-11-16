# 《铅笔倒带》宣传片导出

导出规格：42 秒、1920×1080、30 fps、H.264/AAC、BT.709。录制器从固定场景包读取资产，在临时本地 HTTP 服务中覆盖镜头脚本，按绝对时间逐帧渲染。

## 镜头与声音

| 时间 | 内容 |
| --- | --- |
| 0–1 秒 | 原照片停留 |
| 1–8 秒 | 旋转至磁带背面 |
| 8–14 秒 | 连续靠近广播室，同时倒带 |
| 14–20 秒 | 穿窗进入操场，第一次倒带结束 |
| 20–28 秒 | 立即播放八秒动作，镜头移到篮架下 |
| 28–35 秒 | 第二次倒带，沿原路退出操场和广播室 |
| 35–41 秒 | 反向绕行回到照片 |
| 41–42 秒 | 原照片停留 |

声音包含程序化倒带、篮球落地和球网音效，没有人声或配乐。落地音效读取场景 QA 的实际物理事件时间。互动场景保留广播字幕；宣传片隐藏界面，未烧录字幕。

## 本地重现

在仓库根目录执行。需要 Node、项目验证器可用的 Playwright/Chromium、ffmpeg，以及安装 NumPy/SciPy 的 Python。固定场景包、动作测量和导出媒体属于本地资产，不随 Git 分发。

已交付视频使用场景版本 `b9e17ac9ae84e233`。下列默认音频参数也绑定该版本和镜头时间表；更换场景或时长时需要一起核对镜头、录制补丁与物理测量。

```sh
python3 photo-demo/cases/after-school-rewind/promo-audio.py

node photo-demo/cases/after-school-rewind/record-promo.cjs \
  photo-demo/evidence/universes/after-school-rewind/releases/b9e17ac9ae84e233 \
  演示素材/铅笔倒带 \
  --mode video --width 1920 --height 1080 --fps 30 \
  --audio photo-demo/evidence/universes/after-school-rewind/promo/audio/铅笔倒带-宣传片-声音.wav \
  --name 铅笔倒带-宣传片-1080p.mp4

node photo-demo/cases/after-school-rewind/check-promo.cjs \
  演示素材/铅笔倒带/capture-video.json
```

使用 `--mode stills` 可先检查关键帧，使用 `--times 0,14,20,28,41` 指定取样时刻。静帧模式还会检查首尾照片像素一致。

## 源码与验收

- `promo-director.js`：连续镜头、往返路径、画面合成和倒带时间表。
- `promo-patch.cjs`：只作用于录制服务的窄范围覆盖；补丁锚点不匹配时中止。
- `record-promo.cjs`：逐帧捕获、视频编码、源脚本哈希与帧状态记录。
- `promo-audio.py`：48 kHz 立体声拟音、物理事件同步和峰值测量。
- `check-promo.cjs`：检查全部帧的时间、倒放方向、首尾机位和旋转速度。

已交付的 1260 帧通过检查，最大旋转速度约 53.70°/秒；首尾静帧一致，穿窗切换和最终构图另经人工查看。`check-promo.cjs` 检查采样记录，不能代替成片视觉与声音复核。
