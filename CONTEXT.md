# Project Context

Image Tools is a Windows-first desktop image creation workbench. It organizes image generation work around local provider settings, creative sessions, generation runs, reference images, and generated image files.

## Language

**图片创作工作台**:
The desktop app surface for ongoing image creation. It is centered on sessions, a timeline, a Composer, and generated image results.
_Avoid_: Terminal UI, generic AI config center

**会话**:
A creative theme or task, such as "产品海报主视觉". A session contains multiple generation runs and is not the same as a single API request.
_Avoid_: Request, one-off generation

**项目**:
A local sidebar grouping container used to organize sessions. It is presented as a collapsible folder, but it is not a filesystem directory and moving a session between projects does not move workspace files.
_Avoid_: Disk folder, workspace data directory

**生成轮次**:
One submitted image generation request plus its status, prompt, parameter snapshot, provider/model snapshot, results, or error.
_Avoid_: Session, image file

**Composer**:
The bottom input area where the user enters a prompt, attaches a reference image, selects common parameters, and starts generation.
_Avoid_: Command line, terminal prompt

**Provider**:
A saved image-service configuration containing an explicit Provider protocol, display name, Base URL, API Key, default model, and optional discovered-model cache. The protocol defines authentication, request mapping, capabilities, and response parsing; it is never inferred from the hostname.
_Avoid_: Model, global settings, hostname-derived protocol

**Provider 协议**:
The explicit wire contract used by a Provider, such as OpenAI Compatible, xAI Imagine, or Gemini Native Image. It governs connectivity checks, model discovery, image generation, reference encoding, and response parsing.
_Avoid_: Provider name, model family, Base URL domain

**工作区数据目录**:
The single user-selectable local root for durable Provider, session, generation, reference-image, and generated-image data. These items form one coherent workspace data set rather than independently configurable locations.
_Avoid_: Output folder, per-category storage root

**参考图**:
An ordered image input used for image editing or continued generation. A generation can use up to three, depending on the selected Provider protocol; each can come from upload or from a previous generated result.
_Avoid_: Generated result unless it is actively selected as input

**Codex Windows 视觉基准**:
The Windows Codex Desktop shell proportions, restrained sidebar, unframed task canvas, task-stream hierarchy, and layered Composer used as the Image Tools UI fidelity target. It does not include Codex branding or Codex-specific product features.
_Avoid_: Generic two-column dashboard, Codex feature clone

**新任务草稿**:
A temporary creation state that has not yet been written to SQLite. It becomes a session only after the first valid generation submission.
_Avoid_: Empty persisted session, generation run

**参数摘要**:
The compact Composer display of ratio, resolution, quality, and image count. It is not the full parameter editor.
_Avoid_: Permanent parameter form, complete generation snapshot

## Rules

- Use this file as the project's glossary and ubiquitous language.
- Do not put implementation details, task lists, or scratch notes here.
- When a term is resolved during `/grill-with-docs`, update this file immediately.
- If the project has multiple domains, create `CONTEXT-MAP.md` and per-domain `CONTEXT.md` files.
