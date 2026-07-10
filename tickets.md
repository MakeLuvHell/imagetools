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

Status: In Progress

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

Status: Pending

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

Status: Pending

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

Status: Pending

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

Status: Pending

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
