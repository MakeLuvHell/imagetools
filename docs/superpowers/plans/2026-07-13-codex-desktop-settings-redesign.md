# Codex Desktop Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanent settings forms with a Codex Desktop-style Provider manager and workspace-data status flow while preserving every existing backend and storage contract.

**Architecture:** Keep the dedicated settings work area and existing vanilla JavaScript boundaries. `frontend/ui.js` renders stable Provider states and rows, `frontend/app.js` owns API and layer lifecycles, native `<dialog>` elements isolate edit/confirm tasks, and the existing Provider and storage endpoints remain unchanged. The final CSS uses the current system-theme token set with a restrained settings sidebar and a `620-660px` content measure.

**Tech Stack:** Vanilla HTML/CSS/JavaScript IIFEs, local Lucide 1.24.0, jsdom 29.1.1, Playwright 1.61.1, Tauri 2, existing FastAPI APIs.

---

## File Map

- `frontend/index.html`: final settings shell, Provider editor/delete dialogs, storage-change dialog, and Provider action menu.
- `frontend/ui.js`: pure Provider loading, error, empty, and row rendering.
- `frontend/app.js`: settings navigation, Provider mutations, storage-location flow, menu/dialog ordering, and focus restoration.
- `frontend/styles.css`: Codex Desktop-style settings geometry, rows, dialogs, state feedback, dark theme, and responsive constraints.
- `tests/frontend_ui.test.js`: jsdom coverage for the Provider settings renderer.
- `tests/frontend_ui_contract.test.js`: static contracts for semantic structure and required local assets.
- `tests/ui/helpers.js`: stateful Provider and storage API mocks.
- `tests/ui/codex_windows.spec.js`: browser behavior, accessibility, geometry, and visual regression.
- `tests/ui/codex_windows.spec.js-snapshots/`: approved light/dark settings baselines at both desktop target sizes.
- `knowledge/04-task-list.md`: add the settings redesign ticket and dependency.
- `knowledge/05-review-notes.md`: record product, frontend, security, and test review outcomes.
- `knowledge/08-testing-strategy.md`: record the expanded settings matrix.
- `knowledge/10-lessons-learned.md`: preserve the scan-first settings and nested-layer lessons.

No backend, SQLite, Tauri command, or storage migration file changes are required.

### Task 1: Build the pure Provider settings renderer

**Files:**
- Modify: `tests/frontend_ui.test.js:72-98`
- Modify: `frontend/ui.js:267-327, api export near EOF`

- [ ] **Step 1: Replace the old Provider renderer test with scan-first state tests**

Replace `renderProviderList exposes actions without rendering API keys` with:

```javascript
test("renderProviderSettings renders scan-first rows without exposing API keys", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<div id="providers" aria-live="polite"></div>');
  const edits = [];
  const menus = [];
  ui.renderProviderSettings(
    dom.window.document.querySelector("#providers"),
    {
      status: "ready",
      providers: [
        {
          id: 2,
          name: "Default",
          defaultModel: "gpt-image-2",
          apiKeySet: true,
          isDefault: true,
        },
      ],
    },
    {
      onEdit: (provider, trigger) => edits.push([provider.id, trigger.className]),
      onMenu: (provider, trigger) => menus.push([provider.id, trigger.className]),
    },
  );

  const row = dom.window.document.querySelector("[data-provider-id='2']");
  assert.match(row.textContent, /Default/);
  assert.match(row.textContent, /gpt-image-2/);
  assert.match(row.textContent, /API Key 已配置/);
  assert.match(row.textContent, /默认/);
  assert.doesNotMatch(row.textContent, /sk-/);
  row.querySelector(".provider-row-main").click();
  row.querySelector(".provider-row-menu").click();
  assert.deepEqual(edits, [[2, "provider-row-main"]]);
  assert.deepEqual(menus, [[2, "provider-row-menu icon-button"]]);
});

test("renderProviderSettings exposes stable loading empty and error states", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<div id="providers" aria-live="polite"></div>');
  const container = dom.window.document.querySelector("#providers");
  let action = "";

  ui.renderProviderSettings(container, { status: "loading", providers: [] });
  assert.equal(container.getAttribute("aria-busy"), "true");
  assert.equal(container.querySelectorAll(".settings-skeleton-row").length, 2);

  ui.renderProviderSettings(
    container,
    { status: "ready", providers: [] },
    { onAdd: () => { action = "add"; } },
  );
  container.querySelector(".settings-empty-state button").click();
  assert.equal(action, "add");

  ui.renderProviderSettings(
    container,
    { status: "error", providers: [], error: "Provider 加载失败" },
    { onRetry: () => { action = "retry"; } },
  );
  assert.match(container.textContent, /Provider 加载失败/);
  container.querySelector(".settings-error-state button").click();
  assert.equal(action, "retry");
});
```

- [ ] **Step 2: Run the renderer tests and verify RED**

Run:

```bash
node --test tests/frontend_ui.test.js
```

Expected: FAIL because `renderProviderSettings` is not exported.

- [ ] **Step 3: Add the complete settings renderer beside the existing renderer**

Add this renderer after the existing `renderProviderList` so the Task 1 commit remains compatible with the current `app.js`:

```javascript
  function settingsStateAction(document, label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialog-button";
    button.textContent = label;
    if (callback) button.addEventListener("click", callback);
    return button;
  }

  function renderProviderSettings(container, state, callbacks = {}) {
    const document = container.ownerDocument;
    const status = state.status || "ready";
    const providers = state.providers || [];
    container.replaceChildren();
    container.removeAttribute("aria-busy");

    if (status === "loading") {
      container.setAttribute("aria-busy", "true");
      for (let index = 0; index < 2; index += 1) {
        const skeleton = document.createElement("div");
        skeleton.className = "settings-skeleton-row";
        skeleton.setAttribute("aria-hidden", "true");
        container.appendChild(skeleton);
      }
      return;
    }

    if (status === "error") {
      const error = document.createElement("div");
      error.className = "settings-error-state";
      error.setAttribute("role", "alert");
      const title = document.createElement("strong");
      title.textContent = "无法加载 Provider";
      const message = document.createElement("p");
      message.textContent = state.error || "请求失败";
      error.append(title, message, settingsStateAction(document, "重试", callbacks.onRetry));
      container.appendChild(error);
      return;
    }

    if (!providers.length) {
      const empty = document.createElement("div");
      empty.className = "settings-empty-state";
      const title = document.createElement("strong");
      title.textContent = "尚未配置 Provider";
      const message = document.createElement("p");
      message.textContent = "添加一个图片 API 连接后即可开始生成。";
      empty.append(title, message, settingsStateAction(document, "添加 Provider", callbacks.onAdd));
      container.appendChild(empty);
      return;
    }

    for (const provider of providers) {
      const row = document.createElement("article");
      row.className = "provider-row";
      row.dataset.providerId = String(provider.id);

      const main = document.createElement("button");
      main.type = "button";
      main.className = "provider-row-main";
      main.setAttribute("aria-label", `编辑 Provider ${provider.name}`);
      main.addEventListener("click", () => callbacks.onEdit?.(provider, main));

      const avatar = document.createElement("span");
      avatar.className = "provider-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = provider.name.trim().charAt(0).toUpperCase() || "P";

      const copy = document.createElement("span");
      copy.className = "provider-copy";
      const nameLine = document.createElement("span");
      nameLine.className = "provider-name-line";
      const name = document.createElement("strong");
      name.textContent = provider.name;
      nameLine.appendChild(name);
      if (provider.isDefault) {
        const badge = document.createElement("span");
        badge.className = "provider-default";
        badge.textContent = "默认";
        nameLine.appendChild(badge);
      }
      const detail = document.createElement("span");
      detail.className = "provider-detail";
      detail.textContent = `${provider.defaultModel} · ${provider.apiKeySet ? "API Key 已配置" : "API Key 未配置"}`;
      copy.append(nameLine, detail);
      main.append(avatar, copy);

      const menu = document.createElement("button");
      menu.type = "button";
      menu.className = "provider-row-menu icon-button";
      menu.setAttribute("aria-label", `管理 Provider ${provider.name}`);
      menu.setAttribute("aria-haspopup", "menu");
      menu.setAttribute("aria-expanded", "false");
      menu.title = "Provider 操作";
      menu.innerHTML = '<i data-lucide="ellipsis"></i>';
      menu.addEventListener("click", () => callbacks.onMenu?.(provider, menu));

      row.append(main, menu);
      container.appendChild(row);
    }
    refreshIcons();
  }
```

