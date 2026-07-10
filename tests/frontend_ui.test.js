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

  assert.equal(timeline.querySelector("strong").textContent, "今天想创作什么？");
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
