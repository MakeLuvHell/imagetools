# Image Tools

核心版 Web 生图工具，提供提示词生图、参考图上传、接口设置、结果预览、下载、复制链接和设为参考图。

## 功能范围

已包含：

- 文生图。
- 上传参考图进行图生图。
- 比例、分辨率/尺寸、渲染质量、张数和高级输出设置。
- API 地址和 API Key 服务端保存。
- 生成结果本地保存和预览。

暂不包含：

- 会话列表。
- 历史记录库。
- 素材中心。
- 提示词模板。
- 登录、多用户或权限管理。

## 安装

```bash
python -m pip install -r requirements.txt
```

## 运行

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860
```

打开：

```text
http://127.0.0.1:7860
```

## 桌面安装版

桌面版使用 Tauri 打包。Tauri 负责原生窗口和安装包，Python/FastAPI 后端会作为 sidecar 自动启动。

### 桌面开发依赖

推荐使用 `mise` 安装项目工具链：

```bash
mise install
```

项目 `.mise.toml` 固定了：

- Python 3.12.13
- Node.js 24.16.0
- Rust 1.96.1

还需要安装当前平台的 Tauri 系统依赖。

Ubuntu 24.04 可参考 Tauri v2 的 Linux 依赖安装：

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

安装 Python 和 Node 依赖：

```bash
mise run install
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

### 启动桌面开发版

```bash
mise run desktop-dev
```

该命令会启动 Tauri 原生窗口，并自动运行源码版 Uvicorn：监听
`127.0.0.1:7860` 且启用 `--reload`。修改 Python 后端后 Uvicorn 会自动重载；修改
`frontend/` 下的 HTML、CSS 或 JavaScript 后，需要刷新原生窗口。Rust 代码由
Tauri watcher 监视并自动触发开发构建。开发模式使用源码后端，不会生成 PyInstaller
sidecar；发布构建仍会先打包并使用 PyInstaller sidecar。

### 构建安装包

```bash
mise run desktop-build
```

构建产物位于 `src-tauri/target/release/bundle/`；Linux 默认生成 deb/rpm 安装包。桌面版运行时数据会保存到系统应用数据目录；普通 Web 开发仍默认使用仓库内的 `data/`。

Windows x64 安装包由 GitHub Actions 的 Windows runner 构建并上传到 GitHub Release；本地 Linux/WSL 构建只生成 Linux deb/rpm。发布流程见 [`docs/releases/github-release.md`](docs/releases/github-release.md)。

## 使用

1. 在页面左侧保存兼容 OpenAI 图片接口的 API 地址、API Key 和默认模型。
2. 输入提示词。
3. 按需上传参考图、选择比例、分辨率/尺寸、渲染质量和张数。
4. 点击生成图片。

界面参考 `openai/codex` 的 Codex CLI/App 交互：单个终端窗口中显示启动信息、运行记录和底部输入区，通过 `/settings`、`/reference`、`/options`、`/advanced` 组织配置。输入区会自动记住上次使用的提示词和参数，也可以用快捷预设快速切换常见比例、尺寸、渲染质量和张数组合。

“比例”只表示画幅形状，例如 `1:1`、`16:9`。“分辨率/尺寸”决定实际输出宽高。“渲染质量”是接口的生成质量参数，通常影响细节、速度和成本，不等同于图片分辨率。

API 地址可以填写供应商给出的 Base URL，例如：

```text
https://img-api.chshapi.org/v1
```

前端只请求本地 `/api/*` 接口，API Key 保存到服务端；后端再代理请求上游接口。后端会保留 Base URL 里的 `/v1`，并避免拼成重复的 `/v1/v1/...`。所以最终请求地址显示为：

```text
https://img-api.chshapi.org/v1/images/generations
```

这是正常的完整上游请求地址。后端当前会调用：

- `/v1/images/generations`
- `/v1/images/edits`

也可以用环境变量预置接口配置：

```bash
export IMAGE_TOOLS_BASE_URL="https://img-api.chshapi.org/v1"
export IMAGE_TOOLS_API_KEY="sk-..."
export IMAGE_TOOLS_MODEL="gpt-image-2"
```

## 测试

推荐使用：

```bash
mise run test
```

也可以分别运行：

```bash
pytest -q
node --test tests/frontend_preferences.test.js
```

完整的 GPT Image API 与前端字段适配说明见
[`docs/api/gpt-image-api-frontend-adapter.md`](docs/api/gpt-image-api-frontend-adapter.md)。

## 本地文件

运行时文件保存在 `data/`：

- `data/settings.json`：接口设置。
- `data/images/`：生成图片。
- `data/uploads/`：上传的参考图。

`data/` 默认不提交到 git。
