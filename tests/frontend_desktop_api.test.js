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
  const sessionUpdate = { title: "Final", project_id: 9 };
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
  ]);
  assert.deepEqual(Object.keys(api).sort(), [
    "createProject",
    "createProvider",
    "createSession",
    "deleteProject",
    "deleteProvider",
    "deleteSession",
    "generate",
    "getProvider",
    "getSession",
    "getSettings",
    "getStorageLocation",
    "listProjects",
    "listProviders",
    "listSessionRuns",
    "listSessions",
    "setDefaultProvider",
    "setSessionPinned",
    "stageReference",
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

test("generate sends the Rust JSON DTO with a reference token and no image data", async () => {
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
    reference_token: "ref-token",
    bytes: new Uint8Array([1, 2, 3]),
    reference: { bytes: [1, 2, 3] },
    reference_base64: "c2Vuc2l0aXZl",
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
    reference_token: "ref-token",
  } }]]);
  assert.doesNotMatch(JSON.stringify(calls), /c2Vuc2l0aXZl|reference_base64/);
});

test("normalizes structured command errors and preserves only safe fields", async () => {
  const api = desktopApi.createDesktopApi(async () => {
    throw {
      code: "provider.upstream_status",
      message: "Provider 请求失败。",
      diagnostic: "HTTP 429",
      api_key: "secret",
      stack: "private stack",
      authorization: "Bearer secret",
    };
  });

  await assert.rejects(api.listProviders(), (error) => {
    assert.ok(error instanceof desktopApi.DesktopApiError);
    assert.equal(error.name, "DesktopApiError");
    assert.equal(error.code, "provider.upstream_status");
    assert.equal(error.message, "Provider 请求失败。");
    assert.equal(error.diagnostic, "HTTP 429");
    assert.equal(error.api_key, undefined);
    assert.equal(error.authorization, undefined);
    assert.doesNotMatch(error.stack, /private stack|secret/);
    return true;
  });
});

test("does not expose arbitrary rejection objects as diagnostics", async () => {
  const api = desktopApi.createDesktopApi(async () => {
    throw {
      message: { api_key: "secret" },
      diagnostic: { uploaded_bytes: [1, 2, 3] },
      stack: "sensitive stack",
    };
  });

  await assert.rejects(api.getSettings(), (error) => {
    assert.ok(error instanceof desktopApi.DesktopApiError);
    assert.equal(error.code, "desktop.invoke_failed");
    assert.equal(error.message, "桌面后端请求失败。");
    assert.equal(Object.hasOwn(error, "diagnostic"), false);
    assert.doesNotMatch(error.stack, /secret|uploaded_bytes|sensitive stack/);
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