Add `renderProviderSettings` to the exported `api` object while retaining `renderProviderList` until Task 2.

- [ ] **Step 4: Run the renderer tests and verify GREEN**

Run:

```bash
node --test tests/frontend_ui.test.js
```

Expected: PASS, including both new Provider settings tests.

- [ ] **Step 5: Commit the pure renderer**

```bash
git add frontend/ui.js tests/frontend_ui.test.js
git commit -m "feat(settings): render provider management states"
```

### Task 2: Deliver the complete Provider management flow

**Files:**
- Modify: `tests/frontend_ui_contract.test.js:103-154`
- Modify: `tests/ui/helpers.js:8-66`
- Modify: `tests/ui/codex_windows.spec.js:210-242, 378-394`
- Modify: `frontend/index.html:293-392, before sessionDialog`
- Modify: `frontend/ui.js:267-327, api export near EOF`
- Modify: `frontend/app.js:47-71, 88-100, 458-572, 1017-1044, 1206-1271, 1309-1325`

- [ ] **Step 1: Replace obsolete static contracts with the approved Provider structure**

Replace `Provider Cancel resets the editor without leaving settings` and extend the settings structure test with:

```javascript
test("Provider settings uses a scan-first list and dedicated task dialogs", () => {
  for (const id of [
    "providerList",
    "addProviderBtn",
    "providerDialog",
    "providerForm",
    "providerDialogStatus",
    "providerMenu",
    "providerDeleteDialog",
    "providerDeleteMessage",
    "providerDeleteStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const providerPanel = html.match(
    /<section id="settingsProvidersPanel"[\s\S]*?<\/section>/,
  )[0];
  assert.doesNotMatch(providerPanel, /id="providerForm"/);
  assert.match(app, /openNewProviderDialog/);
  assert.match(app, /openEditProviderDialog/);
  assert.match(app, /openProviderDeleteDialog/);
});
```

- [ ] **Step 2: Extend the Playwright Provider mocks**

Add these fields to the mock `state` in `tests/ui/helpers.js`:

```javascript
    providerRequests: [],
    nextProviderId: Math.max(0, ...(overrides.providers || []).map((provider) => provider.id)) + 2,
```

Replace the current Provider route with these collection and item routes:

```javascript
  await page.route("**/api/providers", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      if (overrides.providerListError) {
        return route.fulfill({ status: 500, json: { detail: overrides.providerListError } });
      }
      return route.fulfill({ json: state.providers });
    }
    if (overrides.providerMutationError) {
      return route.fulfill({ status: 400, json: { detail: overrides.providerMutationError } });
    }
    const body = route.request().postDataJSON();
    state.providerRequests.push({ method, id: null, body });
    const provider = {
      id: state.nextProviderId++,
      name: body.name,
      base_url: body.base_url,
      default_model: body.default_model,
      is_default: Boolean(body.is_default),
      api_key_set: Boolean(body.api_key),
    };
    if (provider.is_default) {
      state.providers.forEach((item) => { item.is_default = false; });
    }
    state.providers.push(provider);
    return route.fulfill({ status: 200, json: provider });
  });

  await page.route(/\/api\/providers\/(\d+)(?:\/default)?$/, async (route) => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split("/")[3]);
    const provider = state.providers.find((item) => item.id === id);
    if (!provider) {
      return route.fulfill({ status: 404, json: { detail: "Provider not found." } });
    }
    if (overrides.providerMutationError) {
      return route.fulfill({ status: 400, json: { detail: overrides.providerMutationError } });
    }
    const method = route.request().method();
    if (url.pathname.endsWith("/default")) {
      state.providerRequests.push({ method, id, body: null });
      state.providers.forEach((item) => { item.is_default = item.id === id; });
      return route.fulfill({ json: provider });
    }
    if (method === "PATCH") {
      const body = route.request().postDataJSON();
      state.providerRequests.push({ method, id, body });
      provider.name = body.name;
      provider.base_url = body.base_url;
      provider.default_model = body.default_model;
      provider.api_key_set = provider.api_key_set || Boolean(body.api_key);
      if (body.is_default) {
        state.providers.forEach((item) => { item.is_default = item.id === id; });
      }
      return route.fulfill({ json: provider });
    }
    if (method === "DELETE") {
      state.providerRequests.push({ method, id, body: null });
      state.providers = state.providers.filter((item) => item.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 405, json: { detail: "Method not allowed" } });
  });
```

- [ ] **Step 3: Add Provider browser behavior tests**

Replace the old Provider Cancel browser test and add these tests:

```javascript
test("Provider settings adds and edits through a focused dialog", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await expect(settings.getByRole("button", { name: "编辑 Provider Default" })).toBeVisible();
  await expect(settings.locator("#providerName")).toHaveCount(0);

  await settings.getByRole("button", { name: "添加 Provider" }).click();
  const dialog = page.getByRole("dialog", { name: "添加 Provider" });
  await dialog.getByLabel("名称").fill("Studio");
  await dialog.getByLabel("Base URL").fill("https://studio.example/v1");
  await dialog.getByLabel("API Key").fill("secret-value");
  await dialog.getByLabel("默认模型").fill("studio-image-v1");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();
  await expect(settings.getByRole("button", { name: "编辑 Provider Studio" })).toBeVisible();

  await settings.getByRole("button", { name: "编辑 Provider Studio" }).click();
  await expect(page.getByRole("dialog", { name: "编辑 Provider" }).getByLabel("API Key"))
    .toHaveValue("");
  await expect(page.getByRole("dialog", { name: "编辑 Provider" }).getByLabel("API Key"))
    .toHaveAttribute("placeholder", "已保存，留空则保持不变");
  await page.getByRole("dialog", { name: "编辑 Provider" }).getByLabel("名称").fill("Studio Updated");
  await page.getByRole("dialog", { name: "编辑 Provider" }).getByRole("button", { name: "保存" }).click();

  await expect(settings.getByRole("button", { name: "编辑 Provider Studio Updated" })).toBeVisible();
  expect(requests.providerRequests.at(-1)).toMatchObject({
    method: "PATCH",
    body: { api_key: "" },
  });
});

test("Provider menu sets defaults and confirms deletion", async ({ page }) => {
  const requests = await installApiMocks(page, {
    providers: [
      { id: 1, name: "Default", base_url: "https://one.example/v1", default_model: "gpt-image-2", is_default: true, api_key_set: true },
      { id: 2, name: "Studio", base_url: "https://two.example/v1", default_model: "studio-v1", is_default: false, api_key_set: true },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByRole("button", { name: "管理 Provider Studio" }).click();
  await page.getByRole("menuitem", { name: "设为默认" }).click();
  await expect.poll(() => requests.providers.find((item) => item.id === 2).is_default).toBe(true);

  await page.getByRole("button", { name: "管理 Provider Studio" }).click();
  await page.getByRole("menuitem", { name: "删除" }).click();
  const confirm = page.getByRole("dialog", { name: "删除 Provider" });
  await expect(confirm).toContainText("Studio");
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("button", { name: "编辑 Provider Studio" })).toBeVisible();

  await page.getByRole("button", { name: "管理 Provider Studio" }).click();
  await page.getByRole("menuitem", { name: "删除" }).click();
  await page.getByRole("dialog", { name: "删除 Provider" }).getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("button", { name: "编辑 Provider Studio" })).toHaveCount(0);
});

test("Provider mutation errors remain in the active dialog", async ({ page }) => {
  await installApiMocks(page, { providerMutationError: "Base URL 无法连接。" });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByRole("button", { name: "添加 Provider" }).click();
  const dialog = page.getByRole("dialog", { name: "添加 Provider" });
  await dialog.getByLabel("名称").fill("Broken");
  await dialog.getByLabel("Base URL").fill("https://broken.example/v1");
  await dialog.getByLabel("API Key").fill("secret-value");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("Base URL 无法连接。");
  await expect(dialog.getByLabel("名称")).toHaveValue("Broken");
});

test("Provider list failures render an inline retry state", async ({ page }) => {
  await installApiMocks(page, { providerListError: "Provider 列表读取失败。" });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await expect(settings.getByRole("alert")).toContainText("Provider 列表读取失败。");
  await expect(settings.getByRole("button", { name: "重试" })).toBeVisible();
});
```

