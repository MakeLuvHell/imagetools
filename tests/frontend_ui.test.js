const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

let ui = null;
try {
  ui = require("../frontend/ui.js");
} catch {
  // The first RED run intentionally exercises the missing renderer module.
}

test("renderSessionList creates compact selectable text rows", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<nav id="sessions"></nav>');
  const selected = [];
  ui.renderSessionList(
    dom.window.document.querySelector("#sessions"),
    [{ id: 7, title: "夏季海报" }],
    7,
    (id) => selected.push(id),
  );

  const button = dom.window.document.querySelector("button.session-item");
  assert.equal(button.textContent.trim(), "夏季海报");
  assert.equal(button.getAttribute("aria-current"), "page");
  assert.equal(button.title, "夏季海报");
  button.click();
  assert.deepEqual(selected, [7]);
});

test("renderSessionList groups pinned and project sessions with compact actions", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<nav id="sessions"></nav>');
  const toggles = [];
  const projectActions = [];
  const sessionActions = [];
  const pointerStarts = [];
  ui.renderSessionList(
    dom.window.document.querySelector("#sessions"),
    {
      pinned: [{ id: 1, title: "置顶灵感" }],
      projects: [
        {
          project: { id: 7, name: "品牌视觉" },
          sessions: [{ id: 2, title: "产品海报" }],
        },
      ],
      ungrouped: [{ id: 3, title: "独立尝试" }],
    },
    2,
    {
      collapsedProjectIds: new Set([7]),
      onSelect() {},
      onProjectToggle: (id) => toggles.push(id),
      onProjectAction: (project) => projectActions.push(project.id),
      onSessionAction: (session) => sessionActions.push(session.id),
      onSessionPointerDown: (session, event) =>
        pointerStarts.push([session.id, event.type]),
    },
  );

  assert.deepEqual(
    [...dom.window.document.querySelectorAll(".session-group-title")].map((node) => node.textContent),
    ["置顶", "项目", "会话"],
  );
  const container = dom.window.document.querySelector("#sessions");
  const toggle = container.querySelector('[data-project-toggle="7"]');
  const children = container.querySelector('[data-project-sessions="7"]');
  const projectRow = container.querySelector('[data-project-id="7"]');
  const sessionRow = container.querySelector('[data-session-id="2"]');
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(children.hidden, true);
  assert.equal(projectRow.classList.contains("project-drop-target"), true);
  assert.equal(projectRow.querySelector(".project-name").textContent, "品牌视觉");
  assert.equal(dom.window.document.querySelector(".session-item[aria-current='page']").textContent.trim(), "产品海报");
  assert.equal(dom.window.document.querySelectorAll("button.session-item").length, 3);
  assert.equal(
    sessionRow.querySelector(".session-row-action").getAttribute("aria-label"),
    "会话操作 产品海报",
  );

  toggle.click();
  projectRow.querySelector(".project-row-action").click();
  sessionRow.querySelector(".session-row-action").click();
  sessionRow.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
  assert.deepEqual(toggles, [7]);
  assert.deepEqual(projectActions, [7]);
  assert.deepEqual(sessionActions, [2]);
  assert.deepEqual(pointerStarts, [[2, "pointerdown"]]);
});

test("project groups finish collapse motion before hiding and reopen in place", async () => {
  const dom = new JSDOM(`
    <button id="toggle" aria-expanded="true" aria-label="收起项目 品牌视觉">
      <i data-lucide="chevron-right"></i>
    </button>
    <div id="children"><button>产品海报</button></div>
  `);
  const toggle = dom.window.document.querySelector("#toggle");
  const children = dom.window.document.querySelector("#children");
  let finishCollapse;
  const animation = {
    playState: "running",
    finished: new Promise((resolve) => {
      finishCollapse = resolve;
    }),
    cancel() {},
  };
  children.getAnimations = () =>
    children.dataset.motion === "closing" && animation.playState === "running"
      ? [animation]
      : [];

  const closing = ui.setProjectGroupExpanded(toggle, children, false);

  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "展开项目 品牌视觉");
  assert.equal(children.hidden, false);
  assert.equal(children.dataset.motion, "closing");

  animation.playState = "finished";
  finishCollapse();
  await closing;
  assert.equal(children.hidden, true);

  children.getAnimations = () => [];
  await ui.setProjectGroupExpanded(toggle, children, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(toggle.getAttribute("aria-label"), "收起项目 品牌视觉");
  assert.equal(children.hidden, false);
  assert.equal(toggle.querySelector("i").dataset.lucide, "chevron-right");
  dom.window.close();
});

