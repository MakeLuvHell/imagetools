# Three-Mode Theme Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished Appearance setting with system, light, and dark modes that restores before first content paint, persists on the current device, and synchronizes the Tauri native titlebar.

**Architecture:** Add a focused `frontend/theme.js` IIFE for normalized device-local theme state and early root-attribute bootstrap. Keep settings orchestration in `frontend/app.js`, express manual themes through the existing CSS token system, and add one narrow Tauri command that maps the same three values to the native window theme. No backend, SQLite, or workspace-storage contract changes.

**Tech Stack:** Vanilla HTML/CSS/JavaScript IIFEs, Node test runner, Playwright 1.61.1, local Lucide 1.24.0, Tauri 2.11.5/Rust 1.96.1, existing FastAPI test server.

---

## File Map

- Create `frontend/theme.js`: normalize, read, persist, apply, bootstrap, and build native theme-command arguments.
- Create `tests/frontend_theme.test.js`: pure theme-state and failure-path coverage.
- Modify `frontend/index.html`: pre-style theme bootstrap, Appearance navigation/panel, radio segments, and status region.
- Modify `frontend/styles.css`: explicit manual theme token overrides and segmented-control styling.
- Modify `frontend/app.js`: three-tab settings navigation, theme persistence, native synchronization, errors, and stale-response protection.
- Modify `tests/frontend_ui_contract.test.js`: script order, semantic Appearance structure, and CSS theme contracts.
- Modify `tests/ui/codex_windows.spec.js`: three-mode behavior, persistence, system changes, errors, storage navigation, native-command mocks, containment, and visuals.
- Modify `src-tauri/src/main.rs`: theme-value mapping, native window command, handler registration, and Rust tests.
- Modify `tests/test_tauri_config.py`: static native-theme command contract.
- Create and update `tests/ui/codex_windows.spec.js-snapshots/*.png`: four Appearance baselines and sixteen sidebar-adjusted settings baselines.
- Modify `knowledge/01-project-overview.md`, `knowledge/02-requirements.md`, `knowledge/03-tech-stack.md`, `knowledge/04-task-list.md`, `knowledge/05-review-notes.md`, `knowledge/08-testing-strategy.md`, `knowledge/09-decisions.md`, and `knowledge/10-lessons-learned.md`: record the final product, data, and verification boundaries.

No change belongs in `CONTEXT.md`, backend Python, SQLite migrations, storage bootstrap, or API schemas.

### Task 1: Build The Pre-Paint Theme State Module

**Files:**
- Create: `tests/frontend_theme.test.js`
- Create: `frontend/theme.js`
- Modify: `tests/frontend_ui_contract.test.js:91-114`
- Modify: `frontend/index.html:2-8,536-541`

- [ ] **Step 1: Write the failing pure theme-state tests**

Create `tests/frontend_theme.test.js`:

```javascript
const assert = require("node:assert/strict");
const test = require("node:test");

const theme = require("../frontend/theme.js");

class MemoryStorage {
  constructor(seed = {}) {
    this.data = new Map(Object.entries(seed));
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }
}

test("normalizeMode accepts only system light and dark", () => {
  assert.equal(theme.normalizeMode("system"), "system");
  assert.equal(theme.normalizeMode("light"), "light");
  assert.equal(theme.normalizeMode("dark"), "dark");
  assert.equal(theme.normalizeMode("sepia"), "system");
  assert.equal(theme.normalizeMode(null), "system");
});

test("readMode defaults invalid or missing values to system", () => {
  assert.deepEqual(theme.readMode(new MemoryStorage()), {
    mode: "system",
    error: "",
  });
  assert.deepEqual(
    theme.readMode(new MemoryStorage({ [theme.STORAGE_KEY]: "sepia" })),
    { mode: "system", error: "" },
  );
});

test("readMode and saveMode contain localStorage failures", () => {
  const broken = {
    getItem() {
      throw new Error("read blocked");
    },
    setItem() {
      throw new Error("write blocked");
    },
  };
  assert.deepEqual(theme.readMode(broken), {
    mode: "system",
    error: "无法读取主题偏好。",
  });
  assert.deepEqual(theme.saveMode(broken, "dark"), {
    mode: "dark",
    error: "主题偏好无法保存。",
  });
});

test("saveMode persists normalized values and applyMode updates the root", () => {
  const storage = new MemoryStorage();
  const root = { dataset: {} };

  assert.deepEqual(theme.saveMode(storage, "dark"), {
    mode: "dark",
    error: "",
  });
  assert.equal(storage.getItem("image-tools-theme"), "dark");
  assert.equal(theme.applyMode(root, "dark"), "dark");
  assert.equal(root.dataset.theme, "dark");
  assert.deepEqual(theme.nativeArgs("sepia"), { mode: "system" });
});

test("bootstrap restores the stored mode before app orchestration", () => {
  const root = { dataset: {} };
  const result = theme.bootstrap(
    root,
    new MemoryStorage({ "image-tools-theme": "light" }),
  );

  assert.deepEqual(result, { mode: "light", error: "" });
  assert.equal(root.dataset.theme, "light");
});
```

