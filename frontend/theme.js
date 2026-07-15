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

  function cookieJarFrom(scope = globalScope) {
    try {
      if (typeof scope?.__TAURI__ === "undefined") return null;
      return scope.document || null;
    } catch {
      return null;
    }
  }

  function readCookieMode(cookieJar) {
    if (!cookieJar) return null;
    try {
      for (const part of String(cookieJar.cookie || "").split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (name === STORAGE_KEY && VALID_MODES.has(value)) return value;
      }
    } catch {
      return null;
    }
    return null;
  }

  function writeCookieMode(cookieJar, value) {
    if (!cookieJar) return true;
    const mode = normalizeMode(value);
    try {
      cookieJar.cookie = `${STORAGE_KEY}=${mode}; Path=/; Max-Age=31536000; SameSite=Strict`;
      return readCookieMode(cookieJar) === mode;
    } catch {
      return false;
    }
  }

  function readMode(storage, cookieJar) {
    if (!storage) {
      return { mode: "system", error: "无法读取主题偏好。" };
    }
    try {
      const storedMode = normalizeMode(storage.getItem(STORAGE_KEY));
      return {
        mode: readCookieMode(cookieJar) || storedMode,
        error: "",
      };
    } catch {
      return { mode: "system", error: "无法读取主题偏好。" };
    }
  }

  function saveMode(storage, value, cookieJar) {
    const mode = normalizeMode(value);
    if (!storage) {
      return { mode, error: "主题偏好无法保存。" };
    }
    try {
      storage.setItem(STORAGE_KEY, mode);
      if (cookieJar && !writeCookieMode(cookieJar, mode)) {
        return { mode, error: "主题偏好无法保存。" };
      }
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

  function bootstrap(root, storage, cookieJar) {
    const result = readMode(storage, cookieJar);
    applyMode(root, result.mode);
    return result;
  }

  const api = {
    STORAGE_KEY,
    normalizeMode,
    storageFrom,
    cookieJarFrom,
    readCookieMode,
    writeCookieMode,
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
      cookieJarFrom(globalScope),
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
