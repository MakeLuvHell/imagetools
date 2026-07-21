const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const adapterPath = path.join(root, "frontend", "desktop-api.js");
const desktopApi = require(adapterPath);

test("maps every current UI operation to its stable Tauri command and arguments", async () => {
  const calls = [];
  const api = desktopApi.createDesktopApi(async (...args) => {
    calls.push(args);
    return args[0];
  });
  const provider = { name: "Primary", base_url: "https://example.test/v1" };
  const project = { name: "Campaign" };
  const sessionCreate = { title: "Draft" };
  const sessionUpdate = { title: "Final", project_id: 9, is_pinned: false };
  const storage = { data_dir: "/workspace", migrate_existing: true };
  const settings = { base_url: "https://example.test/v1", api_key: "key", model: "gpt-image-2" };

  await api.getSettings();
  await api.updateSettings(settings);
  await api.getStorageLocation();
  await api.updateStorageLocation(storage);
  await api.listProviders();
  await api.createProvider(provider);
  await api.getProvider(7);
  await api.updateProvider(7, provider);
  await api.deleteProvider(7);
  await api.setDefaultProvider(7);
  await api.testProviderConnection(provider);
  await api.discoverProviderModels(provider);
  await api.listProjects();
  await api.createProject(project);
  await api.updateProject(9, project);
  await api.deleteProject(9);
  await api.listSessions();
  await api.createSession(sessionCreate);
  await api.getSession(11);
  await api.updateSession(11, sessionUpdate);
  await api.deleteSession(11);
  await api.setSessionPinned(11, true);
  await api.listSessionRuns(11);
  await api.saveImage(42);
  await api.discardStagedReferences(["first", "second"]);

  assert.deepEqual(calls, [
    ["get_settings"],
    ["update_settings", { input: settings }],
    ["get_storage_location"],
    ["update_storage_location", { input: storage }],
    ["list_providers"],
    ["create_provider", { input: provider }],
    ["get_provider", { providerId: 7 }],
    ["update_provider", { providerId: 7, input: provider }],
    ["delete_provider", { providerId: 7 }],
    ["set_default_provider", { providerId: 7 }],
    ["test_provider_connection", { input: provider }],
    ["discover_provider_models", { input: provider }],
    ["list_projects"],
    ["create_project", { input: project }],
    ["update_project", { projectId: 9, input: project }],
    ["delete_project", { projectId: 9 }],
    ["list_sessions"],
    ["create_session", { input: sessionCreate }],
    ["get_session", { sessionId: 11 }],
    ["update_session", { sessionId: 11, input: sessionUpdate }],
    ["delete_session", { sessionId: 11 }],
    ["set_session_pinned", { sessionId: 11, isPinned: true }],
    ["list_session_runs", { sessionId: 11 }],
    ["save_result_image", { imageId: 42 }],
    ["discard_staged_references", { tokens: ["first", "second"] }],
  ]);
  assert.deepEqual(Object.keys(api).sort(), [
    "createProject",
    "createProvider",
    "createSession",
    "deleteProject",
    "deleteProvider",
    "deleteSession",
    "discardStagedReferences",
    "discoverProviderModels",
    "generate",
    "getProvider",
    "getSession",
    "getSettings",
    "getStorageLocation",
    "listProjects",
    "listProviders",
    "listSessionRuns",
    "listSessions",
    "saveImage",
    "setDefaultProvider",
    "setSessionPinned",
    "stageReference",
    "testProviderConnection",
    "updateProject",
    "updateProvider",
    "updateSession",
    "updateSettings",
    "updateStorageLocation",
  ]);
});

test("stageReference sends raw bytes and encoded metadata headers", async () => {
  const calls = [];
  const api = desktopApi.createDesktopApi(async (...args) => {
    calls.push(args);
    return { token: "ref-token" };
  });
  const bytes = new Uint8Array([137, 80, 78, 71]);

  const result = await api.stageReference({
    name: "参考图.png",
    type: "image/png",
    bytes,
  });

  assert.deepEqual(result, { token: "ref-token" });
  assert.deepEqual(calls, [[
    "stage_reference_image",
    bytes,
    {
      headers: {
        "x-image-name": "%E5%8F%82%E8%80%83%E5%9B%BE.png",
        "content-type": "image/png",
      },
    },
  ]]);
});

test("generate sends the Rust JSON DTO with ordered references and no image data", async () => {
  const calls = [];
  const api = desktopApi.createDesktopApi(async (...args) => {
    calls.push(args);
    return { kind: "images" };
  });
  const input = {
    session_id: 11,
    provider_id: 7,
    prompt: "A clean product photo",
    model: "gpt-image-2",
    width: 1024,
    height: 1024,
    ratio: "1:1",
    resolution: "standard",
    count: 1,
    quality: "high",
    output_format: "png",
    output_compression: 90,
    background: "opaque",
    moderation: "auto",
    references: [
      { reference_token: "ref-token" },
      { reference_image_id: 42 },
    ],
    bytes: new Uint8Array([1, 2, 3]),
    reference: { bytes: [1, 2, 3] },
    reference_base64: "c2Vuc2l0aXZl",
    reference_url: "imagetools-media://localhost/image/42",
  };

  await api.generate(input);

  assert.deepEqual(calls, [["generate_image", { input: {
    session_id: 11,
    provider_id: 7,
    prompt: "A clean product photo",
    model: "gpt-image-2",
    width: 1024,
    height: 1024,
    ratio: "1:1",
    resolution: "standard",
    count: 1,
    quality: "high",
    output_format: "png",
    output_compression: 90,
    background: "opaque",
    moderation: "auto",
    references: [
      { reference_token: "ref-token" },
      { reference_image_id: 42 },
    ],
  } }]]);
  assert.doesNotMatch(
    JSON.stringify(calls),
    /c2Vuc2l0aXZl|reference_base64|imagetools-media|reference_url/,
  );
});