- [ ] **Step 2: Add the failing pre-paint script-order contract**

In `tests/frontend_ui_contract.test.js`, replace the expected source list in `offline icon scripts load before application orchestration` with:

```javascript
assert.deepEqual(sources, [
  "/static/theme.js",
  "/static/preferences.js",
  "/static/workbench.js",
  "/static/vendor/lucide.min.js",
  "/static/icons.js",
  "/static/ui.js",
  "/static/app.js",
]);
assert.ok(
  html.indexOf('<script src="/static/theme.js"></script>') <
    html.indexOf('<link rel="stylesheet" href="/static/styles.css" />'),
  "theme bootstrap loads before the stylesheet",
);
assert.equal(fs.existsSync(path.join(root, "frontend", "theme.js")), true);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test tests/frontend_theme.test.js tests/frontend_ui_contract.test.js
```

Expected: FAIL because `frontend/theme.js` and the early script tag do not exist.

- [ ] **Step 4: Implement the focused theme module**

Create `frontend/theme.js`:

```javascript
(function initTheme(globalScope) {
  const STORAGE_KEY = "image-tools-theme";
  const VALID_MODES = new Set(["system", "light", "dark"]);

  function normalizeMode(value) {
    const candidate = String(value ?? "system");
    return VALID_MODES.has(candidate) ? candidate : "system";
  }

  function storageFrom(scope = globalScope) {
    try {
      return scope?.localStorage || null;
    } catch {
      return null;
    }
  }

  function readMode(storage) {
    if (!storage) {
      return { mode: "system", error: "无法读取主题偏好。" };
    }
    try {
      return {
        mode: normalizeMode(storage.getItem(STORAGE_KEY)),
        error: "",
      };
    } catch {
      return { mode: "system", error: "无法读取主题偏好。" };
    }
  }

  function saveMode(storage, value) {
    const mode = normalizeMode(value);
    if (!storage) {
      return { mode, error: "主题偏好无法保存。" };
    }
    try {
      storage.setItem(STORAGE_KEY, mode);
      return { mode, error: "" };
    } catch {
      return { mode, error: "主题偏好无法保存。" };
    }
  }

  function applyMode(root, value) {
    const mode = normalizeMode(value);
    if (root?.dataset) root.dataset.theme = mode;
    return mode;
  }

  function nativeArgs(value) {
    return { mode: normalizeMode(value) };
  }

  function bootstrap(root, storage) {
    const result = readMode(storage);
    applyMode(root, result.mode);
    return result;
  }

  const api = {
    STORAGE_KEY,
    normalizeMode,
    storageFrom,
    readMode,
    saveMode,
    applyMode,
    nativeArgs,
    bootstrap,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsTheme = api;
  if (globalScope.document?.documentElement) {
    globalScope.ImageToolsThemeBootstrap = bootstrap(
      globalScope.document.documentElement,
      storageFrom(globalScope),
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 5: Load the bootstrap before CSS**

In `frontend/index.html`, add this immediately before the stylesheet link:

```html
<script src="/static/theme.js"></script>
<link rel="stylesheet" href="/static/styles.css" />
```

Do not add a second `theme.js` tag at the bottom of the document.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/frontend_theme.test.js tests/frontend_ui_contract.test.js
```

