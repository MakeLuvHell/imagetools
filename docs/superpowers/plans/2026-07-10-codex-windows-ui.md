# Codex Desktop Windows UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic form-heavy workbench with the approved Image Tools-branded, Codex Desktop Windows-style task shell, layered Composer, system themes, and persistent image-generation task flow.

**Architecture:** Keep Tauri, FastAPI, SQLite, and the static HTML/CSS/JavaScript frontend. Put pure state transitions in `frontend/workbench.js`, DOM rendering in a new `frontend/ui.js`, and API/event orchestration in `frontend/app.js`; existing backend contracts and schema stay unchanged, with one compatible hardening change that prevents unexpected generation exceptions from leaving runs permanently `running`. Bundle Lucide locally and use Playwright with mocked API routes for deterministic layout, theme, keyboard, and screenshot verification.

**Tech Stack:** Tauri 2, FastAPI, SQLite, vanilla JavaScript, CSS, Lucide 1.24.0, Node test runner, jsdom 29.1.1, Playwright 1.61.1, pytest.

---

## File Map

- `frontend/workbench.js`: pure session, draft, Composer, parameter-summary, and optimistic-run state.
- `frontend/ui.js`: DOM-only renderers for sidebar, task stream, image results, menus, and Provider rows.
- `frontend/app.js`: API calls, browser storage, event wiring, dialogs, and task submission orchestration.
- `frontend/index.html`: stable Windows-style shell, Composer controls, menu roots, and native dialog roots.
- `frontend/styles.css`: light/dark tokens, shell geometry, task flow, Composer, menus, dialogs, and narrow-window rules.
- `frontend/icons.js`: local Lucide refresh helper for static and dynamically rendered icons.
- `scripts/sync_frontend_vendor.js`: copies pinned Lucide browser assets and the Image Tools app icon into frontend assets.
- `tests/frontend_workbench.test.js`: pure state tests.
- `tests/frontend_ui.test.js`: jsdom renderer and accessibility-contract tests.
- `tests/frontend_ui_contract.test.js`: static HTML and asset contract tests.
- `playwright.config.js`, `tests/ui/codex_windows.spec.js`: deterministic browser interaction and visual tests.
- `knowledge/03-tech-stack.md`, `knowledge/08-testing-strategy.md`, `README.md`: finalized tooling and verification guidance.

## Task 1: Model New-Task Drafts And Optimistic Runs

**Files:**
- Modify: `frontend/workbench.js`
- Modify: `tests/frontend_workbench.test.js`

- [ ] **Step 1: Write failing tests for draft-first startup and state helpers**

```javascript
test("workbench starts on an unpersisted new-task draft", () => {
  const state = workbench.defaultWorkbenchState();
  assert.equal(state.selectedSessionId, null);
  assert.equal(state.view, "new-task");
  assert.deepEqual(state.pendingRunsBySession, {});
});

test("deriveSessionTitle normalizes the first line and limits it to 36 characters", () => {
  assert.equal(workbench.deriveSessionTitle("  夏季   饮品海报\n第二行  "), "夏季 饮品海报");
  assert.equal([...workbench.deriveSessionTitle("图".repeat(50))].length, 36);
});

test("draftStorageKey isolates new-task and persisted-session drafts", () => {
  assert.equal(workbench.draftStorageKey(null), "imagetools:draft:new");
  assert.equal(workbench.draftStorageKey(7), "imagetools:draft:session:7");
});

test("pending runs stay isolated by session and submission id", () => {
  let state = workbench.defaultWorkbenchState();
  state = workbench.addPendingRun(state, 3, { submissionId: "a", status: "running" });
  state = workbench.addPendingRun(state, 4, { submissionId: "b", status: "running" });
  assert.equal(workbench.pendingRunsForSession(state, 3)[0].submissionId, "a");
  assert.equal(workbench.pendingRunsForSession(state, 4)[0].submissionId, "b");
});

test("readDraft rejects corrupt storage and keeps only serializable fields", () => {
  assert.equal(workbench.parseDraft("not-json"), null);
  assert.deepEqual(workbench.parseDraft(JSON.stringify({ prompt: "海报", apiKey: "secret", referenceSource: { kind: "result", url: "/files/images/1.png" } })), {
    prompt: "海报",
    referenceSource: { kind: "result", url: "/files/images/1.png" },
  });
});

test("parameterSummary uses localized resolution and count labels", () => {
  assert.equal(
    workbench.parameterSummary({ ratio: "16:9", resolution: "medium", count: 2 }),
    "16:9 · 高清 · 2 张",
  );
});
```

Update the old `applySessionList selects the newest session` expectation so loading sessions preserves `selectedSessionId === null`; selection only changes after an explicit click or successful first submit.

- [ ] **Step 2: Run the state tests and verify RED**

Run: `node --test tests/frontend_workbench.test.js`

Expected: failures for missing `view`, `pendingRunsBySession`, `deriveSessionTitle`, `draftStorageKey`, `parseDraft`, and `parameterSummary`.

- [ ] **Step 3: Implement the state helpers and export them**

