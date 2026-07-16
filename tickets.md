# Implementation Tickets: Desktop Image Workbench

Source spec: `docs/spec/2026-07-09-desktop-image-workbench.md`

## T001: SQLite 工作台数据层

Status: Done

### What to build

为桌面图片创作工作台建立本地 SQLite 元数据层。数据层需要覆盖 provider、会话、生成轮次和图片记录，并提供可测试的数据访问 API。图片文件仍保存在本地文件目录，SQLite 只保存路径和元数据。

建议包含：

- SQLite 数据库初始化入口，使用当前运行时数据目录。
- 简单 migration 机制，至少能创建初始 schema 并记录 schema version。
- `providers` 表：名称、Base URL、API Key、默认模型、是否默认、创建/更新时间。
- `sessions` 表：标题、最近缩略图路径、创建/更新时间、软删除或删除状态。
- `generation_runs` 表：会话 ID、状态、提示词、参数 JSON、provider/model 快照、参考图路径、错误信息、创建/完成时间。
- `images` 表：生成轮次 ID、本地路径、文件名、MIME/格式、宽高或可用元数据、创建时间。
- 单元测试使用临时目录和临时 SQLite 文件。

### Blocked by

- None

### Acceptance criteria

- 应用代码可以在空数据目录中初始化 SQLite 数据库。
- 重复初始化不会破坏已有数据。
- migration version 可被读取。
- Provider CRUD 有单元测试覆盖。
- Session CRUD 有单元测试覆盖。
- Generation run 和 image 记录写入/读取有单元测试覆盖。
- 测试不依赖真实用户数据目录。

## T002: Provider 配置与旧设置迁移

Status: Done

### What to build

实现多 provider 配置管理，并把旧版单一 `settings.json` 迁移为默认 provider。API Key 在接口返回中必须脱敏或不返回明文；编辑 provider 时允许保留旧 key 或替换为新 key。

建议包含：

- `GET /api/providers`：列出 provider，API Key 不返回明文。
- `POST /api/providers`：新增 provider。
- `PATCH /api/providers/{id}`：编辑 provider，空 API Key 表示保留旧 key。
- `DELETE /api/providers/{id}`：删除 provider。
- `POST /api/providers/{id}/default` 或等价机制：设置默认 provider。
- 启动或首次访问时迁移旧 `settings.json` 为默认 provider。
- 保留兼容层，让现有生成逻辑可以拿到当前 provider 的 Base URL、API Key 和默认模型。

### Blocked by

- T001

### Acceptance criteria

- 可新增、编辑、删除 provider。
- 列表接口不会泄漏 API Key 明文。
- 空 API Key 更新不会清空已有 key。
- 只能有一个默认 provider。
- 旧 `settings.json` 存在时会迁移为默认 provider。
- 重复运行迁移不会创建重复 provider。
- 单元测试覆盖脱敏、保留 key、默认 provider 和旧设置迁移。

## T003: 会话 API

Status: Done

### What to build

实现创作会话 API。会话代表一个创作主题或任务，不是一次 API 请求。左侧会话列表需要依赖这些接口展示标题、最近缩略图和更新时间。

建议包含：

- `GET /api/sessions`：按更新时间倒序列出会话。
- `POST /api/sessions`：新建会话，支持标题为空时使用默认时间标题。
- `GET /api/sessions/{id}`：读取单个会话详情。
- `PATCH /api/sessions/{id}`：重命名会话。
- `DELETE /api/sessions/{id}`：删除会话。
- 返回字段包含 ID、标题、最近缩略图路径、创建时间、更新时间。

### Blocked by

- T001

### Acceptance criteria

- 可新建、列表、读取、重命名、删除会话。
- 列表按最近更新时间排序。
- 新会话标题为空时有稳定默认标题。
- 删除会话后列表不再返回该会话。
- 单元或 API 测试覆盖完整生命周期。

## T004: 生成历史写入

Status: Done

### What to build

