const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const theme = require("../frontend/theme.js");
const themeSource = fs.readFileSync(
  path.join(__dirname, "..", "frontend", "theme.js"),
  "utf8",
);

class MemoryStorage {
  constructor(seed = {}) {
    this.data = new Map(Object.entries(seed));
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }
}

function runBrowserTheme(window) {
  vm.runInNewContext(themeSource, { window });
  return window;
}

test("normalizeMode accepts only system light and dark", () => {
  assert.equal(theme.normalizeMode("system"), "system");
  assert.equal(theme.normalizeMode("light"), "light");
  assert.equal(theme.normalizeMode("dark"), "dark");
  assert.equal(theme.normalizeMode("sepia"), "system");
  assert.equal(theme.normalizeMode(null), "system");
});

test("readMode defaults invalid or missing values to system", () => {
  assert.deepEqual(theme.readMode(new MemoryStorage()), {
    mode: "system",
    error: "",
  });
  assert.deepEqual(
    theme.readMode(new MemoryStorage({ [theme.STORAGE_KEY]: "sepia" })),
    { mode: "system", error: "" },
  );
});

test("readMode and saveMode contain localStorage failures", () => {
  const broken = {
    getItem() {
      throw new Error("read blocked");
    },
    setItem() {
      throw new Error("write blocked");
    },
  };
  assert.deepEqual(theme.readMode(broken), {
    mode: "system",
    error: "无法读取主题偏好。",
  });
  assert.deepEqual(theme.saveMode(broken, "dark"), {
    mode: "dark",
    error: "主题偏好无法保存。",
  });
});

test("saveMode persists normalized values and applyMode updates the root", () => {
  const storage = new MemoryStorage();
  const root = { dataset: {} };

  assert.deepEqual(theme.saveMode(storage, "dark"), {
    mode: "dark",
    error: "",
  });
  assert.equal(storage.getItem("image-tools-theme"), "dark");
  assert.equal(theme.applyMode(root, "dark"), "dark");
  assert.equal(root.dataset.theme, "dark");
  assert.deepEqual(theme.nativeArgs("sepia"), { mode: "system" });
});

test("bootstrap restores the stored mode before app orchestration", () => {
  const root = { dataset: {} };
  const result = theme.bootstrap(
    root,
    new MemoryStorage({ "image-tools-theme": "light" }),
  );

  assert.deepEqual(result, { mode: "light", error: "" });
  assert.equal(root.dataset.theme, "light");
});

test("browser IIFE exposes the API and restores the stored mode automatically", () => {
  const root = { dataset: {} };
  const window = runBrowserTheme({
    document: { documentElement: root },
    localStorage: new MemoryStorage({ "image-tools-theme": "dark" }),
  });

  assert.equal(typeof window.ImageToolsTheme.bootstrap, "function");
  assert.equal(root.dataset.theme, "dark");
  assert.deepEqual(
    { ...window.ImageToolsThemeBootstrap },
    { mode: "dark", error: "" },
  );
});

test("browser IIFE contains inaccessible storage during automatic bootstrap", () => {
  const root = { dataset: {} };
  const window = {
    document: { documentElement: root },
  };
  Object.defineProperty(window, "localStorage", {
    get() {
      throw new Error("storage blocked");
    },
  });

  assert.doesNotThrow(() => runBrowserTheme(window));
  assert.equal(root.dataset.theme, "system");
  assert.deepEqual(
    { ...window.ImageToolsThemeBootstrap },
    { mode: "system", error: "无法读取主题偏好。" },
  );
});

test("browser IIFE exposes the API without bootstrapping when document is absent", () => {
  const window = runBrowserTheme({});

  assert.equal(typeof window.ImageToolsTheme.normalizeMode, "function");
  assert.equal(
    Object.hasOwn(window, "ImageToolsThemeBootstrap"),
    false,
  );
});
