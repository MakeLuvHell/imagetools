const assert = require("node:assert/strict");
const test = require("node:test");

const theme = require("../frontend/theme.js");

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
