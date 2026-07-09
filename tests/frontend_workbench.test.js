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

test("buildGenerationFields maps composer state to generate payload fields", () => {
  const fields = workbench.buildGenerationFields(
    {
      sessionId: 7,
      providerId: 3,
      prompt: "A clean product poster",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "standard",
      quality: "high",
      count: 2,
      outputFormat: "webp",
      outputCompression: 72,
      background: "opaque",
      moderation: "low",
    },
    {
      resolveDimensions() {
        return { width: 1536, height: 864 };
      },
    },
  );

  assert.deepEqual(fields, {
    session_id: "7",
    provider_id: "3",
    prompt: "A clean product poster",
    model: "gpt-image-2",
    width: "1536",
    height: "864",
    ratio: "16:9",
    resolution: "standard",
    quality: "high",
    count: "2",
    output_format: "webp",
    output_compression: "72",
    background: "opaque",
    moderation: "low",
  });
});

test("provider selection returns active provider model fallback", () => {
  const providers = workbench.normalizeProviders([
    { id: 1, name: "A", default_model: "gpt-image-2" },
    { id: 2, name: "B", default_model: "custom-model" },
  ]);

  assert.equal(workbench.selectedProvider(providers, 2).defaultModel, "custom-model");
  assert.equal(workbench.selectedProvider(providers, 99), null);
});

test("composerStateFromRun restores prompt provider model and parameters", () => {
  const state = workbench.composerStateFromRun({
    prompt: "A clean product poster",
    provider_id: 3,
    model: "gpt-image-2",
    parameters: {
      ratio: "16:9",
      resolution: "standard",
      quality: "high",
      count: 2,
      output_format: "webp",
      output_compression: 72,
      background: "opaque",
      moderation: "low",
    },
  });

  assert.equal(state.prompt, "A clean product poster");
  assert.equal(state.providerId, 3);
  assert.equal(state.model, "gpt-image-2");
  assert.equal(state.ratio, "16:9");
  assert.equal(state.resolution, "standard");
  assert.equal(state.outputFormat, "webp");
});