改造图片生成流程，让每次生成都绑定到会话，并把成功和失败都写入 SQLite 历史。现有图片 API 适配、参考图上传、结果保存逻辑应继续复用。

建议包含：

- `/api/generate` 接受 `session_id` 和 provider/model 信息。
- 提交生成时创建 `generation_run`，状态为 pending/running。
- 成功后写入结果图片记录，更新 run 状态和会话最近缩略图/更新时间。
- 上游失败、校验失败或保存失败时写入失败 run 和错误信息。
- 生成记录保存参数快照，包括比例、尺寸、质量、张数、输出格式、高级参数、provider 名称和 model。
- 提供读取会话时间线的 API，例如 `GET /api/sessions/{id}/runs`。

### Blocked by

- T001
- T002
- T003

### Acceptance criteria

- 成功生成会写入 generation run 和 image 记录。
- 失败生成也会写入 generation run，包含错误信息。
- 会话更新时间会随生成记录更新。
- 历史记录保留当时 provider/model 快照。
- 现有无参考图和有参考图生成路径仍可用。
- 测试覆盖成功、失败、参考图和参数快照。

## T005: 桌面工作台两栏 UI

Status: Done

### What to build

替换旧终端式布局，建立 Codex Desktop 风格的现代桌面工作台外壳。第一版主布局只有两栏：左侧会话/历史列表，中间当前会话时间线与底部 Composer 占位。

建议包含：

- 左侧栏：应用标题、新建会话按钮、会话列表、最近缩略图、更新时间、当前选中态。
- 会话操作：新建、选择、重命名、删除。
- 中间主区：当前会话标题、空状态、时间线容器、Composer 区域占位。
- 桌面应用视觉：现代、克制、非终端、非命令行模拟器。
- 参数不做常驻右侧栏。

### Blocked by

- T003

### Acceptance criteria

- UI 不再呈现终端式主界面。
- 左侧可以加载、选择、新建、重命名、删除会话。
- 中间区域随当前会话切换。
- 无会话和空会话都有明确空状态。
- 布局在桌面窗口尺寸下稳定，不出现明显重叠或溢出。
- 前端测试覆盖会话列表渲染和基础交互。

## T006: Composer 与参数控制

Status: Done

### What to build

实现主区底部 Composer。Composer 是自然语言输入区，承载提示词、参考图、常用参数、provider/model 快切和生成动作。高级参数通过弹窗或抽屉调整，不常驻右侧。

建议包含：

- 提示词输入区。
- 参考图选择、预览和清除。
- 常用参数快捷控件：比例、尺寸、质量、张数。
- Provider/model 快速切换。
- 高级参数弹窗或抽屉：输出格式、压缩、背景、审核强度等现有高级字段。
- 生成按钮、loading/disabled 状态、基础校验。
- 提交时调用改造后的 `/api/generate`，带当前 `session_id`。

### Blocked by

- T002
- T004
- T005

### Acceptance criteria

- 用户可以在当前会话中通过 Composer 提交生成。
- Provider/model 切换会影响提交请求。
- 常用参数和高级参数都会正确进入请求 payload。
- 参考图可以上传、预览、清除并随请求提交。
- 没有当前会话、没有 prompt、没有可用 provider 时有明确禁用或错误状态。
- 前端测试覆盖参数读取、provider/model 切换和提交 payload。

## T007: 时间线结果操作

Status: Done

### What to build

实现当前会话的生成时间线和结果图操作。时间线默认展示提示词摘要、结果图网格、状态/时间和关键参数 chips；完整参数折叠在详情中。

建议包含：

- 加载并渲染 `GET /api/sessions/{id}/runs`。
- 生成轮次卡片：状态、时间、提示词摘要、关键参数 chips、详情折叠。
- 成功记录：结果图网格。
- 失败记录：错误摘要和可展开错误详情。
- 图片操作：预览大图、下载、复制本地链接、设为参考图、复制参数到 Composer、基于该图继续生成。
- “复制参数到 Composer” 应恢复 prompt、参数、provider/model 和参考图上下文中可恢复的部分。

