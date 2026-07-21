# 贡献指南

感谢参与 Image Tools。提交代码前请先搜索现有 Issue；较大的功能、架构变化或数据库迁移应先创建 Issue，确认范围和兼容策略后再实现。

参与项目即表示同意遵守 [社区行为准则](CODE_OF_CONDUCT.md)。安全漏洞请按照 [安全策略](SECURITY.md) 私下报告。

## 开发环境

项目使用 `mise` 固定 Node.js、Python 和 Rust 版本：

```bash
mise install
mise run install
```

Linux 桌面依赖和本地 sysroot 说明见 [README](README.md)。Windows 正式资产通过 GitHub Actions 构建，不要提交本地 `target/`、`node_modules/`、工作区数据或密钥。

## 修改原则

- 保持单进程 Tauri/Rust 架构，不引入本地 Web/API 监听服务。
- Provider 协议必须显式建模，不根据域名或模型名推断。
- API Key 不得返回前端 DTO、写入测试夹具或出现在日志和截图中。
- 数据库结构通过事务性迁移演进，并说明升级和回滚方式。
- UI 修改应覆盖 `1280x860`、`960x640`、浅色、深色及减少动态效果模式。
- 新功能和缺陷修复先增加最小回归测试，再实现修改。

## 验证

开发时运行与改动最相关的聚焦测试。提交 PR 前运行非 Windows 源码门禁：

```bash
mise run test
mise run ui-test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
mise run desktop-check
git diff --check
```

Windows 门禁用于最终发布资产，验证 MSI、Portable、单进程退出、无监听端口及升级回滚。普通文档修改和每个开发小步骤不重复执行该门禁；涉及发布负载的所有任务完成后再集中运行。

## Pull Request

- 一个 PR 聚焦一个可解释的目标，避免夹带无关重构。
- 说明用户可见变化、验证命令和结果、剩余风险。
- UI 改动附上不含私人数据的前后截图。
- 标明是否影响 Provider 协议、数据库 schema、工作区数据或 Windows 发布资产。
- 更新相关使用文档、Release Notes、知识文档或 ADR。

维护者可能要求拆分范围、补充测试或调整迁移策略。合并不等同于立即发布，公开版本仍需通过最终发布门禁。