Expected: all theme and UI contract tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/theme.js frontend/index.html tests/frontend_theme.test.js tests/frontend_ui_contract.test.js
git commit -m "feat(theme): restore device theme before paint"
```

### Task 2: Add Appearance Settings And Three-Mode Content Behavior

**Files:**
- Modify: `tests/frontend_ui_contract.test.js:133-218`
- Modify: `tests/ui/codex_windows.spec.js:1-20,455-796,828-852`
- Modify: `frontend/index.html:293-370`
- Modify: `frontend/styles.css:1-48,1178-1422`
- Modify: `frontend/app.js:48-90,1202-1251,1609-1624,1740-end`

- [ ] **Step 1: Write the failing Appearance structure and CSS contracts**

Add to `tests/frontend_ui_contract.test.js`:

```javascript
test("settings exposes an Appearance panel with a three-mode radio group", () => {
  for (const id of [
    "settingsAppearanceNav",
    "settingsAppearancePanel",
    "settingsAppearanceTitle",
    "themeModeGroup",
    "themeStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const value of ["system", "light", "dark"]) {
    assert.match(
      html,
      new RegExp(`name="themeMode"[^>]*value="${value}"`),
    );
  }
  assert.match(html, /data-lucide="monitor"/);
  assert.match(html, /data-lucide="sun"/);
  assert.match(html, /data-lucide="moon"/);
  assert.match(html, /id="themeStatus"[^>]*role="status"/);
});

test("manual theme selectors override the system color scheme", () => {
  assert.match(styles, /:root\[data-theme="light"\]/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /color-scheme:\s*light;/);
  assert.match(styles, /color-scheme:\s*dark;/);
  assert.match(styles, /\.theme-segmented-control/);
  assert.match(styles, /input:checked\s*\+\s*span/);
  assert.match(styles, /input:focus-visible\s*\+\s*span/);
});
```

Update the existing dedicated-settings contract so its required IDs include `settingsAppearanceNav` and `settingsAppearancePanel`, and its initial `aria-current` assertions require Appearance to be `page` while Provider and storage are `false`.

- [ ] **Step 2: Add failing browser tests for navigation, persistence, and live system mode**

Add this helper near the top of `tests/ui/codex_windows.spec.js`:

```javascript
async function openStorageSettings(page) {
  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await settings.getByRole("button", { name: "本地数据" }).click();
  await expect(page.locator("#settingsStoragePanel")).toBeVisible();
  return settings;
}
```

Replace `settings opens as a dedicated view and switches between provider and storage` with:

```javascript
test("settings opens Appearance and switches between all settings categories", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const opener = page.getByRole("button", { name: "设置" });
  await opener.click();
  const settings = page.getByRole("region", { name: "设置" });

  await expect(settings).toBeVisible();
  await expect(page.locator("#composerForm")).toBeHidden();
  await expect(page.locator("#settingsAppearancePanel")).toBeVisible();
  await settings.getByRole("button", { name: "Provider", exact: true }).click();
  await expect(page.locator("#settingsProvidersPanel")).toBeVisible();
  await settings.getByRole("button", { name: "本地数据" }).click();
  await expect(page.locator("#settingsStoragePanel")).toBeVisible();
  await settings.getByRole("button", { name: "外观" }).click();
  await expect(page.getByRole("radio", { name: "跟随系统" })).toBeFocused();
  await page.getByRole("button", { name: "返回工作区" }).click();

  await expect(settings).toBeHidden();
  await expect(opener).toBeFocused();
});

