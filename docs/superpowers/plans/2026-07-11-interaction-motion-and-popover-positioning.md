# Interaction Motion And Popover Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restrained Windows-style interaction motion, anchor Composer popovers to their triggers, and make Provider Cancel close its dialog.

**Architecture:** Put pure positioning math and reusable layer/dialog lifecycle helpers in `frontend/ui.js`; keep business events in `frontend/app.js`; express visual timing and reduced-motion behavior in `frontend/styles.css`. Unit and DOM tests prove algorithms and lifecycle behavior, while Playwright proves real browser geometry, focus, viewport bounds, and motion preferences.

**Tech Stack:** Vanilla JavaScript, CSS keyframes, native `<dialog>`, jsdom, Node test runner, Playwright Chromium

---

### Task 1: Add Pure Anchored Positioning

**Files:**
- Modify: `tests/frontend_ui.test.js`
- Modify: `frontend/ui.js`

- [ ] **Step 1: Write failing positioning tests**

Add focused tests for preferred top placement, bottom fallback, and viewport clamping:

```js
test("anchoredLayerPosition aligns top-start and clamps to the viewport", () => {
  assert.deepEqual(
    ui.anchoredLayerPosition({
      anchor: { top: 500, right: 260, bottom: 530, left: 160 },
      layer: { width: 240, height: 180 },
      viewport: { width: 960, height: 640 },
    }),
    { left: 160, top: 312, placement: "top" },
  );

  assert.deepEqual(
    ui.anchoredLayerPosition({
      anchor: { top: 20, right: 70, bottom: 50, left: 10 },
      layer: { width: 240, height: 180 },
      viewport: { width: 220, height: 640 },
    }),
    { left: 12, top: 58, placement: "bottom" },
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-name-pattern="anchoredLayerPosition" tests/frontend_ui.test.js`

Expected: FAIL because `ui.anchoredLayerPosition` does not exist.

- [ ] **Step 3: Implement the pure calculation**

Add and export `anchoredLayerPosition({ anchor, layer, viewport, gap = 8, padding = 12 })`. Prefer top when it fits, fall back below when only below fits, and clamp both axes to the padded viewport.

```js
function anchoredLayerPosition({ anchor, layer, viewport, gap = 8, padding = 12 }) {
  const topPosition = anchor.top - layer.height - gap;
  const bottomPosition = anchor.bottom + gap;
  const fitsAbove = topPosition >= padding;
  const fitsBelow = bottomPosition + layer.height <= viewport.height - padding;
  const placement = fitsAbove || !fitsBelow ? "top" : "bottom";
  const desiredTop = placement === "top" ? topPosition : bottomPosition;
  const maxLeft = Math.max(padding, viewport.width - layer.width - padding);
  const maxTop = Math.max(padding, viewport.height - layer.height - padding);
  return {
    left: Math.min(Math.max(anchor.left, padding), maxLeft),
    top: Math.min(Math.max(desiredTop, padding), maxTop),
    placement,
  };
}
```

- [ ] **Step 4: Run focused and complete UI unit tests**

