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

推荐使用 `mise` 安装项目工具链：

```bash
mise install
mise run install
```

项目 `.mise.toml` 固定了：

- Python 3.12.13
- Node.js 24.16.0
- Rust 1.96.1

## 运行桌面开发版

```bash
mise run desktop-dev
```

Tauri 负责原生窗口，Python/FastAPI 后端会作为 sidecar 自动启动。浏览器入口仅作为开发测试入口，不是正式产品主入口。

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

Windows 安装包产物位于：

```text
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

Linux 本地构建产物仍位于：

```text
src-tauri/target/release/bundle/
```

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

Linux 缺少 Tauri 系统依赖时：

```bash
mise run desktop-prereqs
mise run desktop-sysroot
```

## 图片接口说明

后端调用兼容 OpenAI 图片接口：

- `/v1/images/generations`
- `/v1/images/edits`

Base URL 可以包含 `/v1`，后端会避免拼成重复的 `/v1/v1/...`。完整字段适配见 [`docs/api/gpt-image-api-frontend-adapter.md`](docs/api/gpt-image-api-frontend-adapter.md)。
