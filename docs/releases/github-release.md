# GitHub Release 发布步骤

本文记录 Image Tools 桌面安装版的 GitHub Release 流程。当前项目版本来自 `package.json` 和 `src-tauri/tauri.conf.json`，首个桌面安装包版本为 `0.1.0`，对应 tag 为 `v0.1.0`。

官方参考：

- GitHub Releases 文档：https://docs.github.com/repositories/releasing-projects-on-github/managing-releases-in-a-repository
- GitHub CLI `gh release create` 文档：https://cli.github.com/manual/gh_release_create

## 发布原则

- Release 应该从最终要交付的代码创建，推荐从 `main` 发布。
- tag 名使用 `vX.Y.Z`，例如 `v0.1.0`。
- Release asset 上传桌面安装包，不上传 `build/`、`target/` 或 sidecar 中间产物目录。
- GitHub token、API token、个人访问令牌不要写入仓库文件。
- 如果 release 已存在，不要直接覆盖；先确认是否要删除重发、追加资产，还是发布 `v0.1.1`。

## 当前版本资产

`v0.1.0` 的 Linux 桌面安装包由 `mise run desktop-build` 生成：

```text
src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb
src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm
```

注意路径中有空格，命令里必须加引号。

## 前置检查

在发布前确认当前分支干净：

```bash
git status --short --branch
```

确认所有 feature 分支提交都符合提交规范：

```bash
git log --reverse --format='%s' main..HEAD
```

提交标题应满足：

```text
type(scope): 中文描述
```

确认版本号一致：

```bash
node -p "require('./package.json').version"
python - <<'PY'
import json
from pathlib import Path
print(json.loads(Path("src-tauri/tauri.conf.json").read_text())["version"])
PY
```

确认远端当前状态：

```bash
git remote -v
git ls-remote --heads origin main feature/installable-app
git ls-remote --tags origin 'v0.1.0'
```

如果 `refs/tags/v0.1.0` 已经存在，先停止，检查已有 release：

```bash
gh release view v0.1.0 --repo MakeLuvHell/imagetools
```

如果本机没有 `gh`，在 GitHub 网页的 Releases 页面检查：

```text
https://github.com/MakeLuvHell/imagetools/releases
```

## 构建验证

发布前重新跑完整验证：

```bash
mise run test
mise run backend-bundle
mise run desktop-check
mise run desktop-build
```

确认产物存在：

```bash
find src-tauri/target/release/bundle -maxdepth 3 -type f \( -name '*.deb' -o -name '*.rpm' \) -print | sort
```

预期至少包含：

```text
src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb
src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm
```

## 推荐流程：先合并到 main，再从 main 发布

推送 feature 分支：

```bash
git push -u origin feature/installable-app
```

创建 PR：

```bash
gh pr create \
  --repo MakeLuvHell/imagetools \
  --base main \
  --head feature/installable-app \
  --title "feat(desktop): 添加桌面安装版" \
  --body "添加 Tauri 桌面壳、后端 sidecar 打包、mise 构建任务和 Linux deb/rpm 安装包流程。"
```

如果本机没有 `gh`，用网页创建 PR：

```text
https://github.com/MakeLuvHell/imagetools/compare/main...feature/installable-app?expand=1
```

PR 合并后，更新本地 `main`：

```bash
git checkout main
git pull --ff-only origin main
```

在 `main` 上创建带注释 tag：

```bash
git tag -a v0.1.0 -m "Image Tools v0.1.0"
git push origin v0.1.0
```

## 备选流程：直接从当前 feature 分支发布

只有在明确接受 release tag 指向 feature 分支时才用此流程。

```bash
git push -u origin feature/installable-app
git tag -a v0.1.0 -m "Image Tools v0.1.0"
git push origin v0.1.0
```

这种方式会让 `v0.1.0` 指向 `feature/installable-app` 当前提交，而不是 `main`。如果之后再合并 main，历史会多一步，需要团队接受。

## 准备 Release Notes

可使用以下内容作为 `v0.1.0` release notes：

```markdown
## Image Tools v0.1.0

首个桌面安装版。

### 新增

- 添加 Tauri 桌面壳，启动后自动拉起 FastAPI 后端 sidecar。
- 添加 PyInstaller 后端 sidecar 打包流程。
- 添加 `mise` 工具链与桌面构建任务。
- 添加 Linux 本地 sysroot 兜底流程，支持无 sudo 环境构建。
- Linux 默认生成 deb/rpm 安装包。

### 验证

- `mise run test`
- `mise run backend-bundle`
- `mise run desktop-check`
- `mise run desktop-build`

### 安装包

- `Image Tools_0.1.0_amd64.deb`
- `Image Tools-0.1.0-1.x86_64.rpm`
```