### Blocked by

- T004
- T006

### Acceptance criteria

- 当前会话时间线能展示成功和失败记录。
- 完整参数默认折叠，可展开查看。
- 图片可预览、下载、复制链接。
- 设为参考图会把图片带入 Composer。
- 复制参数到 Composer 后可直接微调再生成。
- 基于结果图继续生成可创建新生成轮次。
- 前端测试覆盖至少设为参考图、复制参数和失败记录展示。

## T008: Windows 桌面发布整理

Status: Done

### What to build

把项目文档和验证流程整理为桌面优先、Windows 优先。浏览器本地端口可以保留为开发测试入口，但不作为正式用户入口描述。

建议包含：

- 更新 README：定位为 Windows 桌面图片创作工作台。
- 文档说明 Tauri sidecar、本地应用数据目录、SQLite/图片文件存放位置。
- 更新或补充 Windows x64 构建说明。
- 明确 Web/uvicorn 入口是开发测试入口。
- 检查 Tauri 配置、sidecar 启动、应用数据目录行为与新定位一致。
- 记录发布验证步骤。

### Blocked by

- T005
- T006
- T007

### Acceptance criteria

- README 不再把浏览器 Web 版描述为正式主入口。
- 文档能指导用户理解桌面数据目录和 provider/history 存储。
- Windows x64 构建命令和产物位置清晰。
- 桌面启动 sidecar 和应用数据目录行为有验证记录或测试覆盖。
- 现有测试命令和桌面验证命令在文档中可找到。

---

# Codex Desktop Windows UI Redesign

Source: `docs/spec/2026-07-10-codex-windows-ui.md` and `docs/superpowers/plans/2026-07-10-codex-windows-ui.md`

## UI001: Model New-Task Drafts And Optimistic Runs

Status: Done

### What to build

Add pure state for an unpersisted new-task draft, automatic titles, serializable per-session drafts, parameter summaries, and optimistic runs isolated by session and submission ID.

### Blocked by

- None.

### Acceptance criteria

- Startup selects the new-task view without creating a session.
- Draft storage keys isolate new and persisted sessions; malformed drafts fall back safely.
- Titles normalize the first prompt line and stop at 36 Unicode characters.
- Concurrent pending submissions can be inserted, failed, and removed independently.
- `node --test tests/frontend_workbench.test.js` passes.

## UI002: Bundle Icons And Build The Windows Shell

Status: Done

### What to build

Bundle pinned Lucide and app-brand assets locally, then build the native-titlebar Windows shell, restrained sidebar, unframed task canvas, Composer root, theme tokens, and responsive geometry.

### Blocked by

- None.

### Acceptance criteria

- No icon CDN or simulated HTML titlebar is present.
- Sidebar, timeline, Composer, menu, and dialog roots exist without a permanent parameter grid.
- Light and dark themes share layout metrics.
- Static contract tests, vendor sync, Node tests, and `git diff --check` pass.

## UI003: Render Sidebar, New Tasks, And Session Dialogs

Status: Done

### What to build

Add DOM renderers and orchestration for session selection, filtering, draft-first new tasks, and accessible in-app rename/delete dialogs.

### Blocked by

- UI001
- UI002

### Acceptance criteria

- New Task returns to an unpersisted draft.
- Sidebar selection and filtering remain consistent after refreshes and deletes.
- Rename and delete do not use browser prompt/confirm.
- Renderer, contract, and frontend tests pass.

## UI004: Add Provider Management In An App Dialog

Status: Done

### What to build

Implement complete Provider CRUD in an app dialog, including selection/default state, complete PATCH payloads, API-key preservation, validation, and keyboard interaction.

### Blocked by

- UI003

### Acceptance criteria

- Providers can be created, edited, selected as default, and deleted through real UI actions.
- An empty API-key edit preserves the stored key.
- PATCH sends the complete provider payload.
- Provider renderer, frontend, and backend API tests pass.

## UI005: Build The Layered Composer And Parameter Menus

Status: Done

