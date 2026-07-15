(function initTheme(globalScope) {
  const STORAGE_KEY = "image-tools-theme";
  const VALID_MODES = new Set(["system", "light", "dark"]);

  function normalizeMode(value) {
    const candidate = String(value ?? "system");
    return VALID_MODES.has(candidate) ? candidate : "system";
  }

  function storageFrom(scope = globalScope) {
    try {
      return scope?.localStorage || null;
    } catch {
      return null;
    }
  }

  function readMode(storage) {
    if (!storage) {
      return { mode: "system", error: "无法读取主题偏好。" };
    }
    try {
      return {
        mode: normalizeMode(storage.getItem(STORAGE_KEY)),
        error: "",
      };
    } catch {
      return { mode: "system", error: "无法读取主题偏好。" };
    }
  }

  function saveMode(storage, value) {
    const mode = normalizeMode(value);
    if (!storage) {
      return { mode, error: "主题偏好无法保存。" };
    }
    try {
      storage.setItem(STORAGE_KEY, mode);
      return { mode, error: "" };
    } catch {
      return { mode, error: "主题偏好无法保存。" };
    }
  }

  function applyMode(root, value) {
    const mode = normalizeMode(value);
    if (root?.dataset) root.dataset.theme = mode;
    return mode;
  }

  function nativeArgs(value) {
    return { mode: normalizeMode(value) };
  }

  function bootstrap(root, storage) {
    const result = readMode(storage);
    applyMode(root, result.mode);
    return result;
  }

  const api = {
    STORAGE_KEY,
    normalizeMode,
    storageFrom,
    readMode,
    saveMode,
    applyMode,
    nativeArgs,
    bootstrap,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsTheme = api;
  if (globalScope.document?.documentElement) {
    globalScope.ImageToolsThemeBootstrap = bootstrap(
      globalScope.document.documentElement,
      storageFrom(globalScope),
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
