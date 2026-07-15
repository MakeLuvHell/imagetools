const { test, expect } = require("@playwright/test");
const { installApiMocks, settleUi } = require("./helpers");

async function expectTopStartAnchor(page, trigger, layer) {
  await expect(layer).toHaveAttribute("data-placement", "top");
  await expect(layer).toHaveAttribute("data-motion", "open");
  const [triggerBox, layerBox] = await Promise.all([
    trigger.boundingBox(),
    layer.boundingBox(),
  ]);
  const viewport = page.viewportSize();

  expect(Math.abs(layerBox.x - triggerBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(triggerBox.y - (layerBox.y + layerBox.height) - 8)).toBeLessThanOrEqual(1);
  expect(layerBox.x).toBeGreaterThanOrEqual(12);
  expect(layerBox.y).toBeGreaterThanOrEqual(12);
  expect(layerBox.x + layerBox.width).toBeLessThanOrEqual(viewport.width - 12);
  expect(layerBox.y + layerBox.height).toBeLessThanOrEqual(viewport.height - 12);
}

async function openStorageSettings(page) {
  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await settings.getByRole("button", { name: "本地数据" }).click();
  await expect(page.locator("#settingsStoragePanel")).toBeVisible();
  return settings;
}

test("new task creates a session only on first valid submit", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天想创作什么？" })).toBeVisible();
  await expect.poll(() => requests.sessionsCreated).toBe(0);
  const prompt = page.getByPlaceholder("描述你想创作的图片");
  await prompt.fill("夏季饮品海报");
  await prompt.press("Enter");
  await expect.poll(() => requests.sessionsCreated).toBe(1);
  await expect.poll(() => requests.requestLog).toEqual(["session", "generate"]);
  expect(requests.requestLog).toEqual(["session", "generate"]);
  expect(requests.generateBodies[0]).toContain('name="session_id"\r\n\r\n2');
});

test("sidebar renders pinned, project, and ordinary session groups", async ({ page }) => {
  await installApiMocks(page, {
    projects: [{ id: 8, name: "品牌视觉" }],
    sessions: [
      { id: 1, title: "置顶灵感", is_pinned: true, project_id: 8 },
      { id: 2, title: "产品海报", project_id: 8 },
      { id: 3, title: "独立尝试" },
    ],
    runs: { 1: [], 2: [], 3: [] },
  });
  await page.goto("/");

  await expect(page.locator(".session-group-title")).toHaveText(["置顶", "项目", "会话"]);
  await expect(page.locator(".project-row")).toHaveText("品牌视觉");
  await expect(page.locator(".session-item")).toHaveText([
    "置顶灵感",
    "产品海报",
    "独立尝试",
  ]);
});

test("sidebar session menu can remove a pinned session from the pinned group", async ({ page }) => {
  await installApiMocks(page, {
    projects: [{ id: 8, name: "品牌视觉" }],
    sessions: [{ id: 1, title: "置顶灵感", is_pinned: true, project_id: 8 }],
    runs: { 1: [] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "整理会话" }).click();
  await page.getByRole("menuitem", { name: "取消置顶" }).click();

  await expect(page.locator(".session-group-title")).toHaveText(["项目"]);
  await expect(page.locator(".project-row")).toHaveText("品牌视觉");
  await expect(page.locator(".session-item")).toHaveText(["置顶灵感"]);
});

test("missing Provider opens settings without creating a session", async ({ page }) => {
  const requests = await installApiMocks(page, { providers: [] });
  await page.goto("/");
  const prompt = page.getByPlaceholder("描述你想创作的图片");
  await prompt.fill("夏季饮品海报");
  await prompt.press("Enter");
  await expect(page.getByRole("region", { name: "设置" })).toBeVisible();
  await expect(page.locator("#settingsProvidersPanel")).toBeVisible();
  await expect.poll(() => requests.sessionsCreated).toBe(0);
});

test("parameter menu closes with Escape and restores trigger focus", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "图片参数" });
  await trigger.click();
  await expect(page.getByRole("menu", { name: "图片参数" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("parameter menu supports arrow-key focus movement", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "图片参数" }).click();
  await expect(page.locator("#ratioSelect")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#resolutionSelect")).toBeFocused();
});

test("rapid double submit creates only one session and generation", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  const prompt = page.getByPlaceholder("描述你想创作的图片");
  await prompt.fill("夏季饮品海报");
  await Promise.all([prompt.press("Enter"), prompt.press("Enter")]);
  await expect.poll(() => requests.requestLog.length).toBeGreaterThanOrEqual(2);
  expect(requests.sessionsCreated).toBe(1);
  expect(requests.requestLog).toEqual(["session", "generate"]);
});

