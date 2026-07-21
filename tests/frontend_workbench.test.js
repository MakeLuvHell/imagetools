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

test("groupSessions separates pinned, project, and ordinary sessions without duplicates", () => {
  const sessions = workbench.normalizeSessions([
    { id: 1, title: "置顶灵感", is_pinned: true, project_id: 8 },
    { id: 2, title: "品牌海报", project_id: 8 },
    { id: 3, title: "独立尝试" },
  ]);
  const projects = workbench.normalizeProjects([{ id: 8, name: "品牌视觉" }]);

  assert.deepEqual(workbench.groupSessions(sessions, projects), {
    pinned: [sessions[0]],
    projects: [{ project: projects[0], sessions: [sessions[1]] }],
    ungrouped: [sessions[2]],
  });
});

test("collapsed project storage parses normalizes and serializes stable ids", () => {
  assert.deepEqual(workbench.parseCollapsedProjectIds('[7,"8",7,-1]'), [7, 8]);
  assert.deepEqual(workbench.parseCollapsedProjectIds("broken"), []);
  assert.deepEqual(
    workbench.normalizeCollapsedProjectIds(
      [7, 8, 99],
      [{ id: 8 }, { id: 7 }],
    ),
    [7, 8],
  );
  assert.equal(
    workbench.serializeCollapsedProjectIds(new Set([8, 7])),
    "[7,8]",
  );
});

test("drag threshold requires six pixels of pointer movement", () => {
  assert.equal(
    workbench.exceedsDragThreshold({ x: 10, y: 10 }, { x: 16, y: 10 }),
    true,
  );
  assert.equal(
    workbench.exceedsDragThreshold({ x: 10, y: 10 }, { x: 15, y: 12 }),
    false,
  );
});

test("drop patch atomically unpins only pinned sessions", () => {
  assert.deepEqual(workbench.sessionDropPatch({ isPinned: true }, 9), {
    project_id: 9,
    is_pinned: false,
  });
  assert.deepEqual(workbench.sessionDropPatch({ isPinned: false }, 9), {
    project_id: 9,
  });
});

test("session project lookup supports selection auto-expansion", () => {
  const sessions = [
    { id: 1, projectId: 7 },
    { id: 2, projectId: null },
  ];

  assert.equal(workbench.projectIdForSession(sessions, 1), 7);
  assert.equal(workbench.projectIdForSession(sessions, 2), null);
  assert.equal(workbench.projectIdForSession(sessions, 99), null);
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
  assert.equal(
    workbench.pendingRunsForSession(state, 3)[0].error_message,
    "网络不可用",
  );
  assert.equal(workbench.pendingRunsForSession(state, 4)[0].status, "running");

  state = workbench.removePendingRun(state, 3, "a");
  assert.deepEqual(workbench.pendingRunsForSession(state, 3), []);
  assert.equal(workbench.pendingRunsForSession(state, 4)[0].submissionId, "b");
});

test("parseDraft rejects corrupt storage and clears legacy URL-only references", () => {
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
    },
  );
});

test("parseDraft keeps only result references with a positive integer image id", () => {
  const valid = {
    kind: "result",
    imageId: 42,
    url: "imagetools-media://localhost/image/42",
    filename: "result.png",
    mimeType: "image/png",
  };
  assert.deepEqual(
    workbench.parseDraft(JSON.stringify({ prompt: "继续", referenceSource: valid })),
    { prompt: "继续", referenceSources: [valid] },
  );
  for (const imageId of [0, -1, 1.5, "42", null]) {
    assert.deepEqual(
      workbench.parseDraft(JSON.stringify({ prompt: "继续", referenceSource: {
        kind: "result",
        imageId,
        url: "imagetools-media://localhost/image/42",
      } })),
      { prompt: "继续" },
    );
  }
});