### What to build

Build the layered Composer with growing prompt input, references, Provider/model context, compact parameter summary, basic/advanced menus, keyboard submission, and draft restoration.

### Blocked by

- UI002
- UI003
- UI004

### Acceptance criteria

- No six-column parameter form remains visible.
- Enter submits, Shift+Enter inserts a newline, and menu keyboard controls work.
- Uploaded `File` references stay memory-only while serializable fields use localStorage.
- Reference-image mode forces one result.
- Composer state, UI, and contract tests pass.

## UI006: Render The Task Stream And Reconcile Generation Status

Status: Done

### What to build

Render chronological prompt/run rows, stable image grids, result actions and preview, optimistic status, persisted reconciliation, and backend exception hardening.

### Blocked by

- UI001
- UI003
- UI005

### Acceptance criteria

- Running, successful, and failed generations share one chronological stream.
- First valid submit creates a session; drafts clear only after a persisted run is confirmed.
- Network/pre-validation failures remain local; post-creation failures persist in SQLite.
- Unexpected exceptions cannot leave a run permanently `running`.
- Copy-parameters, use-as-reference, preview, and image actions work.
- Focused frontend and generation-history tests pass.

## UI007: Add Playwright Accessibility And Visual Verification

Status: Done

### What to build

Add isolated deterministic Playwright tests for keyboard interaction, focus, responsive layout, themes, task states, menus, dialogs, and screenshots.

### Blocked by

- UI002
- UI003
- UI004
- UI005
- UI006

### Acceptance criteria

- Tests isolate application data, reject external requests, and never reuse an existing server.
- Fonts are ready before screenshots.
- Light and dark screenshots pass at `1280x860` and `960x640` without overlap or overflow.
- Empty, running, success, failure, menu, dialog, and preview states are covered.

## UI008: Finalize Documentation And Release-Grade Verification

Status: Done

### What to build

Update developer knowledge, verify asset bundling and backend packaging, run the full Python/Node/Playwright/Rust suite, and smoke-test Tauri hot reload.

### Blocked by

- UI001
- UI002
- UI003
- UI004
- UI005
- UI006
- UI007

### Acceptance criteria

- README and knowledge files describe the final stack and development loop.
- Vendor regeneration produces no unexpected diff and frontend assets enter the sidecar bundle.
- Full pytest, Node, Playwright, and Cargo verification passes.
- Linux Tauri smoke testing succeeds; Windows WebView2 remains the final pixel-fidelity authority.

---

# 单进程 Rust 桌面后端迁移

来源：

- `docs/superpowers/specs/2026-07-15-single-process-rust-desktop-backend-design.md`
- `docs/superpowers/plans/2026-07-15-single-process-rust-backend.md`
- `docs/adr/0001-single-process-rust-desktop-backend.md`

执行模型：expand-contract。RB001-RB009 只扩展并验证 Rust 能力，现有 Python
后端仍是唯一生产路径；RB010 一次性切换前端和 Tauri 运行时；RB011 删除旧
Python 路径；RB012-RB014 完成打包、文档和 Windows 发布门禁。

## RB001: 建立 Rust 后端契约与测试基础

Status: Done

### What to build

建立 `workbench` Rust 模块、结构化安全错误、输入/输出 DTO、时间戳帮助函数和
后续测试需要的依赖。只把模块接入编译，不注册生产 IPC，也不改变现有 sidecar
生命周期。

### Blocked by

- None. `feat/theme-preference` 已通过 `50f5e15` 合并到 `main`。

### Acceptance criteria

- Rust DTO 保留当前前端使用的 snake_case 公共字段。
- Session 更新能区分“未提交 project_id”和“显式提交 null”。
- Provider 公共 DTO 不返回密钥明文，结构化错误不包含密钥或任意路径。
- 新时间戳保持 Python 的 UTC 微秒和 `+00:00` 表示。
- `cargo test`、`mise run desktop-check` 和现有桌面检查通过。
- Tauri 仍启动 Python 后端，主题命令和主题测试保持不变。

