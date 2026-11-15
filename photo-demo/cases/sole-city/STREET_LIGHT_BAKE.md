桥脚—豆浆摊—东巷的天光根据装配后网格计算。GLB 原件、跑鞋底座、街区和镜头继续使用同一套坐标，没有替换 Hi3D 店面。

在项目根目录执行以下步骤可重烘遮挡。输入是已构建、已展开的实机街段。更改遮挡物（例如雨棚长度或窗洞）后重烘；油漆、窗字等表面修改不用重烘。

```sh
node photo-demo/cases/sole-city/capture-street-mesh.cjs http://127.0.0.1:49619/309e177f3e73c1de/ /tmp/street-triangles.f32
c++ -O3 -std=c++17 photo-demo/cases/sole-city/bake-street-light.cpp -o /tmp/street-light-bake
/tmp/street-light-bake /tmp/street-triangles.f32 /tmp/street-sky.ppm
ffmpeg -loglevel error -y -i /tmp/street-sky.ppm -frames:v 1 -c:v png -pred mixed -compression_level 9 photo-demo/cases/sole-city/viewer/bridge-skylight.png
./photo-demo/universe sole-city build
```

离线工具把实体三角面保守地写入体素，并从 106×29×66 个位置各向 64 个上半球方向追踪天空可见度。同时保存五个接收面方向上的投影权重及近距离遮挡。此光场占一个 PNG，浏览器按局部坐标及实际表面法线采样。用它调节间接漫反射与环境反射；已有实时太阳、阴影和水坑环境采样都保留。路面同时采样整城或桥脚光场，摊脚另外保留近接触遮蔽。水泥和墙体的暖色反弹采取近似。光场在铺面显露后渐入。

整城光场使用相同的 64 向积分，覆盖从鞋跟到鞋尖的 92 × 33 × 196 个位置，高度采样向路面集中。横向七列排布让数据贴图保持在 1288 × 924 像素。桥脚附近按边缘距离过渡到局部高分辨率光场。整城建筑、廊檐或围墙的实体结构改变后，从最终装配版本重新执行：

```sh
node photo-demo/cases/sole-city/capture-street-mesh.cjs <该版本的实机URL> /tmp/town.f32 --city
c++ -O3 -std=c++17 -DCITY_LIGHT photo-demo/cases/sole-city/bake-street-light.cpp -o /tmp/town-bake
/tmp/town-bake /tmp/town.f32 /tmp/town.ppm
ffmpeg -loglevel error -y -i /tmp/town.ppm -frames:v 1 -c:v png -pred mixed -compression_level 9 photo-demo/cases/sole-city/viewer/city-skylight.png
```
摊车台脚使用装配后实体网格的 12 向近距离遮蔽积分。更换摊车、移动它或调整原始比例后，可在该版本的本地预览中重烘一次。以下命令在当前项目根目录执行。

```sh
node photo-demo/cases/sole-city/bake-counter-contact.cjs <该版本的实机URL> photo-demo/cases/sole-city/viewer
```

发布时 `counter-contact.png` 和 `counter-contact.json` 一同进入查看器。查看器逐件校验摊车模型任务号、构件顶点数与街区坐标变换后使用对应纹理。动态主光、水坑六面采样和摊前水面的实时反射各自在实机中计算。
