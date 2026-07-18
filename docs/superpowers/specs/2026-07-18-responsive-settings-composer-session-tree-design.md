# Responsive Settings, Composer Motion, And Session Tree Design

## Status

Approved in conversation on 2026-07-18. This document defines the design to be reviewed before implementation planning.

## Context

Image Tools currently opens Settings as a full-window replacement view. On larger windows the settings content remains narrow while the replacement surface expands, producing unexplained empty space. Composer validation uses the global toast position, submitted prompt text remains in the textarea until server reconciliation, and the optimistic prompt appears without a send transition. Session organization is split between the sidebar row menu and a second menu in the current-session header. Project groups always remain expanded and session-to-project movement requires a dialog.

The requested change should preserve the existing Windows-first shell, single-process Rust/Tauri architecture, schema-v2 workspace, Provider security boundary, and current desktop API adapter.

## Goals

- Present Settings as a centered responsive modal that scales with the application window.
- Clear a valid submitted prompt as soon as the optimistic generation round exists.
- Animate the submitted prompt into the timeline with a restrained Telegram-style bubble transition.
- Place Composer validation messages immediately above the Composer.
- Let users drag sessions into projects, including an atomic move-and-unpin operation for pinned sessions.
- Put all session commands in the sidebar row menu and remove the current-session header menu.
- Let projects collapse and expand while remembering device-local state.
- Preserve keyboard-accessible alternatives, reduced-motion behavior, and existing error/security boundaries.

## Non-Goals

- No database schema migration.
- No filesystem movement when a session changes project.
- No frontend framework, third-party drag-and-drop package, or animation dependency.
- No redesign of Provider forms, storage migration semantics, generation result actions, or project CRUD semantics.
- No change to the one-process release architecture or media protocol.

## Domain Language

A project is a local sidebar grouping container for sessions. It is represented as a collapsible folder but is not a filesystem directory. Moving a session changes its project relationship only; generated images, uploads, and workspace data remain in place.

## Chosen Approach

Use an incremental modular change within the existing frontend boundaries:

- `frontend/workbench.js` owns pure grouping, collapse-state normalization, and drag-decision rules.
- `frontend/ui.js` owns DOM rendering, modal presentation, drag visuals, inline Composer notices, and transient send motion.
- `frontend/app.js` owns persistence, Desktop API calls, lifecycle tokens, authoritative reloads, and submission orchestration.
- `frontend/styles.css` owns responsive geometry, drag states, and reduced-motion variants.
- The Rust session update contract gains an optional pin field so project movement and automatic unpinning can commit atomically.

This avoids a broad controller rewrite while keeping the new interaction logic testable outside `app.js`.

## Settings Modal

### Structure

- Convert the settings replacement region into a native modal dialog.
- Preserve the existing vertical navigation and the Appearance, Provider, and Local Data panels.
- Replace the sidebar back affordance with a Settings title and a top-right close icon.
- Keep Provider editor/delete and storage-location dialogs as separate dialogs above Settings in the top layer.

### Geometry

- Target approximately `75vw` width and `78vh` height.
- Cap the modal at `1040px` wide and `760px` high.
- Respect the Tauri minimum viewport of `960x640`; the modal continues to scale down with the viewport.
- The modal shell does not grow to fill unexplained space. Its main content column scrolls internally when content exceeds the available height.
- The navigation column remains stable and narrows at the existing small-desktop breakpoint.

### Lifecycle And Accessibility

- Opening Settings uses modal semantics, traps focus, and records the opener.
- The close icon, Escape, and backdrop dismissal close Settings when no child layer is open.
- Escape closes only the topmost Provider/storage child dialog before it can close Settings.
- Closing invalidates existing Provider, theme, storage-view, and picker lifecycle tokens exactly as the current settings lifecycle does.
- Focus returns to the button that opened Settings.

## Composer Validation And Submission

### Validation Notice

- Add a dedicated Composer notice immediately above the Composer in normal layout flow.
- Pre-submit messages such as `请先输入提示词` and `请先配置 Provider` use this notice instead of the bottom-right toast.
- The notice uses `role="alert"` for errors, does not overlap the send button, and clears when the user corrects the relevant input or starts a valid submission.
- Validation failure preserves the prompt and focuses the relevant control.
- Provider/settings, native save, and other unrelated messages remain in their contextual dialogs or existing operation surfaces.

### Submission State

1. Reject duplicate submissions for a session that already has a running generation round.
2. Validate Provider and prompt.
3. Create a new session when submitting a new-task draft.
4. Snapshot prompt, parameters, and reference state for this submission.
5. Add the optimistic generation round.
6. Clear the prompt textarea and its persisted draft immediately, while retaining common parameter choices.
7. Animate a transient copy of the submitted prompt into the real optimistic prompt position.
8. Continue reference staging and the generation command using the captured submission snapshot.
9. Reconcile against authoritative run history as today.

The reference preview remains associated with the captured submission until its backend handoff begins. For an uploaded reference, the handoff point is after `stageReference` succeeds and immediately before calling `desktopApi.generate`; for a historical result reference, it is immediately before that generation call. A staging failure leaves the reference affordance in the Composer so the user does not lose the selected input. Once handed off, the Composer reference state clears independently of generation completion.

### Telegram-Style Motion

- The visible prompt clone originates at the Composer text region and morphs into the right-aligned timeline prompt bubble.
- The send button compresses slightly at activation.
- The textarea text clears within roughly `40-60ms`.
- The clone translates and scales into place over roughly `220-280ms` with a smooth ease-out curve and no exaggerated bounce.
- The real optimistic prompt remains visually hidden only while its transient clone is moving, then becomes the sole rendered prompt.
- The running response and progress indicator appear after the prompt bubble settles.
- Resize, session switch, rerender, or animation failure removes the transient clone and reveals the real prompt immediately.
- Under `prefers-reduced-motion: reduce`, no positional animation runs; the real prompt and running response appear directly.