## RB002: 证明 SQLite schema v1/v2 原地兼容

Status: Done

### What to build

实现 rusqlite 连接所有权、schema 初始化、v1 到 v2 migration 和共享 SQL
fixtures。Rust 与 Python 分别对等打开 fixtures，升级过程中不创建新的 schema
版本。

### Blocked by

- RB001

### Acceptance criteria

- 空目录初始化为 schema v2，重复初始化不破坏数据。
- v1 fixture 升级后保留会话并获得 nullable project 和 pin 字段。
- v2 fixture 的 Provider、项目、会话、生成轮次和图片保持不变。
- 外键始终启用；高于 v2 的 schema 和损坏数据库显式失败。
- 失败时不创建空的替代工作区，诊断信息不暴露数据库路径。
- Python fixture 测试与 Rust schema 测试均通过。

## RB003: 移植工作区数据目录引导与复制迁移

Status: Done

### What to build

移植稳定 bootstrap 文件、restart-only 调度、pending 激活和完整工作区复制。
数据库使用 SQLite backup，图片、参考图和旧 settings 文件作为一个整体迁移，
源目录始终保留。

### Blocked by

- RB001

### Acceptance criteria

- 默认目录、自定义目录和 pending 状态与现有 JSON 结构兼容。
- 拒绝相对路径、互相包含的目录、包含配置目录的目标和非空复制目标。
- malformed bootstrap、被文件占用的目录和不可用目标显式失败。
- bootstrap 更新在 Windows/Linux 上使用原子替换。
- 复制包含 `workbench.sqlite3`、`images/`、`uploads/` 和 `settings.json`。
- Rust 与 Python storage 测试通过，源目录和数据库仍可读取。

## RB004: 移植 Provider、Settings 与密钥语义

Status: Done

### What to build

实现 Provider repository/service、旧 `settings.json` 导入、默认 Provider、Base
URL 规范化和兼容 settings 命令。所有公共结果只报告密钥是否已配置。

### Blocked by

- RB002
- RB003

### Acceptance criteria

- Provider 新建、读取、更新、删除和设置默认行为与 Python 一致。
- 空 API Key 更新保留原密钥，任何 IPC DTO 和错误都不出现密钥明文。
- 同一时间最多一个默认 Provider。
- CHSHAPI URL migration 和 `/v1` 规范化保持兼容。
- 旧 settings 在 Provider 为空时只产生一个默认 Provider。
- Rust/Python 对同一 public-contract fixture 产生一致结果。

## RB005: 移植项目、会话与生成历史

Status: Ready

### What to build

实现项目、会话、pin、生成轮次和图片 metadata repository/service，并在启动时
把异常退出遗留的 `running` 轮次收敛为失败。

### Blocked by

- RB002

### Acceptance criteria

- Provider 按 ID 升序；项目和会话按更新时间倒序；轮次按创建时间正序。
- 项目删除会解除会话归属但不删除会话，项目/会话软删除语义不变。
- nullable project、pin、参数 JSON、Provider/model 快照和图片顺序保持兼容。
- 成功完成轮次、插入图片和更新缩略图在一个事务中完成。
- 启动恢复只修改 `running` 行，不改变成功或已失败行。
- Rust history 测试和现有 Python 历史测试通过。

## RB006: 移植生成校验与 Provider HTTP 客户端

Status: Ready

### What to build

实现尺寸、数量、输出选项和透明背景校验，以及 OpenAI-compatible generation/edit
请求构造、超时、响应解析和安全错误映射。测试只使用本地随机端口 fixture server。

### Blocked by

- RB001
- RB004

### Acceptance criteria

- 像素、边长、16 倍数、3:1 比例和数量限制与 Python 一致。
- `auto` 字段按现有规则省略，JPEG/WebP 才发送压缩参数。
- Base URL 不产生重复 `/v1`，generation/edit endpoint 选择正确。
- Bearer 密钥只发送给配置的 Provider，不进入错误、日志或 fixtures。
- 覆盖 base64、URL、重定向、timeout、HTML 错页和 malformed JSON。
- 所有 HTTP 测试不访问公网，Rust/Python transport fixtures 通过。