```javascript
const RESOLUTION_LABELS = { standard: "标准", medium: "高清", large: "超清" };

function deriveSessionTitle(prompt, maxLength = 36) {
  const firstLine = String(prompt || "").split(/\r?\n/, 1)[0];
  const normalized = firstLine.replace(/\s+/g, " ").trim() || "新任务";
  return Array.from(normalized).slice(0, maxLength).join("");
}

function draftStorageKey(sessionId) {
  return sessionId == null
    ? "imagetools:draft:new"
    : `imagetools:draft:session:${Number(sessionId)}`;
}

const DRAFT_FIELDS = ["prompt", "providerId", "model", "ratio", "resolution", "quality", "count", "outputFormat", "outputCompression", "background", "moderation", "referenceSource"];

function parseDraft(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    return Object.fromEntries(DRAFT_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  } catch {
    return null;
  }
}

function parameterSummary(composer) {
  const resolution = RESOLUTION_LABELS[composer.resolution] || "标准";
  return `${composer.ratio || "1:1"} · ${resolution} · ${Number(composer.count || 1)} 张`;
}

function defaultWorkbenchState() {
  return { sessions: [], selectedSessionId: null, view: "new-task", pendingRunsBySession: {} };
}

function createOptimisticRun(composer, temporaryId) {
  return {
    id: temporaryId,
    submissionId: temporaryId,
    sessionId: Number(composer.sessionId),
    optimistic: true,
    status: "running",
    prompt: String(composer.prompt || "").trim(),
    provider_name: composer.providerName,
    model: composer.model,
    parameters: {
      ratio: composer.ratio,
      resolution: composer.resolution,
      quality: composer.quality,
      count: Number(composer.count || 1),
    },
    images: [],
  };
}
```

`applySessionList` must keep an explicit current selection only when it still exists; otherwise it returns `selectedSessionId: null` and `view: "new-task"`. `selectSession` sets `view: "session"`; add `selectNewTask(state)` to clear the selection. Store pending rows as `pendingRunsBySession[sessionId][submissionId]`, never as one global array; add pure helpers to insert, fail, and remove a single submission without disturbing other sessions or late responses.

- [ ] **Step 4: Run the state tests and verify GREEN**

Run: `node --test tests/frontend_workbench.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/workbench.js tests/frontend_workbench.test.js
git commit -m "feat(state): model new image tasks"
```

## Task 2: Bundle Icons And Build The Windows Shell

**Files:**
- Create: `scripts/sync_frontend_vendor.js`
- Create: `frontend/icons.js`
- Generate: `frontend/vendor/lucide.min.js`
- Generate: `frontend/vendor/LUCIDE_LICENSE`
- Generate: `frontend/assets/app-icon.png`
- Create: `tests/frontend_ui_contract.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `frontend/index.html`
- Modify: `frontend/styles.css`

- [ ] **Step 1: Write the failing static shell contract**

```javascript
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

