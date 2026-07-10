# Image Tools

Windows 桌面图片创作工作台，用于通过兼容 OpenAI 图片接口进行文生图、参考图生成、会话化历史管理和本地结果追溯。

## 当前能力

- Windows-first Tauri 桌面应用，启动后自动拉起本地 FastAPI sidecar。
- 左侧会话/历史列表，中间当前会话时间线和底部 Composer。
- 多 provider 配置：名称、Base URL、API Key、默认模型。
- 每次生成写入本地历史：提示词、参数、provider/model 快照、参考图、结果图或错误。
- 图片文件保存在本地目录，元数据保存在 SQLite。
- 支持结果预览、下载、复制链接、设为参考图、复制参数继续生成。

不包含云同步、账号、多用户、素材中心、系统凭据存储、自动更新或内置图片编辑器。

## 安装开发依赖

推荐使用 `mise` 安装项目工具链和依赖：

```bash
mise install
mise run install
```

项目 `.mise.toml` 固定了：

- Python 3.12.13
- Node.js 24.16.0
- Rust 1.96.1

还需要安装当前平台的 Tauri 系统依赖。Ubuntu 24.04 可参考 Tauri v2 的 Linux 依赖安装：

```bash
sudo apt install -y \
  build-essential \
  curl \
  file \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  pkg-config \
  wget
```

检查 Linux 桌面系统依赖：

```bash
mise run desktop-prereqs
```

如果当前环境没有 sudo 或不能安装系统包，可以让项目下载本地 sysroot：

```bash
mise run desktop-sysroot
```

`desktop-check`、`desktop-dev` 和 `desktop-build` 会优先使用系统依赖；系统依赖缺失时会自动使用 `build/tauri-sysroot/`。

## 运行桌面开发版

```bash
mise run desktop-dev
```

该命令会启动 Tauri 原生窗口，并自动运行源码版 Uvicorn：监听 `127.0.0.1:7860` 且启用 `--reload`。修改 Python 后端后 Uvicorn 会自动重载；修改 `frontend/` 下的 HTML、CSS 或 JavaScript 后，需要刷新原生窗口。Rust 代码由 Tauri watcher 监视并自动触发开发构建。

`desktop-dev` 固定使用 `127.0.0.1:7860`，并由启动器独占该端口。端口已被 Web/Uvicorn 服务占用时，启动会立即失败；启动器会为本次运行生成校验令牌，桌面端不会连接遗留后端。`desktop:dev -- --release` 不受支持，因为发布模式需要打包后的 PyInstaller sidecar；请使用 `mise run desktop-build` 构建发布版。

浏览器入口仅作为开发测试入口，不是正式产品主入口。

如需单独调试后端或静态前端，可运行：

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860
```

## 构建桌面安装包

本地平台构建：

```bash
mise run desktop-build
```

Windows x64 构建脚本：

```bash
npm run desktop:build:windows
```

构建产物位于 `src-tauri/target/release/bundle/`；Linux 默认生成 deb/rpm 安装包。Windows x64 安装包产物位于：

```text
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

Windows x64 安装包由 GitHub Actions 的 Windows runner 构建并上传到 GitHub Release；本地 Linux/WSL 构建只生成 Linux deb/rpm。发布流程见 [`docs/releases/github-release.md`](docs/releases/github-release.md)。

## 运行时数据

桌面版运行时数据保存到系统应用数据目录。开发测试入口未设置 `IMAGE_TOOLS_DATA_DIR` 时使用仓库内 `data/`。

数据布局：

- `workbench.sqlite3`：SQLite 元数据。
- `providers`：provider 配置，包含 Base URL、API Key、默认模型。
- `sessions`：创作会话。
- `generation_runs`：每轮生成的提示词、参数、provider/model 快照、状态和错误。
- `images`：生成图片文件的本地路径和元数据。
- `data/images/`：生成图片文件。
- `data/uploads/`：上传或继续生成使用的参考图。
- `data/settings.json`：旧版单 provider 设置；首次访问 provider API 时会迁移为默认 provider。

## 测试与验证

完整测试：

```bash
mise run test
```

分别运行：

```bash
pytest -q
node --test tests/*.test.js
```

桌面相关验证：

```bash
mise run backend-bundle
mise run desktop-check
mise run desktop-build
```

## 图片接口说明

后端调用兼容 OpenAI 图片接口：

- `/v1/images/generations`
- `/v1/images/edits`

Base URL 可以包含 `/v1`，后端会避免拼成重复的 `/v1/v1/...`。完整字段适配见 [`docs/api/gpt-image-api-frontend-adapter.md`](docs/api/gpt-image-api-frontend-adapter.md)。