test("normalizes structured command errors and preserves only safe fields", async () => {
  const api = desktopApi.createDesktopApi(async () => {
    throw {
      code: "provider.upstream_status",
      message: "Provider 请求失败。",
      diagnostic: "HTTP 429",
    };
  });

  await assert.rejects(api.listProviders(), (error) => {
    assert.ok(error instanceof desktopApi.DesktopApiError);
    assert.equal(error.name, "DesktopApiError");
    assert.equal(error.code, "provider.upstream_status");
    assert.equal(error.message, "Provider 请求失败。");
    assert.equal(error.diagnostic, "HTTP 429");
    return true;
  });
});

test("does not expose raw sensitive string rejections", async () => {
  const api = desktopApi.createDesktopApi(async () => {
    throw "request failed with sk-raw-secret";
  });

  await assert.rejects(api.getSettings(), (error) => {
    assert.ok(error instanceof desktopApi.DesktopApiError);
    assert.equal(error.code, "desktop.invoke_failed");
    assert.equal(error.message, "桌面后端请求失败。");
    assert.equal(Object.hasOwn(error, "diagnostic"), false);
    assert.doesNotMatch(error.stack, /sk-raw-secret/);
    return true;
  });
});

test("rejects non-exact objects without exposing sensitive strings", async () => {
  const api = desktopApi.createDesktopApi(async () => {
    throw {
      code: "provider.upstream_status",
      message: "Provider failed with sk-object-secret",
      diagnostic: "authorization: Bearer object-secret",
      api_key: "sk-extra-secret",
    };
  });

  await assert.rejects(api.getSettings(), (error) => {
    assert.ok(error instanceof desktopApi.DesktopApiError);
    assert.equal(error.code, "desktop.invoke_failed");
    assert.equal(error.message, "桌面后端请求失败。");
    assert.equal(Object.hasOwn(error, "diagnostic"), false);
    assert.doesNotMatch(
      `${error.stack}\n${JSON.stringify(error)}`,
      /sk-object-secret|object-secret|sk-extra-secret/,
    );
    return true;
  });
});

test("clones DesktopApiError rejections without sensitive extra properties", async () => {
  const rejected = new desktopApi.DesktopApiError(
    "desktop.unavailable",
    "桌面后端不可用。",
  );
  rejected.api_key = "sk-desktop-secret";
  rejected.authorization = "Bearer desktop-secret";
  const api = desktopApi.createDesktopApi(async () => {
    throw rejected;
  });

  await assert.rejects(api.getSettings(), (error) => {
    assert.ok(error instanceof desktopApi.DesktopApiError);
    assert.notEqual(error, rejected);
    assert.equal(error.code, "desktop.unavailable");
    assert.equal(error.message, "桌面后端不可用。");
    assert.equal(error.api_key, undefined);
    assert.equal(error.authorization, undefined);
    assert.doesNotMatch(
      `${error.stack}\n${JSON.stringify(error)}`,
      /sk-desktop-secret|desktop-secret/,
    );
    return true;
  });
});

function runBrowserAdapter(windowValue) {
  const source = fs.readFileSync(adapterPath, "utf8");
  const context = vm.createContext({
    Promise,
    Uint8Array,
    encodeURIComponent,
    window: windowValue,
  });
  vm.runInContext(source, context, { filename: "desktop-api.js" });
  return windowValue.ImageToolsDesktopApi;
}

test("browser IIFE loads without a Tauri global and fails only when invoked", async () => {
  const browserApi = runBrowserAdapter({});

  assert.equal(typeof browserApi.createDesktopApi, "function");
  assert.equal(typeof browserApi.current, "function");
  await assert.rejects(browserApi.current().getSettings(), (error) => {
    assert.equal(error.name, "DesktopApiError");
    assert.equal(error.code, "desktop.unavailable");
    return true;
  });
});

test("browser IIFE uses an injected desktop API mock", () => {
  const mock = { listSessions: async () => [{ id: 1 }] };
  const browserApi = runBrowserAdapter({
    __IMAGE_TOOLS_DESKTOP_API_MOCK__: mock,
  });

  assert.equal(browserApi.current(), mock);
});

test("browser IIFE resolves the injected Tauri invoke function lazily", async () => {
  const calls = [];
  const windowValue = {};
  const browserApi = runBrowserAdapter(windowValue);
  windowValue.__TAURI__ = {
    core: {
      invoke: async (...args) => {
        calls.push(args);
        return "ok";
      },
    },
  };

  assert.equal(await browserApi.current().getStorageLocation(), "ok");
  assert.deepEqual(calls, [["get_storage_location"]]);
});