- [ ] **Step 4: Run the Provider contracts and browser tests to verify RED**

Run:

```bash
node --test tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "Provider settings|Provider menu|Provider mutation|Provider list"
```

Expected: static tests fail for missing dialog/menu IDs; Playwright fails because the form is still permanent and the row menu does not exist.

- [ ] **Step 5: Replace the settings shell and Provider markup**

Replace `#settingsView`, keep the existing storage form inside the new shell for this commit, and add the Provider dialogs plus Provider menu before `#sessionDialog`. Use this exact ID and role structure:

```html
<section id="settingsView" class="settings-view" role="region" aria-label="设置" hidden>
  <div class="settings-shell">
    <aside class="settings-sidebar">
      <button id="settingsBackBtn" type="button" class="settings-back" aria-label="返回工作区">
        <i data-lucide="arrow-left"></i><span>设置</span>
      </button>
      <span class="settings-nav-label">设置</span>
      <nav class="settings-nav" aria-label="设置分类">
        <button id="settingsProvidersNav" type="button" aria-current="false">
          <i data-lucide="panels-top-left"></i><span>Provider</span>
        </button>
        <button id="settingsStorageNav" type="button" aria-current="page">
          <i data-lucide="hard-drive"></i><span>本地数据</span>
        </button>
      </nav>
    </aside>
    <div class="settings-main">
      <section id="settingsProvidersPanel" class="settings-panel" aria-labelledby="settingsProvidersTitle" hidden>
        <header class="settings-page-heading">
          <div><h2 id="settingsProvidersTitle">Provider</h2><p>管理 Image Tools 用于生成图片的 API 连接。</p></div>
          <button id="addProviderBtn" type="button" class="dialog-button primary">
            <i data-lucide="plus"></i><span>添加 Provider</span>
          </button>
        </header>
        <p id="providerActionStatus" class="settings-inline-status" role="status" hidden></p>
        <div id="providerList" class="provider-list" aria-live="polite"></div>
      </section>
      <section id="settingsStoragePanel" class="settings-panel" aria-label="本地数据">
        <section class="storage-location-section" aria-labelledby="storageLocationTitle">
          <div class="storage-location-heading">
            <h3 id="storageLocationTitle">本地数据</h3>
            <output id="storageCurrentPath" aria-label="当前数据目录"></output>
          </div>
          <form id="storageLocationForm" class="storage-location-form">
            <label><span>新的数据目录</span><span class="storage-directory-input"><input id="storageDataDir" required autocomplete="off" placeholder="D:\Image Tools" /><button id="storageBrowseBtn" type="button" class="icon-button" aria-label="选择目录" title="选择目录"><i data-lucide="folder-open"></i></button></span></label>
            <label class="checkbox-field"><input id="storageMigrateExisting" type="checkbox" /><span>复制现有会话和文件</span></label>
            <footer><p id="storageLocationStatus" role="status" hidden></p><button id="storageApplyBtn" type="submit" class="dialog-button primary">应用</button></footer>
          </form>
        </section>
      </section>
    </div>
  </div>
</section>

<div id="providerMenu" class="task-menu provider-menu" role="menu" aria-label="Provider 操作" hidden>
  <button id="providerMenuEditBtn" type="button" role="menuitem"><i data-lucide="pencil"></i><span>编辑</span></button>
  <button id="providerMenuDefaultBtn" type="button" role="menuitem"><i data-lucide="star"></i><span>设为默认</span></button>
  <button id="providerMenuDeleteBtn" type="button" class="danger-menu-item" role="menuitem"><i data-lucide="trash-2"></i><span>删除</span></button>
</div>

<dialog id="providerDialog" class="app-dialog settings-dialog" aria-labelledby="providerEditorTitle">
  <header><div><h2 id="providerEditorTitle">添加 Provider</h2><p>配置图片生成 API 连接。</p></div><button id="providerDialogClose" type="button" class="icon-button" aria-label="关闭"><i data-lucide="x"></i></button></header>
  <form id="providerForm">
    <p id="providerDialogStatus" class="dialog-status" role="alert" hidden></p>
    <label><span>名称</span><input id="providerName" required autocomplete="off" /></label>
    <label><span>Base URL</span><input id="providerBaseUrl" required type="url" autocomplete="url" /></label>
    <label><span>API Key</span><input id="providerApiKey" type="password" autocomplete="new-password" placeholder="输入 API Key" /></label>
    <label><span>默认模型</span><input id="providerDefaultModel" required value="gpt-image-2" autocomplete="off" /></label>
    <label class="checkbox-field"><input id="providerIsDefault" type="checkbox" /><span>设为默认 Provider</span></label>
    <footer><button id="providerCancelBtn" type="button" class="dialog-button">取消</button><button id="providerSaveBtn" type="submit" class="dialog-button primary">保存</button></footer>
  </form>
</dialog>

<dialog id="providerDeleteDialog" class="app-dialog settings-dialog" aria-labelledby="providerDeleteTitle">
  <form id="providerDeleteForm">
    <h2 id="providerDeleteTitle">删除 Provider</h2>
    <p id="providerDeleteMessage"></p>
    <p id="providerDeleteStatus" class="dialog-status" role="alert" hidden></p>
    <footer><button id="providerDeleteCancel" type="button" class="dialog-button">取消</button><button id="providerDeleteConfirm" type="submit" class="dialog-button danger">删除</button></footer>
  </form>
</dialog>

```

- [ ] **Step 6: Wire Provider list, editor, menu, mutations, and confirmation**

Replace the old Provider selectors and add the new Provider state with:

```javascript
const providerList = document.querySelector("#providerList");
const providerActionStatus = document.querySelector("#providerActionStatus");
const addProviderBtn = document.querySelector("#addProviderBtn");
const providerDialog = document.querySelector("#providerDialog");
const providerDialogClose = document.querySelector("#providerDialogClose");
const providerDialogStatus = document.querySelector("#providerDialogStatus");
const providerForm = document.querySelector("#providerForm");
const providerEditorTitle = document.querySelector("#providerEditorTitle");
const providerName = document.querySelector("#providerName");
const providerBaseUrl = document.querySelector("#providerBaseUrl");
const providerApiKey = document.querySelector("#providerApiKey");
const providerDefaultModel = document.querySelector("#providerDefaultModel");
const providerIsDefault = document.querySelector("#providerIsDefault");
const providerCancelBtn = document.querySelector("#providerCancelBtn");
const providerSaveBtn = document.querySelector("#providerSaveBtn");
const providerMenu = document.querySelector("#providerMenu");
const providerMenuEditBtn = document.querySelector("#providerMenuEditBtn");
const providerMenuDefaultBtn = document.querySelector("#providerMenuDefaultBtn");
const providerMenuDeleteBtn = document.querySelector("#providerMenuDeleteBtn");
const providerDeleteDialog = document.querySelector("#providerDeleteDialog");
const providerDeleteForm = document.querySelector("#providerDeleteForm");
const providerDeleteMessage = document.querySelector("#providerDeleteMessage");
const providerDeleteStatus = document.querySelector("#providerDeleteStatus");
const providerDeleteCancel = document.querySelector("#providerDeleteCancel");
const providerDeleteConfirm = document.querySelector("#providerDeleteConfirm");

let providerSettingsStatus = "loading";
let providerSettingsError = "";
let providerMenuTarget = null;
let providerMenuTrigger = null;
let providerDeleteTarget = null;
let providerSaveToken = 0;
```

Then replace the old Provider manager functions with:

```javascript
function setInlineStatus(element, message, tone = "") {
  element.textContent = message;
  element.hidden = !message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function renderProviderManager() {
  window.ImageToolsUi.renderProviderSettings(
    providerList,
    { status: providerSettingsStatus, providers, error: providerSettingsError },
    {
      onAdd: () => openNewProviderDialog(addProviderBtn),
      onEdit: (provider, trigger) => openEditProviderDialog(provider.id, trigger),
      onMenu: openProviderMenu,
      onRetry: () => void loadProviders({ showLoading: true }),
    },
  );
}

async function loadProviders({ showLoading = false } = {}) {
  if (showLoading) {
    providerSettingsStatus = "loading";
    providerSettingsError = "";
    renderProviderManager();
  }
  try {
    providers = window.ImageToolsWorkbench.normalizeProviders(
      await fetch("/api/providers").then(readJson),
    );
    providerSettingsStatus = "ready";
    providerSettingsError = "";
    renderProviders();
    return true;
  } catch (error) {
    providerSettingsStatus = "error";
    providerSettingsError = error.message;
    renderProviderManager();
    if (settingsView.hidden) showToast(error.message);
    return false;
  }
}

function resetProviderForm() {
  providerForm.reset();
  providerDefaultModel.value = "gpt-image-2";
  providerApiKey.placeholder = "输入 API Key";
  setInlineStatus(providerDialogStatus, "");
}

function openNewProviderDialog(opener) {
  editingProviderId = null;
  resetProviderForm();
  providerEditorTitle.textContent = "添加 Provider";
  window.ImageToolsUi.openDialog(providerDialog, opener);
  providerName.focus();
}

function openEditProviderDialog(providerId, opener) {
  const provider = providers.find((item) => item.id === Number(providerId));
  if (!provider) return;
  editingProviderId = provider.id;
  resetProviderForm();
  providerEditorTitle.textContent = "编辑 Provider";
  providerName.value = provider.name;
  providerBaseUrl.value = provider.baseUrl;
  providerApiKey.placeholder = provider.apiKeySet ? "已保存，留空则保持不变" : "输入 API Key";
  providerDefaultModel.value = provider.defaultModel;
  providerIsDefault.checked = provider.isDefault;
  window.ImageToolsUi.openDialog(providerDialog, opener);
  providerName.focus();
}

function closeProviderDialog() {
  if (providerSaveBtn.disabled) return Promise.resolve();
  providerSaveToken += 1;
  return window.ImageToolsUi.closeDialog(providerDialog);
}

function focusProviderRow(providerId) {
  providerList.querySelector(`[data-provider-id="${providerId}"] .provider-row-main`)?.focus();
}

async function openProviderMenu(provider, trigger) {
  const sameTrigger = providerMenuTrigger === trigger;
  if (window.ImageToolsUi.isLayerOpen(providerMenu)) {
    await closeProviderMenu({ restoreFocus: sameTrigger });
    if (sameTrigger) return;
  }
  providerMenuTarget = provider;
  providerMenuTrigger = trigger;
  providerMenuDefaultBtn.hidden = provider.isDefault;
  window.ImageToolsUi.openAnchoredLayer(providerMenu, trigger);
  providerMenu.querySelector('[role="menuitem"]:not([hidden])')?.focus();
}

async function closeProviderMenu({ restoreFocus = false } = {}) {
  const trigger = providerMenuTrigger;
  await window.ImageToolsUi.closeLayer(providerMenu, trigger, { restoreFocus });
  providerMenuTarget = null;
  providerMenuTrigger = null;
}

async function editProviderFromMenu() {
  const provider = providerMenuTarget;
  const opener = providerList.querySelector(`[data-provider-id="${provider?.id}"] .provider-row-main`);
  await closeProviderMenu();
  if (provider && opener) openEditProviderDialog(provider.id, opener);
}

async function setDefaultProviderFromMenu() {
  const provider = providerMenuTarget;
  await closeProviderMenu();
  if (!provider) return;
  setInlineStatus(providerActionStatus, "");
  try {
    await fetch(`/api/providers/${provider.id}/default`, { method: "POST" }).then(readJson);
    await loadProviders();
    focusProviderRow(provider.id);
  } catch (error) {
    setInlineStatus(providerActionStatus, error.message, "error");
    focusProviderRow(provider.id);
  }
}

async function openProviderDeleteDialog() {
  const provider = providerMenuTarget;
  const opener = providerList.querySelector(`[data-provider-id="${provider?.id}"] .provider-row-menu`);
  await closeProviderMenu();
  if (!provider || !opener) return;
  providerDeleteTarget = provider;
  providerDeleteMessage.textContent = `确定删除“${provider.name}”吗？此操作无法撤销。`;
  setInlineStatus(providerDeleteStatus, "");
  window.ImageToolsUi.openDialog(providerDeleteDialog, opener);
}

function closeProviderDeleteDialog() {
  if (providerDeleteConfirm.disabled) return Promise.resolve();
  providerDeleteTarget = null;
  return window.ImageToolsUi.closeDialog(providerDeleteDialog);
}

async function handleProviderDeleteSubmit(event) {
  event.preventDefault();
  const provider = providerDeleteTarget;
  if (!provider) return;
  providerDeleteConfirm.disabled = true;
  providerDeleteCancel.disabled = true;
  setInlineStatus(providerDeleteStatus, "");
  try {
    await fetch(`/api/providers/${provider.id}`, { method: "DELETE" }).then(readJson);
    await window.ImageToolsUi.closeDialog(providerDeleteDialog);
    providerDeleteTarget = null;
    await loadProviders();
    const nextFocus = providerList.querySelector(".provider-row-main") || addProviderBtn;
    nextFocus.focus();
  } catch (error) {
    setInlineStatus(providerDeleteStatus, error.message, "error");
  } finally {
    providerDeleteConfirm.disabled = false;
    providerDeleteCancel.disabled = false;
  }
}

async function handleProviderSubmit(event) {
  event.preventDefault();
  const token = ++providerSaveToken;
  const payload = window.ImageToolsWorkbench.buildProviderPayload({
    name: providerName.value,
    baseUrl: providerBaseUrl.value,
    apiKey: providerApiKey.value,
    defaultModel: providerDefaultModel.value,
    isDefault: providerIsDefault.checked,
  });
  const method = editingProviderId == null ? "POST" : "PATCH";
  const url = editingProviderId == null ? "/api/providers" : `/api/providers/${editingProviderId}`;
  providerSaveBtn.disabled = true;
  providerCancelBtn.disabled = true;
  providerDialogClose.disabled = true;
  providerSaveBtn.textContent = "保存中";
  setInlineStatus(providerDialogStatus, "");
  try {
    const saved = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(readJson);
    if (token !== providerSaveToken) return;
    await window.ImageToolsUi.closeDialog(providerDialog);
    await loadProviders();
    focusProviderRow(saved.id);
  } catch (error) {
    if (token === providerSaveToken) setInlineStatus(providerDialogStatus, error.message, "error");
  } finally {
    if (token === providerSaveToken) {
      providerSaveBtn.disabled = false;
      providerCancelBtn.disabled = false;
      providerDialogClose.disabled = false;
      providerSaveBtn.textContent = "保存";
    }
  }
}
```

