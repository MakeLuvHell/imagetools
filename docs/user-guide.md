# Image Tools 使用文档

Image Tools 是一款 Windows 桌面图片创作工具，支持 OpenAI Compatible、xAI Imagine 和 Gemini Native Image Provider。Provider 密钥、会话、参考图和生成结果保存在本机。

## 安装与启动

正式版面向 Windows x64，提供两种下载包：

- MSI：按安装向导安装，可从开始菜单启动，适合日常使用。
- Portable ZIP：解压后直接运行 `Image Tools.exe`，无需安装。压缩包内只有这一个应用执行文件。

应用依赖 Windows WebView2 Runtime。Windows 10 和 Windows 11 通常已安装；如果程序无法打开，请先安装或更新 WebView2 Runtime。

当前发布包未进行代码签名，Windows SmartScreen 可能提示“Windows 已保护你的电脑”。请确认文件来自本项目的 GitHub Release，再选择“更多信息”继续运行。

每个 Release 同时提供 `SHA256SUMS`。在下载目录打开 PowerShell，可将文件的实际摘要与校验文件比较：

```powershell
Get-FileHash -Algorithm SHA256 "Image-Tools-v0.4.0-Windows-x64.msi"
```

关闭主窗口后，整个 `Image Tools.exe` 进程会退出；应用不会在后台保留独立 backend 程序，也不会监听本地 Web 或 API 端口。

## 配置 Provider

首次生成前，打开左下角“设置”，进入 `Provider`，然后选择 `添加 Provider`。

需要填写：

- 协议：明确选择 OpenAI Compatible、xAI Imagine 或 Gemini Native Image。
- 名称：用于在应用中区分不同 Provider。
- Base URL：Provider 的 API 根地址。
- API Key：Provider 提供的密钥。
- 默认模型：生成时默认使用的模型名称。

保存前可以使用两个独立功能：

- `检测联通性`：检查地址、密钥和 Provider 服务能否正常通信。
- `获取可用模型`：从 Provider 读取模型列表并更新本地缓存。

联通性检测成功不代表模型发现一定成功，反之亦然。模型发现失败时，应用会保留上一次成功获取的模型缓存。编辑已有 Provider 时，API Key 留空会保留原密钥。需要在多个 Provider 之间设置默认项时，使用 `设为默认 Provider`。

### 协议参考

| 协议 | 推荐 Base URL | 常用模型 | 参考图和结果数量 |
| --- | --- | --- | --- |
| OpenAI Compatible | `https://api.openai.com/v1` | `gpt-image-2` | 最多 1 张参考图，最多 4 个结果 |
| xAI Imagine | `https://api.x.ai/v1` | `grok-imagine-image`、`grok-imagine-image-pro`、`grok-imagine-image-quality` | 最多 3 张有序参考图，最多 4 个结果 |
| Gemini Native Image | `https://generativelanguage.googleapis.com` | `gemini-3-pro-image`、`gemini-2.5-flash-image` | 最多 3 张有序参考图，固定 1 个结果 |

模型能力由协议和具体模型共同决定：

- OpenAI Compatible 支持 `1:1`、`3:2`、`2:3`，并提供高级输出选项。
- xAI Imagine 支持 `1:1`、`3:2`、`2:3`、`16:9`、`9:16`，以及标准、中等和大尺寸。
- Gemini Native Image 支持与 xAI 相同的画面比例。`gemini-3-pro-image` 的标准、中等和大尺寸分别对应 1K、2K 和 4K；`gemini-2.5-flash-image` 及未知 Gemini 模型只使用标准 1K。
- 使用参考图时只能生成 1 个结果，不兼容的选项会被禁用或自动调整。

自建或第三方 OpenAI 兼容服务的地址和模型名以服务方文档为准。应用不会根据域名猜测协议。

## 生成图片

1. 选择“新任务”，或进入一个已有会话。
2. 在消息框中选择 Provider 和模型。
3. 输入提示词，按需设置比例、分辨率和结果数量。
4. 按 Enter 或点击发送；需要换行时按 Shift+Enter。
5. 等待任务流显示结果或错误信息。

发送成功受理后，消息框中的提示词会立即清空，并以 Telegram 风格气泡动画进入任务流；界面会跟随到最新记录。进入已有会话时，也会定位到该会话的最新生成记录。比例、分辨率等常用参数会保留，方便继续迭代。

提交前的提示，例如“请先输入提示词”或“请先配置 Provider”，会显示在消息框正上方。Provider 返回的认证、限流、安全策略或生成错误会保留在对应任务记录中。

### 结果操作

每张结果图支持：

- 点击图片预览。
- 使用系统原生保存对话框保存文件。
- 复制图片链接。
- 选择 `设为参考图`，用于下一次生成。
- 选择 `复制参数`，复用该轮的生成设置。

## 使用参考图

在消息框中点击 `+`，选择 `上传参考图`。支持 PNG、JPEG 和 WebP。也可以从历史结果的菜单中选择 `设为参考图`。