test("renderNewTask creates an unframed creation empty state", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<section id="timeline"></section>');
  const timeline = dom.window.document.querySelector("#timeline");

  ui.renderNewTask(timeline);

  assert.equal(timeline.querySelector("h2").textContent, "今天想创作什么？");
  assert.equal(timeline.querySelector(".empty-workspace img").alt, "");
});

test("renderProviderSettings renders scan-first provider rows", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  assert.equal(typeof ui.renderProviderSettings, "function");
  const dom = new JSDOM('<div id="providers" aria-live="polite"></div>');
  const container = dom.window.document.querySelector("#providers");
  const edits = [];
  const menus = [];
  ui.renderProviderSettings(
    container,
    {
      status: "ready",
      providers: [{
        id: 2,
        name: "Default",
        defaultModel: "gpt-image-2",
        apiKeySet: true,
        isDefault: true,
        apiKey: "sk-never-render",
      }],
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
  assert.doesNotMatch(container.innerHTML, /sk-never-render/);

  const main = row.querySelector(".provider-row-main");
  const menu = row.querySelector(".provider-row-menu");
  assert.equal(main.tagName, "BUTTON");
  assert.equal(main.type, "button");
  assert.equal(main.getAttribute("aria-label"), "编辑 Provider Default");
  assert.equal(menu.tagName, "BUTTON");
  assert.equal(menu.type, "button");
  assert.equal(menu.getAttribute("aria-label"), "管理 Provider Default");
  assert.equal(menu.getAttribute("aria-haspopup"), "menu");
  assert.equal(menu.getAttribute("aria-expanded"), "false");

  main.click();
  menu.click();
  assert.deepEqual(edits, [[2, "provider-row-main"]]);
  assert.deepEqual(menus, [[2, "provider-row-menu icon-button"]]);
});

test("renderProviderSettings keeps unconfigured provider text inert", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<div id="providers" aria-live="polite"></div>');
  const container = dom.window.document.querySelector("#providers");
  const hostileName = '<img src=x data-injected="provider-name">';
  const hostileModel = '<script data-injected="provider-model">alert("xss")</script>';

  ui.renderProviderSettings(container, {
    status: "ready",
    providers: [{
      id: 3,
      name: hostileName,
      defaultModel: hostileModel,
      apiKeySet: false,
      isDefault: false,
      api_key: "sk-never-render",
    }],
  });

  const row = container.querySelector("[data-provider-id='3']");
  assert.equal(row.querySelector(".provider-name-line strong").textContent, hostileName);
  assert.equal(
    row.querySelector(".provider-detail").textContent,
    `${hostileModel} · API Key 未配置`,
  );
  assert.equal(row.querySelector(".provider-default"), null);
  assert.equal(row.querySelector("img, script"), null);
  assert.doesNotMatch(container.innerHTML, /sk-never-render/);
});

test("renderProviderSettings renders stable loading, empty, and error states", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  assert.equal(typeof ui.renderProviderSettings, "function");
  const dom = new JSDOM('<div id="providers" aria-live="polite"></div>');
  const container = dom.window.document.querySelector("#providers");

  ui.renderProviderSettings(container, { status: "loading" });
  assert.equal(container.getAttribute("aria-busy"), "true");
  assert.equal(container.querySelectorAll(".settings-skeleton-row").length, 2);

  let added = false;
  ui.renderProviderSettings(
    container,
    { status: "ready", providers: [] },
    { onAdd: () => { added = true; } },
  );
  const empty = container.querySelector(".settings-empty-state");
  assert.ok(empty);
  assert.equal(container.hasAttribute("aria-busy"), false);
  empty.querySelector("button").click();
  assert.equal(added, true);

  let retried = false;
  ui.renderProviderSettings(
    container,
    { status: "error", error: "Provider 加载失败" },
    { onRetry: () => { retried = true; } },
  );
  const error = container.querySelector(".settings-error-state");
  assert.match(error.textContent, /Provider 加载失败/);
  error.querySelector("button").click();
  assert.equal(retried, true);
});

