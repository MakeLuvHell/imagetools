const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workbench = require("../frontend/workbench.js");

test("workbench starts on an unpersisted new-task draft", () => {
  const state = workbench.defaultWorkbenchState();

  assert.equal(state.selectedSessionId, null);
  assert.equal(state.view, "new-task");
  assert.deepEqual(state.pendingRunsBySession, {});
});

test("applySessionList keeps the new-task draft when no selection exists", () => {
  const state = workbench.defaultWorkbenchState();

  const next = workbench.applySessionList(state, [
    { id: 2, title: "头像探索", updated_at: "2026-07-09T02:00:00Z" },
    { id: 1, title: "产品海报", updated_at: "2026-07-09T01:00:00Z" },
  ]);

  assert.equal(next.selectedSessionId, null);
  assert.equal(next.view, "new-task");
  assert.equal(workbench.selectedSession(next), null);
});

test("selectSession ignores ids that are not in the loaded list", () => {
  const state = workbench.applySessionList(workbench.defaultWorkbenchState(), [
    { id: 1, title: "产品海报" },
  ]);

  const next = workbench.selectSession(state, 99);

  assert.equal(next.selectedSessionId, null);
  assert.equal(next.view, "new-task");
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
  assert.equal(next.view, "session");
});

test("selectNewTask clears an explicit session selection", () => {
  const sessions = [{ id: 1, title: "产品海报" }];
  const selected = workbench.selectSession(
    workbench.applySessionList(workbench.defaultWorkbenchState(), sessions),
    1,
  );

  const next = workbench.selectNewTask(selected);

  assert.equal(next.selectedSessionId, null);
  assert.equal(next.view, "new-task");
});

test("deriveSessionTitle normalizes the first line and limits it to 36 characters", () => {
  assert.equal(
    workbench.deriveSessionTitle("  夏季   饮品海报\n第二行  "),
    "夏季 饮品海报",
  );
  assert.equal([...workbench.deriveSessionTitle("图".repeat(50))].length, 36);
  assert.equal(workbench.deriveSessionTitle("  \n第二行"), "新任务");
});

test("draftStorageKey isolates new-task and persisted-session drafts", () => {
  assert.equal(workbench.draftStorageKey(null), "imagetools:draft:new");
  assert.equal(workbench.draftStorageKey(7), "imagetools:draft:session:7");
});

test("pending runs stay isolated by session and submission id", () => {
  let state = workbench.defaultWorkbenchState();
  state = workbench.addPendingRun(state, 3, {
    submissionId: "a",
    status: "running",
  });
  state = workbench.addPendingRun(state, 4, {
    submissionId: "b",
    status: "running",
  });

  assert.equal(workbench.pendingRunsForSession(state, 3)[0].submissionId, "a");
  assert.equal(workbench.pendingRunsForSession(state, 4)[0].submissionId, "b");

  state = workbench.failPendingRun(state, 3, "a", "网络不可用");
  assert.equal(workbench.pendingRunsForSession(state, 3)[0].status, "failed");
  assert.equal(workbench.pendingRunsForSession(state, 3)[0].error, "网络不可用");
  assert.equal(workbench.pendingRunsForSession(state, 4)[0].status, "running");

  state = workbench.removePendingRun(state, 3, "a");
  assert.deepEqual(workbench.pendingRunsForSession(state, 3), []);
  assert.equal(workbench.pendingRunsForSession(state, 4)[0].submissionId, "b");
});

test("parseDraft rejects corrupt storage and keeps only serializable fields", () => {
  assert.equal(workbench.parseDraft("not-json"), null);
  assert.deepEqual(
    workbench.parseDraft(
      JSON.stringify({
        prompt: "海报",
        apiKey: "secret",
        referenceSource: { kind: "result", url: "/files/images/1.png" },
      }),
    ),
    {
      prompt: "海报",
      referenceSource: { kind: "result", url: "/files/images/1.png" },
    },
  );
});

test("parameterSummary uses localized resolution and count labels", () => {
  assert.equal(
    workbench.parameterSummary({
      ratio: "16:9",
      resolution: "medium",
      count: 2,
    }),
    "16:9 · 高清 · 2 张",
  );
});

test("createOptimisticRun snapshots the visible composer state", () => {
  const run = workbench.createOptimisticRun(
    {
      sessionId: 7,
      prompt: "  产品海报  ",
      providerName: "OpenAI",
      model: "gpt-image-2",
      ratio: "3:2",
      resolution: "large",
      quality: "high",
      count: 2,
    },
    "pending-1",
  );

  assert.deepEqual(run, {
    id: "pending-1",
    submissionId: "pending-1",
    sessionId: 7,
    optimistic: true,
    status: "running",
    prompt: "产品海报",
    provider_name: "OpenAI",
    model: "gpt-image-2",
    parameters: {
      ratio: "3:2",
      resolution: "large",
      quality: "high",
      count: 2,
    },
    images: [],
  });
});

test("shouldSubmitComposer respects newlines and IME composition", () => {
  assert.equal(
    workbench.shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: false }),
    true,
  );
  assert.equal(
    workbench.shouldSubmitComposer({ key: "Enter", shiftKey: true, isComposing: false }),
    false,
  );
  assert.equal(
    workbench.shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: true }),
    false,
  );
});

test("normalizeComposerForReference forces one result only while attached", () => {
  assert.deepEqual(
    workbench.normalizeComposerForReference({ count: 4 }, true),
    { count: 1, hasReference: true },
  );
  assert.deepEqual(
    workbench.normalizeComposerForReference({ count: 1 }, false),
    { count: 1, hasReference: false },
  );
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

test("buildProviderPayload is complete and preserves an empty key", () => {
  assert.deepEqual(
    workbench.buildProviderPayload({
      name: "Primary",
      baseUrl: "https://api.example/v1",
      apiKey: "",
      defaultModel: "gpt-image-2",
      isDefault: true,
    }),
    {
      name: "Primary",
      base_url: "https://api.example/v1",
      api_key: "",
      default_model: "gpt-image-2",
      is_default: true,
    },
  );
});

test("preferredProvider preserves selection then falls back to default or first", () => {
  const providers = workbench.normalizeProviders([
    { id: 1, name: "A", default_model: "a", is_default: true },
    { id: 2, name: "B", default_model: "b", is_default: false },
  ]);
  assert.equal(workbench.preferredProvider(providers, 2).id, 2);
  assert.equal(workbench.preferredProvider(providers.slice(0, 1), 2).id, 1);

  const switched = providers.map((provider) => ({
    ...provider,
    isDefault: provider.id === 2,
  }));
  assert.equal(workbench.preferredProvider(switched, 99).id, 2);
  assert.equal(workbench.preferredProvider([], 1), null);
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