test("retry after a network failure reuses the created session", async ({ page }) => {
  const requests = await installApiMocks(page, { generateFailure: true });
  await page.goto("/");
  const prompt = page.getByPlaceholder("描述你想创作的图片");
  await prompt.fill("夏季饮品海报");
  await prompt.press("Enter");
  const retry = page.getByRole("button", { name: "重试" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect.poll(() => requests.generateBodies.length).toBe(2);
  expect(requests.sessionsCreated).toBe(1);
  expect(requests.requestLog).toEqual(["session", "generate", "generate"]);
});

test("Lucide is served locally and health identifies the app", async ({ request }) => {
  const icons = await request.get("/static/vendor/lucide.min.js");
  expect(icons.status()).toBe(200);
  expect(await icons.text()).toContain("createIcons");
  await expect(await request.get("/api/health").then((response) => response.json())).toMatchObject({
    app: "Image Tools",
  });
});

test("desktop shell has no horizontal overflow at the minimum size", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await settleUi(page);
  for (const selector of [".app-shell", ".session-sidebar", ".timeline", ".composer"]) {
    const fits = await page.locator(selector).evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    );
    expect(fits, selector).toBe(true);
  }
});

test("Composer menus stay anchored through viewport resize", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/");
  const parameterTrigger = page.getByRole("button", { name: "图片参数" });
  const parameterMenu = page.getByRole("menu", { name: "图片参数" });

  await parameterTrigger.click();
  await expectTopStartAnchor(page, parameterTrigger, parameterMenu);
  await page.setViewportSize({ width: 960, height: 640 });
  await expectTopStartAnchor(page, parameterTrigger, parameterMenu);

  await page.keyboard.press("Escape");
  await expect(parameterMenu).toBeHidden();
  const referenceTrigger = page.getByRole("button", { name: "添加参考图" });
  const referenceMenu = page.locator("#referenceMenu");
  await referenceTrigger.click();
  await expectTopStartAnchor(page, referenceTrigger, referenceMenu);
});

test("expanded advanced parameters stay inside the viewport", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "图片参数" });
  const menu = page.getByRole("menu", { name: "图片参数" });
  await trigger.click();
  await menu.locator("summary").click();

  const [box, viewport] = await Promise.all([menu.boundingBox(), page.viewportSize()]);
  expect(box.y).toBeGreaterThanOrEqual(12);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 12);
});

test("search keeps the local workspace control at the sidebar bottom", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  const workspace = page.locator(".workspace-account");
  const search = page.getByRole("button", { name: "搜索会话" });

  const before = await workspace.boundingBox();
  await search.click();
  await expect(page.locator("#searchPanel")).toBeVisible();
  const opened = await workspace.boundingBox();
  await search.click();
  await expect(page.locator("#searchPanel")).toBeHidden();
  const closed = await workspace.boundingBox();

  for (const box of [before, opened, closed]) {
    expect(Math.round(box.y + box.height)).toBe(640);
  }
});

test("wide desktop windows expand the session sidebar", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");

  expect((await page.locator(".session-sidebar").boundingBox()).width).toBeGreaterThan(280);
});

test("Provider settings adds and edits through a focused dialog", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await expect(
    settings.getByRole("button", { name: "编辑 Provider Default" }),
  ).toBeVisible();
  await expect(settings.locator("#providerName")).toHaveCount(0);

  await settings.getByRole("button", { name: "添加 Provider" }).click();
  const addDialog = page.getByRole("dialog", { name: "添加 Provider" });
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel("名称").fill("Studio");
  await addDialog.getByLabel("Base URL").fill("https://studio.example/v1");
  await addDialog.getByLabel("API Key").fill("secret-value");
  await addDialog.getByLabel("默认模型").fill("studio-image-v1");
  await addDialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(addDialog).toBeHidden();
  const studioRow = settings.getByRole("button", {
    name: "编辑 Provider Studio",
  });
  await expect(studioRow).toBeVisible();
  await studioRow.click();

  const editDialog = page.getByRole("dialog", { name: "编辑 Provider" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("API Key")).toHaveValue("");
  await expect(editDialog.getByLabel("API Key")).toHaveAttribute(
    "placeholder",
    "已保存，留空则保持不变",
  );
  await editDialog.getByLabel("名称").fill("Studio Updated");
  await editDialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(editDialog).toBeHidden();
  await expect(
    settings.getByRole("button", { name: "编辑 Provider Studio Updated" }),
  ).toBeVisible();
  await expect.poll(() => requests.providerRequests.at(-1)?.method).toBe("PATCH");
  expect(requests.providerRequests.at(-1).body.api_key).toBe("");
});