test("renderTaskRuns keeps success and failure in one chronological stream", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<section id="timeline"></section>');
  ui.renderTaskRuns(
    dom.window.document.querySelector("#timeline"),
    [
      {
        id: 1,
        status: "succeeded",
        prompt: "夏季海报",
        parameters: { count: 2 },
        images: [{ url: "/files/images/1.png" }],
      },
      {
        id: 2,
        status: "failed",
        prompt: "提高对比度",
        parameters: {},
        error_message: "上游超时",
        images: [],
      },
    ],
    {},
  );

  assert.equal(dom.window.document.querySelectorAll(".task-run").length, 2);
  assert.equal(dom.window.document.querySelectorAll(".result-image").length, 1);
  assert.equal(
    dom.window.document.querySelectorAll('button[aria-label="设为参考图"]').length,
    1,
  );
  assert.equal(
    [...dom.window.document.querySelectorAll("button")].some(
      (button) => button.textContent === "基于结果继续",
    ),
    false,
  );
  assert.match(dom.window.document.querySelector(".run-error").textContent, /上游超时/);
});

test("result actions expose pending and success feedback without duplicate clicks", async () => {
  const dom = new JSDOM('<section id="timeline"></section>');
  let resolveCopy;
  let copyCalls = 0;
  ui.renderTaskRuns(
    dom.window.document.querySelector("#timeline"),
    [
      {
        id: 1,
        status: "succeeded",
        prompt: "夏季海报",
        parameters: {},
        images: [{ id: 9, url: "imagetools-media://image/9" }],
      },
    ],
    {
      onCopyLink: () => {
        copyCalls += 1;
        return new Promise((resolve) => {
          resolveCopy = resolve;
        });
      },
    },
  );

  const button = dom.window.document.querySelector('button[aria-label="复制链接"]');
  button.click();
  button.click();

  assert.equal(copyCalls, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.dataset.feedback, "pending");
  assert.equal(button.getAttribute("aria-busy"), "true");
  assert.equal(button.getAttribute("aria-label"), "复制链接，处理中");
  assert.equal(button.querySelector("i").dataset.lucide, "loader-circle");

  resolveCopy(true);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(button.disabled, false);
  assert.equal(button.dataset.feedback, "success");
  assert.equal(button.getAttribute("aria-busy"), "false");
  assert.equal(button.getAttribute("aria-label"), "复制链接，已完成");
  assert.equal(button.querySelector("i").dataset.lucide, "check");
  ui.resetButtonFeedback(button);
  assert.equal(button.dataset.feedback, undefined);
  assert.equal(button.hasAttribute("aria-busy"), false);
  assert.equal(button.getAttribute("aria-label"), "复制链接");
  assert.equal(button.querySelector("i").dataset.lucide, "copy");
  dom.window.close();
});

test("result images leave their loading state only after load or error", () => {
  const dom = new JSDOM('<section id="timeline"></section>');
  ui.renderTaskRuns(
    dom.window.document.querySelector("#timeline"),
    [
      {
        id: 1,
        status: "succeeded",
        prompt: "夏季海报",
        parameters: {},
        images: [{ id: 9, url: "imagetools-media://image/9" }],
      },
    ],
  );

  const figure = dom.window.document.querySelector(".result-image");
  const image = figure.querySelector("img");
  assert.equal(figure.dataset.imageState, "loading");

  image.dispatchEvent(new dom.window.Event("load"));
  assert.equal(figure.dataset.imageState, "loaded");

  figure.dataset.imageState = "loading";
  image.dispatchEvent(new dom.window.Event("error"));
  assert.equal(figure.dataset.imageState, "error");
  dom.window.close();
});

test("renderTaskRuns exposes optimistic prompt handoff targets", () => {
  const dom = new JSDOM('<section id="timeline"></section>');
  const timeline = dom.window.document.querySelector("#timeline");
  ui.renderTaskRuns(timeline, [
    {
      id: "pending-1",
      submissionId: "pending-1",
      optimistic: true,
      status: "running",
      prompt: "发送中的提示词",
      parameters: { count: 1 },
    },
  ]);

  assert.equal(
    timeline.querySelector('[data-submission-id="pending-1"] .user-prompt')
      .textContent,
    "发送中的提示词",
  );
});