test("shell exposes Codex Windows task regions without permanent parameter columns", () => {
  for (const id of ["newSessionBtn", "sessionList", "timeline", "composerForm", "parameterMenu", "providerDialog"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /class="composer-controls"/);
  assert.doesNotMatch(html, /Scheduled|Plugins|Sites|terminal-stage/);
  assert.match(html, /data-lucide="search"/);
});

test("offline icon and brand assets are present", () => {
  assert.equal(fs.existsSync(path.join(root, "frontend/vendor/lucide.min.js")), true);
  assert.equal(fs.existsSync(path.join(root, "frontend/assets/app-icon.png")), true);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/frontend_ui_contract.test.js`

Expected: failures for the missing menu/dialog roots and local assets.

- [ ] **Step 3: Install pinned dependencies and add the vendor sync**

Run:

```bash
npm install --save-dev lucide@1.24.0 jsdom@29.1.1
```

Add scripts:

```json
"postinstall": "npm run frontend:vendor",
"frontend:vendor": "node scripts/sync_frontend_vendor.js"
```

Create the sync script:

```javascript
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const lucideCjs = require.resolve("lucide");
const lucideRoot = path.resolve(path.dirname(lucideCjs), "../..");
const copies = [
  [path.join(lucideRoot, "dist/umd/lucide.min.js"), path.join(root, "frontend/vendor/lucide.min.js")],
  [path.join(lucideRoot, "LICENSE"), path.join(root, "frontend/vendor/LUCIDE_LICENSE")],
  [path.join(root, "src-tauri/icons/icon.png"), path.join(root, "frontend/assets/app-icon.png")],
];

for (const [source, target] of copies) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
```

Run: `npm run frontend:vendor`

Expected: all three generated files exist.

- [ ] **Step 4: Replace the static shell while preserving IDs consumed by the current app**

`index.html` must contain this stable hierarchy:

```html
<div class="app-shell">
  <aside class="session-sidebar" aria-label="创作会话">
    <header class="sidebar-brand">
      <img src="/static/assets/app-icon.png" alt="" />
      <h1>Image Tools <span>Work</span></h1>
      <button id="searchToggle" class="icon-button" aria-label="搜索会话"><i data-lucide="search"></i></button>
    </header>
    <nav class="primary-nav">
      <button id="newSessionBtn"><i data-lucide="square-pen"></i><span>新建任务</span></button>
      <button id="providersBtn"><i data-lucide="panels-top-left"></i><span>Providers</span></button>
    </nav>
    <div id="searchPanel" hidden><input id="sessionFilter" placeholder="搜索会话" /></div>
    <div class="sidebar-section-label">会话</div>
    <nav id="sessionList" class="session-list"></nav>
    <footer class="workspace-account"><span>本地工作区</span><button aria-label="设置"><i data-lucide="settings"></i></button></footer>
  </aside>
  <main class="workspace">
    <header id="taskHeader" class="task-header"></header>
    <section id="timeline" class="timeline" aria-live="polite"></section>
    <form id="composerForm" class="composer"></form>
  </main>
</div>
<dialog id="providerDialog"></dialog>
<dialog id="sessionDialog"></dialog>
<div id="parameterMenu" class="popover" hidden></div>
<div id="toast" role="status" hidden></div>
```

Keep all existing form control IDs inside `composerForm` and `parameterMenu` so submission behavior remains usable during the transition. In this task load scripts in this order: preferences, workbench, Lucide vendor, icons, app. Task 3 inserts UI immediately before app after `frontend/ui.js` exists.

Create `icons.js` with `refresh()` calling `lucide.createIcons({ attrs: { width: 16, height: 16, "stroke-width": 1.7 } })` and exporting `ImageToolsIcons.refresh`. Lucide scans the document; do not pass an unsupported `root` option.

Replace the CSS foundation with:

```css
:root {
  color-scheme: light dark;
  --sidebar-width: clamp(248px, 20.3vw, 280px);
  --task-width: 760px;
  --composer-width: 746px;
  --bg: #ffffff;
  --sidebar: #fbfbfc;
  --surface: #ffffff;
  --surface-subtle: #f4f4f5;
  --text: #202124;
  --muted: #747980;
  --line: #e2e3e6;
  --accent: #1685d1;
  --danger: #b4232d;
  font-family: "Segoe UI Variable", "Segoe UI", "Noto Sans CJK SC", system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #202123;
    --sidebar: #1c1d1f;
    --surface: #292a2d;
    --surface-subtle: #252629;
    --text: #f1f2f3;
    --muted: #a1a4aa;
    --line: #3a3c40;
  }
}

.app-shell { width: 100vw; height: 100vh; display: grid; grid-template-columns: var(--sidebar-width) minmax(0, 1fr); overflow: hidden; background: var(--bg); }
.session-sidebar { min-height: 0; display: grid; grid-template-rows: auto auto auto auto minmax(0, 1fr) auto; border-right: 1px solid var(--line); background: var(--sidebar); }
.workspace { min-width: 0; min-height: 0; display: grid; grid-template-rows: 50px minmax(0, 1fr) auto; background: var(--bg); }
.timeline { min-height: 0; overflow: auto; padding: 24px max(24px, calc((100% - var(--task-width)) / 2)) 32px; }
.composer { width: min(var(--composer-width), calc(100% - 48px)); min-height: 116px; margin: 0 auto 16px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 5px 16px rgb(0 0 0 / 9%); }
```

Add stable 32px sidebar rows, 30px icon buttons, a 50px task header, compact 12-13px sidebar text, focus-visible rings, and a `@media (max-width: 1040px)` rule that reduces horizontal task padding without collapsing the sidebar.

- [ ] **Step 5: Verify shell assets and unit suite**

Run:

```bash
node --test tests/frontend_ui_contract.test.js tests/frontend_workbench.test.js
npm run frontend:vendor
git diff --check
```

Expected: tests pass, vendor sync exits 0, no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/sync_frontend_vendor.js frontend/index.html frontend/styles.css frontend/icons.js frontend/vendor frontend/assets tests/frontend_ui_contract.test.js
git commit -m "feat(ui): add Codex Windows shell"
```

## Task 3: Render Sidebar, New Tasks, And Session Dialogs

**Files:**
- Create: `frontend/ui.js`
- Create: `tests/frontend_ui.test.js`
- Modify: `frontend/index.html`
- Modify: `frontend/styles.css`
- Modify: `frontend/app.js`
- Modify: `tests/frontend_ui_contract.test.js`

- [ ] **Step 1: Write failing jsdom tests for the sidebar and dialog contract**

```javascript
const { JSDOM } = require("jsdom");
const ui = require("../frontend/ui.js");

test("renderSessionList creates compact selectable text rows", () => {
  const dom = new JSDOM('<nav id="sessions"></nav>');
  const selected = [];
  ui.renderSessionList(dom.window.document.querySelector("#sessions"), [{ id: 7, title: "夏季海报" }], 7, id => selected.push(id));
  const button = dom.window.document.querySelector("button.session-item");
  assert.equal(button.textContent.trim(), "夏季海报");
  assert.equal(button.getAttribute("aria-current"), "page");
  button.click();
  assert.deepEqual(selected, [7]);
});

test("app no longer uses browser-native prompt or confirm", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/app.js"), "utf8");
  assert.doesNotMatch(source, /window\.(prompt|confirm)\(/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/frontend_ui.test.js tests/frontend_ui_contract.test.js`

Expected: failure because `frontend/ui.js` and application dialogs are not implemented.

- [ ] **Step 3: Implement the renderer boundary**

Create an IIFE/CommonJS dual export matching `workbench.js`:

```javascript
function renderSessionList(container, sessions, selectedSessionId, onSelect) {
  container.replaceChildren();
  for (const session of sessions) {
    const button = container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "session-item";
    button.textContent = session.title;
    button.title = session.title;
    if (session.id === selectedSessionId) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => onSelect(session.id));
    container.appendChild(button);
  }
  globalScope.ImageToolsIcons?.refresh(container);
}
```

Also export `renderNewTask`, `renderTaskHeader`, `openDialog`, and `closeDialog`. `openDialog` stores the opener, calls `showModal()`, and focuses the first non-disabled input; `closeDialog` closes and restores opener focus.

Add `<script src="/static/ui.js"></script>` immediately before `/static/app.js` in `index.html`.

- [ ] **Step 4: Replace session orchestration and native dialogs**

In `app.js`, add `readDraft`, `writeDraft`, `startNewTask`, `selectExistingSession`, `openRenameDialog`, and `openDeleteDialog`. Use `draftStorageKey` for storage and keep a draft before every view switch. Persist the schema accepted by `parseDraft`: prompt, parameters, Provider/model, and an existing-result `referenceSource` URL. Keep an uploaded `File` reference in memory only and clear it on reload rather than writing image bytes or API keys to `localStorage`. Corrupt JSON loads as an empty draft. Deleting a session also removes `draft:session:<id>`.

```javascript
function startNewTask() {
  saveActiveDraft();
  state = window.ImageToolsWorkbench.selectNewTask(state);
  restoreActiveDraft();
  render();
}

async function ensureSessionForSubmit(prompt) {
  if (state.selectedSessionId != null) return state.selectedSessionId;
  const title = window.ImageToolsWorkbench.deriveSessionTitle(prompt);
  const session = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then(readJson);
  await loadSessions();
  state = window.ImageToolsWorkbench.selectSession(state, session.id);
  return session.id;
}
```

Use `PATCH /api/sessions/{id}` from the rename form and `DELETE /api/sessions/{id}` from the delete dialog. After deletion, return to the new-task draft. Wire search-toggle expansion and Escape collapse.

The task-title More button must open a menu containing Rename and Delete; neither action may be a dead icon. The sidebar footer Settings button and the primary Providers row both open `providerDialog` from Task 4.

- [ ] **Step 5: Verify state, renderer, and existing session API tests**

Run:

```bash
node --test tests/frontend_workbench.test.js tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
pytest -q tests/test_session_api.py
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/ui.js frontend/index.html frontend/styles.css frontend/app.js tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
git commit -m "feat(sessions): add Codex task drafts and dialogs"
```

## Task 4: Add Provider Management In An App Dialog

**Files:**
- Modify: `frontend/ui.js`
- Modify: `frontend/app.js`
- Modify: `frontend/index.html`
- Modify: `frontend/styles.css`
- Modify: `tests/frontend_ui.test.js`

- [ ] **Step 1: Write failing Provider renderer tests**

```javascript
test("renderProviderList exposes selection and edit actions without API keys", () => {
  const dom = new JSDOM('<div id="providers"></div>');
  ui.renderProviderList(dom.window.document.querySelector("#providers"), [{ id: 2, name: "Default", defaultModel: "gpt-image-2", apiKeySet: true }], 2, () => {});
  const row = dom.window.document.querySelector("[data-provider-id='2']");
  assert.match(row.textContent, /Default/);
  assert.match(row.textContent, /gpt-image-2/);
  assert.doesNotMatch(row.textContent, /sk-/);
});

test("provider payload is complete and an empty key means preserve", () => {
  assert.deepEqual(workbench.buildProviderPayload({ name: "Primary", baseUrl: "https://api.example/v1", apiKey: "", defaultModel: "gpt-image-2", isDefault: true }), {
    name: "Primary",
    base_url: "https://api.example/v1",
    api_key: "",
    default_model: "gpt-image-2",
    is_default: true,
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/frontend_ui.test.js`

Expected: failure because `renderProviderList` is missing.

- [ ] **Step 3: Implement Provider dialog rendering and CRUD orchestration**

The dialog contains a provider list and a single editor form with `providerName`, `providerBaseUrl`, `providerApiKey`, `providerDefaultModel`, and `providerIsDefault`. Render only `apiKeySet`; never place a saved key in DOM state, and reset the password input to `""` every time the editor opens. Add and test `buildProviderPayload` in `workbench.js`; PATCH sends the complete payload because the backend endpoint is replacement-style, and an empty `api_key` deliberately preserves the stored key.

Use exact endpoints:

```javascript
const method = editingProviderId == null ? "POST" : "PATCH";
const url = editingProviderId == null ? "/api/providers" : `/api/providers/${editingProviderId}`;
await fetch(url, {
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, base_url, api_key, default_model, is_default }),
}).then(readJson);
```

Delete with `DELETE /api/providers/{id}` and set default with `POST /api/providers/{id}/default`. Reload providers after every mutation. Preserve the active selection when it still exists; otherwise choose the explicit default, then the first remaining Provider, and update the model from that Provider. If none remain, clear the selection/model fallback, disable submit, and show the Provider setup action. Cover deleting the current/default Provider and switching the default in UI tests.

- [ ] **Step 4: Add dialog styling and keyboard behavior**

Use a maximum width of `720px`, two columns above `680px`, one column below it, stable 34px fields, a masked API-key placeholder, and explicit Save/Cancel/Delete commands. Escape closes; submit remains disabled while the request is active.

- [ ] **Step 5: Verify UI and Provider API contracts**

Run:

```bash
node --test tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
pytest -q tests/test_provider_api.py
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/ui.js frontend/app.js frontend/index.html frontend/styles.css tests/frontend_ui.test.js
git commit -m "feat(providers): add desktop provider dialog"
```

## Task 5: Build The Layered Composer And Parameter Menus

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/styles.css`
- Modify: `frontend/app.js`
- Modify: `frontend/ui.js`
- Modify: `tests/frontend_workbench.test.js`
- Modify: `tests/frontend_ui_contract.test.js`

- [ ] **Step 1: Write failing Composer contract and keyboard tests**

```javascript
test("Composer keeps controls in context and popover layers", () => {
  assert.match(html, /class="composer-context"/);
  assert.match(html, /id="parameterMenu"/);
  assert.match(html, /id="advancedParamsPanel"/);
  assert.match(html, /id="referenceInput"/);
  assert.match(html, /id="providerSelect"/);
  assert.doesNotMatch(html, /class="composer-controls"/);
});
```

Add a pure `shouldSubmitComposer({ key, shiftKey, isComposing })` test: Enter submits, Shift+Enter does not, and IME composition never submits.

Add tests for `normalizeComposerForReference`: selecting a reference forces `count: 1` because the current edit API returns one image; removing it re-enables count selection without inventing extra edit results. Reuse `preferences.supportsTransparentBackground(model, outputFormat)` so changing to an unsupported model/format resets transparent background to `auto`.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/frontend_workbench.test.js tests/frontend_ui_contract.test.js`

Expected: failure for the new Composer structure and keyboard helper.

- [ ] **Step 3: Implement the stable Composer structure**

The top context row contains the reference preview/removal and a Provider/model button. The text area sits in the middle. The bottom toolbar contains Add, Parameters, the `parameterSummary`, optional voice-disabled placeholder removal, and the circular ArrowUp submit button. Preserve all generation field IDs inside the parameter and advanced panels.

Implement text-area growth:

```javascript
function resizePrompt() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 144)}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > 144 ? "auto" : "hidden";
}
```

Implement one-open-layer behavior: opening Parameters closes Provider/reference menus; outside click and Escape close the active layer and restore focus. `aria-expanded` must match `hidden` state.

- [ ] **Step 4: Wire reference, Provider/model, common, and advanced parameters**

`+` opens upload/reference actions; uploaded files appear in the context row with a 32px preview and remove icon. Selecting any reference forces count to 1 and disables the count selector until the reference is removed. Parameter controls update the summary immediately. Advanced fields remain `output_format`, `output_compression`, `background`, and `moderation`; transparent background is disabled/reset when the selected model or output format cannot support it. Provider changes update model fallback but preserve a manually edited model until a different Provider is chosen.

- [ ] **Step 5: Verify Composer logic and frontend suite**

Run: `node --test tests/frontend_workbench.test.js tests/frontend_ui.test.js tests/frontend_ui_contract.test.js`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/styles.css frontend/app.js frontend/ui.js tests/frontend_workbench.test.js tests/frontend_ui_contract.test.js
git commit -m "feat(composer): add layered image controls"
```

## Task 6: Render The Task Stream And Reconcile Generation Status

**Files:**
- Modify: `frontend/ui.js`
- Modify: `frontend/app.js`
- Modify: `frontend/styles.css`
- Modify: `backend/main.py`
- Modify: `tests/frontend_ui.test.js`
- Modify: `tests/frontend_workbench.test.js`
- Modify: `tests/test_generation_history.py`

- [ ] **Step 1: Write failing renderer tests for running, success, and failure**

```javascript
test("renderTaskRuns keeps success and failure in one chronological stream", () => {
  const dom = new JSDOM('<section id="timeline"></section>');
  ui.renderTaskRuns(dom.window.document.querySelector("#timeline"), [
    { id: 1, status: "succeeded", prompt: "夏季海报", parameters: { count: 2 }, images: [{ url: "/files/images/1.png" }] },
    { id: 2, status: "failed", prompt: "提高对比度", parameters: {}, error_message: "上游超时", images: [] },
  ], {});
  assert.equal(dom.window.document.querySelectorAll(".task-run").length, 2);
  assert.equal(dom.window.document.querySelectorAll(".result-image").length, 1);
  assert.match(dom.window.document.querySelector(".run-error").textContent, /上游超时/);
});

test("reconcileSubmission keeps a local failure when no server run was created", () => {
  const pending = workbench.createOptimisticRun({ prompt: "海报", count: 1 }, "local-1");
  const runs = workbench.reconcileSubmission([], pending, 0, "网络连接失败");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].error_message, "网络连接失败");
});
```

Add a backend test using `TestClient(main.app, raise_server_exceptions=False)` and an `UnexpectedImageApiClient` whose `generate()` raises `RuntimeError("disk failed")`. Assert HTTP 500 and that the created run is `failed` rather than `running`. Run this pytest in Step 2 so the backend behavior is observed RED before implementation.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/frontend_ui.test.js tests/frontend_workbench.test.js
pytest -q tests/test_generation_history.py
```

