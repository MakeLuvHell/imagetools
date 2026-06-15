(function initPreferences(globalScope) {
  const STORAGE_KEY = "image-tools-ui-state";

  const RATIO_OPTIONS = [
    { id: "1:1", label: "1:1", name: "方图", preview: [28, 28] },
    { id: "3:2", label: "3:2", name: "横图", preview: [32, 22] },
    { id: "2:3", label: "2:3", name: "竖图", preview: [22, 32] },
    { id: "16:9", label: "16:9", name: "宽屏", preview: [34, 20] },
    { id: "9:16", label: "9:16", name: "竖屏", preview: [20, 34] },
  ];

  const RESOLUTION_OPTIONS = [
    { id: "standard", label: "1K", name: "标准" },
    { id: "medium", label: "2K", name: "高清" },
    { id: "large", label: "4K", name: "超清" },
  ];

  const OUTPUT_FORMAT_OPTIONS = ["png", "jpeg", "webp"];
  const BACKGROUND_OPTIONS = ["auto", "opaque", "transparent"];
  const MODERATION_OPTIONS = ["auto", "low"];
  const QUALITY_OPTIONS = ["auto", "low", "medium", "high"];

  const QUICK_PRESETS = [
    {
      id: "square-poster",
      label: "方图海报",
      ratio: "1:1",
      resolution: "large",
      quality: "high",
      count: 2,
      description: "适合封面、海报和通用预览",
    },
    {
      id: "wide-banner",
      label: "横幅横构图",
      ratio: "16:9",
      resolution: "large",
      quality: "high",
      count: 1,
      description: "适合横图横幅、网页头图",
    },
    {
      id: "mobile-story",
      label: "竖版故事",
      ratio: "9:16",
      resolution: "medium",
      quality: "medium",
      count: 2,
      description: "适合手机屏幕和短视频封面",
    },
    {
      id: "speed-draft",
      label: "快速草稿",
      ratio: "1:1",
      resolution: "standard",
      quality: "low",
      count: 4,
      description: "优先速度，适合先试方向",
    },
  ];

  const DIMENSION_MAP = {
    standard: {
      "1:1": [1024, 1024],
      "3:2": [1536, 1024],
      "2:3": [1024, 1536],
      "16:9": [1536, 864],
      "9:16": [864, 1536],
    },
    medium: {
      "1:1": [2048, 2048],
      "3:2": [2016, 1344],
      "2:3": [1344, 2016],
      "16:9": [2048, 1152],
      "9:16": [1152, 2048],
    },
    large: {
      "1:1": [2880, 2880],
      "3:2": [3456, 2304],
      "2:3": [2304, 3456],
      "16:9": [3840, 2160],
      "9:16": [2160, 3840],
    },
  };

  const LEGACY_SIZE_MAP = {
    "1024x1024": { ratio: "1:1", resolution: "standard" },
    "1536x1024": { ratio: "3:2", resolution: "standard" },
    "1024x1536": { ratio: "2:3", resolution: "standard" },
    "1820x1024": { ratio: "16:9", resolution: "medium" },
    "1024x1820": { ratio: "9:16", resolution: "medium" },
    "2048x1152": { ratio: "16:9", resolution: "medium" },
    "1152x2048": { ratio: "9:16", resolution: "medium" },
  };

  function defaultUiState() {
    return {
      prompt: "",
      ratio: "1:1",
      resolution: "standard",
      quality: "auto",
      count: 1,
      model: "gpt-image-2",
      apiBaseUrl: "",
      apiModel: "gpt-image-2",
      lastPresetId: "",
      outputFormat: "png",
      outputCompression: 100,
      background: "auto",
      moderation: "auto",
    };
  }

  function safeParse(value) {
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function migrateLegacySize(input) {
    if (!input.size) {
      return {};
    }
    return LEGACY_SIZE_MAP[String(input.size)] || {};
  }

  function normalizeChoice(value, allowed, fallback) {
    const clean = String(value ?? fallback);
    return allowed.includes(clean) ? clean : fallback;
  }

  function clampNumber(value, fallback, min, max) {
    const parsed = Number.parseInt(value ?? fallback, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeUiState(input = {}) {
    const fallback = defaultUiState();
    const migrated = migrateLegacySize(input);
    return {
      prompt: String(input.prompt ?? fallback.prompt),
      ratio: String(input.ratio ?? migrated.ratio ?? fallback.ratio),
      resolution: String(
        input.resolution ?? migrated.resolution ?? fallback.resolution,
      ),
      quality: normalizeChoice(
        input.quality,
        QUALITY_OPTIONS,
        fallback.quality,
      ),
      count: clampNumber(input.count, fallback.count, 1, 4),
      model: String(input.model ?? input.apiModel ?? fallback.model),
      apiBaseUrl: String(input.apiBaseUrl ?? fallback.apiBaseUrl),
      apiModel: String(input.apiModel ?? fallback.apiModel),
      lastPresetId: String(input.lastPresetId ?? fallback.lastPresetId),
      outputFormat: normalizeChoice(
        input.outputFormat,
        OUTPUT_FORMAT_OPTIONS,
        fallback.outputFormat,
      ),
      outputCompression: clampNumber(
        input.outputCompression,
        fallback.outputCompression,
        0,
        100,
      ),
      background: normalizeChoice(
        input.background,
        BACKGROUND_OPTIONS,
        fallback.background,
      ),
      moderation: normalizeChoice(
        input.moderation,
        MODERATION_OPTIONS,
        fallback.moderation,
      ),
    };
  }

  function resolveDimensions(ratio, resolution) {
    const fallback = defaultUiState();
    const resolutionMap =
      DIMENSION_MAP[resolution] || DIMENSION_MAP[fallback.resolution];
    const [width, height] =
      resolutionMap[ratio] || resolutionMap[fallback.ratio];
    return { width, height };
  }

  function supportsTransparentBackground(model) {
    return !/gpt-image-2/i.test(String(model ?? ""));
  }

  function loadUiState(storage, key = STORAGE_KEY) {
    const parsed = safeParse(storage.getItem(key));
    return normalizeUiState(parsed || {});
  }

  function saveUiState(storage, state, key = STORAGE_KEY) {
    storage.setItem(key, JSON.stringify(normalizeUiState(state)));
  }

  function applyPreset(state, preset) {
    return normalizeUiState({
      ...state,
      ratio: preset.ratio,
      resolution: preset.resolution,
      quality: preset.quality,
      count: preset.count,
      lastPresetId: preset.id,
    });
  }

  const api = {
    STORAGE_KEY,
    RATIO_OPTIONS,
    RESOLUTION_OPTIONS,
    OUTPUT_FORMAT_OPTIONS,
    BACKGROUND_OPTIONS,
    MODERATION_OPTIONS,
    QUALITY_OPTIONS,
    supportsTransparentBackground,
    QUICK_PRESETS,
    defaultUiState,
    normalizeUiState,
    resolveDimensions,
    loadUiState,
    saveUiState,
    applyPreset,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsPreferences = api;
})(typeof window !== "undefined" ? window : globalThis);