## RB007: 实现参考图暂存和持久化生成闭环

Status: Blocked

### What to build

实现有界 raw reference 暂存、单次 token 消费、过期清理、结果文件原子写入，以及
`GenerationService` 的 text-to-image/image-to-image 完整流程。

### Blocked by

- RB003
- RB004
- RB005
- RB006

### Acceptance criteria

- 参考图限制为 25 MiB，接受 PNG/JPEG/WebP，并校验 MIME 与文件签名。
- UTF-8 文件名安全编码，token 只能消费一次，24 小时过期 staging 会清理。
- 最终图片先 `sync_all` 再 rename；失败会清理临时文件和未入库的最终文件。
- 创建 `running` 后的任何失败都持久化为 `failed`，不遗留运行中轮次。
- 成功路径原子写入图片 metadata、完成轮次和会话缩略图。
- 数据库锁不会跨 `.await`；成功、上游失败和磁盘失败测试均通过。

## RB008: 建立受限媒体协议和 Tauri 命令表面

Status: Blocked

### What to build

实现按图片 ID 读取的 `imagetools-media` resolver、所有桌面命令 adapter 和 raw
reference IPC 测试。命令与协议只在 mock builder 中注册，尚不切换真实窗口。

### Blocked by

- RB005
- RB007

### Acceptance criteria

- 媒体 resolver 从数据库 ID 查找 `images/...` 相对路径，不接受任意路径参数。
- 拒绝 traversal、symlink escape、非 GET、缺失记录和 workspace 外文件。
- Windows/Linux 媒体 URL 映射正确，响应包含 MIME 和 reference fetch 所需 CORS。
- raw reference 使用 `InvokeBody::Raw`，JSON/base64 请求被拒绝。
- settings、storage、Provider、project、session、run 和 generation 命令均有契约测试。
- 命令 adapter 不包含 SQL 或 Provider HTTP 逻辑，生产窗口仍只使用 Python。

## RB009: 添加前端 Desktop API 适配器

Status: Blocked

### What to build

新增集中式 `frontend/desktop-api.js`，把 UI 操作映射到已冻结的 Tauri 命令，
支持浏览器 mock、结构化错误和 raw reference 三参数 invoke。此 ticket 只加载
adapter，`app.js` 仍走 REST。

### Blocked by

- RB008

### Acceptance criteria

- 每个当前 UI 操作都有唯一 adapter 方法和稳定命令名。
- 顶层 Tauri 参数为 camelCase，嵌套 DTO 保持现有 snake_case。
- 中文参考图文件名先 percent-encode，再进入 header。
- 错误保留 `code`、安全 `message` 和可选安全 `diagnostic`。
- 无 Tauri global 时可注入 mock，Playwright 启动不失败。
- Node adapter/静态契约测试和现有 Python 测试通过。

## RB010: 一次性切换前端与 Tauri 到 IPC

Status: Blocked

### What to build

把 Playwright mock 移到 Desktop API 边界，把 `app.js` 的所有 REST 调用替换为
adapter，切换 Tauri 到 bundled assets、Rust state、生产命令和媒体协议。保留已
合并的 system/light/dark 主题同步。

### Blocked by

- RB003
- RB004
- RB005
- RB006
- RB007
- RB008
- RB009

### Acceptance criteria

- `frontend/app.js` 不含 `fetch(`、`/api/` 或 `/files/`。
- bundled `index.html` 不含 `/static/`，所有 CSS/JS/asset 可从 Tauri root 加载。
- Playwright 使用 test-only Node 静态服务器和 Desktop API mock，不依赖 Uvicorn。
- Tauri 启动先完成 storage、database 和 interrupted-run recovery，再创建窗口。
- 启动失败显示安全原生消息并退出，不打开空工作区。
- 顶层导航只允许 Tauri app origin，外部 Provider URL 不能导航窗口。
- 全量 Node、Playwright、Rust、pytest 和 desktop-check 通过。