Expected: frontend failure because `renderTaskRuns` is missing and backend failure because the unexpected exception leaves the run `running`.

- [ ] **Step 3: Implement the task stream renderer**

Each `.task-run` renders a right-aligned prompt surface followed by a left-aligned response. Running shows a spinner and fixed-aspect skeletons without a fake percentage. Success renders a stable 1/2/3/4-image grid. Failure renders an inline error summary and Retry, Copy Error, and Details actions. Add `imagePreviewDialog` to `index.html`; Preview opens the image in this dialog instead of `window.open`, so the desktop workflow never escapes to a browser tab.

Expose callbacks:

```javascript
renderTaskRuns(container, runs, {
  onPreview,
  onDownload,
  onCopyLink,
  onSetReference,
  onContinue,
  onRetry,
  onCopyError,
  onCopyParameters,
});
```

Use icon buttons with accessible names for Preview, Download, Copy, Reference, and More. Keep “基于结果继续” and “重试” as explicit text commands.

- [ ] **Step 4: Add optimistic submission and reconciliation**

Before `fetch('/api/generate')`, create a unique `submissionId`, record the current server-run count, insert `createOptimisticRun` at `pendingRunsBySession[sessionId][submissionId]`, and render only that session's pending rows. Disable duplicate submit while the same Composer payload is in flight, but allow a different session to submit independently. Late responses reconcile by both `sessionId` and `submissionId`, so switching sessions cannot remove another session's pending row.