test("newest Provider reload wins when an older response finishes last", async ({ page }) => {
  const requests = await installApiMocks(page, {
    providerListDelaysMs: [0, 1200, 0],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await expect.poll(() => requests.providerListResponses).toBe(1);
  await expect(
    settings.getByRole("button", { name: "编辑 Provider Default" }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "添加 Provider" }).click();
  const dialog = page.getByRole("dialog", { name: "添加 Provider" });
  await dialog.getByLabel("名称").fill("Studio");
  await dialog.getByLabel("Base URL").fill("https://studio.example/v1");
  await dialog.getByLabel("API Key").fill("secret-value");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => requests.providerListRequests).toBe(2);
  await settings.getByRole("button", { name: "添加 Provider" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "取消" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "关闭" })).toBeEnabled();
  await dialog.getByLabel("名称").fill("Latest");
  await dialog.getByLabel("Base URL").fill("https://latest.example/v1");
  await dialog.getByLabel("API Key").fill("latest-secret");
  await dialog.getByLabel("设为默认 Provider").check();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => requests.providerListRequests).toBe(3);
  await expect.poll(() => requests.providerListResponses).toBe(3);
  expect(requests.providerListResponseOrder).toEqual([1, 3, 2]);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  const latestEdit = settings.getByRole("button", {
    name: "编辑 Provider Latest",
  });
  await expect(latestEdit).toBeVisible();
  await expect(settings.locator(".provider-default")).toHaveCount(1);
  await expect(latestEdit.locator("..").locator(".provider-default")).toHaveText("默认");
  await expect(page.locator("#providerSelect option")).toHaveText([
    "Default",
    "Studio",
    "Latest",
  ]);
  await expect(settings.locator("#providerActionStatus")).toBeHidden();
});

