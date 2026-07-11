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

test("renderNewTask creates an unframed creation empty state", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<section id="timeline"></section>');
  const timeline = dom.window.document.querySelector("#timeline");

  ui.renderNewTask(timeline);

  assert.equal(timeline.querySelector("h2").textContent, "今天想创作什么？");
  assert.equal(timeline.querySelector(".empty-workspace img").alt, "");
});

test("renderProviderList exposes actions without rendering API keys", () => {
  assert.ok(ui, "frontend/ui.js must exist");
  const dom = new JSDOM('<div id="providers"></div>');
  const actions = [];
  ui.renderProviderList(
    dom.window.document.querySelector("#providers"),
    [
      {
        id: 2,
        name: "Default",
        defaultModel: "gpt-image-2",
        apiKeySet: true,
        isDefault: true,
      },
    ],
    2,
    (action, id) => actions.push([action, id]),
  );

  const row = dom.window.document.querySelector("[data-provider-id='2']");
  assert.match(row.textContent, /Default/);
  assert.match(row.textContent, /gpt-image-2/);
  assert.match(row.textContent, /已配置密钥/);
  assert.doesNotMatch(row.textContent, /sk-/);
  row.querySelector("[data-action='edit']").click();
  assert.deepEqual(actions, [["edit", 2]]);
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
  assert.match(dom.window.document.querySelector(".run-error").textContent, /上游超时/);
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
