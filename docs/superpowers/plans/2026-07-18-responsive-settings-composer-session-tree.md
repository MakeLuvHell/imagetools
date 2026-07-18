# Responsive Settings, Composer, And Session Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive settings modal, Telegram-style prompt submission, correctly placed Composer validation, complete sidebar session actions, pointer-based session moves, and persistent collapsible projects.

**Architecture:** Extend the existing vanilla frontend layers incrementally: `workbench.js` owns pure collapse/drag decisions, `ui.js` owns DOM rendering and transient visual helpers, and `app.js` owns persistence, pointer lifecycles, dialogs, and backend calls. Extend the existing Rust session update contract with an optional pin patch so project movement and unpinning commit in one SQLite transaction; keep schema v2, the standalone pin command, packaging, and the single-process runtime unchanged.

**Tech Stack:** Vanilla HTML/CSS/JavaScript IIFEs, Node 24 test runner with jsdom, Playwright 1.61.1, Tauri 2, Rust 2021, rusqlite 0.32, SQLite schema v2, GitHub Actions Windows x64 release gate.

---

## File Map And Dependency Order

- Modify `src-tauri/src/workbench/models.rs`, `sessions.rs`, `database/history.rs`, and `commands.rs`: deserialize and atomically apply an optional `is_pinned` session patch.
- Modify `frontend/workbench.js`: pure collapsed-project persistence normalization, drag threshold, and drop-payload decisions.
- Modify `frontend/ui.js`: accessible project/session tree rendering and transient prompt-bubble helpers.
- Modify `frontend/index.html`: Settings native dialog, Composer notice, sidebar menu commands, and removal of the task-header menu.
- Modify `frontend/app.js`: settings lifecycle, project collapse persistence, row-targeted actions, pointer drag orchestration, Composer handoff, and animation cleanup.
- Modify `frontend/styles.css`: modal geometry, project tree/drop states, validation notice, send compression, and Telegram-style transient bubble.
- Modify `tests/frontend_desktop_api.test.js`, `tests/frontend_workbench.test.js`, `tests/frontend_ui.test.js`, and `tests/frontend_ui_contract.test.js`: focused contract, pure-state, DOM, and static coverage.
- Modify `tests/ui/helpers.js` and `tests/ui/codex_windows.spec.js`: deterministic desktop mock state and interaction coverage.
- Update `tests/ui/codex_windows.spec.js-snapshots/*.png`: approved settings and shell baselines at `1280x860` and `960x640`, light and dark.
- Modify `knowledge/02-requirements.md`, `knowledge/04-task-list.md`, `knowledge/05-review-notes.md`, `knowledge/08-testing-strategy.md`, `knowledge/09-decisions.md`, `knowledge/10-lessons-learned.md`, and `tickets.md`: record delivered behavior, ticket status, and verification evidence.

`CONTEXT.md` is already current: 项目 is a collapsible session grouping, not a filesystem directory. No ADR, schema migration, third-party drag package, release version change, tag move, or change to the published `v0.3.0` Release belongs in this work.

### Task 1: Add Atomic Project-And-Pin Session Updates

**Files:**
- Modify: `src-tauri/src/workbench/models.rs:51-64,154-220`
- Modify: `src-tauri/src/workbench/database/history.rs:156-207`
- Modify: `src-tauri/src/workbench/sessions.rs:94-108,230-430`
- Modify: `src-tauri/src/workbench/commands.rs:890-930`
- Modify: `tests/frontend_desktop_api.test.js:17-70`

- [ ] **Step 1: Write failing Rust contract and transaction tests**

Add model tests that deserialize `{}` as `Patch::Missing`, `{"is_pinned": false}` as `Patch::Value(Some(false))`, and `{"is_pinned": null}` as `Patch::Value(None)`. Add service tests named `session_update_moves_and_unpins_atomically`, `invalid_project_rolls_back_pin_change`, and `missing_session_patches_preserve_existing_values`; construct inputs explicitly as:

```rust
SessionUpdateInput {
    title: None,
    project_id: Patch::Value(Some(project.id)),
    is_pinned: Patch::Value(Some(false)),
}
```

The rollback test starts with a pinned session, sends project ID `9_999_999` plus `false`, expects `project.not_found`, then asserts that `project_id` and `is_pinned` are unchanged. Update every existing `SessionUpdateInput` test literal to include `is_pinned: Patch::Missing`.

- [ ] **Step 2: Add a failing IPC assertion**

In the existing command lifecycle test, replace the `update_session` input and assertions with:

```rust
let moved = fixture.ok(
    "update_session",
    json!({"sessionId": session_id, "input": {
        "title": "Poster v2",
        "project_id": project_id,
        "is_pinned": false
    }}),
);
assert_eq!(moved["project_id"], project_id);
assert_eq!(moved["is_pinned"], false);
```

Change `sessionUpdate` in `tests/frontend_desktop_api.test.js` to `{ title: "Final", project_id: 9, is_pinned: false }`; the expected invocation remains `update_session` with the input unchanged.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test tests/frontend_desktop_api.test.js
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml session_update -- --nocapture
```

Expected: Node passes transport transparency; Rust fails because `SessionUpdateInput` has no `is_pinned` field and the repository accepts only title/project patches.

- [ ] **Step 4: Implement the optional pin patch and one-transaction update**

Extend the input:

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct SessionUpdateInput {
    pub title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_patch")]
    pub project_id: Patch<i64>,
    #[serde(default, deserialize_with = "deserialize_patch")]
    pub is_pinned: Patch<bool>,
}
```

In `HistoryService::update_session`, map the patches before the repository call:

```rust
let project = match input.project_id {
    Patch::Missing => None,
    Patch::Value(value) => Some(value),
};
let pinned = match input.is_pinned {
    Patch::Missing => None,
    Patch::Value(Some(value)) => Some(value),
    Patch::Value(None) => {
        return Err(CommandError::new(
            "session.invalid_pinned",
            "会话置顶状态无效。",
        ));
    }
};
self.repository
    .update_session(id, title.as_deref(), project, pinned)
    .map(session_dto)
```

Change the repository signature to accept `is_pinned: Option<bool>`, retain the active-project check inside its immediate transaction, and execute one statement:

```rust
let now = utc_now();
let changed = tx.execute(
    "UPDATE sessions SET
       title = CASE WHEN ?1 THEN ?2 ELSE title END,
       recent_thumbnail_path = NULL,
       project_id = CASE WHEN ?3 THEN ?4 ELSE project_id END,
       is_pinned = CASE WHEN ?5 THEN ?6 ELSE is_pinned END,
       updated_at = ?7
     WHERE id = ?8 AND deleted_at IS NULL",
    params![
        title.is_some(), title, project_id.is_some(), project_id.flatten(),
        is_pinned.is_some(), is_pinned, now, id
    ],
).map_err(database_error)?;
```

Keep `set_pinned` unchanged for existing menu callers.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the two commands from Step 3 plus:

```bash
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml invalid_project_rolls_back_pin_change -- --nocapture
```

Expected: all selected Node and Rust tests pass; the rollback test proves no partial unpin.

- [ ] **Step 6: Commit the backend contract**

```bash
git add src-tauri/src/workbench/models.rs src-tauri/src/workbench/database/history.rs src-tauri/src/workbench/sessions.rs src-tauri/src/workbench/commands.rs tests/frontend_desktop_api.test.js
git commit -m "feat(sessions): update project and pin atomically"
```

### Task 2: Add Pure Collapse And Drag Decisions

**Files:**
- Modify: `tests/frontend_workbench.test.js:71-95`
- Modify: `frontend/workbench.js:1-62,430-485`

- [ ] **Step 1: Write failing pure-state tests**

Add tests for these exact contracts:

```javascript
assert.deepEqual(workbench.parseCollapsedProjectIds('[7,"8",7,-1]'), [7, 8]);
assert.deepEqual(workbench.parseCollapsedProjectIds("broken"), []);
assert.deepEqual(
  workbench.normalizeCollapsedProjectIds([7, 8, 99], [{ id: 8 }, { id: 7 }]),
  [7, 8],
);
assert.equal(workbench.serializeCollapsedProjectIds(new Set([8, 7])), "[7,8]");
assert.equal(workbench.exceedsDragThreshold({ x: 10, y: 10 }, { x: 16, y: 10 }), true);
assert.equal(workbench.exceedsDragThreshold({ x: 10, y: 10 }, { x: 15, y: 12 }), false);
assert.deepEqual(workbench.sessionDropPatch({ isPinned: true }, 9), {
  project_id: 9,
  is_pinned: false,
});
assert.deepEqual(workbench.sessionDropPatch({ isPinned: false }, 9), { project_id: 9 });
```

Also verify selecting a session returns its project ID for auto-expansion and invalid IDs return `null`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test --test-name-pattern="collapsed|drag threshold|drop patch|auto-expansion" tests/frontend_workbench.test.js
```

Expected: FAIL because the helpers are not exported.

- [ ] **Step 3: Implement and export the pure helpers**

Add these complete helpers before the API object:

```javascript
const COLLAPSED_PROJECTS_STORAGE_KEY = "imagetools:collapsed-projects";