test("Provider menu sets defaults and confirms deletion", async ({ page }) => {
  const requests = await installApiMocks(page, {
    providers: [
      {
        id: 1,
        name: "Default",
        base_url: "https://api.example/v1",
        default_model: "gpt-image-2",
        is_default: true,
        api_key_set: true,
      },
      {
        id: 2,
        name: "Studio",
        base_url: "https://studio.example/v1",
        default_model: "studio-image-v1",
        is_default: false,
        api_key_set: true,
      },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  const studioMenuButton = settings.getByRole("button", {
    name: "管理 Provider Studio",
  });

  await studioMenuButton.click();
  const menu = page.getByRole("menu", { name: "Provider 操作" });
  await menu.getByRole("menuitem", { name: "设为默认" }).click();
  await expect
    .poll(() => requests.providers.filter((provider) => provider.is_default).map((provider) => provider.id))
    .toEqual([2]);

  await studioMenuButton.click();
  await menu.getByRole("menuitem", { name: "删除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "删除 Provider" });
  await expect(deleteDialog).toContainText("Studio");
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  await expect(
    settings.getByRole("button", { name: "编辑 Provider Studio" }),
  ).toBeVisible();

  await studioMenuButton.click();
  await menu.getByRole("menuitem", { name: "删除" }).click();
  await deleteDialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "编辑 Provider Studio" }),
  ).toHaveCount(0);
});

test("Escape closes the innermost settings layer before the settings page", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Providers" });
  await opener.click();
  const settings = page.getByRole("region", { name: "设置" });
  await settings.getByRole("button", { name: "添加 Provider" }).click();
  const dialog = page.getByRole("dialog", { name: "添加 Provider" });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settings).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Provider menu supports arrow navigation and restores its trigger", async ({ page }) => {
  await installApiMocks(page, {
    providers: [
      {
        id: 1,
        name: "Default",
        base_url: "https://api.example/v1",
        default_model: "gpt-image-2",
        is_default: true,
        api_key_set: true,
      },
      {
        id: 2,
        name: "Studio",
        base_url: "https://studio.example/v1",
        default_model: "studio-image-v1",
        is_default: false,
        api_key_set: true,
      },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const trigger = page.getByRole("button", { name: "管理 Provider Studio" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Provider 操作" });

  await expect(menu.getByRole("menuitem", { name: "编辑" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "设为默认" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Provider menu closes after an outside click", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByRole("button", { name: "管理 Provider Default" }).click();
  const menu = page.getByRole("menu", { name: "Provider 操作" });

  await expect(menu).toBeVisible();
  await page.getByRole("heading", { name: "Provider" }).click();
  await expect(menu).toBeHidden();
});

test("Provider mutation errors remain in the active dialog", async ({ page }) => {
  await installApiMocks(page, {
    providerMutationError: "Base URL 无法连接。",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByRole("button", { name: "添加 Provider" }).click();
  const dialog = page.getByRole("dialog", { name: "添加 Provider" });
  await dialog.getByLabel("名称").fill("Broken");
  await dialog.getByLabel("Base URL").fill("https://broken.example/v1");
  await dialog.getByLabel("API Key").fill("secret-value");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("Base URL 无法连接。");
  await expect(dialog.getByLabel("名称")).toHaveValue("Broken");
});

test("Provider list failures render an inline retry state", async ({ page }) => {
  await installApiMocks(page, {
    providerListError: "Provider 列表读取失败。",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  const error = settings.getByRole("alert");

  await expect(error).toContainText("Provider 列表读取失败。");
  await expect(error.getByRole("button", { name: "重试" })).toBeVisible();
});

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

test("stored manual theme synchronizes once at startup without rewriting persistence", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("image-tools-theme", "dark");
    window.themeCommands = [];
    window.themeWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "image-tools-theme") window.themeWrites.push(value);
      return original.call(this, key, value);
    };
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command === "set_app_theme") window.themeCommands.push(args);
          return null;
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => window.themeCommands)).toEqual([
    { mode: "dark" },
  ]);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => window.themeWrites)).toEqual([]);
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("radio", { name: "深色" })).toBeChecked();
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

test("selected theme activation retries failures without duplicating ordinary changes", async ({ page }) => {
  await page.addInitScript(() => {
    window.themeActivity = { writes: [], commands: [] };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "image-tools-theme") {
        window.themeActivity.writes.push(value);
        const darkWrites = window.themeActivity.writes.filter(
          (mode) => mode === "dark",
        ).length;
        if (value === "dark" && darkWrites === 1) {
          throw new Error("storage blocked once");
        }
      }
      return original.call(this, key, value);
    };
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command !== "set_app_theme") return null;
          window.themeActivity.commands.push(args);
          const darkCommands = window.themeActivity.commands.filter(
            ({ mode }) => mode === "dark",
          ).length;
          if (args.mode === "dark" && darkCommands === 1) {
            throw new Error("native blocked once");
          }
          return null;
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const dark = page.getByRole("radio", { name: "深色" });

  await dark.check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#themeStatus")).toHaveText(
    "主题偏好无法保存。 native blocked once",
  );
  await expect.poll(() => page.evaluate(() => window.themeActivity)).toEqual({
    writes: ["dark"],
    commands: [{ mode: "system" }, { mode: "dark" }],
  });

  await dark.click();
  await expect.poll(() => page.evaluate(() => window.themeActivity)).toEqual({
    writes: ["dark", "dark"],
    commands: [
      { mode: "system" },
      { mode: "dark" },
      { mode: "dark" },
    ],
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#themeStatus")).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem("image-tools-theme")),
  ).toBe("dark");

  await dark.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "浅色" })).toBeChecked();
  await expect.poll(() => page.evaluate(() => window.themeActivity)).toEqual({
    writes: ["dark", "dark", "light"],
    commands: [
      { mode: "system" },
      { mode: "dark" },
      { mode: "dark" },
      { mode: "light" },
    ],
  });
});

test("storage settings confirms a copied workspace-data change", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  const settings = await openStorageSettings(page);
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });

  await expect(settings.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.active_data_dir,
  );
  await expect(dialog).toBeHidden();
  await settings.getByRole("button", { name: "更改位置" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("复制现有会话和文件")).toBeChecked();
  await dialog.getByLabel("新的数据目录").fill("D:\\Image Tools");
  await dialog.getByRole("button", { name: "应用更改" }).click();

  await expect.poll(() => requests.storageRequests).toEqual([
    { data_dir: "D:\\Image Tools", migrate_existing: true },
  ]);
  await expect.poll(() => requests.storagePostResponses).toBe(1);
  await expect.poll(() => requests.storageGetResponses).toBe(2);
  expect(requests.storageRequestOrder).toEqual([
    { method: "GET", ordinal: 1 },
    { method: "POST", ordinal: 1 },
    { method: "GET", ordinal: 2 },
  ]);
  await expect(dialog).toBeHidden();
  await expect(settings.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.active_data_dir,
  );
  await expect(settings.getByLabel("等待重启的数据目录")).toHaveText(
    "D:\\Image Tools",
  );
  await expect(settings.getByText("等待重启", { exact: true })).toBeVisible();
});