After the request completes, reload server runs. `reconcileSubmission(serverRuns, pending, previousServerCount, errorMessage)` discards the pending row when the server added a persisted run; when the server count is unchanged and the request failed, it retains that row as a local `failed` item with Retry and Copy Error actions. Clear the submitted draft only after the refreshed server list proves a new run was persisted. Pre-validation failures and network failures without a new server run preserve the draft.

Add and export this pure helper from `workbench.js`:

```javascript
function reconcileSubmission(serverRuns, pendingRun, previousServerCount, errorMessage) {
  if (serverRuns.length > previousServerCount) return serverRuns;
  if (!errorMessage) return serverRuns;
  return [
    ...serverRuns,
    {
      ...pendingRun,
      status: "failed",
      error_message: String(errorMessage),
    },
  ];
}
```

When first submit creates a session but `/api/generate` fails before reaching the backend, keep the selected session and the local failed row so the user can retry without creating another session.

In `backend/main.py`, keep the existing `ApiError -> 502` branch and add a second exception branch after it:

```python
    except Exception as exc:
        if "run" in locals():
            store.finish_generation_run(run.id, status="failed", error_message=str(exc))
        raise
```

This preserves FastAPI's 500 behavior while ensuring unexpected file/client failures do not strand durable runs in `running`.

