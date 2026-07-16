(function exposeDesktopApi(root, factory) {
  const desktopApi = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = desktopApi;
  }
  if (root) {
    root.ImageToolsDesktopApi = desktopApi;
  }
})(typeof window === "object" ? window : globalThis, function createModule(root) {
  "use strict";

  const GENERATE_FIELDS = [
    "session_id",
    "provider_id",
    "prompt",
    "model",
    "width",
    "height",
    "ratio",
    "resolution",
    "count",
    "quality",
    "output_format",
    "output_compression",
    "background",
    "moderation",
    "reference_token",
  ];

  class DesktopApiError extends Error {
    constructor(code, message, diagnostic) {
      super(message);
      this.name = "DesktopApiError";
      this.code = code;
      if (diagnostic !== undefined) {
        this.diagnostic = diagnostic;
      }
    }
  }

  function normalizeError(error) {
    if (error instanceof DesktopApiError) {
      return error;
    }
    const structured = error !== null && typeof error === "object";
    const code = structured && typeof error.code === "string"
      ? error.code
      : "desktop.invoke_failed";
    const message = structured && typeof error.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "桌面后端请求失败。";
    const diagnostic = structured && typeof error.diagnostic === "string"
      ? error.diagnostic
      : undefined;
    return new DesktopApiError(code, message, diagnostic);
  }

  function createDesktopApi(invoke) {
    function call(...args) {
      return Promise.resolve()
        .then(() => invoke(...args))
        .catch((error) => {
          throw normalizeError(error);
        });
    }

    return {
      getSettings: () => call("get_settings"),
      updateSettings: (input) => call("update_settings", { input }),
      getStorageLocation: () => call("get_storage_location"),
      updateStorageLocation: (input) => call("update_storage_location", { input }),
      listProviders: () => call("list_providers"),
      createProvider: (input) => call("create_provider", { input }),
      getProvider: (providerId) => call("get_provider", { providerId }),
      updateProvider: (providerId, input) => call("update_provider", { providerId, input }),
      deleteProvider: (providerId) => call("delete_provider", { providerId }),
      setDefaultProvider: (providerId) => call("set_default_provider", { providerId }),
      listProjects: () => call("list_projects"),
      createProject: (input) => call("create_project", { input }),
      updateProject: (projectId, input) => call("update_project", { projectId, input }),
      deleteProject: (projectId) => call("delete_project", { projectId }),
      listSessions: () => call("list_sessions"),
      createSession: (input) => call("create_session", { input }),
      getSession: (sessionId) => call("get_session", { sessionId }),
      updateSession: (sessionId, input) => call("update_session", { sessionId, input }),
      deleteSession: (sessionId) => call("delete_session", { sessionId }),
      setSessionPinned: (sessionId, isPinned) =>
        call("set_session_pinned", { sessionId, isPinned }),
      listSessionRuns: (sessionId) => call("list_session_runs", { sessionId }),
      stageReference: ({ name, type, bytes }) =>
        call("stage_reference_image", bytes, {
          headers: {
            "x-image-name": encodeURIComponent(name),
            "content-type": type,
          },
        }),
      generate: (metadata) => {
        const input = {};
        for (const field of GENERATE_FIELDS) {
          if (Object.hasOwn(metadata, field)) {
            input[field] = metadata[field];
          }
        }
        return call("generate_image", { input });
      },
    };
  }

  function current() {
    if (root && root.__IMAGE_TOOLS_DESKTOP_API_MOCK__) {
      return root.__IMAGE_TOOLS_DESKTOP_API_MOCK__;
    }
    const core = root && root.__TAURI__ && root.__TAURI__.core;
    if (core && typeof core.invoke === "function") {
      return createDesktopApi(core.invoke.bind(core));
    }
    return createDesktopApi(() => Promise.reject({
      code: "desktop.unavailable",
      message: "桌面后端不可用。",
    }));
  }

  return { DesktopApiError, createDesktopApi, current };
});