test("storage async latest GET wins after overlapping changes", async ({ page }) => {
  const requests = await installApiMocks(page, {
    storageGetDelaysMs: [0, 1200, 0],
  });
  await page.goto("/");
  const settings = await openStorageSettings(page);
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  const changeLocation = settings.getByRole("button", { name: "更改位置" });
  await expect.poll(() => requests.storageGetResponses).toBe(1);

  await changeLocation.click();
  await dialog.getByLabel("新的数据目录").fill("D:\\First");
  await dialog.getByRole("button", { name: "应用更改" }).click();
  await expect.poll(() => requests.storageGetRequests).toBe(2);

  await changeLocation.click();
  await dialog.getByLabel("新的数据目录").fill("D:\\Latest");
  await dialog.getByRole("button", { name: "应用更改" }).click();
  await expect.poll(() => requests.storageGetRequests).toBe(3);
  await expect.poll(() => requests.storageGetResponseOrder).toEqual([1, 3, 2]);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await expect(settings.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.active_data_dir,
  );
  await expect(settings.getByLabel("等待重启的数据目录")).toHaveText("D:\\Latest");
  await expect(settings.getByText("等待重启", { exact: true })).toBeVisible();
  await expect(settings.locator("#storagePanelStatus")).toHaveText(
    "已安排数据位置变更，重启应用后生效。",
  );
});

test("storage async older submit cannot unlock a newer submit", async ({ page }) => {
  const requests = await installApiMocks(page, {
    storageGetDelaysMs: [0, 1500, 0],
    storagePostDelaysMs: [0, 3000],
  });
  await page.goto("/");
  const settings = await openStorageSettings(page);
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  const changeLocation = settings.getByRole("button", { name: "更改位置" });
  await expect.poll(() => requests.storageGetResponses).toBe(1);

  await changeLocation.click();
  await dialog.getByLabel("新的数据目录").fill("D:\\First");
  await dialog.getByRole("button", { name: "应用更改" }).click();
  await expect.poll(() => requests.storageGetRequests).toBe(2);

  await changeLocation.click();
  await dialog.getByLabel("新的数据目录").fill("D:\\Second");
  await dialog.getByRole("button", { name: "应用更改" }).click();
  await expect.poll(() => requests.storagePostRequests).toBe(2);
  expect(requests.storagePostResponses).toBe(1);
  await expect.poll(() => requests.storageGetResponses).toBe(2);
  await expect(settings.getByLabel("等待重启的数据目录")).toHaveText("D:\\First");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#storageApplyBtn")).toBeDisabled();
  await expect(dialog.locator("#storageApplyBtn")).toHaveText("应用中");
  await expect(dialog.locator("#storageCancelBtn")).toBeDisabled();
  await expect(dialog.locator("#storageDialogClose")).toBeDisabled();

  await expect.poll(() => requests.storagePostResponses).toBe(2);
  await expect.poll(() => requests.storageGetResponses).toBe(3);
  await expect(dialog).toBeHidden();
  await expect(settings.getByLabel("等待重启的数据目录")).toHaveText("D:\\Second");
});

