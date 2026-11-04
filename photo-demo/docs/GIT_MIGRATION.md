# Git 仓库统一记录 · 2026-11-04

项目统一由外层 `backside_universe/.git` 管理。`photo-demo/` 作为普通目录逐文件跟踪，不是子模块，也不再具有自己的 `.git`。外层原有 `56fc3e5` 初始提交保留。

## 旧历史的备份

迁移前内层 HEAD 为 `ec5abb03a4ea7e78a80e4fa12b0416cc21060fbf`，包含四个提交：

```text
0ff7d5c Update Site source
7044903 Update Site source
72625fe Update Site source
ec5abb0 feat: add reconstruction labs and keep generated assets local
```

备份位于项目外的同级目录：

```text
../backside_universe-git-backups/photo-demo-20261104-ec5abb0-s5rjw3qg/
  photo-demo-history.bundle
  verified-history.git/
  original-dot-git/
  backup-manifest.json
```

`photo-demo-history.bundle` 使用 `git bundle create --all` 导出，已通过 `git bundle verify`。另从 bundle 克隆独立裸仓库，并核对四个提交的完整 ID 集合和执行 `git fsck --full`。`original-dot-git/` 是从内层原位置移出的完整 `.git`，保留原引用、reflog、配置及其他本地 Git 对象。manifest 保存原 HEAD、引用、bundle SHA256 与迁移前 120 个已跟踪文件的哈希。

这些备份只保存在本机，没有进入外层仓库。它们包含早期图片/模型历史，不能作为普通源码附件上传。

若要查看旧历史，可在另一个目录独立恢复，不覆盖当前项目：

```sh
git clone /absolute/path/to/photo-demo-history.bundle /another/path/photo-demo-history
```

## 纳入外层仓库的内容

- 内层 `ec5abb0` 的源码、配置、许可及文档快照。
- 原来漏在外层的产品、设计、调研、任务计划、进度和技术发现。
- 根目录共享忽略规则，以及覆盖整个仓库的提交内容检查。

没有把内层旧提交合并到外层历史，以免旧提交中的图片与模型随未来推送进入 GitHub。完整旧历史仍可从上述备份恢复。

照片、GLB、PLY、生成几何、模型权重、截图、运行环境及大型依赖继续留在原本的本地路径；演示路径和 localhost 地址不变。本次只创建外层本地提交，未执行 push。

## 迁移核对

迁移前120个内层已跟踪文件逐一比对，仅忽略规则、README、资产说明和仓库检查脚本按迁移需要变化。51个本地运行资产的SHA256全部保持不变，localhost返回HTTP 200，`npm run check`通过。

从根目录和应用目录运行仓库检查均覆盖整个外层索引。用临时索引验证：根目录图片、实验生成几何JSON、嵌套gitlink都会被拒绝，真实暂存区未被测试修改。上游Three.js源码保留原始字节，通过`.gitattributes`仅豁免其已有的混合缩进格式检查。