已选择的参考图会按顺序显示：

- 使用 `左移` 和 `右移` 调整顺序，顺序会传给 Provider。
- 使用移除按钮取消某张参考图。
- 同一张图片不能重复加入。
- OpenAI Compatible 最多使用 1 张；xAI Imagine 和 Gemini Native Image 最多使用 3 张。

参考图只用于下一次提交。提交交给后端后，当前参考图会从消息框清除。上传文件会先暂存在本地，使用后或过期后由应用清理。

## 管理会话和项目

首次有效提交时，应用会自动创建会话，并根据提示词生成标题。会话右侧菜单提供：

- `置顶` 或取消置顶。
- `移动到项目`。
- `重命名`。
- `删除`。

可在侧栏新建、重命名和删除项目，也可以直接把会话拖到目标项目。项目支持展开和收起，状态会保存在当前设备上。删除项目不会删除其中的会话；这些会话会回到未归类区域。删除会话会同时删除该会话的生成记录，请在确认后操作。

## 设置

设置窗口会随主窗口尺寸变化，约占界面的四分之三，并在空间不足时内部滚动。设置包含：

- `外观`：跟随系统、浅色或深色。
- `Provider`：管理 Provider、联通性和模型。
- `本地数据`：查看或安排切换工作区目录。

切换本地数据目录会在重启应用后生效。可以选择把现有工作区复制到新目录；目标目录必须为空。复制完成后旧目录仍会保留，便于恢复，不会自动删除。

## 本地数据与备份

Windows 默认工作区通常位于：

```text
%APPDATA%\com.imagetools.desktop\
```

主要内容包括：

- `workbench.sqlite3`：Provider、项目、会话、生成轮次和图片元数据。
- `images/`：生成结果。
- `uploads/`：暂存参考图。
- `settings.json`：旧版单 Provider 设置的兼容文件。

建议退出应用后备份整个工作区，而不是只复制数据库。这样可以保证数据库记录与图片文件一致。

从 v0.3.0 升级到 v0.4.0 时，数据库会从 schema v2 自动迁移到 schema v3。升级前应备份完整工作区。若要回滚到 v0.3.0，必须恢复升级前的 schema-v2 备份；不要让 v0.3.0 直接打开已经迁移到 schema v3 的数据库。

Provider API Key 不会返回给前端界面，但当前版本也不使用 Windows 系统凭据库。备份工作区时应按含敏感信息的数据处理。

## 数据与隐私

Image Tools 没有项目自建的云服务或用户账号。会话历史、Provider 配置、API Key、上传参考图和生成结果保存在工作区数据目录中，不会由本项目主动收集。

执行以下操作时，应用会直接连接到你配置的 Provider：

- 检测联通性会发送验证 Provider 所需的请求和 API Key。
- 获取模型会向 Provider 请求当前密钥可访问的模型列表。
- 生成图片会发送 API Key、模型、提示词、生成参数，以及本轮选择的参考图。

这些数据会由 OpenAI、xAI、Google 或你配置的第三方兼容服务处理，其保留期限、训练政策、内容审核和所在地区由对应 Provider 的条款决定。使用前应阅读服务方隐私政策，不要向不可信的 Base URL 提交 API Key、私人提示词或图片。

删除会话只删除该会话及其生成记录；卸载应用不保证删除工作区。需要彻底清理时，请先退出应用，再删除设置中显示的工作区数据目录及固定配置目录。执行前确认已备份需要保留的内容。

## 常见问题

### 提示“请先配置 Provider”

打开“设置”中的 `Provider`，新增并保存一个 Provider，必要时把它设为默认 Provider。

### 检测联通性失败

依次检查 Base URL、协议、API Key、网络代理和 Provider 服务状态。协议必须手动选择正确；应用不会通过 URL 自动识别。

### 获取可用模型失败

模型发现与联通性检测是独立请求。确认 Provider 是否提供模型列表接口，以及当前密钥是否有读取权限。失败不会删除上一次成功缓存，仍可手动输入已知模型名。

### 某些比例、分辨率或结果数量不可选

应用会按当前协议、模型和参考图数量限制参数。切换模型后，不受支持的参数会被禁用或归一化。Gemini 固定生成 1 个结果，使用任何参考图时也固定为 1 个结果。

### 参考图无法添加

确认文件是有效的 PNG、JPEG 或 WebP，未重复选择，并且没有超过当前协议的数量上限。OpenAI Compatible 上限为 1 张，xAI 和 Gemini 上限为 3 张。

### 生成失败或长时间没有结果

查看任务记录中的错误信息。常见原因包括密钥无效、余额或配额不足、请求限流、模型名错误、Provider 服务异常，以及提示词或参考图触发安全策略。

### 关闭窗口后还有 backend 程序吗

没有。当前版本是单进程 Tauri 应用，Rust 后端运行在 `Image Tools.exe` 内。关闭主窗口后进程应完整退出。如果任务管理器中仍残留同名进程，请记录版本、安装方式和复现步骤后提交问题。
