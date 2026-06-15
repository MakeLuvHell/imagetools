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
  assert.equal(state.model, "gpt-image-2");
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
  assert.equal(state.resolution, "medium");
  assert.deepEqual(prefs.resolveDimensions(state.ratio, state.resolution), {
    width: 2048,
    height: 1152,
  });
});

test("normalizeUiState maps legacy standard sizes to standard resolution", () => {
  const landscape = prefs.normalizeUiState({ size: "1536x1024" });
  const portrait = prefs.normalizeUiState({ size: "1024x1536" });

  assert.equal(landscape.ratio, "3:2");
  assert.equal(landscape.resolution, "standard");
  assert.equal(portrait.ratio, "2:3");
  assert.equal(portrait.resolution, "standard");
});

test("dimension presets stay valid for GPT Image 2", () => {
  for (const resolution of prefs.RESOLUTION_OPTIONS.map((item) => item.id)) {
    for (const ratio of prefs.RATIO_OPTIONS.map((item) => item.id)) {
      const dimensions = prefs.resolveDimensions(ratio, resolution);
      const totalPixels = dimensions.width * dimensions.height;
      const longEdge = Math.max(dimensions.width, dimensions.height);
      const shortEdge = Math.min(dimensions.width, dimensions.height);

      assert.equal(dimensions.width % 16, 0, `${ratio} ${resolution} width`);
      assert.equal(dimensions.height % 16, 0, `${ratio} ${resolution} height`);
      assert.ok(longEdge <= 3840, `${ratio} ${resolution} long edge`);
      assert.ok(longEdge / shortEdge <= 3, `${ratio} ${resolution} aspect`);
      assert.ok(totalPixels >= 655360, `${ratio} ${resolution} min pixels`);
      assert.ok(totalPixels <= 8294400, `${ratio} ${resolution} max pixels`);
    }
  }
});

test("standard widescreen presets use exact API-safe 16:9 dimensions", () => {
  assert.deepEqual(prefs.resolveDimensions("16:9", "standard"), {
    width: 1536,
    height: 864,
  });
  assert.deepEqual(prefs.resolveDimensions("9:16", "standard"), {
    width: 864,
    height: 1536,
  });
});

test("medium 3:2 presets keep the selected aspect ratio exactly", () => {
  assert.deepEqual(prefs.resolveDimensions("3:2", "medium"), {
    width: 2016,
    height: 1344,
  });
  assert.deepEqual(prefs.resolveDimensions("2:3", "medium"), {
    width: 1344,
    height: 2016,
  });
});

test("normalizeUiState persists advanced API options", () => {
  const state = prefs.normalizeUiState({
    outputFormat: "webp",
    outputCompression: 72,
    background: "opaque",
    moderation: "low",
  });

  assert.equal(state.outputFormat, "webp");
  assert.equal(state.outputCompression, 72);
  assert.equal(state.background, "opaque");
  assert.equal(state.moderation, "low");
});

test("transparent background support is model-aware", () => {
  assert.equal(prefs.supportsTransparentBackground("gpt-image-2"), false);
  assert.equal(
    prefs.supportsTransparentBackground("gpt-image-2-2026-04-21"),
    false,
  );
  assert.equal(prefs.supportsTransparentBackground("gpt-image-1.5"), true);
});