test("prompt handoff creates a transient clone and cleans up after motion", async () => {
  const dom = new JSDOM('<section id="timeline"><div id="target">发送中的提示词</div></section>');
  const timeline = dom.window.document.querySelector("#timeline");
  const target = dom.window.document.querySelector("#target");
  Object.defineProperties(timeline, {
    scrollHeight: { value: 900 },
    clientHeight: { value: 300 },
  });
  timeline.scrollTop = 100;
  target.getBoundingClientRect = () => ({
    left: 400,
    top: 700,
    width: 180,
    height: 40,
    right: 580,
    bottom: 740,
  });
  let resolveAnimation;
  let keyframes;
  dom.window.HTMLElement.prototype.animate = (frames) => {
    keyframes = frames;
    return {
      finished: new Promise((resolve) => {
        resolveAnimation = resolve;
      }),
    };
  };

  const handoff = ui.startPromptHandoff({
    document: dom.window.document,
    sourceRect: { left: 200, top: 500, width: 300, height: 44 },
    target,
    scrollContainer: timeline,
    text: "发送中的提示词",
    reducedMotion: false,
  });

  assert.equal(dom.window.document.querySelectorAll(".prompt-handoff").length, 1);
  assert.equal(target.classList.contains("is-handoff-hidden"), true);
  assert.equal(timeline.scrollTop, 600);
  assert.match(keyframes[1].transform, /translate\(200px, -300px\)/);
  resolveAnimation();
  await handoff.finished;
  assert.equal(dom.window.document.querySelectorAll(".prompt-handoff").length, 0);
  assert.equal(target.classList.contains("is-handoff-hidden"), false);
});

test("scrollTimelineToLatest aligns a history container to its newest record", () => {
  const dom = new JSDOM('<section id="timeline"></section>');
  const timeline = dom.window.document.querySelector("#timeline");
  Object.defineProperties(timeline, {
    scrollHeight: { value: 1280 },
    clientHeight: { value: 480 },
  });

  ui.scrollTimelineToLatest(timeline);

  assert.equal(timeline.scrollTop, 800);
});

test("prompt handoff reduced motion and animation failure always reveal the target", async () => {
  const dom = new JSDOM('<div id="target">提示词</div>');
  const target = dom.window.document.querySelector("#target");
  target.getBoundingClientRect = () => ({
    left: 20,
    top: 20,
    width: 100,
    height: 30,
    right: 120,
    bottom: 50,
  });

  const reduced = ui.startPromptHandoff({
    document: dom.window.document,
    sourceRect: { left: 10, top: 80, width: 200, height: 40 },
    target,
    text: "提示词",
    reducedMotion: true,
  });
  await reduced.finished;
  assert.equal(dom.window.document.querySelector(".prompt-handoff"), null);
  assert.equal(target.classList.contains("is-handoff-hidden"), false);

  dom.window.HTMLElement.prototype.animate = () => ({
    finished: Promise.reject(new Error("animation cancelled")),
  });
  const failed = ui.startPromptHandoff({
    document: dom.window.document,
    sourceRect: { left: 10, top: 80, width: 200, height: 40 },
    target,
    text: "提示词",
    reducedMotion: false,
  });
  await failed.finished;
  assert.equal(dom.window.document.querySelector(".prompt-handoff"), null);
  assert.equal(target.classList.contains("is-handoff-hidden"), false);
});

test("anchoredLayerPosition aligns a menu above the trigger", () => {
  assert.deepEqual(
    ui.anchoredLayerPosition({
      anchor: { top: 500, right: 260, bottom: 530, left: 160 },
      layer: { width: 240, height: 180 },
      viewport: { width: 960, height: 640 },
    }),
    { left: 160, top: 312, placement: "top" },
  );
});

test("anchoredLayerPosition falls below when the menu does not fit above", () => {
  assert.deepEqual(
    ui.anchoredLayerPosition({
      anchor: { top: 20, right: 280, bottom: 50, left: 40 },
      layer: { width: 240, height: 180 },
      viewport: { width: 960, height: 640 },
    }),
    { left: 40, top: 58, placement: "bottom" },
  );
});