Run: `node --test tests/frontend_ui.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit positioning math**

```bash
git add frontend/ui.js tests/frontend_ui.test.js
git commit -m "feat(ui): calculate anchored popover positions"
```

### Task 2: Centralize Layer Lifecycle And Fix Provider Cancel

**Files:**
- Modify: `tests/frontend_ui.test.js`
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `frontend/ui.js`
- Modify: `frontend/app.js`

- [ ] **Step 1: Write failing lifecycle and binding tests**

Add a jsdom test that stubs rectangles and verifies an anchored layer is positioned and updates `aria-expanded`:

```js
test("openAnchoredLayer positions the layer and closeLayer restores focus", async () => {
  const dom = new JSDOM('<button id="trigger"></button><div id="menu" hidden></div>');
  const trigger = dom.window.document.querySelector("#trigger");
  const menu = dom.window.document.querySelector("#menu");
  trigger.getBoundingClientRect = () => ({ top: 500, bottom: 530, left: 160, right: 260 });
  menu.getBoundingClientRect = () => ({ width: 240, height: 180 });
  Object.defineProperty(dom.window, "innerWidth", { value: 960 });
  Object.defineProperty(dom.window, "innerHeight", { value: 640 });

  ui.openAnchoredLayer(menu, trigger);
  assert.equal(menu.style.left, "160px");
  assert.equal(menu.style.top, "312px");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  await ui.closeLayer(menu, trigger, { restoreFocus: true });
  assert.equal(menu.hidden, true);
  assert.equal(dom.window.document.activeElement, trigger);
});
```

Add a static contract assertion:

```js
const app = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");
assert.match(app, /providerCancelBtn\.addEventListener\("click", closeProviderDialog\)/);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/frontend_ui.test.js tests/frontend_ui_contract.test.js`

Expected: failures for missing layer helpers and the old Provider Cancel binding.

- [ ] **Step 3: Implement reusable layer lifecycle helpers**

In `frontend/ui.js`, add:

- `openLayer(layer, trigger, options)`
- `openAnchoredLayer(layer, trigger, options)`
- `positionAnchoredLayer(layer, trigger, options)`
- `closeLayer(layer, trigger, options)`
- `isLayerOpen(layer)`

Track each layer with a `WeakMap` token. Opening cancels stale close completion; closing waits for `element.getAnimations({ subtree: true })` when supported, then hides only if its token remains current. In jsdom or reduced-motion mode, no animations exist and close completes immediately.

- [ ] **Step 4: Route application interactions through the helpers**

Replace direct `hidden` mutations for parameter, reference, and task menus with the lifecycle helpers. Parameter and reference menus call `openAnchoredLayer`; task menu calls `openLayer` with bottom placement. Add a resize listener that repositions open Composer menus.

Replace:

```js
providerCancelBtn.addEventListener("click", startNewProvider);
```

with:

```js
providerCancelBtn.addEventListener("click", closeProviderDialog);
```

Use the same close path for Escape, outside click, close icons, and menu switching. Restore focus only for explicit Escape/toggle/dialog closes, not for outside clicks or when another layer is opening.

- [ ] **Step 5: Run Node tests**

Run: `node --test tests/frontend_ui.test.js tests/frontend_ui_contract.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit lifecycle behavior**

```bash
git add frontend/ui.js frontend/app.js tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
git commit -m "fix(ui): anchor menus and close Provider settings"
```

### Task 3: Add Restrained Motion And Reduced-Motion Fallback

**Files:**
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `frontend/styles.css`

- [ ] **Step 1: Write failing CSS contract tests**

Assert the stylesheet contains popover/dialog entry and exit states, the approved timings, and a reduced-motion media query:

```js
test("temporary layers use restrained motion with a reduced-motion fallback", () => {
  assert.match(styles, /\.popover\[data-motion="opening"\]/);
  assert.match(styles, /\.app-dialog\[data-motion="closing"\]/);
  assert.match(styles, /--motion-fast:\s*120ms/);
  assert.match(styles, /--motion-dialog:\s*160ms/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test --test-name-pattern="restrained motion" tests/frontend_ui_contract.test.js`

Expected: FAIL because the motion tokens and states are absent.

- [ ] **Step 3: Add motion tokens and component animations**

Define `--motion-control: 100ms`, `--motion-fast: 120ms`, `--motion-content: 150ms`, `--motion-dialog: 160ms`, and a standard easing curve. Add:

- Popover/menu opening and closing keyframes with opacity, 4px shift, and scale 0.985.
- Dialog opening/closing keyframes and matching backdrop opacity keyframes.
- Control hover/pressed transitions without changing layout dimensions.
- Search panel, Toast, empty state, and task-run entrance motion.
- `@media (prefers-reduced-motion: reduce)` that removes transitions and animations.

