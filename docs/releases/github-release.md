# GitHub Release 发布步骤

本文记录 Image Tools v0.4.0 Windows x64 发布流程。目标 tag 是不可变的 `v0.4.0`；已存在的 `v0.3.0` 不移动、不覆盖。

## 发布资产

Windows workflow 发布五个稳定命名资产：

```text
Image-Tools-v0.4.0-Windows-x64.msi
Image-Tools-v0.4.0-Windows-x64-Portable.zip
Image-Tools-v0.4.0-Windows-x64-SHA256SUMS.txt
Image-Tools-v0.4.0-Windows-x64-SBOM.spdx.json
Image-Tools-v0.4.0-Windows-x64-build-info.json
```

Portable ZIP 必须只包含 `Image Tools.exe`。MSI 的行政解包负载必须只包含一个应用可执行文件 `Image Tools.exe`。可执行资产均未签名，Windows 可能显示未知发布者或 SmartScreen 提示；应用不包含自动更新。`SHA256SUMS` 由通过门禁的 MSI 和 Portable 字节生成。`SBOM.spdx.json` 是由 workflow 生成的 SPDX JSON 软件物料清单，描述构建依赖；`build-info.json` 记录 tag、build ref、repository、commit SHA、workflow run、尝试次数、生成时间和资产文件名，不包含 API Key 或工作区数据。

## 版本一致性

下列位置必须全部是 `0.4.0`，workflow 默认值必须全部是 `v0.4.0`：

- `package.json` 和 `package-lock.json`
- `src-tauri/Cargo.toml` 和根 crate 的 `src-tauri/Cargo.lock` 条目
- `src-tauri/tauri.conf.json`
- `.github/workflows/windows-release.yml`
- `docs/releases/v0.4.0.md`

可用只读脚本检查：

```bash
python - <<'PY'
import json, pathlib, tomllib

package = json.loads(pathlib.Path("package.json").read_text())
lock = json.loads(pathlib.Path("package-lock.json").read_text())
tauri = json.loads(pathlib.Path("src-tauri/tauri.conf.json").read_text())
cargo = tomllib.loads(pathlib.Path("src-tauri/Cargo.toml").read_text())
assert package["version"] == lock["version"] == lock["packages"][""]["version"] == "0.4.0"
assert tauri["version"] == cargo["package"]["version"] == "0.4.0"
PY
```

## 发布前门禁

先在干净提交上完成集中仓库门禁：

```bash
mise run test
mise run ui-test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
mise run desktop-check
git diff --check
git status --short
```

这些检查不能替代 Windows 门禁。发布前还必须在 Windows x64 runner 上验证真实 MSI 与 Portable 资产：负载内容、安装/卸载、唯一应用进程、无应用监听端口、关闭窗口后完整退出、Windows WebView2 媒体/主题行为，以及 v0.3.0 schema-v2 工作区升级和备份恢复回滚。

## 创建 Tag

确认待发布提交已推送后创建新 tag：

```bash
git tag -a v0.4.0 -m "Image Tools v0.4.0"
git push origin main
git push origin v0.4.0
```

不要复用旧 tag，也不要在失败后移动 `v0.4.0`。若发布提交需要修复，使用新的补丁版本和 tag。

## 运行 Windows Workflow

工作流位于 `.github/workflows/windows-release.yml`。它会：

1. Checkout `build_ref`。
2. 在 `windows-latest` 上构建 x86_64 MSI。
3. 把唯一 MSI 重命名为稳定资产名。
4. 从 `src-tauri\target\x86_64-pc-windows-msvc\release\Image Tools.exe` 创建单文件 Portable ZIP。
5. 运行 `scripts/verify_windows_single_process.ps1`。
6. 下载公开 Release 中固定的 v0.3.0 MSI，在隔离工作区运行 v0.3.0 → v0.4.0 升级，并在回滚 v0.3.0 前恢复升级前的 schema-v2 备份。
7. 为 MSI 和 Portable 生成 SHA-256 校验文件。
8. 生成 SPDX JSON SBOM 和不含机密的 `build-info.json` 构建来源清单。
9. 无条件上传五个 workflow artifact；只有 `publish_release=true` 时才创建 GitHub Release 并上传 release assets。

触发命令：

```bash
gh workflow run windows-release.yml -f release_tag=v0.4.0 -f build_ref=v0.4.0
```

该命令的 `publish_release` 默认为 `false`，适合安全验证，不会创建或修改公开 Release。门禁成功后，发布 run 必须显式执行：

```bash
gh workflow run windows-release.yml -f release_tag=v0.4.0 -f build_ref=v0.4.0 -f publish_release=true
```

也可在以下页面选择 `Run workflow`，两个输入都填写 `v0.4.0`：

```text
https://github.com/MakeLuvHell/imagetools/actions/workflows/windows-release.yml
```

不要重跑修复前已经失败的旧 run；它仍使用当时 checkout 的提交。提交修复并使用新 tag。

## 本地 Windows 构建与验证

本地 Windows x64 机器可执行：

```powershell
npm run desktop:build:windows
```

MSI 产物目录：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/
```

按 workflow 的稳定名称复制 MSI，并创建 Portable ZIP 后运行：

```powershell
pwsh -NoProfile -File scripts/verify_windows_single_process.ps1 `
  -Msi release-assets/Image-Tools-v0.4.0-Windows-x64.msi `
  -PortableZip release-assets/Image-Tools-v0.4.0-Windows-x64-Portable.zip
```

该脚本会拒绝已有 Image Tools 安装，避免修改预存用户状态；请在隔离 Windows runner 或干净测试机上运行。

升级/回滚门禁另需公开的 `Image-Tools-v0.3.0-Windows-x64.msi`，并运行 `scripts/verify_windows_upgrade_rollback.ps1`。脚本生成脱敏 schema-v2 fixture，验证 v0.4.0 迁移后的 schema v3，再让回滚安装只打开升级前备份；它不会把工作区、SQLite 数据库或 API Key 上传为 artifact。v0.3.0 不能直接打开已迁移的 schema-v3 数据库。

## 发布后检查

```bash
gh release view v0.4.0 --repo MakeLuvHell/imagetools
```

确认：

- tag 和标题均为 `v0.4.0`。
- 只有预期的 MSI、Portable ZIP、`SHA256SUMS`、SPDX JSON SBOM 与 `build-info.json`，文件名完全匹配。
- workflow 的 `Verify Windows single-process release` 步骤成功，并发生在任何资产上传前。
- Release 正文来自 `docs/releases/v0.4.0.md`。
- 下载后的 MSI 与 Portable 哈希均与 `SHA256SUMS` 一致。
- `build-info.json` 中的 `commit_sha` 与 tag 指向的提交一致，`workflow_run_id` 指向本次发布 run；SBOM 中不包含工作区或 API Key。

发布门禁证据和升级/回滚记录应附在发布 run 或 RB014 验证记录中；不能用源代码检查结果代替。