The persistence boundary is explicit: failures before `create_generation_run` (invalid request, missing Provider, reference-file write failure, or connection failure before the server receives the request) are local failed rows only; failures after run creation must update SQLite to `failed`. Do not move run creation earlier in this UI ticket because that would change reference-path and validation semantics.

- [ ] **Step 5: Verify renderer and backend history behavior**

Run:

```bash
node --test tests/frontend_workbench.test.js tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
pytest -q tests/test_generation_history.py tests/test_session_api.py
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/ui.js frontend/app.js frontend/styles.css backend/main.py tests/frontend_ui.test.js tests/frontend_workbench.test.js tests/test_generation_history.py
git commit -m "feat(timeline): render image tasks as a stream"
```

## Task 7: Add Playwright Accessibility And Visual Verification

**Files:**
- Create: `playwright.config.js`
- Create: `tests/ui/codex_windows.spec.js`
- Create: `tests/ui/helpers.js`
- Create: `tests/ui/codex_windows.spec.js-snapshots/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.mise.toml`
- Modify: `.gitignore`
- Modify: frontend files only where tests expose accessibility or layout defects

- [ ] **Step 1: Install Playwright and add scripts**

Run:

```bash
npm install --save-dev @playwright/test@1.61.1
npx playwright install chromium
```

