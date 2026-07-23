# 支持说明

Image Tools 是 Windows-first 的开源桌面图片创作工作台。维护支持聚焦于最新公开版本、公开文档中声明的功能，以及 OpenAI Compatible、xAI Imagine 和 Gemini Native Image 的已记录协议边界。

## 获取帮助

提交 Issue 前，请先阅读 [README](README.md)、[使用文档](docs/user-guide.md)、[隐私说明](docs/privacy.md) 和现有 Issue。

- 缺陷、崩溃、安装或数据兼容问题：使用 Bug Report 模板。
- Provider 接口兼容性：使用 Provider Compatibility 模板，并删除真实密钥、提示词和图片。
- 产品建议：使用 Feature Request 模板，说明目标用户与使用场景。
- 安全漏洞、API Key 泄露或潜在数据暴露：使用 [GitHub Private vulnerability reporting](https://github.com/MakeLuvHell/imagetools/security/advisories/new)，不要创建公开 Issue。

Issue 应包含应用版本、MSI 或 Portable 安装方式、Windows 版本、Provider 协议、脱敏后的复现步骤和实际结果。维护者会按安全影响、数据丢失风险、可复现性和与路线图的关系安排处理；开源维护不承诺固定响应时间或功能交付日期。

## 支持范围

支持范围包括：

- 最新公开 Windows x64 版本的 MSI 与 Portable ZIP。
- 文档所列的本地工作区、升级/回滚和 Provider 配置流程。
- 项目公开维护的 GitHub Actions、发布资产和开源依赖问题。

以下内容不在免费维护支持范围：

- 代为配置、托管或保管第三方 Provider API Key。
- 为私有 OpenAI Compatible 服务提供 SLA、账户、计费或内容审核支持。
- 恢复未备份的本机工作区数据，或绕过 Provider 的内容政策与使用限制。
- 当前未公开支持的平台、自动更新、云同步或系统凭据存储。

## 自助排查

提交前请确认：应用来自项目 GitHub Release、下载摘要与 `SHA256SUMS` 一致、WebView2 Runtime 可用、Provider 协议与 Base URL 已正确选择，并检查任务流中的脱敏错误信息。升级或回滚前请备份完整工作区。