Generation/API failures remain attached to their generation round. The cleared prompt is not silently restored into a potentially newer Composer draft; the existing round Retry action remains the recovery path.

## Session Row Menu

- Every sidebar session row exposes one ellipsis menu.
- Commands are ordered as:
  1. `置顶` or `取消置顶`
  2. `移动到项目`
  3. `重命名`
  4. separator
  5. `删除`
- Delete uses the danger style and existing confirmation dialog.
- Rename, delete, move, and pin operate on the row menu target, not implicitly on the currently selected session.
- The current-session header ellipsis button and its complete menu are removed.
- Existing dialogs are reused, with opener/focus restoration updated for sidebar row triggers.

## Project Collapse State

- Each project row becomes an expand/collapse control with a chevron and `aria-expanded`.
- Projects are expanded by default.
- New projects are expanded when created.
- Collapsed project IDs persist in device-local localStorage, separate from workspace data and the database.
- Unknown or deleted project IDs are discarded while normalizing persisted state.
- Selecting a session in a collapsed project expands that project before focusing/rendering the selection.
- Project rename preserves its collapse state; project deletion removes its saved collapse entry.
- The project ellipsis menu remains independent from the chevron toggle.

## Session Drag And Drop

### Pointer Interaction

- Use Pointer Events instead of native HTML drag-and-drop to avoid conflicts with WebView2 file dragging and to control the drag preview.
- A session row starts dragging only after pointer movement exceeds approximately `6px`, preserving normal click selection.
- The UI shows a lightweight drag preview and a source placeholder without changing list geometry.
- The full project row is a drop target and shows a clear active state.
- Escape, pointer cancel, loss of capture, or dropping outside a target cancels the operation without mutation.
- Hovering over a collapsed target for approximately `500ms` temporarily expands it. A successful drop keeps it expanded.

### Mutation Rules

- Dropping an unpinned session sets its `project_id`.
- Dropping a pinned session sets its `project_id` and `is_pinned=false` in one command and one SQLite transaction.
- A successful drop reloads the authoritative session list, expands the target project, and announces the result near the sidebar.
- A failed drop reloads authoritative state, removes all drag visuals, and shows a contextual failure notice.
- Moving to a project remains available from the row menu as the keyboard and non-pointer alternative.

## Desktop And Database Contract

Extend the existing session update input with an optional `is_pinned` patch field. Existing callers that provide only `title` or `project_id` retain their current behavior.

The session service validates the target project and applies title, project, and pin patches in one SQLite transaction. The response remains the existing public session DTO. No schema version change is required.

## Error Handling

- Settings child-dialog errors stay in the child dialog; settings-panel errors stay in the active panel.
- Composer pre-submit validation stays above the Composer.
- Accepted generation failures stay in their generation round.
- Session menu mutation errors stay associated with the menu/dialog workflow.
- Drag failures restore authoritative backend state rather than attempting to preserve speculative ordering.
- Animation capability or timing failures never block submission.
- Existing redaction rules continue to prevent Provider API keys or raw backend diagnostics from entering frontend state or logs.

## Testing

### Pure And DOM Tests

- Collapse-state parse/normalize/serialize behavior, including unknown project cleanup.
- Group rendering for expanded and collapsed projects.
- Drag threshold, target selection, pinned move payload, cancel, and failure reset.
- Session row menu contents and targeting for non-selected sessions.
- Composer validation placement and clearing rules.
- Transient prompt clone creation, cleanup, and reduced-motion fallback.

### Playwright

- Settings modal geometry, internal scrolling, focus return, backdrop, and nested Escape behavior at `1280x860` and `960x640` in light and dark themes.
- Telegram send motion, immediate prompt clearing, optimistic prompt handoff, reduced motion, failure round behavior, resize, and rapid session switching.
- Composer validation above the input without overlap.
- Dragging ordinary and pinned sessions into expanded and collapsed projects.
- Auto-expand after hover/drop, persisted collapse state after reload, and row-menu keyboard alternatives.
- Sidebar menus contain rename/delete while the task-header menu is absent.

### Rust And IPC

- Optional pin patch serialization through the Desktop API and Tauri command.
- Atomic project-and-pin update, invalid project rollback, missing-field preservation, and schema-v2 compatibility.

### Gate Order

Run focused checks while implementing individual tickets. After all related tickets are complete, run the consolidated Node, Playwright, Rust, formatting, desktop, and Windows release gates once. If the final Windows gate exposes a defect, apply and verify the focused fix before rerunning that failed final gate.

## Acceptance Criteria

- Settings opens as the approved responsive centered modal and no longer replaces the whole workspace.
- Settings has no unexplained wide-window whitespace and remains usable at the minimum viewport.
- Valid submissions clear the prompt immediately after optimistic acceptance and play the approved Telegram-style motion.
- Composer validation appears immediately above the Composer; accepted run failures remain in the timeline.
- All session commands are available from the sidebar row menu and the task-header menu is removed.
- Sessions can be dragged into projects; pinned sessions atomically move and unpin.
- Projects expand/collapse, persist state locally, and auto-expand for selected or dropped sessions.
- Keyboard, focus, reduced-motion, light/dark, and both target viewport contracts pass.
- No schema migration, filesystem movement, credential exposure, or production runtime change is introduced.
