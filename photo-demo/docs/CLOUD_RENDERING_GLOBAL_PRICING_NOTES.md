# 云渲染海外定价核验（2026-11-15）

本笔记只研究现有 Three.js 网页在远程 Linux GPU 浏览器中的渲染，不开通或购买服务器。定价为公开 Linux On-Demand、Shared tenancy、无预装商业软件；均为 USD，税费、EBS、公网 IPv4 与网络流量另计。以下来自 AWS 官方价格目录，并按其官方 CSV 筛选说明检索，不使用第三方估价作为依据。

## 已核验计算实例

| 地区 | 实例 | GPU | vCPU / RAM | 每小时 USD | 720 小时 USD |
| --- | --- | --- | --- | ---: | ---: |
| 新加坡 ap-southeast-1 | g4dn.2xlarge | 1 × NVIDIA T4 / 16 GB | 8 / 32 GiB | 1.052 | 757.44 |
| 香港 ap-east-1 | g4dn.2xlarge | 1 × NVIDIA T4 / 16 GB | 8 / 32 GiB | 1.158 | 833.76 |
| 美东弗吉尼亚 us-east-1 | g4dn.2xlarge | 1 × NVIDIA T4 / 16 GB | 8 / 32 GiB | 0.752 | 541.44 |
| 美东弗吉尼亚 us-east-1 | g6.2xlarge | 1 × NVIDIA L4 / 24 GB | 8 / 32 GiB | 0.9776 | 703.872 |

价格目录版本 `20261114012926`，出版 2026-11-14T01:29:26Z，相关行 EffectiveDate 为 2026-11-01。SKU 分别为 `77E3SQ5ZB9PCPK8N`、`ZKBHTPXTV4K88UPN`、`TC8FKEZG2GHNHWEF`、`XCA3J9EEM739PU6M`。按实例筛选新加坡/香港目录时未找到 g6.2xlarge 的合格行，不据此承诺当地可购买该 SKU；新加坡原型以有明确价格的 T4 实例起步。

原始一方报价：[新加坡 CSV](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20261114012926/ap-southeast-1/index.csv)、[香港 CSV](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20261114012926/ap-east-1/index.csv)、[美东 CSV](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20261114012926/us-east-1/index.csv)。[AWS 官方筛选方法](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/finding-prices-in-service-price-list-files.html)。配置依据：[G4](https://aws.amazon.com/ec2/instance-types/g4/)、[G6](https://aws.amazon.com/ec2/instance-types/g6/)。官方价格目录用于信息参考，实际与服务报价冲突时以服务报价为准。

## 编码与手机浏览器

T4 有 1 个 NVENC 引擎，L4 有 2 个，均支持 H.264；支持表中的 unrestricted 是驱动会话数量策略，不代表无限吞吐。A100 的 NVENC 为 0，不宜因其 AI 算力高而选作本项目的低成本图形串流机。[NVIDIA 官方编解码支持表](https://developer.nvidia.com/video-encode-decode-support-matrix)

AWS G4dn/G6 支持 NVIDIA Tesla、GRID 和 Gaming 驱动；其 Linux OpenGL/Vulkan 与 NVENC 接口可供渲染及编码。Gaming 驱动的显示器数量限制和实际多容器桌面架构需单独核验，不能从硬件编码器会话许可推导多用户密度。[AWS 驱动文档](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html)

H.264 Constrained Baseline 是 WebRTC 兼容浏览器的基础编码要求，可作为 iOS Safari 和 Android 浏览器的起步方案；不应把 AV1/HEVC 全平台支持作为首版前提。[MDN WebRTC 编码文档](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs)

720p/30fps 每 GPU 2 个独立用户仅是预算假设，4 个是压测目标，均不是已测容量。GPU、浏览器主线程、系统 RAM、显存、编码器和多用户最坏场景均会影响容量。

## 其他明确费用

每个公有 IPv4 地址每小时 $0.005，即 720 小时 $3.60，闲置也计费。[VPC 官方价格](https://aws.amazon.com/vpc/pricing/)

每月 100 GB 的互联网出流量免费量是全账户跨服务、跨地区共享（不含中国区和 GovCloud）；不能给每台机器或每个用户各减 100 GB。公网出流量阶梯会聚合部分 AWS 服务。数据传入与跨区、跨可用区传输应分别核验。[EC2 官方按量价格](https://aws.amazon.com/ec2/pricing/on-demand/)

本方案应让 WebRTC 直接出网或走同区专用 TURN，避免把高码率视频默认经过按 GB 收取处理费的 NAT Gateway。TURN 不必然造成两遍公网出网费：若 GPU 到 TURN 走同区私网，只对实际路径核算；跨区/跨云 TURN 可能额外计费。[NAT Gateway 官方计费说明](https://aws.amazon.com/vpc/pricing/)

## 已核验公网出流量阶梯

AWSDataTransfer 目录版本 `20261111191941`。以下为超出全账户共享免费量后的累计付费用量；单位沿用官方目录 GB，不把 10 TB 错按 10,000 GB，目录区间边界为 10,240 / 51,200 / 153,600。

| 地区 | 首 10,240 GB | 后续至 51,200 GB | 后续至 153,600 GB | 超出 153,600 GB |
| --- | ---: | ---: | ---: | ---: |
| 新加坡 | $0.120 / GB | $0.085 / GB | $0.082 / GB | $0.080 / GB |
| 香港 | $0.120 / GB | $0.085 / GB | $0.082 / GB | $0.080 / GB |
| 美东弗吉尼亚 | $0.090 / GB | $0.085 / GB | $0.070 / GB | $0.050 / GB |

原始官方目录：[新加坡 DataTransfer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/20261111191941/ap-southeast-1/index.json)、[香港 DataTransfer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/20261111191941/ap-east-1/index.json)、[美东 DataTransfer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/20261111191941/us-east-1/index.json)。出网 SKU 分别是 `SDHP4R7WGBVJPQPY`、`UYN6VMC5ANUD4H6S`、`HQEH3ZWJVT46JHRG`；全球 100 GB 免费量 SKU 为 `PB257JUQ8U6E6UPM`。

以 4 Mbps 视频、额外 15% 音频/协议预算、十进制 GB 的近似计算，每活跃用户小时约 2.07 GB；新加坡首档出网约 $0.2484 / 用户小时。若每台同时承载 2 人且二人都活跃，GPU约 $0.526 / 用户小时，二者合计约 $0.7744 / 用户小时，尚未算备用容量与其他服务。若空闲时间很多，GPU费用不会随播放人数自动归零，需要单独算利用率。上述 GB 近似与供应商实际字节计量可能有差异，不作为结算账单。

## 选型结论

- 海外东亚/东南亚用户：从新加坡 g4dn.2xlarge 原型开始，2 个独立会话/卡作为初始预算，至少测试 1、2、4 会话；是否用香港由实测移动网 RTT 决定。
- 北美用户：宜新增美区池，不能把新加坡当作全球低延迟入口；美东便宜但不能以其价承诺中国用户体验。
- GPU配额、可用区容量和驱动架构需在开通前验证。公开价格不保证有现货。
- 预算表必须按地区分别向上取整机器数；两个各 5 人的区域按每卡 2 人需要 3+3 台，不能合并算成 5 台。至少保留可用热会话，是否需要整台备用 GPU 与容灾要求另算。