test("storage async ignores initial picker after settings lifecycle changes", async ({ page }) => {
  await page.addInitScript(() => {
    const picker = { calls: 0, settled: 0, resolve: null };
    window.__storagePickerControl = picker;
    window.__TAURI__ = {
      core: {
        invoke(command) {
          if (command !== "pick_data_directory") {
            return Promise.reject(new Error("unexpected command"));
          }
          picker.calls += 1;
          return new Promise((resolve) => {
            picker.resolve = resolve;
          }).finally(() => {
            picker.settled += 1;
          });
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  const settings = await openStorageSettings(page);
  await settings.getByRole("button", { name: "更改位置" }).click();
  await expect.poll(() =>
    page.evaluate(() => window.__storagePickerControl.calls),
  ).toBe(1);

  await page.getByRole("button", { name: "返回工作区" }).click();
  await page.getByRole("button", { name: "Providers" }).click();
  const addProvider = settings.getByRole("button", { name: "添加 Provider" });
  await expect(addProvider).toBeFocused();
  await page.evaluate(() => {
    window.__storagePickerControl.resolve("D:\\Stale");
  });
  await expect.poll(() =>
    page.evaluate(() => window.__storagePickerControl.settled),
  ).toBe(1);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await expect(page.getByRole("dialog", { name: "更改数据位置" })).toBeHidden();
  await expect(page.locator("#settingsProvidersPanel")).toBeVisible();
  await expect(addProvider).toBeFocused();
});

test("storage async ignores browse picker from a closed dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const picker = { calls: 0, oldBrowseSettled: 0, resolveOldBrowse: null };
    window.__storagePickerControl = picker;
    window.__TAURI__ = {
      core: {
        invoke(command) {
          if (command !== "pick_data_directory") {
            return Promise.reject(new Error("unexpected command"));
          }
          picker.calls += 1;
          if (picker.calls === 1) return Promise.resolve("D:\\Initial");
          if (picker.calls === 2) {
            return new Promise((resolve) => {
              picker.resolveOldBrowse = resolve;
            }).finally(() => {
              picker.oldBrowseSettled += 1;
            });
          }
          if (picker.calls === 3) return Promise.resolve("D:\\New");
          return Promise.reject(new Error("unexpected picker call"));
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  const settings = await openStorageSettings(page);
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  const dataDirectory = dialog.getByLabel("新的数据目录");
  await settings.getByRole("button", { name: "更改位置" }).click();
  await expect(dataDirectory).toHaveValue("D:\\Initial");

  await dialog.getByRole("button", { name: "选择目录" }).click();
  await expect.poll(() =>
    page.evaluate(() => window.__storagePickerControl.calls),
  ).toBe(2);
  await dialog.getByRole("button", { name: "关闭" }).click();
  await expect(dialog).toBeHidden();
  await settings.getByRole("button", { name: "更改位置" }).click();
  await expect(dataDirectory).toHaveValue("D:\\New");
  await expect(dataDirectory).toBeFocused();

  await page.evaluate(() => {
    window.__storagePickerControl.resolveOldBrowse("D:\\Stale");
  });
  await expect.poll(() =>
    page.evaluate(() => window.__storagePickerControl.oldBrowseSettled),
  ).toBe(1);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await expect(dialog).toBeVisible();
  await expect(dataDirectory).toHaveValue("D:\\New");
  await expect(dataDirectory).toBeFocused();
  await expect(dialog.locator("#storageBrowseBtn")).toBeEnabled();
  await expect(dialog.locator("#storageApplyBtn")).toBeEnabled();
  await expect(dialog.locator("#storageApplyBtn")).toHaveText("应用更改");
  await expect(dialog.locator("#storageCancelBtn")).toBeEnabled();
  await expect(dialog.locator("#storageDialogClose")).toBeEnabled();
});

test("native storage picker opens confirmation with the selected folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI__ = {
      core: {
        invoke(command) {
          return command === "pick_data_directory"
            ? Promise.resolve("D:\\Selected Images")
            : Promise.reject(new Error("unexpected command"));
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  const settings = await openStorageSettings(page);
  await settings.getByRole("button", { name: "更改位置" }).click();
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("新的数据目录")).toHaveValue(
    "D:\\Selected Images",
  );
});

test("storage picker errors preserve the directory and restore input focus", async ({ page }) => {
  await page.addInitScript(() => {
    let pickerCalls = 0;
    window.__TAURI__ = {
      core: {
        invoke(command) {
          if (command !== "pick_data_directory") {
            return Promise.reject(new Error("unexpected command"));
          }
          pickerCalls += 1;
          return pickerCalls === 1
            ? Promise.resolve("D:\\Selected Images")
            : Promise.reject(new Error("目录选择器不可用。"));
        },
      },
    };
  });
  await installApiMocks(page);
  await page.goto("/");
  const settings = await openStorageSettings(page);
  await settings.getByRole("button", { name: "更改位置" }).click();
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  const dataDirectory = dialog.getByLabel("新的数据目录");
  await dialog.getByRole("button", { name: "选择目录" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("目录选择器不可用。");
  await expect(dataDirectory).toHaveValue("D:\\Selected Images");
  await expect(dataDirectory).toBeFocused();
});

test("storage validation errors stay in the change dialog", async ({ page }) => {
  await installApiMocks(page, { storageLocationError: "数据目录必须使用绝对路径。" });
  await page.goto("/");
  const settings = await openStorageSettings(page);
  await settings.getByRole("button", { name: "更改位置" }).click();
  const dialog = page.getByRole("dialog", { name: "更改数据位置" });
  await dialog.getByLabel("新的数据目录").fill("relative-data");
  await dialog.getByRole("button", { name: "应用更改" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("数据目录必须使用绝对路径。");
  await expect(dialog.getByLabel("新的数据目录")).toHaveValue("relative-data");
});

test("storage status stays contained at desktop target sizes", async ({ page }) => {
  await installApiMocks(page);
  for (const viewport of [
    { width: 1280, height: 860 },
    { width: 960, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const settings = await openStorageSettings(page);
    expect(
      await settings.evaluate((element) => element.scrollWidth <= element.clientWidth),
      `${viewport.width}x${viewport.height}`,
    ).toBe(true);
  }
});

test("storage load failures stay in the settings page", async ({ page }) => {
  await installApiMocks(page, { storageLoadError: "工作区数据位置读取失败。" });
  await page.goto("/");
  const settings = await openStorageSettings(page);
  const status = settings.locator("#storagePanelStatus[role=status]");

  await expect(status).toBeVisible();
  await expect(status).toContainText("工作区数据位置读取失败。");
});

test("reduced motion opens anchored menus without active animation", async ({ page }) => {
  await installApiMocks(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "图片参数" }).click();
  const menu = page.getByRole("menu", { name: "图片参数" });

  await expect(menu).toHaveAttribute("data-motion", "open");
  expect(
    await menu.evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test("shell visual baselines follow viewport and system theme", async ({ page }) => {
  await installApiMocks(page);
  for (const viewport of [
    { width: 1280, height: 860 },
    { width: 960, height: 640 },
  ]) {
    for (const colorScheme of ["light", "dark"]) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await settleUi(page);
      await expect(page.locator(".app-shell")).toHaveScreenshot(
        `shell-${viewport.width}x${viewport.height}-${colorScheme}.png`,
      );
    }
  }
});

test("theme changes after load and long CJK content stays contained", async ({ page }) => {
  const longTitle = "超长中文创作会话".repeat(25);
  await installApiMocks(page, {
    sessions: [{ id: 1, title: longTitle, updated_at: "2026-07-10T12:00:00Z" }],
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  const light = await page.locator(".app-shell").evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.locator(".app-shell").evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(dark).not.toBe(light);
  await page.getByPlaceholder("描述你想创作的图片").fill("图片提示词".repeat(40));
  for (const selector of [".session-sidebar", ".composer"]) {
    expect(
      await page.locator(selector).evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
      selector,
    ).toBe(true);
  }
});

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

test("settings visual baselines cover both themes and target sizes", async ({ page }) => {
  await installApiMocks(page);
  for (const viewport of [
    { width: 1280, height: 860 },
    { width: 960, height: 640 },
  ]) {
    for (const colorScheme of ["light", "dark"]) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await settleUi(page);

      await page.getByRole("button", { name: "Providers" }).click();
      const settings = page.getByRole("region", { name: "设置" });
      await expect(
        settings.getByRole("button", { name: "编辑 Provider Default" }),
      ).toBeVisible();
      await expect(settings).toHaveScreenshot(
        `settings-provider-${viewport.width}x${viewport.height}-${colorScheme}.png`,
      );
      expect(
        await settings.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      for (const selector of [".settings-main", ".settings-panel:not([hidden])"]) {
        expect(
          await settings.locator(selector).evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
          selector,
        ).toBe(true);
      }

      await settings.getByRole("button", { name: "添加 Provider" }).click();
      const providerDialog = page.getByRole("dialog", { name: "添加 Provider" });
      await expect(providerDialog).toHaveScreenshot(
        `provider-dialog-${viewport.width}x${viewport.height}-${colorScheme}.png`,
      );
      const providerBox = await providerDialog.boundingBox();
      expect(providerBox.x).toBeGreaterThanOrEqual(0);
      expect(providerBox.y).toBeGreaterThanOrEqual(0);
      expect(providerBox.x + providerBox.width).toBeLessThanOrEqual(viewport.width);
      expect(providerBox.y + providerBox.height).toBeLessThanOrEqual(viewport.height);
      await expect(providerDialog.locator("#providerIsDefault")).toHaveCSS("width", "16px");
      await expect(providerDialog.locator("#providerIsDefault")).toHaveCSS("height", "16px");
      await page.keyboard.press("Escape");

      await settings.getByRole("button", { name: "本地数据" }).click();
      await expect(settings.getByLabel("当前数据目录")).not.toHaveText("");
      await expect(settings).toHaveScreenshot(
        `settings-storage-${viewport.width}x${viewport.height}-${colorScheme}.png`,
      );
      expect(
        await settings.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      for (const selector of [".settings-main", ".settings-panel:not([hidden])"]) {
        expect(
          await settings.locator(selector).evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
          selector,
        ).toBe(true);
      }

      await settings.getByRole("button", { name: "更改位置" }).click();
      const storageDialog = page.getByRole("dialog", { name: "更改数据位置" });
      await expect(storageDialog).toHaveScreenshot(
        `storage-dialog-${viewport.width}x${viewport.height}-${colorScheme}.png`,
      );
      const storageBox = await storageDialog.boundingBox();
      expect(storageBox.x).toBeGreaterThanOrEqual(0);
      expect(storageBox.y).toBeGreaterThanOrEqual(0);
      expect(storageBox.x + storageBox.width).toBeLessThanOrEqual(viewport.width);
      expect(storageBox.y + storageBox.height).toBeLessThanOrEqual(viewport.height);
      await expect(storageDialog.locator("#storageMigrateExisting")).toHaveCSS("width", "16px");
      await expect(storageDialog.locator("#storageMigrateExisting")).toHaveCSS("height", "16px");
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "返回工作区" }).click();
      await expect(settings).toBeHidden();
    }
  }
});

test("settings dialog stays contained and scrolls in a short viewport", async ({ page }) => {
  await installApiMocks(page);
  const viewport = { width: 960, height: 420 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByRole("button", { name: "添加 Provider" }).click();

  const dialog = page.getByRole("dialog", { name: "添加 Provider" });
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(
    await dialog.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
});

test("running success and failure remain stable in one task stream", async ({ page }) => {
  const running = {
    id: 10,
    status: "running",
    prompt: "夏季饮品主视觉",
    provider_name: "Default",
    model: "gpt-image-2",
    parameters: { count: 2 },
    images: [],
  };
  const requests = await installApiMocks(page, { runs: { 1: [running] } });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/");
  await settleUi(page);
  const session = page.getByRole("button", { name: "夏季饮品广告图" });
  await session.click();
  await expect(page.locator(".timeline")).toHaveScreenshot("task-running.png");

  requests.runs[1] = [
    {
      ...running,
      status: "succeeded",
      images: [
        { url: "/files/images/result.png", filename: "result.png" },
        { url: "/files/images/result.png", filename: "result-2.png" },
      ],
    },
  ];
  await page.getByRole("button", { name: "新建任务" }).click();
  await session.click();
  await expect(page.locator(".timeline")).toHaveScreenshot("task-success.png");

  requests.runs[1] = [
    {
      ...running,
      status: "failed",
      error_message: "上游服务超时，请稍后重试",
    },
  ];
  await page.getByRole("button", { name: "新建任务" }).click();
  await session.click();
  await expect(page.locator(".timeline")).toHaveScreenshot("task-failure.png");

  const boxes = await page.evaluate(() => {
    const task = document.querySelector(".task-run").getBoundingClientRect();
    const composer = document.querySelector(".composer").getBoundingClientRect();
    return { taskBottom: task.bottom, composerTop: composer.top };
  });
  expect(boxes.taskBottom).toBeLessThanOrEqual(boxes.composerTop);
});
