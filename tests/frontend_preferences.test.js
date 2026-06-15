const assert = require("node:assert/strict");
const test = require("node:test");

const prefs = require("../frontend/preferences.js");

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

test("loadUiState returns defaults when storage is empty", () => {
  const storage = new MemoryStorage();

  const state = prefs.loadUiState(storage);

  assert.equal(state.prompt, "");
  assert.equal(state.ratio, "1:1");
  assert.equal(state.resolution, "standard");
  assert.deepEqual(prefs.resolveDimensions(state.ratio, state.resolution), {
    width: 1024,
    height: 1024,
  });
  assert.equal(state.quality, "auto");
  assert.equal(state.count, 1);
  assert.equal(state.lastPresetId, "");
});

test("saveUiState and loadUiState round-trip the remembered values", () => {
  const storage = new MemoryStorage();
  const source = {
    prompt: "夜景城市",
    ratio: "16:9",
    resolution: "large",
    quality: "high",
    count: 3,
    model: "gpt-image-2",
    apiBaseUrl: "https://api.example.com",
    apiModel: "gpt-image-2",
    lastPresetId: "poster",
  };

  prefs.saveUiState(storage, source);
  const restored = prefs.loadUiState(storage);

  assert.equal(restored.prompt, "夜景城市");
  assert.equal(restored.ratio, "16:9");
  assert.equal(restored.resolution, "large");
  assert.equal(restored.quality, "high");
  assert.equal(restored.count, 3);
  assert.equal(restored.lastPresetId, "poster");
});

test("applyPreset keeps custom prompt and updates quick settings", () => {
  const next = prefs.applyPreset(
    {
      prompt: "自定义提示词",
      ratio: "1:1",
      resolution: "standard",
      quality: "auto",
      count: 1,
      model: "gpt-image-2",
      apiBaseUrl: "",
      apiModel: "gpt-image-2",
      lastPresetId: "",
    },
    prefs.QUICK_PRESETS[1],
  );

  assert.equal(next.prompt, "自定义提示词");
  assert.equal(next.ratio, prefs.QUICK_PRESETS[1].ratio);
  assert.equal(next.resolution, prefs.QUICK_PRESETS[1].resolution);
  assert.equal(next.quality, prefs.QUICK_PRESETS[1].quality);
  assert.equal(next.count, prefs.QUICK_PRESETS[1].count);
  assert.equal(next.lastPresetId, prefs.QUICK_PRESETS[1].id);
});

test("normalizeUiState migrates legacy size into ratio and resolution", () => {
  const state = prefs.normalizeUiState({
    size: "1820x1024",
    quality: "medium",
    count: 2,
  });

  assert.equal(state.ratio, "16:9");
  assert.equal(state.resolution, "large");
  assert.deepEqual(prefs.resolveDimensions(state.ratio, state.resolution), {
    width: 1820,
    height: 1024,
  });
});