如果要写入临时文件给 `gh release create` 使用：

```bash
cat > /tmp/imagetools-v0.1.0-release-notes.md <<'EOF'
## Image Tools v0.1.0

首个桌面安装版。

### 新增

- 添加 Tauri 桌面壳，启动后自动拉起 FastAPI 后端 sidecar。
- 添加 PyInstaller 后端 sidecar 打包流程。
- 添加 `mise` 工具链与桌面构建任务。
- 添加 Linux 本地 sysroot 兜底流程，支持无 sudo 环境构建。
- Linux 默认生成 deb/rpm 安装包。

### 验证

- `mise run test`
- `mise run backend-bundle`
- `mise run desktop-check`
- `mise run desktop-build`

### 安装包

- `Image Tools_0.1.0_amd64.deb`
- `Image Tools-0.1.0-1.x86_64.rpm`
EOF
```

## 使用 GitHub CLI 创建 Release

前置条件：

- 已安装 `gh`。
- 已登录 GitHub：`gh auth login`。
- 当前用户对 `MakeLuvHell/imagetools` 有 release 权限。
- `v0.1.0` tag 已经推送到 GitHub。

创建 release 并上传资产：

```bash
gh release create v0.1.0 \
  "src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb" \
  "src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm" \
  --repo MakeLuvHell/imagetools \
  --title "Image Tools v0.1.0" \
  --notes-file /tmp/imagetools-v0.1.0-release-notes.md
```

如果要先创建草稿 release：

```bash
gh release create v0.1.0 \
  "src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb" \
  "src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm" \
  --repo MakeLuvHell/imagetools \
  --title "Image Tools v0.1.0" \
  --notes-file /tmp/imagetools-v0.1.0-release-notes.md \
  --draft
```

## 使用 GitHub 网页创建 Release

如果本机没有 `gh`，用网页操作：

1. 打开：

   ```text
   https://github.com/MakeLuvHell/imagetools/releases/new?tag=v0.1.0
   ```

2. `Choose a tag` 选择或输入 `v0.1.0`。
3. `Target` 选择 tag 对应的提交。推荐选择已经合并后的 `main`。
4. `Release title` 填：

   ```text
   Image Tools v0.1.0
   ```

5. `Describe this release` 粘贴上面的 release notes。
6. 上传两个安装包：

   ```text
   src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb
   src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm
   ```

7. 如果要先检查，点击 `Save draft`；如果确认发布，点击 `Publish release`。

## 发布后验证

用 GitHub CLI 验证：

```bash
gh release view v0.1.0 --repo MakeLuvHell/imagetools --web
gh release view v0.1.0 --repo MakeLuvHell/imagetools
```

用 API 验证：

```bash
curl --fail --silent https://api.github.com/repos/MakeLuvHell/imagetools/releases/tags/v0.1.0
```

检查页面：

```text
https://github.com/MakeLuvHell/imagetools/releases/tag/v0.1.0
```

确认 release 页面包含：

- tag：`v0.1.0`
- title：`Image Tools v0.1.0`
- asset：`Image Tools_0.1.0_amd64.deb`
- asset：`Image Tools-0.1.0-1.x86_64.rpm`

## 常见问题

### 本机没有 `gh`

安装 GitHub CLI，或直接使用 GitHub 网页创建 release。当前仓库不依赖 `gh` 才能构建安装包；`gh` 只用于自动创建 release。

### 没有 GitHub 登录权限

先运行：

```bash
gh auth login
```

或在 shell 中设置有权限的 token：

```bash
export GH_TOKEN="..."
```

不要把 token 写进仓库文件。

### tag 已存在但 release 不存在

可以直接基于已有 tag 创建 release：

```bash
gh release create v0.1.0 \
  "src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb" \
  "src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm" \
  --repo MakeLuvHell/imagetools \
  --title "Image Tools v0.1.0" \
  --notes-file /tmp/imagetools-v0.1.0-release-notes.md
```

### release 已存在但资产缺失

上传缺失资产：

```bash
gh release upload v0.1.0 \
  "src-tauri/target/release/bundle/deb/Image Tools_0.1.0_amd64.deb" \
  "src-tauri/target/release/bundle/rpm/Image Tools-0.1.0-1.x86_64.rpm" \
  --repo MakeLuvHell/imagetools
```

如果资产同名已存在，先确认是否允许覆盖。允许覆盖时加：

```bash
--clobber
```

### 要撤销本地 tag

只撤销本地 tag：

```bash
git tag -d v0.1.0
```

删除远端 tag 属于破坏性操作，发布后不要随意执行。确实要删时，先确认没有用户依赖该 release。

```bash
git push origin :refs/tags/v0.1.0
```