Remove fixed `right`, `bottom`, and formula-based placement from `.parameter-menu` and `.reference-menu`; inline coordinates from `ui.js` become authoritative.

- [ ] **Step 4: Run frontend tests**

Run: `node --test tests/*.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit motion styling**

```bash
git add frontend/styles.css tests/frontend_ui_contract.test.js
git commit -m "feat(ui): add restrained interaction motion"
```

### Task 4: Prove Browser Geometry And Cancel Behavior

**Files:**
- Modify: `tests/ui/codex_windows.spec.js`
- Update only if intentional rendering changes require it: `tests/ui/codex_windows.spec.js-snapshots/*.png`

- [ ] **Step 1: Add failing browser interaction tests**

Add a bounding-box helper and tests that:

- Open the parameter menu at `1280x860` and `960x640`.
- Assert its left edge is within 1px of the trigger left edge.
- Assert the resolved gap is 8px and the layer remains within a 12px viewport inset.
- Resize while open and repeat the assertions.
- Open the reference menu and verify the same anchoring contract.
- Open Providers from the sidebar, click Cancel, assert the dialog is hidden, and assert the sidebar opener regains focus.
- Emulate reduced motion, open a menu, and assert it has no active animation.

- [ ] **Step 2: Run selected Playwright tests and verify RED where applicable**

Run: `npm run test:ui -- --grep "anchored|Provider Cancel|reduced motion"`

Expected before final implementation adjustment: positioning and Cancel assertions expose any remaining browser-level mismatch.

- [ ] **Step 3: Make the smallest browser-specific corrections**

Adjust only measurement timing, resize repositioning, or animation completion semantics needed by the failing assertions. Do not introduce viewport-specific hardcoded coordinates.

- [ ] **Step 4: Run the complete Playwright suite**

Run: `npm run test:ui`

Expected: all interaction and screenshot tests pass. If screenshot baselines change intentionally, regenerate with `npm run test:ui:update` and inspect every changed PNG before committing.

- [ ] **Step 5: Commit browser verification**

```bash
git add tests/ui/codex_windows.spec.js tests/ui/codex_windows.spec.js-snapshots
git commit -m "test(ui): verify anchored animated interactions"
```

### Task 5: Preserve Learning And Run Release-Grade Verification

**Files:**
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/08-testing-strategy.md`
- Modify: `knowledge/09-decisions.md`
- Modify: `knowledge/10-lessons-learned.md`

- [ ] **Step 1: Record the completed interaction work**

Add an interaction ticket to `knowledge/04-task-list.md`. Document anchored-layer browser checks in the testing strategy, record the decision to avoid CSS Anchor Positioning for WebView2 compatibility, and record the fixed-position formula and misbound Cancel event as reusable lessons.

- [ ] **Step 2: Run frontend vendor drift and static checks**

Run: `npm run frontend:vendor && git diff --exit-code -- frontend/vendor frontend/assets/app-icon.png`

Run: `git diff --check`

Expected: both commands exit 0.

- [ ] **Step 3: Run complete Python and Node suites**

Run: `pytest -q`

Expected: all Python tests pass.

Run: `node --test tests/*.test.js`

Expected: all Node tests pass.

- [ ] **Step 4: Run complete Playwright and Cargo checks**

Run: `npm run test:ui`

Expected: all Playwright tests pass.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: Cargo exits 0.

- [ ] **Step 5: Verify the live Web entry**

Open `http://127.0.0.1:7860`, test Parameter, Reference, Provider Cancel, Escape, outside click, and viewport resizing, and capture a final screenshot plus bounding-box evidence at `1280x860` and `960x640`.

- [ ] **Step 6: Commit knowledge updates**

```bash
git add knowledge/04-task-list.md knowledge/08-testing-strategy.md knowledge/09-decisions.md knowledge/10-lessons-learned.md
git commit -m "docs(ui): record anchored interaction verification"
```
