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

test("missing Provider opens settings without creating a session", async ({ page }) => {
  const requests = await installApiMocks(page, { providers: [] });
  await page.goto("/");
  const prompt = page.getByPlaceholder("描述你想创作的图片");
  await prompt.fill("夏季饮品海报");
  await prompt.press("Enter");
  await expect(page.getByRole("dialog", { name: "Providers" })).toBeVisible();
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

test("Provider Cancel closes settings and restores the sidebar opener", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Providers" });

  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Providers" });
  await expect(dialog).toHaveAttribute("data-motion", "open");
  await dialog.getByRole("button", { name: "取消" }).click();

  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("settings schedules a copied data migration without switching the active path", async ({ page }) => {
  const requests = await installApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const dialog = page.getByRole("dialog", { name: "Providers" });

  await expect(dialog.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.active_data_dir,
  );
  await dialog.getByLabel("新的数据目录").fill("D:\\Image Tools");
  await dialog.getByLabel("复制现有会话和文件").check();
  await dialog.getByRole("button", { name: "应用" }).click();

  await expect.poll(() => requests.storageRequests).toEqual([
    { data_dir: "D:\\Image Tools", migrate_existing: true },
  ]);
  await expect(dialog.locator("#storageLocationStatus")).toHaveText(
    "已设置新位置，重启应用后生效。",
  );
  await expect(dialog.getByLabel("当前数据目录")).toHaveText(
    requests.storageLocation.default_data_dir,
  );
});

test("settings displays storage validation errors in the local section", async ({ page }) => {
  await installApiMocks(page, { storageLocationError: "数据目录必须使用绝对路径。" });
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const dialog = page.getByRole("dialog", { name: "Providers" });
  await dialog.getByLabel("新的数据目录").fill("relative-data");
  await dialog.getByRole("button", { name: "应用" }).click();

  await expect(dialog.locator("#storageLocationStatus")).toHaveText(
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
    const dialog = page.getByRole("dialog", { name: "Providers" });
    await expect(dialog.getByLabel("新的数据目录")).toBeFocused();
    expect(
      await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
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

test("menus and Provider dialog have stable visual states", async ({ page }) => {
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
  const dialog = page.getByRole("dialog", { name: "Providers" });
  await expect(dialog).toHaveScreenshot("provider-dialog.png");
  expect(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
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