Add scripts `test:ui` as `playwright test` and `test:ui:update` as `playwright test --update-snapshots`. Add a `.mise.toml` task `ui-test` that runs `npm run test:ui`. Ignore `test-results/` and `playwright-report/`.

- [ ] **Step 2: Configure a deterministic local server**

```javascript
const { defineConfig } = require("@playwright/test");
const path = require("node:path");

module.exports = defineConfig({
  testDir: "tests/ui",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:8765", trace: "retain-on-failure" },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  webServer: {
    command: "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765",
    url: "http://127.0.0.1:8765/api/health",
    reuseExistingServer: false,
    env: { ...process.env, IMAGE_TOOLS_DATA_DIR: path.join(__dirname, "test-results/playwright-data") },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

`tests/ui/helpers.js` must route `/api/providers`, `/api/sessions`, `/api/sessions/*/runs`, `/api/generate`, and image URLs with fixed JSON/binary fixtures so tests never call an upstream image API or mutate local SQLite. Use an in-memory fixture state:

```javascript
async function installApiMocks(page, overrides = {}) {
  const state = {
    sessionsCreated: 0,
    requestLog: [],
    generateBodies: [],
    sessions: [{ id: 1, title: "夏季饮品广告图", updated_at: "2026-07-10T12:00:00Z" }],
    providers: overrides.providers ?? [{ id: 1, name: "Default", default_model: "gpt-image-2", is_default: true, api_key_set: true }],
    runs: { 1: [] },
  };
  await page.route("**/api/providers", route => route.fulfill({ json: state.providers }));
  await page.route("**/api/sessions", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const session = { id: 2, title: body.title, updated_at: "2026-07-10T12:01:00Z" };
      state.sessionsCreated += 1;
      state.requestLog.push("session");
      state.sessions.unshift(session);
      state.runs[2] = [];
      return route.fulfill({ status: 200, json: session });
    }
    return route.fulfill({ json: state.sessions });
  });
  await page.route(/\/api\/sessions\/(\d+)\/runs$/, route => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    return route.fulfill({ json: state.runs[id] || [] });
  });
  await page.route("**/api/generate", route => {
    const body = route.request().postData() || "";
    state.requestLog.push("generate");
    state.generateBodies.push(body);
    const sessionId = Number(body.match(/name="session_id"\r\n\r\n(\d+)/)?.[1] || 0);
    state.runs[sessionId] = [...(state.runs[sessionId] || []), { id: 20, status: "succeeded", prompt: "夏季饮品海报", parameters: { count: 1 }, images: [] }];
    return route.fulfill({ json: { kind: "text_to_image", model: "gpt-image-2", size: "1024x1024", images: [] } });
  });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:8765") return route.abort("blockedbyclient");
    return route.fallback();
  });
  return state;
}

module.exports = { installApiMocks };
```

- [ ] **Step 3: Write failing keyboard and layout tests**

```javascript
test("new task creates a session only on first valid submit", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天想创作什么？" })).toBeVisible();
  await expect.poll(() => requests.sessionsCreated).toBe(0);
  await page.getByPlaceholder("描述你想生成的图片").fill("夏季饮品海报");
  await page.getByPlaceholder("描述你想生成的图片").press("Enter");
  await expect.poll(() => requests.sessionsCreated).toBe(1);
  expect(requests.requestLog).toEqual(["session", "generate"]);
  expect(requests.generateBodies[0]).toContain('name="session_id"\r\n\r\n2');
});

test("missing Provider opens settings without creating a session", async ({ page }) => {
  const requests = await installApiMocks(page, { providers: [] });
  await page.goto("/");
  await page.getByPlaceholder("描述你想生成的图片").fill("夏季饮品海报");
  await page.getByPlaceholder("描述你想生成的图片").press("Enter");
  await expect(page.getByRole("dialog", { name: "Providers" })).toBeVisible();
  await expect.poll(() => requests.sessionsCreated).toBe(0);
});

