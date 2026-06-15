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

## 使用

1. 在页面左侧保存兼容 OpenAI 图片接口的 API 地址、API Key 和默认模型。
2. 输入提示词。
3. 按需上传参考图、选择比例、分辨率/尺寸、渲染质量和张数。
4. 点击生成图片。

左侧控制区会自动记住上次使用的提示词和参数，也可以用快捷预设快速切换常见比例、尺寸、渲染质量和张数组合。

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
