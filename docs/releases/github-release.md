# GitHub Release 发布步骤

本文记录 Image Tools Windows x64 安装包的发布流程。当前待发布版本为 `0.2.1`，对应不可变 tag `v0.2.1`。

## 发布原则

- `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本必须一致。
- Release 从同名 tag 构建，`release_tag` 和 `build_ref` 均填写该 tag。
- 已发布 tag 不移动、不覆盖；后续修改使用新的补丁版本。
- Windows 安装包暂未签名，系统可能显示未知发布者或 SmartScreen 提示。

## 发布前验证

```bash
npm run frontend:vendor
cmp src-tauri/icons/icon.png frontend/assets/app-icon.png
pytest -q
node --test tests/*.test.js
cargo check --manifest-path src-tauri/Cargo.toml
git status --short
```

Windows 安装器配置应满足：

- NSIS `.exe` 使用 `SimpChinese`。
- WiX/MSI `.msi` 使用 `zh-CN`。
- 应用、安装器和卸载器使用 `src-tauri/icons/icon.ico`。

## 创建 Tag 和 Release

确认所有验证通过并推送 `main` 后创建 tag：

```bash
git tag -a v0.2.1 -m "Image Tools v0.2.1"
git push origin main
git push origin v0.2.1
```

在 GitHub 创建 `v0.2.1` Release，说明使用 `docs/releases/v0.2.1.md`：

```text
https://github.com/MakeLuvHell/imagetools/releases/new?tag=v0.2.1
```

使用 GitHub CLI 时可执行：

```bash
gh release create v0.2.1 \
  --repo MakeLuvHell/imagetools \
  --title "Image Tools v0.2.1" \
  --notes-file docs/releases/v0.2.1.md
```

## 构建 Windows 安装包

工作流位于 `.github/workflows/windows-release.yml`，必须在 Windows runner 上构建 x64 NSIS 和 MSI 安装包。

GitHub CLI 触发命令：

```bash
gh workflow run windows-release.yml -f release_tag=v0.2.1 -f build_ref=v0.2.1
```

没有安装 `gh` 时打开：

```text
https://github.com/MakeLuvHell/imagetools/actions/workflows/windows-release.yml
```

点击 `Run workflow`，两个输入均填写 `v0.2.1`。构建成功后，工作流会把以下文件上传到 Release：

- Windows x64 NSIS `.exe`
- Windows x64 MSI `.msi`

本地 Windows 机器也可执行：

```bash
npm run desktop:build:windows
```

产物位于：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/
```

## 发布后检查

打开 Release 页面：

```text
https://github.com/MakeLuvHell/imagetools/releases/tag/v0.2.1
```

确认：

- tag 和标题均为 `v0.2.1`。
- `.exe` 和 `.msi` 两种资产都存在。
- 两种安装界面均显示简体中文。
- 应用、安装器、卸载器和开始菜单快捷方式显示新图标。

也可使用命令检查：

```bash
gh release view v0.2.1 --repo MakeLuvHell/imagetools
curl --fail --silent https://api.github.com/repos/MakeLuvHell/imagetools/releases/tags/v0.2.1
```