test("anchoredLayerPosition clamps a wide menu to the viewport inset", () => {
  assert.deepEqual(
    ui.anchoredLayerPosition({
      anchor: { top: 500, right: 70, bottom: 530, left: 10 },
      layer: { width: 240, height: 180 },
      viewport: { width: 220, height: 640 },
    }),
    { left: 12, top: 312, placement: "top" },
  );
});

test("openAnchoredLayer positions the layer and closeLayer restores focus", async () => {
  const dom = new JSDOM(`
    <button id="trigger" aria-expanded="false">参数</button>
    <div id="menu" hidden></div>
  `);
  const trigger = dom.window.document.querySelector("#trigger");
  const menu = dom.window.document.querySelector("#menu");
  trigger.getBoundingClientRect = () => ({
    top: 500,
    right: 260,
    bottom: 530,
    left: 160,
  });
  menu.getBoundingClientRect = () => ({ width: 240, height: 180 });
  Object.defineProperty(dom.window, "innerWidth", { value: 960 });
  Object.defineProperty(dom.window, "innerHeight", { value: 640 });

  ui.openAnchoredLayer(menu, trigger);

  assert.equal(menu.hidden, false);
  assert.equal(menu.style.left, "160px");
  assert.equal(menu.style.top, "312px");
  assert.equal(menu.dataset.placement, "top");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  await ui.closeLayer(menu, trigger, { restoreFocus: true });

  assert.equal(menu.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(dom.window.document.activeElement, trigger);
});

test("reopening a closing layer prevents stale animation completion from hiding it", async () => {
  const dom = new JSDOM('<button id="trigger"></button><div id="menu" hidden></div>');
  const trigger = dom.window.document.querySelector("#trigger");
  const menu = dom.window.document.querySelector("#menu");
  trigger.getBoundingClientRect = () => ({
    top: 500,
    right: 260,
    bottom: 530,
    left: 160,
  });
  menu.getBoundingClientRect = () => ({ width: 240, height: 180 });
  Object.defineProperty(dom.window, "innerWidth", { value: 960 });
  Object.defineProperty(dom.window, "innerHeight", { value: 640 });

  let finishClose;
  const closeAnimation = {
    playState: "running",
    finished: new Promise((resolve) => {
      finishClose = resolve;
    }),
    cancel() {
      this.playState = "idle";
      finishClose();
    },
  };
  menu.getAnimations = () =>
    menu.dataset.motion === "closing" && closeAnimation.playState === "running"
      ? [closeAnimation]
      : [];

  ui.openAnchoredLayer(menu, trigger);
  const closing = ui.closeLayer(menu, trigger);
  ui.openAnchoredLayer(menu, trigger);
  await closing;

  assert.equal(menu.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
});

test("dialog helpers focus the first input and restore the opener", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM(`
    <button id="opener">打开</button>
    <dialog><input disabled /><input id="title" /><button>保存</button></dialog>
  `);
  const opener = dom.window.document.querySelector("#opener");
  const dialog = dom.window.document.querySelector("dialog");
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  opener.focus();

  ui.openDialog(dialog, opener);
  assert.equal(dom.window.document.activeElement.id, "title");
  ui.closeDialog(dialog);
  assert.equal(dom.window.document.activeElement.id, "opener");
});

test("openDialog traps Tab focus inside the active dialog", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM(`
    <button id="opener">打开</button>
    <dialog><input id="first" /><button id="last">保存</button></dialog>
  `);
  const dialog = dom.window.document.querySelector("dialog");
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  ui.openDialog(dialog, dom.window.document.querySelector("#opener"));

  const first = dom.window.document.querySelector("#first");
  const last = dom.window.document.querySelector("#last");
  last.focus();
  dialog.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(dom.window.document.activeElement, first);

  dialog.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(dom.window.document.activeElement, last);
});

test("app uses application dialogs and draft-first session creation", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "frontend", "app.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /window\.(prompt|confirm)\(/);
  assert.match(source, /function startNewTask\(/);
  assert.match(source, /async function ensureSessionForSubmit\(/);
  assert.match(source, /draftStorageKey/);
});
