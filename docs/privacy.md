# Image Tools 隐私说明

最后更新：2026-07-23

## 范围

本说明适用于 Image Tools Windows 桌面应用及其公开源代码仓库。Image Tools 不运营用户账号、项目自建云服务、遥测服务或同步服务；它不是对你所选择的图片 Provider 的隐私政策的替代。

## 本机保存的数据

应用把 Provider 配置、API Key、项目、会话、提示词、生成参数、参考图和生成结果保存在你的本机、本地工作区。Windows 默认工作区通常是 `%APPDATA%\com.imagetools.desktop\`；工作区位置可在应用设置中变更。固定配置通常位于 `%LOCALAPPDATA%\com.imagetools.desktop\`。

工作区包括 `workbench.sqlite3`、`images/`、`uploads/` 和兼容用的 `settings.json`。API Key 不会返回给前端 DTO，但当前版本不使用 Windows 系统凭据库；请把工作区备份、SQLite 文件和配置文件按敏感数据处理。

Image Tools 不会主动把这些本机数据上传给本项目维护者。卸载应用不保证删除工作区；删除会话只删除对应的会话和生成记录。若要清理本机数据，请先退出应用，再删除工作区与固定配置目录。操作前请先备份需要保留的内容。

## 发送给 Provider 的数据

只有在你主动配置并使用 Provider 时，应用才会直接向该 Provider 或你指定的 OpenAI Compatible 服务发送数据：

- 检测联通性会发送该 Provider 所需的认证信息和验证请求。
- 获取可用模型会请求当前 API Key 可访问的模型列表。
- 生成图片会发送 API Key、模型、提示词、生成参数和本轮选择的参考图。

这些请求从你的设备直接发往配置的 Base URL。OpenAI、xAI、Google 或第三方兼容服务对数据的处理、保存地点、保留期、训练政策和内容审核由其自身条款控制。使用前请阅读服务方政策；不要向不可信的 Base URL 提交 API Key、私人提示词或图片。

## 公开协作内容

在 GitHub Issue、Pull Request、Discussion、截图或日志中提交的内容会由 GitHub 按其政策处理，并可能公开可见。不要提交 API Key、Authorization Header、完整工作区、私人提示词、参考图、生成结果、本机用户名路径或其他个人数据。安全问题请遵循 [安全策略](../SECURITY.md) 的私下报告方式。

## 联系与变更

普通使用支持请阅读 [支持说明](../SUPPORT.md)。涉及 API Key 泄露、任意文件访问或其他安全问题，请使用 GitHub Private vulnerability reporting，详情见 [SECURITY.md](../SECURITY.md)。本说明的实质性变更会随代码或 Release Notes 记录在仓库中。