function parseCollapsedProjectIds(raw) {
  try {
    const values = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function normalizeCollapsedProjectIds(ids, projects) {
  const known = new Set(projects.map((project) => Number(project.id)));
  return [...new Set(ids.map(Number).filter((id) => known.has(id)))]
    .sort((left, right) => left - right);
}

function serializeCollapsedProjectIds(ids) {
  return JSON.stringify([...ids].map(Number).sort((left, right) => left - right));
}

function exceedsDragThreshold(start, current, threshold = 6) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

function sessionDropPatch(session, projectId) {
  const patch = { project_id: Number(projectId) };
  if (session.isPinned) patch.is_pinned = false;
  return patch;
}

function projectIdForSession(sessions, sessionId) {
  return sessions.find((session) => session.id === Number(sessionId))?.projectId ?? null;
}
```

Export the storage key and all six functions from `api`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit pure interaction state**

```bash
git add frontend/workbench.js tests/frontend_workbench.test.js
git commit -m "feat(sidebar): model project collapse and session drops"
```

### Task 3: Render The Accessible Collapsible Session Tree

**Files:**
- Modify: `tests/frontend_ui.test.js:14-60`
- Modify: `frontend/ui.js:163-252,565-579`
- Modify: `frontend/styles.css:240-430`

- [ ] **Step 1: Write failing DOM tests**

Update the grouped-list fixture to pass `collapsedProjectIds: new Set([7])` and callbacks for `onProjectToggle`, `onProjectAction`, `onSessionAction`, and `onSessionPointerDown`. Assert:

```javascript
const toggle = container.querySelector('[data-project-toggle="7"]');
assert.equal(toggle.getAttribute("aria-expanded"), "false");
assert.equal(container.querySelector('[data-project-sessions="7"]').hidden, true);
assert.equal(container.querySelector('[data-project-id="7"]').classList.contains("project-drop-target"), true);
assert.equal(container.querySelector('[data-session-id="2"] .session-row-action').getAttribute("aria-label"), "会话操作 产品海报");
```

Click the chevron and row ellipsis to prove their callbacks receive project/session objects independently. Dispatch `pointerdown` on the session row and assert the pointer callback receives the session and event without selecting it.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test --test-name-pattern="session list|collapsible" tests/frontend_ui.test.js
```

Expected: FAIL because project toggles, collapsed groups, drop attributes, and row menu labels are absent.

- [ ] **Step 3: Implement the renderer contract**

Refactor each project into `.project-block[data-project-id]` containing a `.project-row.project-drop-target`, a separate toggle button, a separate ellipsis button, and a child container. Use this exact state wiring:

```javascript
const collapsed = callbacks.collapsedProjectIds?.has(group.project.id) || false;
toggle.type = "button";
toggle.className = "project-toggle";
toggle.dataset.projectToggle = String(group.project.id);
toggle.setAttribute("aria-expanded", String(!collapsed));
toggle.setAttribute("aria-label", `${collapsed ? "展开" : "收起"}项目 ${group.project.name}`);
toggle.innerHTML = `<i data-lucide="${collapsed ? "chevron-right" : "chevron-down"}"></i>`;
toggle.addEventListener("click", () => callbacks.onProjectToggle?.(group.project.id));
children.dataset.projectSessions = String(group.project.id);
children.hidden = collapsed;
```

Set `row.dataset.sessionId`, attach `pointerdown` to `callbacks.onSessionPointerDown`, and change the row action label/title to `会话操作 ${session.title}` / `会话操作`. Preserve ordinary click selection and the existing pinned/project/ungrouped de-duplication.

- [ ] **Step 4: Add stable tree and drop styling**

Add fixed 28px toggle/action tracks, a non-shifting `.project-block`, `.project-children[hidden]`, `.project-drop-target.is-drop-target`, `.session-row.is-drag-source`, and a fixed-position `.session-drag-preview`. Use existing color tokens, 6px or smaller radii for rows, and no new palette tokens.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run Step 2. Expected: all selected DOM tests pass and no row click count changes.

- [ ] **Step 6: Commit the session tree renderer**

```bash
git add frontend/ui.js frontend/styles.css tests/frontend_ui.test.js
git commit -m "feat(sidebar): render collapsible project tree"
```

### Task 4: Orchestrate Collapse Persistence, Row Menus, And Pointer Drag

**Files:**
- Modify: `frontend/index.html:63-122,520-600`
- Modify: `frontend/app.js:1-25,118-170,274-330,730-980,1500-1810`
- Modify: `frontend/styles.css:240-430,760-850`
- Modify: `tests/frontend_ui_contract.test.js:1-150`
- Modify: `tests/ui/helpers.js`
- Modify: `tests/ui/codex_windows.spec.js:43-90`

- [ ] **Step 1: Write failing static and Playwright interaction tests**

Add static assertions that `#taskMenuBtn` and `#taskMenu` are absent, while `#sidebarMenu` contains menu items in this order: `sidebarMenuPinBtn`, `sidebarMenuOrganizeBtn`, `sidebarMenuRenameSessionBtn`, separator, `sidebarMenuDeleteSessionBtn`. Add Playwright tests named:

```javascript
test("session row menu renames and deletes a non-selected session", async ({ page }) => { /* use mock call assertions */ });
test("project collapse persists and selected sessions expand their project", async ({ page }) => { /* reload and select */ });
test("pointer drag moves ordinary and pinned sessions atomically", async ({ page }) => { /* mouse move beyond 6px */ });
test("collapsed drag target expands after hover and cancel does not mutate", async ({ page }) => { /* 500ms hover, Escape */ });
```

For the pinned drop, assert the single update call is `{ sessionId, input: { project_id: targetId, is_pinned: false } }`; assert no `set_session_pinned` call occurs.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "session row menu|project collapse|pointer drag|collapsed drag target"
```

Expected: FAIL because actions still live in the header, projects do not persist collapse state, and pointer drag is absent.

- [ ] **Step 3: Replace the menu markup and target all commands explicitly**

Remove the complete header `.workspace-actions` block. Extend `#sidebarMenu` with session rename/delete buttons separated by `<hr role="separator" />`; keep project rename/delete buttons but toggle their visibility from `sidebarMenuTarget.kind`. Store `{ kind: "session"|"project", value, trigger }`, and route every action through that target. Open existing rename/delete dialogs with the row trigger as opener; never derive the target from `state.selectedSessionId`.

- [ ] **Step 4: Add collapse persistence orchestration**

Initialize and persist state with these complete functions:

```javascript
let collapsedProjectIds = new Set(
  window.ImageToolsWorkbench.parseCollapsedProjectIds(
    localStorage.getItem(window.ImageToolsWorkbench.COLLAPSED_PROJECTS_STORAGE_KEY),
  ),
);

function persistCollapsedProjects() {
  localStorage.setItem(
    window.ImageToolsWorkbench.COLLAPSED_PROJECTS_STORAGE_KEY,
    window.ImageToolsWorkbench.serializeCollapsedProjectIds(collapsedProjectIds),
  );
}

function setProjectExpanded(projectId, expanded, { persist = true } = {}) {
  if (expanded) collapsedProjectIds.delete(Number(projectId));
  else collapsedProjectIds.add(Number(projectId));
  if (persist) persistCollapsedProjects();
  renderSessions();
}
```

After projects load, normalize against authoritative projects and persist the cleaned set. New project creation and successful move/delete expand or remove the affected ID. Before selecting a nested session, expand its project.

- [ ] **Step 5: Implement the pointer lifecycle**

Use one `dragState` with `pointerId`, `session`, start/current coordinates, `active`, `targetProjectId`, `preview`, and `expandTimer`. Capture the pointer on the source row; activate only when `exceedsDragThreshold` returns true; resolve targets with `document.elementFromPoint(...).closest("[data-project-id]")`; schedule collapsed-target expansion with `setTimeout(..., 500)`. On drop call exactly:

```javascript
await desktopApi.updateSession(
  dragState.session.id,
  window.ImageToolsWorkbench.sessionDropPatch(
    dragState.session,
    dragState.targetProjectId,
  ),
);
```

Centralize `finishSessionDrag({ commit })` so pointer up, Escape, `pointercancel`, lost capture, resize, failure, and outside drop always clear timers, preview, source/target classes, and listeners. On success or failure reload sessions; on success keep the target expanded and announce near the sidebar, on failure show the contextual sidebar status.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run Step 2. Expected: all selected tests pass, including menu action targeting and atomic pinned drop payload.

- [ ] **Step 7: Commit sidebar orchestration**

```bash
git add frontend/index.html frontend/app.js frontend/styles.css tests/frontend_ui_contract.test.js tests/ui/helpers.js tests/ui/codex_windows.spec.js
git commit -m "feat(sidebar): add row actions collapse and pointer moves"
```

### Task 5: Convert Settings Into A Responsive Native Modal

**Files:**
- Modify: `frontend/index.html:294-420`
- Modify: `frontend/app.js:49-68,1280-1320,1500-1545`
- Modify: `frontend/styles.css:1040-1320`
- Modify: `tests/frontend_ui.test.js:320-370`
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `tests/ui/codex_windows.spec.js:287-797,1180-1295`

- [ ] **Step 1: Write failing modal lifecycle and geometry tests**

Change settings locators from `region` to `dialog`. Assert the modal is about 75% viewport width and 78% height, never exceeds `1040x760`, stays inside `960x640`, and `.settings-main` scrolls internally. Add tests proving backdrop click and Escape close Settings and restore `#settingsBtn`, while Escape closes Provider/storage child dialogs first and leaves Settings open.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test --test-name-pattern="dialog|settings" tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "settings opens|Escape closes|settings modal|settings dialog stays"
```

Expected: FAIL because Settings is a replacement region with a back button rather than a native modal.

- [ ] **Step 3: Replace settings markup with a native dialog**

Replace the opening tag `<section id="settingsView" class="settings-view" role="region" aria-label="设置" hidden>` with:

```html
<dialog id="settingsView" class="app-dialog settings-view" aria-labelledby="settingsTitle">
```

Replace its closing `</section>` after `#providerMenu` with `</dialog>`. Remove `#settingsBackBtn`, replace `.settings-nav-label` with `<h2 id="settingsTitle">设置</h2>`, and insert this button as the last child of `.settings-shell`:

```html
<button id="settingsCloseBtn" type="button" class="icon-button settings-close" aria-label="关闭设置">
  <i data-lucide="x"></i>
</button>
```

Do not alter the current settings navigation, panels, or `#providerMenu` children. Retain Provider/storage child dialogs as sibling native dialogs so they remain above Settings.

- [ ] **Step 4: Use the existing dialog helper and topmost-layer rules**

Implement `openSettingsView` with `ImageToolsUi.openDialog(settingsView, opener)`. Implement `closeSettingsView` by first invalidating Provider/theme/storage/picker generations, closing Provider menu, then awaiting `closeDialog(settingsView)`. Handle `cancel` with `preventDefault()` and close Settings only when no child dialog/menu is open. Handle `click` only when `event.target === settingsView` for backdrop dismissal.

- [ ] **Step 5: Apply responsive modal geometry**

Use:

```css
.settings-view {
  width: min(75vw, 1040px);
  height: min(78vh, 760px);
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  padding: 0;
  overflow: hidden;
}
.settings-shell { height: 100%; grid-template-columns: minmax(176px, 24%) minmax(0, 1fr); }
.settings-main { min-height: 0; overflow: auto; }
```

At the existing small-desktop breakpoint narrow the navigation track without changing font size. Style `::backdrop` with a neutral translucent overlay.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run Step 2. Expected: all selected DOM and Playwright tests pass at both target viewports.

- [ ] **Step 7: Commit the settings modal**

```bash
git add frontend/index.html frontend/app.js frontend/styles.css tests/frontend_ui.test.js tests/frontend_ui_contract.test.js tests/ui/codex_windows.spec.js
git commit -m "feat(settings): open responsive native modal"
```

### Task 6: Move Validation Above Composer And Clear Accepted Prompts Immediately

**Files:**
- Modify: `frontend/index.html:124-205`
- Modify: `frontend/app.js:23-48,180-250,993-1154,1760-1770`
- Modify: `frontend/styles.css:850-1040`
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `tests/ui/codex_windows.spec.js:29-190`

- [ ] **Step 1: Write failing validation and handoff tests**

Add a static test that `#composerNotice` precedes `#composerForm` inside a `.composer-stack`. In Playwright, verify empty prompt and missing Provider notices are visible directly above the Composer, prompt validation preserves/focuses input, valid submit clears within 60ms while ratio/resolution/quality/count remain unchanged, upload staging failure preserves the selected reference, and accepted reference handoff clears it before generation completion.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test --test-name-pattern="composer notice" tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "Composer validation|accepted submit|reference handoff"
```

Expected: FAIL because validation uses the toast and prompt/reference clearing waits for persistence.

- [ ] **Step 3: Add the notice and contextual helpers**

Insert the wrapper start tag and notice immediately before the current `#composerForm`, then replace that form's opening tag with:

```html
<div class="composer-stack">
  <p id="composerNotice" class="composer-notice" role="alert" hidden></p>
  <form id="composerForm" class="composer" aria-label="图片生成输入">
```

Replace the current form closing tag with:

```html
  </form>
</div>
```

All current form controls remain between these tags exactly once.

Implement:

```javascript
function setComposerNotice(message = "") {
  composerNotice.textContent = message;
  composerNotice.hidden = !message;
}
```

Clear prompt errors on prompt input, Provider errors on Provider selection, and all pre-submit errors when a valid submission starts. Do not route generation/API failures, settings failures, or save failures through this notice.

- [ ] **Step 4: Snapshot submission before clearing the draft**

After session creation and optimistic-run insertion, capture `submission = { prompt, fields, uploadedFile, referenceSource }`, set `promptInput.value = ""`, resize, save the empty active draft immediately, and render the optimistic prompt. Keep common parameter controls unchanged. Use only `submission` for staging/generation. Clear uploaded/result reference UI at the specified handoff point: after staging succeeds and immediately before `generate`, or immediately before `generate` for a persisted image reference. A staging failure must leave the original reference state visible.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run Step 2. Expected: selected tests pass; accepted prompt clears without waiting for network completion, and failures remain in their generation round.

- [ ] **Step 6: Commit Composer semantics**

```bash
git add frontend/index.html frontend/app.js frontend/styles.css tests/frontend_ui_contract.test.js tests/ui/codex_windows.spec.js
git commit -m "feat(composer): clear accepted prompts and place validation"
```

### Task 7: Add The Telegram-Style Transient Prompt Bubble

**Files:**
- Modify: `frontend/ui.js:430-503,565-579`
- Modify: `frontend/app.js:118-170,993-1154,1807-1810`
- Modify: `frontend/styles.css:850-1040,1500-1560`
- Modify: `tests/frontend_ui.test.js`
- Modify: `tests/ui/codex_windows.spec.js`

- [ ] **Step 1: Write failing DOM animation-helper tests**

Add jsdom tests for `startPromptHandoff({ document, sourceRect, target, text, reducedMotion })`. Normal motion must append `.prompt-handoff`, add `is-handoff-hidden` to the real prompt, and expose a cleanup function that removes both states. Reduced motion must append no clone. Simulate a rejected `animation.finished` promise and assert cleanup still reveals the real prompt.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test --test-name-pattern="prompt handoff" tests/frontend_ui.test.js
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement a failure-safe UI helper**

Export `startPromptHandoff`. Clone only submitted text, position it from the captured Composer text rect, calculate translation/scale to `target.getBoundingClientRect()`, run a 250ms Web Animations API transform/opacity animation with `cubic-bezier(0.2, 0, 0, 1)`, and always cleanup in `finished.catch(...).finally(...)`. Return `{ cleanup, finished }`; reduced motion returns an already-resolved result without hiding the target.

- [ ] **Step 4: Wire animation after optimistic render**

Capture the Composer text rectangle before clearing. After rendering, locate the optimistic prompt by `data-submission-id`, call the helper, and defer the running response visibility until `finished` settles. Keep one `activePromptHandoff`; call its cleanup before rerender, session switch, resize, submission replacement, and app teardown. Animate `.send-button:active` with a restrained `scale(.94)` only.

- [ ] **Step 5: Add motion and reduced-motion CSS**

Style `.prompt-handoff` as fixed, right-aligned, non-interactive, and visually identical to `.run-prompt`; keep dimensions stable with explicit max width. Under `@media (prefers-reduced-motion: reduce)`, disable send-button and handoff transitions and reveal real optimistic content immediately.

- [ ] **Step 6: Add focused Playwright coverage and verify GREEN**

Add tests for immediate clear, one moving clone, 220-280ms settlement, reduced motion, resize cleanup, rapid session switch cleanup, and failed generation staying in the run. Run:

```bash
node --test --test-name-pattern="prompt handoff" tests/frontend_ui.test.js
npm run test:ui -- --grep "Telegram prompt|reduced motion prompt|prompt handoff cleanup"
```

Expected: all selected tests pass with no clone or hidden prompt left after each case.

- [ ] **Step 7: Commit the send motion**

```bash
git add frontend/ui.js frontend/app.js frontend/styles.css tests/frontend_ui.test.js tests/ui/codex_windows.spec.js
git commit -m "feat(composer): animate Telegram style prompt handoff"
```

### Task 8: Refresh Desktop Visual And Accessibility Coverage

**Files:**
- Modify: `tests/ui/codex_windows.spec.js:1124-1295`
- Update: `tests/ui/codex_windows.spec.js-snapshots/*.png`

- [ ] **Step 1: Add the final target-size matrix**

For `1280x860` and `960x640` in light/dark, assert: no horizontal overflow; Settings dialog bounds and internal scrolling; Composer notice does not overlap input/send button; expanded/collapsed project rows keep stable dimensions; row menu contains rename/delete; header menu is absent; no drag preview or prompt clone remains after settled interactions.

- [ ] **Step 2: Run behavior tests before changing baselines**

```bash
npm run test:ui -- --grep "settings modal|Composer validation|project collapse|session row menu|Telegram prompt"
```

Expected: behavior assertions pass. Do not update images while any behavior assertion fails.

- [ ] **Step 3: Generate and inspect only affected baselines**

```bash
npm run test:ui:update -- --grep "shell visual baselines|settings visual baselines"
```

Expected: only shell/settings screenshots affected by the approved modal/tree/Composer changes are rewritten. Inspect every changed image for both themes and viewports; reject overlap, clipping, unexplained whitespace, blank captures, or stale transient layers.

- [ ] **Step 4: Re-run the affected visual tests**

```bash
npm run test:ui -- --grep "shell visual baselines|settings visual baselines"
```

Expected: all affected snapshots pass without updates.

- [ ] **Step 5: Commit visual baselines**

```bash
git add tests/ui/codex_windows.spec.js tests/ui/codex_windows.spec.js-snapshots
git commit -m "test(ui): cover responsive workbench interactions"
```

### Task 9: Preserve Knowledge And Run Centralized Gates Once

**Files:**
- Modify: `tickets.md`
- Modify: `knowledge/02-requirements.md`
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/05-review-notes.md`
- Modify: `knowledge/08-testing-strategy.md`
- Modify: `knowledge/09-decisions.md`
- Modify: `knowledge/10-lessons-learned.md`

- [ ] **Step 1: Record completed tracer-bullet tickets**

Add UI012-UI020 entries matching Tasks 1-9, their dependency edges, acceptance results, and focused verification commands. Record that collapse state is device-local, project movement is metadata-only, transient animation never gates generation, and no schema/runtime/release mutation occurred.

- [ ] **Step 2: Run the complete non-Windows gate once**

From a clean worktree run:

```bash
mise run test
mise run ui-test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
mise run desktop-check
git diff --check
```

Expected: every command exits 0. If one fails, make the narrowest focused repair, rerun its focused test, then rerun only the failed final command.

- [ ] **Step 3: Commit knowledge and final source verification**

```bash
git add tickets.md knowledge/02-requirements.md knowledge/04-task-list.md knowledge/05-review-notes.md knowledge/08-testing-strategy.md knowledge/09-decisions.md knowledge/10-lessons-learned.md
git commit -m "docs(ui): record responsive interaction delivery"
git status --short
```

Expected: commit succeeds and `git status --short` is empty.

- [ ] **Step 4: Push the verified commit and run the Windows gate once without publishing**

```bash
git push origin main
BUILD_REF=$(git rev-parse HEAD)
gh workflow run windows-release.yml \
  -f release_tag=v0.3.0 \
  -f build_ref="$BUILD_REF" \
  -f publish_release=false
gh run watch "$(gh run list --workflow windows-release.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: the workflow builds MSI and single-file Portable artifacts, then passes payload, process shutdown, schema-v2 upgrade, and rollback gates. `publish_release=false` must remain unchanged: this run must not edit, replace assets on, or move the immutable published `v0.3.0` tag/Release.

- [ ] **Step 5: Record the Windows run evidence**

Append the workflow run URL and result to `knowledge/05-review-notes.md` and `knowledge/10-lessons-learned.md`, then commit and push:

```bash
git add knowledge/05-review-notes.md knowledge/10-lessons-learned.md
git commit -m "docs(release): record responsive UI Windows gate"
git push origin main
```

Expected: the evidence commit is on `origin/main`; the working tree is clean; `git rev-parse v0.3.0` still equals `cc56df1`.

## Self-Review Record

- Spec coverage: Tasks 1-9 cover atomic pin/project updates, project persistence and normalization, selection/drop expansion, row-targeted rename/delete/pin/move, header-menu removal, pointer threshold/cancel/hover/failure behavior, modal geometry and nested focus lifecycle, Composer notice and reference handoff, Telegram motion and cleanup, both target viewports/themes, knowledge updates, and one final Windows gate.
- Type consistency: frontend normalized sessions use `isPinned`/`projectId`; IPC payloads use `is_pinned`/`project_id`; Rust uses `Patch<bool>`/`Patch<i64>` and repository `Option<bool>`/`Option<Option<i64>>`. The drag path calls only `updateSession`; the existing menu may continue calling `setSessionPinned`.
- Scope consistency: SQLite remains schema v2; projects remain metadata groupings; no new dependency, server, second process, packaging format, version, tag, or Release mutation is introduced.
- Placeholder scan: the plan contains no deferred implementation markers or unspecified error/test steps; every task has exact files, RED/GREEN commands, expected outcomes, and a commit boundary.
