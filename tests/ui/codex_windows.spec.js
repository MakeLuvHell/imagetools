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

test("Provider stale reloads do not disable a newer dialog", async ({ page }) => {
  const requests = await installApiMocks(page, { providerReloadDelayMs: 500 });
  await page.goto("/");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
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

test("settings opens as a dedicated view and switches between provider and storage", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const opener = page.getByRole("button", { name: "设置" });
  await opener.click();
  const settings = page.getByRole("region", { name: "设置" });

  await expect(settings).toBeVisible();
  await expect(page.locator("#composerForm")).toBeHidden();
  await expect(page.locator("#settingsStoragePanel")).toBeVisible();
  await settings.getByRole("button", { name: "Provider", exact: true }).click();
  await expect(page.locator("#settingsProvidersPanel")).toBeVisible();
  await page.getByRole("button", { name: "返回工作区" }).click();

  await expect(settings).toBeHidden();
  await expect(opener).toBeFocused();
});

test("settings schedules a copied data migration without switching the active path", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("region", { name: "设置" });

  await expect(settings.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.active_data_dir,
  );
  await settings.getByLabel("新的数据目录").fill("D:\\Image Tools");
  await settings.getByLabel("复制现有会话和文件").check();
  await settings.getByRole("button", { name: "应用" }).click();

  await expect.poll(() => requests.storageRequests).toEqual([
    { data_dir: "D:\\Image Tools", migrate_existing: true },
  ]);
  await expect(settings.locator("#storageLocationStatus")).toHaveText(
    "已设置新位置，重启应用后生效。",
  );
  await expect(settings.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.default_data_dir,
  );
});

test("storage directory picker fills the selected native folder", async ({ page }) => {
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
  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await settings.getByRole("button", { name: "选择目录" }).click();

  await expect(settings.getByLabel("新的数据目录")).toHaveValue("D:\\Selected Images");
  await expect(settings.getByLabel("新的数据目录")).toBeFocused();
});

test("settings displays storage validation errors in the local section", async ({ page }) => {
  await installApiMocks(page, { storageLocationError: "数据目录必须使用绝对路径。" });
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await settings.getByLabel("新的数据目录").fill("relative-data");
  await settings.getByRole("button", { name: "应用" }).click();

  await expect(settings.locator("#storageLocationStatus")).toHaveText(
    "数据目录必须使用绝对路径。",
  );
});

test("storage settings stay contained at desktop target sizes", async ({ page }) => {
  await installApiMocks(page);
  for (const viewport of [
    { width: 1280, height: 860 },
    { width: 960, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).click();
    const settings = page.getByRole("region", { name: "设置" });
    await expect(settings.getByLabel("新的数据目录")).toBeFocused();
    expect(
      await settings.evaluate((element) => element.scrollWidth <= element.clientWidth),
      `${viewport.width}x${viewport.height}`,
    ).toBe(true);
  }
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

test("menus and settings Provider view have stable visual states", async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/");
  await settleUi(page);
  await page.getByRole("button", { name: "图片参数" }).click();
  await expect(page.getByRole("menu", { name: "图片参数" })).toHaveScreenshot(
    "parameter-menu.png",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Providers" }).click();
  const settings = page.getByRole("region", { name: "设置" });
  await expect(settings).toHaveScreenshot("settings-provider.png");
  expect(
    await settings.evaluate((element) => element.scrollWidth <= element.clientWidth),
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
