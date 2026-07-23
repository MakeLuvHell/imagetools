# 开源发布准备完善

## 背景

Image Tools 已具备 MIT 许可、贡献指南、安全策略、行为准则、结构化 Issue 模板、CI、依赖更新和 Windows 发布门禁。v0.4.0 的非发布 Windows 门禁已通过，但社区协作入口、独立隐私说明和发布物的依赖/构建来源信息仍不完整。

## 问题陈述

用户需要能在下载前理解本地与 Provider 数据流、知道应在哪里寻求帮助，并能把发布资产追溯到具体源码提交和依赖清单。维护者也需要明确代码审查归属，而不把支持或安全报告混入普通 Issue。

## 目标

- 提供独立、可链接的中文隐私说明，并从 README 和使用文档进入。
- 提供明确的支持边界和非安全问题入口。
- 为全部仓库路径指定默认审查归属。
- 提供精简的英文项目入口。
- 在 Windows 发布 workflow 中生成 SPDX JSON SBOM 和构建来源清单，并将其与现有发布资产共同上传。

## 非目标

- 不创建或修改公开 GitHub Release、tag 或发布资产。
- 不配置代码签名证书、自动更新、云服务、遥测或账号体系。
- 不对第三方 Provider 的数据处理、保留期或训练政策作出承诺。
- 不添加募资链接；该链接需要维护者单独指定收款平台和账号。

## 目标用户

- 下载 Windows MSI 或 Portable ZIP 的创作者。
- 报告缺陷、Provider 兼容性或安全问题的社区成员。
- 审核依赖、安全或构建来源的技术用户。

## 用户故事

- 作为用户，我能在配置 API Key 前知道哪些数据留在本机、哪些数据会发送给 Provider。
- 作为贡献者，我能区分使用支持、普通 Issue 和私下安全报告。
- 作为下载者，我能从发布物获得与源码提交关联的 SBOM 和构建信息。
- 作为维护者，我能看到代码归属规则并保留最终审查责任。

## 功能需求

1. 新增 `docs/privacy.md`，记录本地存储、Provider 传输、删除方式、非收集范围和限制。
2. 新增根目录 `SUPPORT.md`，说明支持版本、渠道、Issue 前检查和不提供的支持。
3. 新增 `.github/CODEOWNERS`，由 `@MakeLuvHell` 作为全路径默认 owner。
4. 新增 `README.en.md`，覆盖产品范围、安装包、数据/Provider、构建与贡献入口。
5. README、使用文档和 Issue 配置链接隐私与支持资料。
6. Windows workflow 生成以下稳定命名文件：
   - `Image-Tools-<tag>-Windows-x64-SBOM.spdx.json`
   - `Image-Tools-<tag>-Windows-x64-build-info.json`
7. workflow artifact 和可选公开 Release 同时包含以上两个文件、MSI、Portable ZIP 和 `SHA256SUMS`。
8. 构建来源清单至少包含 release tag、build ref、GitHub SHA、仓库、workflow run ID、构建时间和资产文件名。

## 领域术语

- **Provider**：用户自行配置的图片服务；其传输与数据处理由服务方条款控制。
- **SBOM**：以 SPDX JSON 表示的软件组件清单，描述构建输入而非用户工作区数据。
- **构建来源清单**：将发布资产关联到 repository、commit、workflow run 和构建时间的 JSON 文件。

## 实施决定

- 使用 `anchore/sbom-action` 生成 SPDX JSON，而不是手写依赖清单。
- 构建来源清单在 Windows runner 上由 PowerShell 序列化，避免把环境机密写入资产。
- 不为未确认启用的 GitHub Discussions 添加错误入口；支持文档先以 Issue 和安全报告为准。

## 测试决定

- Python 静态测试验证文档文件、README 链接、CODEOWNERS 和 workflow 的资产路径/步骤。
- 运行既有文档测试和 workflow 静态测试；Windows workflow 在后续所有发布任务完成后再集中执行。

## 风险

- 代码签名仍未解决 SmartScreen 信任提示。
- SBOM 描述构建依赖，不代表第三方 Provider 的远端服务组成。
- `@MakeLuvHell` 必须继续拥有该 GitHub 用户名或组织，CODEOWNERS 才能生效。

## 开放问题

- 是否启用 GitHub Discussions 并指定其分类？
- 是否在未来配置 GitHub Sponsors、Open Collective 或其他资金渠道？
- 选择哪种 Windows 代码签名服务及证书保管方式？

## 建议票据入口

- OS001：治理与用户入口文档。
- OS002：发布 SBOM 与构建来源资产。
- OS003：在正式发布前配置代码签名并更新 Windows 门禁。
