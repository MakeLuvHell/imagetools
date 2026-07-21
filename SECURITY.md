# 安全策略

## 支持范围

安全修复优先提供给最新公开版本。旧版本可能因数据库格式或 Provider 协议变化而无法获得修复；升级和回滚前请遵循对应 Release 的备份说明。

## 私下报告漏洞

请使用 GitHub 的 [Private vulnerability reporting](https://github.com/MakeLuvHell/imagetools/security/advisories/new) 提交安全报告，不要为未修复漏洞创建公开 Issue。

报告中请包含：

- 受影响版本和 MSI 或 Portable 安装方式。
- 可复现的最小步骤、预期行为和实际影响。
- 受影响的 Provider 协议与相关配置，但不要包含真实 API Key。
- 必要的日志或示例文件；提交前删除私人提示词、图片、路径和账号信息。
- 已知的缓解方式或修复建议。

维护者确认后会评估影响、准备修复，并在适合公开时通过 Security Advisory 和 Release Notes 披露。处理时间取决于严重程度和复现条件。

## 敏感信息

不要在 Issue、Discussion、PR、截图或日志中提交以下内容：

- API Key、Authorization Header 或完整 Provider 配置。
- 包含真实密钥的 `workbench.sqlite3`、工作区备份或 `settings.json`。
- 私人提示词、上传参考图、生成结果和本机用户名路径。

如果密钥已经公开，请立即在 Provider 控制台撤销并轮换。仅删除 GitHub 内容不能保证密钥未被第三方获取。

普通功能缺陷、Provider 兼容性问题和功能建议不属于安全漏洞，请使用仓库 Issue 模板。