After `app.js` uses `renderProviderSettings`, delete the old `renderProviderList` function and remove its export. The final renderer portion of the API object is:

```javascript
    renderSessionList,
    renderNewTask,
    renderProviderSettings,
    renderTaskRuns,
    renderTaskHeader,
```

Replace `openSettingsView` and the old Provider event bindings with:

```javascript
function openSettingsView(tab, opener) {
  settingsOpener = opener;
  settingsView.hidden = false;
  workspace.classList.add("settings-open");
  selectSettingsTab(tab);
  renderProviderManager();
  if (tab === "storage") {
    void loadStorageLocation(true);
  } else {
    addProviderBtn.focus();
  }
}

addProviderBtn.addEventListener("click", () => openNewProviderDialog(addProviderBtn));
providerDialogClose.addEventListener("click", closeProviderDialog);
providerCancelBtn.addEventListener("click", closeProviderDialog);
providerDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  void closeProviderDialog();
});
providerForm.addEventListener("submit", handleProviderSubmit);
providerMenuEditBtn.addEventListener("click", () => void editProviderFromMenu());
providerMenuDefaultBtn.addEventListener("click", () => void setDefaultProviderFromMenu());
providerMenuDeleteBtn.addEventListener("click", () => void openProviderDeleteDialog());
providerMenu.addEventListener("keydown", handleMenuKeydown);
providerDeleteCancel.addEventListener("click", () => void closeProviderDeleteDialog());
providerDeleteDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  void closeProviderDeleteDialog();
});
providerDeleteForm.addEventListener("submit", handleProviderDeleteSubmit);
```

- [ ] **Step 7: Run focused Provider verification**

Run:

```bash
node --test tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "Provider settings|Provider menu|Provider mutation|Provider list|missing Provider|settings opens"
```

Expected: PASS. The missing-Provider flow opens the Provider list empty state without creating a session.

- [ ] **Step 8: Commit the Provider vertical slice**

```bash
git add frontend/index.html frontend/ui.js frontend/app.js tests/frontend_ui_contract.test.js tests/ui/helpers.js tests/ui/codex_windows.spec.js
git commit -m "feat(settings): add focused provider management"
```

### Task 3: Replace the storage form with a workspace-data status flow

**Files:**
- Modify: `frontend/index.html: storage status element in #settingsStoragePanel`
- Modify: `tests/frontend_ui_contract.test.js:127-154`
- Modify: `tests/ui/helpers.js:51-66`
- Modify: `tests/ui/codex_windows.spec.js:244-319`
- Modify: `frontend/app.js:65-71, 1046-1108, event bindings near 1260`

- [ ] **Step 1: Replace the storage static contract**

Replace `settings dialog exposes a restart-only local data directory workflow` with:

```javascript
test("storage settings separates current status from the change dialog", () => {
  for (const id of [
    "storageCurrentPath",
    "storageChangeBtn",
    "storagePendingState",
    "storagePendingPath",
    "storageIdleState",
    "storagePanelStatus",
    "storageDialog",
    "storageDataDir",
    "storageMigrateExisting",
    "storageBrowseBtn",
    "storageApplyBtn",
    "storageDialogStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const storagePanel = html.match(
    /<section id="settingsStoragePanel"[\s\S]*?<\/section>\s*<\/div>/,
  )[0];
  assert.doesNotMatch(storagePanel, /id="storageDataDir"/);
  assert.match(app, /beginStorageChange/);
  assert.match(app, /openStorageDialog/);
  assert.match(app, /pick_data_directory/);
});
```

- [ ] **Step 2: Add storage loading failure support to the browser mock**

Replace the GET branch in the existing storage route with:

```javascript
    if (route.request().method() === "GET") {
      if (overrides.storageLoadError) {
        return route.fulfill({ status: 500, json: { detail: overrides.storageLoadError } });
      }
      return route.fulfill({ json: state.storageLocation });
    }
```

- [ ] **Step 3: Replace the permanent-form Playwright tests**

Replace the four existing storage settings tests with:

```javascript
test("storage settings confirms a copied workspace-data change", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await expect(settings.getByLabel("当前数据目录")).toHaveText(requests.storageLocation.active_data_dir);
  await expect(page.getByRole("dialog", { name: "更改数据位置" })).toBeHidden();

  await settings.getByRole("button", { name: "更改位置" }).click();
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  await expect(dialog.getByLabel("复制现有会话和文件")).toBeChecked();
  await dialog.getByLabel("新的数据目录").fill("D:\\Image Tools");
  await dialog.getByRole("button", { name: "应用更改" }).click();

  await expect.poll(() => requests.storageRequests).toEqual([
    { data_dir: "D:\\Image Tools", migrate_existing: true },
  ]);
  await expect(dialog).toBeHidden();
  await expect(settings.getByLabel("当前数据目录")).toHaveText(requests.storageLocation.default_data_dir);
  await expect(settings.getByLabel("等待重启的数据目录")).toHaveText("D:\\Image Tools");
  await expect(settings.getByText("等待重启", { exact: true })).toBeVisible();
});

test("native storage picker opens confirmation with the selected folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI__ = { core: { invoke: () => Promise.resolve("D:\\Selected Images") } };
  });
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "更改位置" }).click();
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("新的数据目录")).toHaveValue("D:\\Selected Images");
});

test("storage validation errors stay in the change dialog", async ({ page }) => {
  await installApiMocks(page, { storageLocationError: "数据目录必须使用绝对路径。" });
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "更改位置" }).click();
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  await dialog.getByLabel("新的数据目录").fill("relative-data");
  await dialog.getByRole("button", { name: "应用更改" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("数据目录必须使用绝对路径。");
  await expect(dialog.getByLabel("新的数据目录")).toHaveValue("relative-data");
});

test("storage status stays contained at desktop target sizes", async ({ page }) => {
  await installApiMocks(page);
  for (const viewport of [{ width: 1280, height: 860 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).click();
    const settings = page.getByRole("region", { name: "设置" });
    expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth), `${viewport.width}x${viewport.height}`).toBe(true);
  }
});

test("storage load failures stay in the settings page", async ({ page }) => {
  await installApiMocks(page, { storageLoadError: "工作区数据位置读取失败。" });
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("region", { name: "设置" }).getByRole("status"))
    .toContainText("工作区数据位置读取失败。");
});
```

- [ ] **Step 4: Run storage tests and verify RED**

Run:

```bash
node --test tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "storage settings|storage picker|storage validation|storage status|storage load"
```

Expected: FAIL because “更改位置” does not open a task dialog and pending state is not rendered separately.

- [ ] **Step 5: Replace storage orchestration with status and confirmation functions**

Replace `#settingsStoragePanel` with the status surface:

```html
<section id="settingsStoragePanel" class="settings-panel" aria-labelledby="settingsStorageTitle">
  <header class="settings-page-heading">
    <div><h2 id="settingsStorageTitle">本地数据</h2><p>管理会话、生成记录和图片文件的保存位置。</p></div>
  </header>
  <section class="settings-section" aria-labelledby="workspaceDataTitle">
    <h3 id="workspaceDataTitle">工作区数据位置</h3>
    <div class="storage-current-row">
      <span class="storage-icon"><i data-lucide="folder"></i></span>
      <span class="storage-current-copy">
        <span>当前数据目录 <span class="settings-status-chip">使用中</span></span>
        <output id="storageCurrentPath" aria-label="当前数据目录"></output>
      </span>
      <button id="storageChangeBtn" type="button" class="dialog-button">
        <i data-lucide="folder-open"></i><span>更改位置</span>
      </button>
    </div>
    <p class="settings-help">Provider、会话、生成记录、参考图和生成图片作为一个工作区数据集存放。</p>
  </section>
  <section class="settings-section" aria-labelledby="storageChangeStateTitle">
    <h3 id="storageChangeStateTitle">变更状态</h3>
    <div id="storagePendingState" class="storage-pending-state" hidden>
      <i data-lucide="info"></i>
      <span><strong>等待重启</strong><output id="storagePendingPath" aria-label="等待重启的数据目录"></output></span>
    </div>
    <p id="storageIdleState" class="settings-empty-copy">没有等待处理的变更。</p>
    <p id="storagePanelStatus" class="settings-inline-status" role="status" hidden></p>
  </section>
</section>
```

Add the storage task dialog before `#sessionDialog`:

```html
<dialog id="storageDialog" class="app-dialog settings-dialog" aria-labelledby="storageDialogTitle">
  <header><div><h2 id="storageDialogTitle">更改数据位置</h2><p>选择 Image Tools 下次启动时使用的目录。</p></div><button id="storageDialogClose" type="button" class="icon-button" aria-label="关闭"><i data-lucide="x"></i></button></header>
  <form id="storageLocationForm">
    <p id="storageDialogStatus" class="dialog-status" role="alert" hidden></p>
    <label><span>新的数据目录</span><span class="storage-directory-input"><input id="storageDataDir" required autocomplete="off" placeholder="D:\Image Tools" /><button id="storageBrowseBtn" type="button" class="icon-button" aria-label="选择目录" title="选择目录"><i data-lucide="folder-open"></i></button></span></label>
    <label class="checkbox-field"><input id="storageMigrateExisting" type="checkbox" checked /><span><strong>复制现有会话和文件</strong><small>下次启动时复制数据；原目录会保留。</small></span></label>
    <p class="storage-impact">更改将在重启应用后生效。复制完成前不会切换数据目录，也不会删除当前位置中的内容。</p>
    <footer><button id="storageCancelBtn" type="button" class="dialog-button">取消</button><button id="storageApplyBtn" type="submit" class="dialog-button primary">应用更改</button></footer>
  </form>
</dialog>
```

Replace the old storage selectors and add storage state with:

```javascript
const storageCurrentPath = document.querySelector("#storageCurrentPath");
const storageChangeBtn = document.querySelector("#storageChangeBtn");
const storagePendingState = document.querySelector("#storagePendingState");
const storagePendingPath = document.querySelector("#storagePendingPath");
const storageIdleState = document.querySelector("#storageIdleState");
const storagePanelStatus = document.querySelector("#storagePanelStatus");
const storageDialog = document.querySelector("#storageDialog");
const storageDialogClose = document.querySelector("#storageDialogClose");
const storageLocationForm = document.querySelector("#storageLocationForm");
const storageDialogStatus = document.querySelector("#storageDialogStatus");
const storageDataDir = document.querySelector("#storageDataDir");
const storageBrowseBtn = document.querySelector("#storageBrowseBtn");
const storageMigrateExisting = document.querySelector("#storageMigrateExisting");
const storageCancelBtn = document.querySelector("#storageCancelBtn");
const storageApplyBtn = document.querySelector("#storageApplyBtn");

let storageLocation = null;
```

Then replace the current storage functions with:

```javascript
function renderStorageLocation(location, message = "") {
  storageLocation = location;
  storageCurrentPath.value = location.active_data_dir || "";
  storagePendingPath.value = location.pending_data_dir || "";
  storagePendingState.hidden = !location.pending_data_dir;
  storageIdleState.hidden = Boolean(location.pending_data_dir);
  setInlineStatus(storagePanelStatus, message);
}

async function loadStorageLocation({ announce = "" } = {}) {
  setInlineStatus(storagePanelStatus, "正在读取工作区数据位置。");
  try {
    const location = await fetch("/api/storage-location").then(readJson);
    renderStorageLocation(location, announce);
    return location;
  } catch (error) {
    setInlineStatus(storagePanelStatus, error.message, "error");
    return null;
  }
}

function openStorageDialog(opener, dataDir, error = "") {
  storageLocationForm.reset();
  storageDataDir.value = dataDir || storageLocation?.pending_data_dir || storageLocation?.active_data_dir || "";
  storageMigrateExisting.checked = true;
  setInlineStatus(storageDialogStatus, error, error ? "error" : "");
  window.ImageToolsUi.openDialog(storageDialog, opener);
  storageDataDir.focus();
}

function closeStorageDialog() {
  if (storageApplyBtn.disabled) return Promise.resolve();
  return window.ImageToolsUi.closeDialog(storageDialog);
}

async function invokeStoragePicker() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return { available: false, selected: null };
  try {
    return { available: true, selected: await invoke("pick_data_directory"), error: "" };
  } catch (error) {
    return { available: true, selected: null, error: error.message || "无法打开系统目录选择器。" };
  }
}

async function beginStorageChange() {
  storageChangeBtn.disabled = true;
  const result = await invokeStoragePicker();
  storageChangeBtn.disabled = false;
  if (!result.available) {
    openStorageDialog(storageChangeBtn, storageLocation?.pending_data_dir || storageLocation?.active_data_dir || "");
    return;
  }
  if (result.error) {
    openStorageDialog(storageChangeBtn, storageLocation?.pending_data_dir || storageLocation?.active_data_dir || "", result.error);
    return;
  }
  if (result.selected) openStorageDialog(storageChangeBtn, result.selected);
}

async function browseStorageDirectory() {
  storageBrowseBtn.disabled = true;
  const result = await invokeStoragePicker();
  storageBrowseBtn.disabled = false;
  if (!result.available) {
    storageDataDir.focus();
    return;
  }
  if (result.error) {
    setInlineStatus(storageDialogStatus, result.error, "error");
    return;
  }
  if (result.selected) {
    storageDataDir.value = result.selected;
    storageDataDir.focus();
  }
}

async function handleStorageLocationSubmit(event) {
  event.preventDefault();
  storageApplyBtn.disabled = true;
  storageCancelBtn.disabled = true;
  storageDialogClose.disabled = true;
  storageApplyBtn.textContent = "应用中";
  setInlineStatus(storageDialogStatus, "");
  try {
    await fetch("/api/storage-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_dir: storageDataDir.value.trim(),
        migrate_existing: storageMigrateExisting.checked,
      }),
    }).then(readJson);
    await window.ImageToolsUi.closeDialog(storageDialog);
    await loadStorageLocation({ announce: "已安排数据位置变更，重启应用后生效。" });
  } catch (error) {
    setInlineStatus(storageDialogStatus, error.message, "error");
  } finally {
    storageApplyBtn.disabled = false;
    storageCancelBtn.disabled = false;
    storageDialogClose.disabled = false;
    storageApplyBtn.textContent = "应用更改";
  }
}
```

Replace the old storage event bindings and storage-tab handler with:

```javascript
settingsStorageNav.addEventListener("click", () => {
  selectSettingsTab("storage");
  void loadStorageLocation();
  storageChangeBtn.focus();
});
storageChangeBtn.addEventListener("click", () => void beginStorageChange());
storageBrowseBtn.addEventListener("click", () => void browseStorageDirectory());
storageDialogClose.addEventListener("click", closeStorageDialog);
storageCancelBtn.addEventListener("click", closeStorageDialog);
storageDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  void closeStorageDialog();
});
storageLocationForm.addEventListener("submit", handleStorageLocationSubmit);
```