## RB011: 删除 Python sidecar 生产路径

Status: Blocked

### What to build

在 IPC 切换通过后删除 FastAPI/Uvicorn/PyInstaller backend、sidecar 启动脚本、
shell plugin 和已被 Rust 覆盖的 Python 应用测试，保留必要的 Python 环境辅助
脚本。

### Blocked by

- RB010

### Acceptance criteria

- `backend/`、sidecar bundler、desktop backend launcher 和 `externalBin` 均不存在。
- 发布依赖不含 FastAPI、Uvicorn、HTTPX、multipart、PyInstaller 或 shell plugin。
- `desktop:dev` 和 `desktop:build` 直接启动/构建 Tauri。
- Playwright 继续由 test-only Node 静态服务器运行。
- 生产配置和脚本不包含 backend 进程或 loopback UI server。
- 全量 Linux 可执行检查通过，主题和所有现有 UI 行为保持绿色。

## RB012: 生成 MSI 和单文件便携发布物

Status: Blocked

### What to build

保留 Windows MSI，移除 NSIS，新增只包含 `Image Tools.exe` 的 portable ZIP，更新
Windows release workflow，并提供单进程、无监听端口和退出检查脚本。

### Blocked by

- RB011

### Acceptance criteria

- Windows 构建显式使用 `--bundles msi`，Linux 通用配置仍保留 deb/rpm。
- Portable ZIP 只有一个 entry：`Image Tools.exe`。
- MSI application payload 只有一个 Image Tools `.exe`，不含 backend/Python。
- MSI 可静默安装、启动和卸载；便携版可直接启动。
- 两种启动方式都只有一个 Image Tools PID，且该 PID 没有监听 TCP socket。
- 关闭窗口后 PID 在 10 秒内退出，WebView2 系统进程不计为应用进程。
- GitHub Actions 上传命名稳定的 MSI 与 Portable ZIP，不再发布 NSIS。

## RB013: 更新架构知识与发布文档

Status: Blocked

### What to build

更新 README、knowledge 和 release 文档，记录 Rust/Tauri IPC、SQLite、媒体协议、
开发测试入口和 MSI/portable 发布方式。补齐当前缺失的 API 与 schema 权威文档。

### Blocked by

- RB012

### Acceptance criteria

- README 不再描述 Python sidecar 或发布 UI 端口。
- `knowledge/01-05`、`08-10` 与最终实现一致，并链接 ADR 0001。
- 新增 `knowledge/06-api-design.md`，说明 IPC 命令和媒体协议边界。
- 新增 `knowledge/07-database-schema.md`，说明 v1/v2 和不新增 migration 的决定。
- 测试策略区分 test-only helper process 与单进程发布运行时。
- Release 文档说明 MSI、Portable ZIP、Windows x64 门禁和无签名/无自动更新范围。

## RB014: 执行 Windows 升级、回滚与发布门禁

Status: Blocked

### What to build

在 Windows x64 runner 上执行最终构建、安装、升级、工作区兼容、回滚、卸载、
进程和端口检查，并汇总所有平台验证证据。

### Blocked by

- RB012
- RB013
- 可用的 Windows x64 runner、v0.2.3 MSI 和脱敏工作区副本。

### Acceptance criteria

- 新版本 MSI 和 portable ZIP 均由 release workflow 实际产出。
- v0.2.3 工作区原地打开后，Provider、会话、轮次和图片均可读取。
- v0.2.3 MSI 可升级到新 MSI，新 MSI 可卸载并重新安装 v0.2.3。
- 升级后的工作区副本仍可被 v0.2.3 读取，schema version 保持 2。
- Windows WebView2 主题、参考图、生成历史和关闭行为 smoke test 通过。
- API Key 不出现在 IPC、日志、诊断或 CI artifact 中。
- Node、Playwright、Rust、desktop-check、打包和 Windows smoke checks 全部通过。