test("menus close with Escape and restore trigger focus", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "图片参数" });
  await trigger.click();
  await expect(page.getByRole("menu", { name: "图片参数" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("Lucide is served locally and no CDN is needed", async ({ request }) => {
  const response = await request.get("/static/vendor/lucide.min.js");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("createIcons");
});
```

Run: `npm run test:ui`

Expected: at least one failure for keyboard focus, dialog behavior, or missing snapshots.

- [ ] **Step 4: Fix accessibility and overflow failures**

Ensure dialogs trap focus, menus implement arrow-key movement, Escape restores focus, every icon button has an accessible name and tooltip, and no interactive element is clipped at `960x640`. Use stable dimensions rather than font scaling. Add request-order assertions proving session POST precedes multipart generate, the returned session ID is the submitted `session_id`, rapid double-submit creates only one session, and retry after a pre-server network failure reuses the already-created session.

- [ ] **Step 5: Add four visual baselines and overlap assertions**

For `1280x860` and `960x640`, capture both `colorScheme: 'light'` and `colorScheme: 'dark'`. Also capture parameter menu, Provider dialog, running, success, and failure states. Assert `scrollWidth <= clientWidth` for shell, sidebar, timeline, Composer, open menu, and dialog, and assert the Composer bounding box does not intersect the last task-run bounding box after scrolling to bottom.

```javascript
for (const viewport of [{ width: 1280, height: 860 }, { width: 960, height: 640 }]) {
  for (const colorScheme of ["light", "dark"]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(page.locator(".app-shell")).toHaveScreenshot(
      `shell-${viewport.width}x${viewport.height}-${colorScheme}.png`,
      { animations: "disabled" },
    );
  }
}
```

Before each screenshot wait for `document.fonts.ready`, inject `*, *::before, *::after { animation: none !important; transition: none !important; }`, and verify `/api/health` returns `{ app: "Image Tools" }`. Add tests that change `page.emulateMedia()` after load, use a 200-character CJK session/prompt, and delay mocked image responses to prove fixed image aspect ratios prevent layout movement.

Run: `npm run test:ui:update`

Expected: snapshot files created.

Run: `npm run test:ui`

Expected: all Playwright tests pass with no screenshot differences.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .mise.toml .gitignore playwright.config.js tests/ui frontend
git commit -m "test(ui): verify Codex Windows experience"
```

## Task 8: Update Knowledge And Run Release-Grade Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/api/gpt-image-api-frontend-adapter.md`
- Modify: `knowledge/01-project-overview.md`
- Modify: `knowledge/02-requirements.md`
- Modify: `knowledge/03-tech-stack.md`
- Create: `knowledge/08-testing-strategy.md`
- Modify: `knowledge/10-lessons-learned.md`
- Modify: frontend/tests only for defects found by verification

- [ ] **Step 1: Document the finalized stack and verification commands**

Replace the stale placeholders in `knowledge/01-project-overview.md` and `knowledge/02-requirements.md` with the confirmed Windows-first product scope and this spec's requirements. Record vanilla JS + jsdom + local Lucide + Playwright in `knowledge/03-tech-stack.md`. In `knowledge/08-testing-strategy.md`, document the unit/API/visual/Tauri layers and exact commands. Update README with `mise run desktop-dev`, `mise run test`, `mise run ui-test`, and the requirement that Windows screenshots are the final fidelity authority. Update `docs/api/gpt-image-api-frontend-adapter.md` so its frontend mapping describes the layered Composer rather than the removed permanent form controls.

- [ ] **Step 2: Run formatting and generated-asset checks**

Run:

```bash
npm run frontend:vendor
git diff --check
node --check frontend/workbench.js
node --check frontend/ui.js
node --check frontend/app.js
! rg -n 'https?://.*(lucide|unpkg|jsdelivr)' frontend/index.html frontend/*.js
```

Expected: all commands exit 0, vendor generation produces no unexpected diff, and no icon CDN is referenced. A Playwright request test must return HTTP 200 for `/static/vendor/lucide.min.js`; `tests/test_bundle_backend.py` must still prove the entire `frontend/` directory is included in the PyInstaller sidecar.

- [ ] **Step 3: Run the complete automated suite**

Run:

```bash
mise run test
mise run ui-test
mise run desktop-check
```

Expected: pytest, Node, Playwright, and Cargo checks all pass. The existing Starlette deprecation warning may remain, but no test may fail.

- [ ] **Step 4: Perform desktop smoke verification**

Run: `mise run desktop-dev`

Verify at `1280x860` and the `960x640` minimum that the native titlebar remains visible, the empty new-task page opens, session switching works, menus stay in bounds, reference upload renders, system theme changes without restart, and Python/frontend hot reload still works. On Linux, record WebKitGTK differences as non-authoritative; perform final pixel comparison on the Windows WebView2 build.

On a Windows runner or workstation, run `npm run desktop:build:windows`, install or launch the generated x64 bundle, and capture four WebView2 screenshots: `1280x860` light, `1280x860` dark, `960x640` light, and `960x640` dark. Compare them with the approved reference for titlebar, sidebar width, blank canvas, task stream, and Composer geometry. These four artifacts, not Chromium/Linux baselines, are the pixel-fidelity completion evidence.

- [ ] **Step 5: Preserve lessons and commit**

Add resolved platform/rendering lessons to `knowledge/10-lessons-learned.md`, then run `git status --short` and confirm only intended files remain.

```bash
git add README.md docs/api/gpt-image-api-frontend-adapter.md knowledge/01-project-overview.md knowledge/02-requirements.md knowledge/03-tech-stack.md knowledge/08-testing-strategy.md knowledge/10-lessons-learned.md
git commit -m "docs(ui): record Codex Windows verification"
```

## Execution Order And Gates

1. Tasks 1-2 establish state and visual infrastructure.
2. Task 3 depends on Tasks 1-2.
3. Task 4 depends on Task 3.
4. Task 5 depends on Tasks 2-4.
5. Task 6 depends on Tasks 1, 3, and 5.
6. Task 7 depends on Tasks 2-6 and is the visual acceptance gate.
7. Task 8 depends on all implementation tasks and is the completion gate.

Do not move to the next task with a red narrow test. Do not claim Windows pixel parity from Linux screenshots; only the Windows WebView2 run closes that risk.