test("manual theme persists while system mode follows media changes", async ({ page }) => {
  await installApiMocks(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const shell = page.locator(".app-shell");
  const lightBackground = await shell.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await page.getByRole("radio", { name: "深色" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const manualDark = await shell.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(manualDark).not.toBe(lightBackground);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(shell).toHaveCSS("background-color", manualDark);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("radio", { name: "深色" })).toBeChecked();

  await page.getByRole("radio", { name: "跟随系统" }).check();
  await page.emulateMedia({ colorScheme: "light" });
  const systemLight = await shell.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  const systemDark = await shell.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(systemDark).not.toBe(systemLight);
});

test("theme persistence failures keep the active content theme and report inline", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "image-tools-theme") throw new Error("storage blocked");
      return original.call(this, key, value);
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("radio", { name: "深色" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#themeStatus")).toHaveText("主题偏好无法保存。");
  await expect(page.locator("#themeStatus")).toHaveAttribute("data-tone", "error");
});

test("theme startup and changes synchronize through the Tauri bridge", async ({ page }) => {
  await page.addInitScript(() => {
    window.themeCommands = [];
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command === "set_app_theme") {
            window.themeCommands.push(args);
            return null;
          }
          return null;
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");

  await expect.poll(() => page.evaluate(() => window.themeCommands)).toEqual([
    { mode: "system" },
  ]);
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("radio", { name: "深色" }).check();
  await expect.poll(() => page.evaluate(() => window.themeCommands)).toEqual([
    { mode: "system" },
    { mode: "dark" },
  ]);
});

test("native theme failures keep content theming and report inline", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI__ = {
      core: {
        invoke: async (command) => {
          if (command === "set_app_theme") throw new Error("native unavailable");
          return null;
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("radio", { name: "深色" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#themeStatus")).toContainText("native unavailable");
  await expect(page.locator("#themeStatus")).toHaveAttribute("data-tone", "error");
});
```

In the existing test `theme changes after load and long CJK content stays contained`, assert `html[data-theme="system"]` after navigation so the test explicitly proves the system-mode path.

- [ ] **Step 3: Make storage tests enter the new storage category explicitly**

For each of these tests, replace the initial settings-button click and settings lookup with `const settings = await openStorageSettings(page);`:

- `storage settings confirms a copied workspace-data change`
- `storage async latest GET wins after overlapping changes`
- `storage async older submit cannot unlock a newer submit`
- `storage async ignores initial picker after settings lifecycle changes`
- `storage async ignores browse picker from a closed dialog`
- `native storage picker opens confirmation with the selected folder`
- `storage picker errors preserve the directory and restore input focus`
- `storage validation errors stay in the change dialog`
- `storage status stays contained at desktop target sizes` inside each viewport iteration
- `storage load failures stay in the settings page`

Do not alter their storage assertions or mock response ordering.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
node --test tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "settings opens Appearance|manual theme persists|theme persistence failures|synchronize through the Tauri bridge|native theme failures|theme changes after load|storage"
```

Expected: contract and Appearance tests fail because the new panel, selectors, and handlers do not exist. Updated storage tests fail because Appearance still cannot navigate to local data.

- [ ] **Step 5: Add the Appearance navigation and panel**

In `frontend/index.html`, make Appearance the initial settings tab and insert it before Provider:

```html
<button id="settingsAppearanceNav" type="button" aria-current="page">
  <i data-lucide="palette"></i>
  <span>外观</span>
</button>
<button id="settingsProvidersNav" type="button" aria-current="false">
  <i data-lucide="panels-top-left"></i>
  <span>Provider</span>
</button>
<button id="settingsStorageNav" type="button" aria-current="false">
  <i data-lucide="hard-drive"></i>
  <span>本地数据</span>
</button>
```

Insert this as the first child of `.settings-main`, and mark the existing Provider and storage panels `hidden` initially:

```html
<section
  id="settingsAppearancePanel"
  class="settings-panel"
  aria-labelledby="settingsAppearanceTitle"
>
  <header class="settings-page-heading">
    <div>
      <h2 id="settingsAppearanceTitle">外观</h2>
      <p>选择 Image Tools 的界面主题。</p>
    </div>
  </header>
  <fieldset id="themeModeGroup" class="theme-mode-fieldset">
    <legend>主题</legend>
    <div class="theme-segmented-control">
      <label>
        <input type="radio" name="themeMode" value="system" checked />
        <span><i data-lucide="monitor" aria-hidden="true"></i>跟随系统</span>
      </label>
      <label>
        <input type="radio" name="themeMode" value="light" />
        <span><i data-lucide="sun" aria-hidden="true"></i>浅色</span>
      </label>
      <label>
        <input type="radio" name="themeMode" value="dark" />
        <span><i data-lucide="moon" aria-hidden="true"></i>深色</span>
      </label>
    </div>
  </fieldset>
  <p id="themeStatus" class="settings-inline-status" role="status" hidden></p>
</section>
```

- [ ] **Step 6: Add explicit manual token overrides and segmented-control styling**

After the existing dark media query in `frontend/styles.css`, add the complete manual token overrides:

```css
:root[data-theme="light"] {
  color-scheme: light;
  --bg: #ffffff;
  --sidebar: #fbfbfc;
  --surface: #ffffff;
  --surface-subtle: #f4f4f5;
  --surface-hover: #eeeeef;
  --text: #202124;
  --muted: #656a72;
  --line: #e2e3e6;
  --line-strong: #cfd1d5;
  --accent: #1685d1;
  --accent-hover: #0d72b7;
  --focus: rgb(22 133 209 / 28%);
  --danger: #b4232d;
  --danger-soft: #fff0f1;
  --shadow: 0 5px 16px rgb(0 0 0 / 9%);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #202123;
  --sidebar: #1c1d1f;
  --surface: #292a2d;
  --surface-subtle: #252629;
  --surface-hover: #303236;
  --text: #f1f2f3;
  --muted: #a1a4aa;
  --line: #3a3c40;
  --line-strong: #4b4e54;
  --accent: #55a8df;
  --accent-hover: #6ab5e5;
  --focus: rgb(85 168 223 / 30%);
  --danger: #ff8c93;
  --danger-soft: #3b2427;
  --shadow: 0 6px 18px rgb(0 0 0 / 28%);
}
```

Add this settings control styling beside `.settings-section`:

```css
.theme-mode-fieldset {
  margin: 34px 0 0;
  padding: 0;
  border: 0;
}

.theme-mode-fieldset legend {
  margin: 0 0 10px;
  padding: 0;
  font-size: 13px;
  font-weight: 650;
}

.theme-segmented-control {
  width: min(100%, 480px);
  padding: 3px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.theme-segmented-control label {
  position: relative;
  min-width: 0;
}

.theme-segmented-control input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.theme-segmented-control span {
  height: 36px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.theme-segmented-control input:checked + span {
  border-color: var(--line);
  color: var(--text);
  background: var(--surface);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.theme-segmented-control input:focus-visible + span {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
```

At the existing `@media (max-width: 1040px)` block, add:

```css
.theme-segmented-control span {
  padding: 0 6px;
}
```

Keep all three stable columns; do not collapse the modes into a select.

- [ ] **Step 7: Implement three-tab navigation and theme application**

In `frontend/app.js`, add these DOM references beside the existing settings references:

```javascript
const settingsAppearanceNav = document.querySelector("#settingsAppearanceNav");
const settingsAppearancePanel = document.querySelector("#settingsAppearancePanel");
const themeModeGroup = document.querySelector("#themeModeGroup");
const themeModeInputs = [
  ...document.querySelectorAll('input[name="themeMode"]'),
];
const themeStatus = document.querySelector("#themeStatus");
```

Replace `selectSettingsTab` with a map-based three-tab implementation:

```javascript
function selectSettingsTab(tab) {
  const tabs = {
    appearance: [settingsAppearanceNav, settingsAppearancePanel],
    providers: [settingsProvidersNav, settingsProvidersPanel],
    storage: [settingsStorageNav, settingsStoragePanel],
  };
  for (const [name, [nav, panel]] of Object.entries(tabs)) {
    const active = name === tab;
    nav.setAttribute("aria-current", active ? "page" : "false");
    panel.hidden = !active;
  }
}
```

Add these focused helpers near the settings functions:

```javascript
function checkedThemeInput() {
  return themeModeInputs.find((input) => input.checked) || themeModeInputs[0];
}

function renderThemeMode(mode) {
  const normalized = window.ImageToolsTheme.applyMode(
    document.documentElement,
    mode,
  );
  for (const input of themeModeInputs) input.checked = input.value === normalized;
  return normalized;
}

async function syncNativeTheme(mode) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return { error: "" };
  try {
    await invoke("set_app_theme", window.ImageToolsTheme.nativeArgs(mode));
    return { error: "" };
  } catch (error) {
    const message = typeof error === "string" ? error : error?.message;
    return { error: message || "无法同步窗口主题。" };
  }
}

async function applyThemeMode(mode, options = {}) {
  const normalized = renderThemeMode(mode);
  const errors = [];
  if (options.initialError) errors.push(options.initialError);
  if (options.persist !== false) {
    const saved = window.ImageToolsTheme.saveMode(
      window.ImageToolsTheme.storageFrom(window),
      normalized,
    );
    if (saved.error) errors.push(saved.error);
  }
  const nativeResult = await syncNativeTheme(normalized);
  if (nativeResult.error) errors.push(nativeResult.error);
  setInlineStatus(themeStatus, errors.join(" "), errors.length ? "error" : "");
}

function initializeThemePreference() {
  const initial = window.ImageToolsThemeBootstrap || {
    mode: "system",
    error: "无法读取主题偏好。",
  };
  renderThemeMode(initial.mode);
  void applyThemeMode(initial.mode, {
    persist: false,
    initialError: initial.error,
  });
}
```

Add a single activation function and use it from open/navigation paths:

```javascript
function activateSettingsTab(tab) {
  selectSettingsTab(tab);
  if (tab === "storage") {
    activateStorageView();
    return;
  }
  invalidateStorageView();
  if (tab === "providers") {
    renderProviderManager();
    addProviderBtn.focus();
    return;
  }
  checkedThemeInput().focus();
}

function openSettingsView(tab, opener) {
  settingsOpener = opener;
  settingsView.hidden = false;
  workspace.classList.add("settings-open");
  setInlineStatus(providerActionStatus, "");
  activateSettingsTab(tab);
}
```

Replace the settings/nav bindings with:

```javascript
settingsBtn.addEventListener("click", () =>
  openSettingsView("appearance", settingsBtn),
);
settingsAppearanceNav.addEventListener("click", () => {
  activateSettingsTab("appearance");
});
settingsProvidersNav.addEventListener("click", () => {
  activateSettingsTab("providers");
});
settingsStorageNav.addEventListener("click", () => {
  activateSettingsTab("storage");
});

themeModeGroup.addEventListener("change", (event) => {
  if (event.target.matches('input[name="themeMode"]')) {
    void applyThemeMode(event.target.value);
  }
});
```

Call `initializeThemePreference()` once after event binding and before the existing initial `render()` call.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/frontend_theme.test.js tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "settings opens Appearance|manual theme persists|theme persistence failures|synchronize through the Tauri bridge|native theme failures|theme changes after load|storage"
```

Expected: all focused theme, settings, and storage tests pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/index.html frontend/styles.css frontend/app.js tests/frontend_ui_contract.test.js tests/ui/codex_windows.spec.js
git commit -m "feat(settings): add three-mode Appearance theme"
```

### Task 3: Synchronize The Native Tauri Window Theme

**Files:**
- Modify: `tests/test_tauri_config.py:75-85`
- Modify: `src-tauri/src/main.rs:168-187,180-230`

- [ ] **Step 1: Write the failing static Tauri command contract**

Add to `tests/test_tauri_config.py`:

```python
def test_tauri_exposes_native_window_theme_sync():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert "fn theme_override" in main_rs
    assert "fn set_app_theme" in main_rs
    assert "window.set_theme(theme)" in main_rs
    assert "generate_handler![pick_data_directory, set_app_theme]" in main_rs
```

Update `test_tauri_exposes_a_native_directory_picker_command` to expect the combined generated-handler string while retaining its dialog-plugin and global-Tauri assertions.

- [ ] **Step 2: Write failing Rust mapping tests**

In `src-tauri/src/main.rs`'s test module, import `theme_override` and add:

```rust
#[test]
fn maps_supported_theme_modes() {
    assert_eq!(theme_override("system"), Ok(None));
    assert_eq!(theme_override("light"), Ok(Some(tauri::Theme::Light)));
    assert_eq!(theme_override("dark"), Ok(Some(tauri::Theme::Dark)));
}

#[test]
fn rejects_unsupported_theme_modes() {
    assert_eq!(
        theme_override("sepia"),
        Err("不支持的主题模式：sepia".to_string())
    );
}
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
pytest -q tests/test_tauri_config.py
mise run backend-bundle
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: Python and Rust tests fail because the mapping, command, and generated-handler entry do not exist.

- [ ] **Step 4: Implement native theme mapping and command**

Add before `pick_data_directory` in `src-tauri/src/main.rs`:

```rust
fn theme_override(mode: &str) -> Result<Option<tauri::Theme>, String> {
    match mode {
        "system" => Ok(None),
        "light" => Ok(Some(tauri::Theme::Light)),
        "dark" => Ok(Some(tauri::Theme::Dark)),
        unsupported => Err(format!("不支持的主题模式：{unsupported}")),
    }
}

#[tauri::command]
fn set_app_theme(window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    let theme = theme_override(&mode)?;
    window
        .set_theme(theme)
        .map_err(|error| format!("无法同步窗口主题：{error}"))
}
```

Register both commands:

```rust
.invoke_handler(tauri::generate_handler![pick_data_directory, set_app_theme])
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pytest -q tests/test_tauri_config.py
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all static and Rust native-theme tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/main.rs tests/test_tauri_config.py
git commit -m "feat(theme): synchronize the native window theme"
```

### Task 4: Guard Native Theme Async Ordering

**Files:**
- Modify: `tests/ui/codex_windows.spec.js`
- Modify: `frontend/app.js`

- [ ] **Step 1: Write a failing stale-native-response test**

Add:

```javascript
test("a stale native theme failure cannot overwrite a newer success", async ({ page }) => {
  await page.addInitScript(() => {
    window.resolveDarkTheme = null;
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command !== "set_app_theme" || args.mode !== "dark") return null;
          return new Promise((resolve, reject) => {
            window.resolveDarkTheme = () => reject(new Error("stale failure"));
          });
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("radio", { name: "深色" }).check();
  await expect.poll(() => page.evaluate(() => typeof window.resolveDarkTheme)).toBe(
    "function",
  );
  await page.getByRole("radio", { name: "浅色" }).check();
  await page.evaluate(() => window.resolveDarkTheme());

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#themeStatus")).toBeHidden();
});
```

- [ ] **Step 2: Run the ordering test and verify RED**

Run:

```bash
npm run test:ui -- --grep "stale native theme failure"
```

Expected: FAIL because the older rejected dark request overwrites the newer successful light status.

- [ ] **Step 3: Add the minimal generation guard**

Add `let themeSyncGeneration = 0;` beside the other settings lifecycle counters, then replace `applyThemeMode` with:

```javascript
async function applyThemeMode(mode, options = {}) {
  const generation = ++themeSyncGeneration;
  const normalized = renderThemeMode(mode);
  const errors = [];
  if (options.initialError) errors.push(options.initialError);
  if (options.persist !== false) {
    const saved = window.ImageToolsTheme.saveMode(
      window.ImageToolsTheme.storageFrom(window),
      normalized,
    );
    if (saved.error) errors.push(saved.error);
  }
  const nativeResult = await syncNativeTheme(normalized);
  if (generation !== themeSyncGeneration) return;
  if (nativeResult.error) errors.push(nativeResult.error);
  setInlineStatus(themeStatus, errors.join(" "), errors.length ? "error" : "");
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm run test:ui -- --grep "theme persistence failures|stale native theme failure|manual theme persists|synchronize through the Tauri bridge"
```

Expected: all theme behavior and failure-path tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/app.js tests/ui/codex_windows.spec.js
git commit -m "fix(theme): guard preference and native sync failures"
```

### Task 5: Expand The Settings Visual Matrix To Twenty Baselines

**Files:**
- Modify: `tests/ui/codex_windows.spec.js:865-946`
- Create: `tests/ui/codex_windows.spec.js-snapshots/settings-appearance-*-chromium-linux.png`
- Modify: sixteen existing Provider/storage settings PNG baselines.

- [ ] **Step 1: Add the Appearance visual state before Provider capture**

At the start of each viewport/theme iteration in `settings visual baselines cover both themes and target sizes`, replace the direct Providers click with:

```javascript
await page.getByRole("button", { name: "设置" }).click();
const settings = page.getByRole("region", { name: "设置" });
await expect(page.locator("#settingsAppearancePanel")).toBeVisible();
await expect(settings).toHaveScreenshot(
  `settings-appearance-${viewport.width}x${viewport.height}-${colorScheme}.png`,
);
for (const selector of [".settings-view", ".settings-main", ".settings-panel:not([hidden])"]) {
  expect(
    await page.locator(selector).evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    selector,
  ).toBe(true);
}

await settings.getByRole("button", { name: "Provider", exact: true }).click();
```

Keep the existing Provider, Provider dialog, storage, and storage-dialog capture/assertion blocks after this insertion.

- [ ] **Step 2: Run the visual test and verify RED**

Run:

```bash
npm run test:ui -- --grep "settings visual baselines"
```

Expected: FAIL because four Appearance snapshots are missing and the sixteen existing settings screenshots contain the old two-item navigation.

- [ ] **Step 3: Regenerate every settings baseline intentionally**

Run:

```bash
python scripts/run_playwright_linux_env.py npx playwright test --update-snapshots=all --grep "settings visual baselines"
```

Expected: one visual test passes and writes twenty current settings PNG files.

- [ ] **Step 4: Verify the baseline inventory**

Run:

```bash
find tests/ui/codex_windows.spec.js-snapshots -maxdepth 1 -type f \( -name 'settings-appearance-*' -o -name 'settings-provider-*' -o -name 'provider-dialog-*' -o -name 'settings-storage-*' -o -name 'storage-dialog-*' \) | sort
```

Expected: exactly twenty files: five states multiplied by two viewports and two color schemes.

- [ ] **Step 5: Inspect all twenty PNGs**

Use `view_image` on every Appearance, Provider, Provider-dialog, storage, and storage-dialog image. Confirm:

- all three navigation labels fit at `960x640`;
- all three theme segments fit without wrapping or truncation;
- selected, focus-neutral, light, and dark hierarchy is consistent;
- no path, label, status, button, or dialog overlaps;
- dialog and settings geometry matches the existing Codex settings shell.

If any image fails inspection, adjust only the affected CSS, rerun the normal visual test, regenerate with `--update-snapshots=all`, and reinspect all affected states.

- [ ] **Step 6: Run the visual test without update mode**

Run:

```bash
npm run test:ui -- --grep "settings visual baselines"
```

Expected: PASS without writing or changing snapshots.

- [ ] **Step 7: Commit**

```bash
git add tests/ui/codex_windows.spec.js tests/ui/codex_windows.spec.js-snapshots
git commit -m "test(theme): capture Appearance visual baselines"
```

### Task 6: Preserve Project Knowledge And Run Release-Grade Verification

**Files:**
- Modify: `knowledge/01-project-overview.md`
- Modify: `knowledge/02-requirements.md`
- Modify: `knowledge/03-tech-stack.md`
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/05-review-notes.md`
- Modify: `knowledge/08-testing-strategy.md`
- Modify: `knowledge/09-decisions.md`
- Modify: `knowledge/10-lessons-learned.md`

- [ ] **Step 1: Record the resolved product and data boundaries**

Make these explicit edits:

- In `knowledge/01-project-overview.md`, change the system-theme scope/success language to device-selectable system/light/dark themes.
- In `knowledge/02-requirements.md`, replace the system-only theme requirement with three modes, immediate content/titlebar sync, and device-local persistence outside workspace data.
- In `knowledge/03-tech-stack.md`, record `frontend/theme.js`, the `image-tools-theme` localStorage key, and the Tauri native theme command.
- In `knowledge/04-task-list.md`, append `THM001` state/bootstrap, `THM002` Appearance UI, `THM003` native sync, and `THM004` visual/error coverage as Done; add `THM005` release verification as In Progress.
- In `knowledge/05-review-notes.md`, record the selected dedicated Appearance approach, no backend/schema change, titlebar fallback behavior, and Windows WebView2 gate.
- In `knowledge/08-testing-strategy.md`, record three-mode behavior tests and twenty settings baselines.
- In `knowledge/09-decisions.md`, add `2026-07-15: Keep Theme Preference Device-Local` with the selected modes, localStorage boundary, and native window synchronization consequences.
- In `knowledge/10-lessons-learned.md`, record pre-style bootstrap and stale native-response tokens as reusable patterns.

Do not modify `CONTEXT.md` or create an ADR.

- [ ] **Step 2: Run the complete Node and Python suite**

Run:

```bash
mise run test
```

Expected: all Python and Node tests pass, including `tests/frontend_theme.test.js`.

- [ ] **Step 3: Run the complete browser suite**

Run:

```bash
mise run ui-test
```

Expected: all Playwright behavior and visual tests pass without snapshot updates.

- [ ] **Step 4: Bundle the sidecar and run Rust verification**

Run:

```bash
mise run backend-bundle
mise run desktop-check
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PyInstaller creates the ignored current-platform sidecar, Cargo check exits zero, and all Rust unit tests pass.

- [ ] **Step 5: Run final repository checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended knowledge files are pending before the final documentation commit.

- [ ] **Step 6: Mark release verification complete**

Change only the `THM005` task status in `knowledge/04-task-list.md` from `In Progress` to `Done` after Steps 2-5 have all exited zero.

- [ ] **Step 7: Commit documentation**

```bash
git add knowledge/01-project-overview.md knowledge/02-requirements.md knowledge/03-tech-stack.md knowledge/04-task-list.md knowledge/05-review-notes.md knowledge/08-testing-strategy.md knowledge/09-decisions.md knowledge/10-lessons-learned.md
git commit -m "docs(theme): record Appearance preference behavior"
```

- [ ] **Step 8: Start the review server from the completed branch**

Run:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860 --reload
```

Expected: `/api/health` returns `{"ok":true,"app":"Image Tools"}` and the server remains running for user review. If port `7860` is occupied, use the next available local port and report the actual URL.

- [ ] **Step 9: Record the remaining platform gate**

Report that Linux Chromium proves deterministic behavior/layout and Cargo proves native API compilation, while Windows WebView2 must still verify the native titlebar and content stay synchronized for system/light/dark at `1280x860` and `960x640`.
