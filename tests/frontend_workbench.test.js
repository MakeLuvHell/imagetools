const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workbench = require("../frontend/workbench.js");

test("applySessionList selects the newest session when no selection exists", () => {
  const state = workbench.defaultWorkbenchState();

  const next = workbench.applySessionList(state, [
    { id: 2, title: "头像探索", updated_at: "2026-07-09T02:00:00Z" },
    { id: 1, title: "产品海报", updated_at: "2026-07-09T01:00:00Z" },
  ]);

  assert.equal(next.selectedSessionId, 2);
  assert.equal(workbench.selectedSession(next).title, "头像探索");
});

test("selectSession ignores ids that are not in the loaded list", () => {
  const state = workbench.applySessionList(workbench.defaultWorkbenchState(), [
    { id: 1, title: "产品海报" },
  ]);

  const next = workbench.selectSession(state, 99);

  assert.equal(next.selectedSessionId, 1);
});

test("applySessionList preserves current selection when it still exists", () => {
  const state = workbench.selectSession(
    workbench.applySessionList(workbench.defaultWorkbenchState(), [
      { id: 1, title: "产品海报" },
      { id: 2, title: "头像探索" },
    ]),
    2,
  );

  const next = workbench.applySessionList(state, [
    { id: 3, title: "新主题" },
    { id: 2, title: "头像探索" },
  ]);

  assert.equal(next.selectedSessionId, 2);
});

test("desktop workbench html exposes two-column session shell", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "frontend", "index.html"),
    "utf8",
  );

  assert.match(html, /id="sessionList"/);
  assert.match(html, /id="timeline"/);
  assert.doesNotMatch(html, /terminal-stage/);
  assert.doesNotMatch(html, /\/settings/);
  assert.doesNotMatch(html, /\/options/);
});