test("parseDraft migrates one legacy reference and keeps ordered unique references", () => {
  const first = {
    kind: "result",
    imageId: 1,
    url: "imagetools-media://localhost/image/1",
  };
  const second = {
    kind: "result",
    imageId: 2,
    url: "imagetools-media://localhost/image/2",
  };
  assert.deepEqual(
    workbench.parseDraft(JSON.stringify({ referenceSource: first })).referenceSources
      .map((reference) => reference.imageId),
    [1],
  );
  assert.deepEqual(
    workbench.parseDraft(JSON.stringify({ referenceSources: [first, second, first] }))
      .referenceSources.map((reference) => reference.imageId),
    [1, 2],
  );
  assert.deepEqual(workbench.moveReference([first, second], 1, -1), [second, first]);
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
      providerId: 3,
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
    provider_id: 3,
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

test("reconcileSubmission keeps a local failure when no server run was created", () => {
  const pending = workbench.createOptimisticRun(
    { prompt: "海报", count: 1 },
    "local-1",
  );
  const runs = workbench.reconcileSubmission(
    [],
    pending,
    0,
    "网络连接失败",
  );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].error_message, "网络连接失败");
});

test("reconcileSubmission removes optimistic state after persistence", () => {
  const pending = workbench.createOptimisticRun(
    { prompt: "海报", count: 1 },
    "local-1",
  );
  const persisted = [{ id: 4, status: "failed", prompt: "海报" }];
  assert.deepEqual(
    workbench.reconcileSubmission(persisted, pending, 0, "请求失败"),
    persisted,
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
    {
      id: 2,
      protocol: "gemini_native",
      name: "B",
      default_model: "custom-model",
      available_models: ["custom-model"],
      models_refreshed_at: "2026-07-20T00:00:00Z",
    },
  ]);

  assert.equal(workbench.selectedProvider(providers, 2).defaultModel, "custom-model");
  assert.equal(workbench.selectedProvider(providers, 1).protocol, "openai_compatible");
  assert.deepEqual(workbench.selectedProvider(providers, 2).availableModels, ["custom-model"]);
  assert.equal(workbench.selectedProvider(providers, 99), null);
});

test("protocol defaults and capabilities are explicit and model-aware", () => {
  assert.equal(
    workbench.proposeProviderBaseUrl("openai_compatible", "xai_images", ""),
    "https://api.x.ai/v1",
  );
  assert.equal(
    workbench.proposeProviderBaseUrl(
      "openai_compatible",
      "gemini_native",
      "https://custom.example/v1",
    ),
    "https://custom.example/v1",
  );
  assert.equal(workbench.providerCapabilities("gemini_native", "custom").maxResults, 1);
  assert.deepEqual(
    workbench.providerCapabilities("gemini_native", "gemini-3-pro-image").resolutions,
    ["standard", "medium", "large"],
  );
  assert.equal(workbench.providerCapabilities("xai_images", "grok-imagine-image").maxReferences, 3);
  assert.deepEqual(
    workbench.providerModelOptions("xai_images", ["other", "grok-imagine-image", "other"]),
    [
      { id: "grok-imagine-image", recommended: true },
      { id: "grok-imagine-image-pro", recommended: true },
      { id: "grok-imagine-image-quality", recommended: true },
      { id: "other", recommended: false },
    ],
  );
});

test("composer normalization clears fields unsupported by the selected protocol", () => {
  assert.deepEqual(
    workbench.normalizeComposerForProvider({
      count: 4,
      resolution: "large",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 72,
      background: "transparent",
      moderation: "low",
    }, "gemini_native", "gemini-2.5-flash-image"),
    {
      count: 1,
      resolution: "standard",
      quality: "auto",
      outputFormat: "png",
      outputCompression: 100,
      background: "auto",
      moderation: "auto",
    },
  );
});

test("buildProviderPayload is complete and preserves an empty key", () => {
  assert.deepEqual(
    workbench.buildProviderPayload({
      protocol: "xai_images",
      name: "Primary",
      baseUrl: "https://api.example/v1",
      apiKey: "",
      defaultModel: "gpt-image-2",
      isDefault: true,
      availableModels: ["grok-imagine-image"],
      modelsRefreshedAt: "2026-07-20T00:00:00Z",
    }),
    {
      protocol: "xai_images",
      name: "Primary",
      base_url: "https://api.example/v1",
      api_key: "",
      default_model: "gpt-image-2",
      is_default: true,
      available_models: ["grok-imagine-image"],
      models_refreshed_at: "2026-07-20T00:00:00Z",
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