Update the storage branch in `openSettingsView` now that `storageChangeBtn` exists:

```javascript
  if (tab === "storage") {
    void loadStorageLocation();
    storageChangeBtn.focus();
  } else {
    addProviderBtn.focus();
  }
```

- [ ] **Step 6: Run focused storage verification**

Run:

```bash
node --test tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "storage settings|storage picker|storage validation|storage status|storage load"
```

Expected: PASS. Active and pending paths remain distinct, and validation errors stay inside the dialog.

- [ ] **Step 7: Commit the storage vertical slice**

```bash
git add frontend/index.html frontend/app.js tests/frontend_ui_contract.test.js tests/ui/helpers.js tests/ui/codex_windows.spec.js
git commit -m "feat(settings): focus workspace data changes"
```

### Task 4: Apply Codex Desktop polish and nested-layer accessibility

**Files:**
- Modify: `tests/frontend_ui_contract.test.js:84-91, settings contracts`
- Modify: `tests/ui/codex_windows.spec.js:226-242, 303-319, 378-394`
- Modify: `frontend/app.js:1110-1132, 1206-1228, 1309-1325`
- Modify: `frontend/styles.css:1128-1437, 1507-1526, 1686-1722`
- Add/Update: `tests/ui/codex_windows.spec.js-snapshots/settings-*.png`

- [ ] **Step 1: Add layer-order, geometry, and visual tests**

Replace `menus and settings Provider view have stable visual states` with the parameter-menu-only baseline:

```javascript
test("parameter menu keeps its stable visual state", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/");
  await settleUi(page);
  await page.getByRole("button", { name: "图片参数" }).click();
  await expect(page.getByRole("menu", { name: "图片参数" })).toHaveScreenshot(
    "parameter-menu.png",
  );
});
```

Then add:

```javascript
test("Escape closes the innermost settings layer before the settings page", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Providers" });
  await opener.click();
  await page.getByRole("button", { name: "添加 Provider" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "添加 Provider" })).toBeHidden();
  await expect(page.getByRole("region", { name: "设置" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "设置" })).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Provider menu supports arrow navigation and restores its trigger", async ({ page }) => {
  await installApiMocks(page, {
    providers: [
      { id: 1, name: "Default", base_url: "https://one.example/v1", default_model: "gpt-image-2", is_default: true, api_key_set: true },
      { id: 2, name: "Studio", base_url: "https://two.example/v1", default_model: "studio-v1", is_default: false, api_key_set: true },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const trigger = page.getByRole("button", { name: "管理 Provider Studio" });
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "编辑" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "设为默认" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("settings visual baselines cover both themes and target sizes", async ({ page }) => {
  await installApiMocks(page);
  for (const viewport of [{ width: 1280, height: 860 }, { width: 960, height: 640 }]) {
    for (const colorScheme of ["light", "dark"]) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await settleUi(page);

      await page.getByRole("button", { name: "Providers" }).click();
      const settings = page.getByRole("region", { name: "设置" });
      await expect(settings.getByRole("button", { name: "编辑 Provider Default" })).toBeVisible();
      await expect(settings).toHaveScreenshot(`settings-provider-${viewport.width}x${viewport.height}-${colorScheme}.png`);
      await page.getByRole("button", { name: "添加 Provider" }).click();
      await expect(page.getByRole("dialog", { name: "添加 Provider" }))
        .toHaveScreenshot(`provider-dialog-${viewport.width}x${viewport.height}-${colorScheme}.png`);
      await page.keyboard.press("Escape");
      await settings.getByRole("button", { name: "本地数据" }).click();
      await expect(settings.getByLabel("当前数据目录")).not.toHaveText("");
      await expect(settings).toHaveScreenshot(`settings-storage-${viewport.width}x${viewport.height}-${colorScheme}.png`);
      await settings.getByRole("button", { name: "更改位置" }).click();
      await expect(page.getByRole("dialog", { name: "更改数据位置" }))
        .toHaveScreenshot(`storage-dialog-${viewport.width}x${viewport.height}-${colorScheme}.png`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "返回工作区" }).click();
    }
  }
});
```

Add this static CSS assertion:

```javascript
test("settings navigation uses a restrained neutral active state", () => {
  const activeRule = styles.match(
    /\.settings-nav button\[aria-current="page"\]\s*\{[\s\S]*?\}/,
  )[0];
  assert.match(activeRule, /background:\s*var\(--surface-hover\)/);
  assert.doesNotMatch(activeRule, /var\(--accent\)/);
});
```

- [ ] **Step 2: Run interaction and visual tests to verify RED**

Run:

```bash
node --test tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "Escape closes the innermost|Provider menu supports|settings visual baselines"
```

Expected: Escape closes the entire settings page too early, and visual snapshots are missing.

- [ ] **Step 3: Make Escape and outside-click handling innermost-first**

Replace the settings portion of `handleEscape` with this ordering and return after one handled layer:

```javascript
function handleEscape(event) {
  if (event.key !== "Escape") return;
  if (providerDialog.open || providerDeleteDialog.open || storageDialog.open || sessionDialog.open || imagePreviewDialog.open) return;
  if (window.ImageToolsUi.isLayerOpen(providerMenu)) {
    event.preventDefault();
    void closeProviderMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(taskMenu)) {
    void closeTaskMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(sidebarMenu)) {
    void closeSidebarMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(searchPanel)) {
    void window.ImageToolsUi.closeLayer(searchPanel, searchToggle, { restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(parameterMenu)) {
    void closeParameterMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(referenceMenu)) {
    void closeReferenceMenu({ restoreFocus: true });
    return;
  }
  if (!settingsView.hidden) closeSettingsView();
}
```

Add this Provider menu branch at the start of `handleOutsideClick`; the dialog `cancel` bindings were added in Tasks 2 and 3:

```javascript
  if (
    window.ImageToolsUi.isLayerOpen(providerMenu) &&
    !providerMenu.contains(event.target) &&
    !event.target.closest(".provider-row-menu")
  ) {
    void closeProviderMenu();
  }
```

- [ ] **Step 4: Replace the settings CSS with the approved layout and states**

Remove `.provider-dialog-grid`, `.provider-list-pane`, permanent `.provider-form` pane rules, and permanent `.storage-location-form` page rules. Add one coherent block with these final constraints:

```css
.settings-view {
  position: fixed;
  z-index: 25;
  inset: 0;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
}

.settings-shell {
  width: min(1080px, 100%);
  min-height: 100%;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
}

.settings-sidebar {
  padding: 22px 12px;
  border-right: 1px solid var(--line);
  background: var(--sidebar);
}

.settings-back {
  width: 100%;
  height: 36px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: transparent;
  font-weight: 650;
}

.settings-nav-label {
  display: block;
  margin: 24px 9px 7px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.settings-nav {
  display: grid;
  gap: 3px;
}

.settings-nav button {
  width: 100%;
  height: 36px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.settings-nav button[aria-current="page"] {
  color: var(--text);
  background: var(--surface-hover);
}

.settings-back:hover,
.settings-nav button:hover:not([aria-current="page"]) {
  color: var(--text);
  background: var(--surface-subtle);
}

.settings-main {
  min-width: 0;
  overflow: auto;
  padding: 46px 46px 64px;
}

.settings-panel {
  width: min(100%, 640px);
  margin: 0 auto;
}

.settings-page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.settings-page-heading h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 650;
}

.settings-page-heading p,
.settings-help,
.settings-empty-copy {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.settings-page-heading .dialog-button,
.storage-current-row .dialog-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.provider-list {
  margin-top: 32px;
  border-top: 1px solid var(--line);
}

.provider-row {
  min-width: 0;
  min-height: 62px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  align-items: center;
  border-bottom: 1px solid var(--line);
}

.provider-row-main {
  min-width: 0;
  min-height: 61px;
  padding: 9px 4px 9px 2px;
  display: flex;
  align-items: center;
  gap: 11px;
  overflow: hidden;
  border: 0;
  color: var(--text);
  background: transparent;
  text-align: left;
}

.provider-row-main:hover,
.provider-row-menu:hover {
  background: var(--surface-subtle);
}

.provider-avatar,
.storage-icon {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 32px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
  background: var(--surface);
  font-size: 12px;
  font-weight: 700;
}

.provider-copy,
.storage-current-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.provider-name-line {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}

.provider-detail,
.storage-current-copy output,
.storage-pending-state output {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-default,
.settings-status-chip {
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--muted);
  background: var(--surface-hover);
  font-size: 10px;
  font-weight: 600;
}

.settings-section {
  margin-top: 34px;
}

.settings-section + .settings-section {
  padding-top: 30px;
  border-top: 1px solid var(--line);
}

.settings-section h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 650;
}

.storage-current-row {
  min-height: 72px;
  padding: 10px 2px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.storage-pending-state {
  padding: 12px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-subtle);
}

.storage-pending-state span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.settings-inline-status,
.dialog-status {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.settings-inline-status[data-tone="error"],
.dialog-status[data-tone="error"] {
  color: var(--danger);
}

.settings-empty-state,
.settings-error-state {
  margin-top: 32px;
  padding: 28px 0;
  display: grid;
  justify-items: start;
  gap: 8px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.settings-empty-state p,
.settings-error-state p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.settings-skeleton-row {
  height: 62px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(90deg, transparent, var(--surface-subtle), transparent);
  background-size: 200% 100%;
  animation: settings-loading 1.2s linear infinite;
}

.settings-dialog > header p,
.storage-impact,
.checkbox-field small {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.settings-dialog .checkbox-field > span {
  display: grid;
  gap: 2px;
}

.settings-dialog {
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.settings-dialog .checkbox-field input[type="checkbox"] {
  appearance: none;
  width: 16px;
  height: 16px;
  margin: 0;
  display: grid;
  flex: 0 0 16px;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  background: var(--surface);
}

.settings-dialog .checkbox-field input[type="checkbox"]::before {
  content: "✓";
  color: var(--bg);
  font-size: 11px;
  font-weight: 700;
  transform: scale(0);
}

.settings-dialog .checkbox-field input[type="checkbox"]:checked {
  border-color: var(--text);
  background: var(--text);
}

.settings-dialog .checkbox-field input[type="checkbox"]:checked::before {
  transform: scale(1);
}

.provider-menu {
  position: fixed;
  z-index: 40;
  width: 180px;
}

@keyframes settings-loading {
  to { background-position: -200% 0; }
}

@media (max-width: 1040px) {
  .settings-shell { grid-template-columns: 148px minmax(0, 1fr); }
  .settings-main { padding: 32px 28px 48px; }
}
```

In reduced-motion mode, the existing global rule disables the skeleton animation. Verify checkbox dimensions remain `16px` and dialogs remain within `calc(100vw - 48px)` and `calc(100vh - 48px)`.

- [ ] **Step 5: Generate deterministic visual baselines**

Run:

```bash
git rm tests/ui/codex_windows.spec.js-snapshots/settings-provider-chromium-linux.png
npm run test:ui:update -- --grep "settings visual baselines"
```

Expected: 16 settings PNGs are created or updated for four states, two sizes, and two themes.

Inspect every `settings-provider-*`, `provider-dialog-*`, `settings-storage-*`, and `storage-dialog-*` PNG. Reject baselines with clipped paths, blue selected navigation, native unstyled checkboxes, overlapping text, nested cards, or dialogs outside the viewport.

- [ ] **Step 6: Run focused accessibility and visual verification**

Run:

```bash
node --test tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
npm run test:ui -- --grep "settings|Provider"
git diff --check
```

Expected: PASS with no snapshot changes after the update run and no whitespace errors.

- [ ] **Step 7: Commit interaction, styles, and snapshots**

```bash
git add frontend/app.js frontend/styles.css tests/frontend_ui_contract.test.js tests/ui/codex_windows.spec.js tests/ui/codex_windows.spec.js-snapshots
git commit -m "feat(settings): match Codex Desktop interaction polish"
```

### Task 5: Preserve project knowledge and run release-grade verification

**Files:**
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/05-review-notes.md`
- Modify: `knowledge/08-testing-strategy.md`
- Modify: `knowledge/10-lessons-learned.md`

- [ ] **Step 1: Record the completed ticket and review findings**

Add `UI012` to `knowledge/04-task-list.md`:

```markdown
| UI012 | Settings | Match the dedicated settings work area to the Codex Desktop baseline | Scan-first Provider management, focused task dialogs, workspace-data status, and expanded visual coverage | UI010 | Done |
```

Append this item to the Recommended Order list:

```markdown
10. UI012 turns the dedicated settings work area into a scan-first Codex Desktop-style management surface without changing Provider or storage contracts.
```

Append these concise findings to the relevant review sections in `knowledge/05-review-notes.md`:

```markdown
- Settings defaults to scan-first status surfaces; edit and migration controls appear only inside focused task dialogs.
- Provider secrets remain status-only in rendered DOM, and destructive Provider actions require named confirmation.
- Workspace data remains one coherent root; current and pending paths must never be presented as the same state.
- Escape closes the innermost settings layer before the dedicated settings work area.
```

- [ ] **Step 2: Record the testing matrix and reusable lessons**

Add to `knowledge/08-testing-strategy.md`:

```markdown
Settings baselines cover Provider list, Provider editor, workspace-data status, and storage confirmation at `1280x860` and `960x640` in both system themes. Behavior coverage includes Provider empty/error states, secret-preserving edits, named deletion confirmation, native and Web directory selection, pending-restart status, and innermost-first Escape handling.
```

Add to `knowledge/10-lessons-learned.md` under Useful Patterns:

```markdown
- Keep settings default pages scan-first: show durable state in restrained rows, then open a focused dialog only for a concrete edit or risky migration task.
- Treat a dedicated settings page and its menus/dialogs as nested layers; Escape and focus restoration must resolve the innermost active layer before leaving settings.
```

- [ ] **Step 3: Run the complete automated suite**

Run:

```bash
mise run test
mise run ui-test
mise run desktop-check
git diff --check
```

Expected: Python and Node tests pass, all Playwright behavior and snapshots pass, Cargo check passes, and no whitespace errors are reported.

- [ ] **Step 4: Start the local review surface**

Run the reload-enabled Web entry in a persistent execution session:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860 --reload
```

Open `http://127.0.0.1:7860`, repeat the Provider and workspace-data flows, and leave this server running for the user handoff. If port `7860` is occupied, select the next free local port and report the actual URL.

Expected: the approved settings experience is directly reviewable without Tauri and no external network is required until image generation.

- [ ] **Step 5: Perform the desktop fidelity gate**

Run:

```bash
mise run desktop-dev
```

On Windows WebView2, verify the Provider list, all three settings dialogs, native directory picker, light/dark system theme switching, `1280x860`, and `960x640`. Confirm no API Key appears in rendered text or screenshots. Stop the development process after the checks.

Expected: desktop behavior matches Chromium evidence; any Windows-only font or geometry difference is corrected before release.

- [ ] **Step 6: Commit knowledge updates**

```bash
git add knowledge/04-task-list.md knowledge/05-review-notes.md knowledge/08-testing-strategy.md knowledge/10-lessons-learned.md
git commit -m "docs(settings): record settings redesign verification"
```
