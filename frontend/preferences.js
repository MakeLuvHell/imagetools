(function initPreferences(globalScope) {
  const STORAGE_KEY = "image-tools-ui-state";

  const QUICK_PRESETS = [
    {
      id: "square-poster",
      label: "方图海报",
      ratio: "1:1",
      resolution: "large",
      quality: "high",
      count: 2,
      model: "gpt-image-2",
      description: "适合封面、海报和通用预览",
    },
    {
      id: "wide-banner",
      label: "横幅横构图",
      ratio: "16:9",
      resolution: "large",
      quality: "high",
      count: 1,
      model: "gpt-image-2",
      description: "适合横图横幅、网页头图",
    },
    {
      id: "mobile-story",
      label: "竖版故事",
      ratio: "9:16",
      resolution: "medium",
      quality: "medium",
      count: 2,
      model: "gpt-image-2",
      description: "适合手机屏幕和短视频封面",
    },
    {
      id: "speed-draft",
      label: "快速草稿",
      ratio: "1:1",
      resolution: "standard",
      quality: "low",
      count: 4,
      model: "gpt-image-2",
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
      "1:1": [1024, 1024],
      "3:2": [1536, 1024],
      "2:3": [1024, 1536],
      "16:9": [1820, 1024],
      "9:16": [1024, 1820],
    },
    large: {
      "1:1": [1536, 1536],
      "3:2": [1536, 1024],
      "2:3": [1024, 1536],
      "16:9": [1820, 1024],
      "9:16": [1024, 1820],
    },
  };

  const LEGACY_SIZE_MAP = {
    "1024x1024": { ratio: "1:1", resolution: "standard" },
    "1536x1024": { ratio: "3:2", resolution: "large" },
    "1024x1536": { ratio: "2:3", resolution: "large" },
    "1820x1024": { ratio: "16:9", resolution: "large" },
    "1024x1820": { ratio: "9:16", resolution: "large" },
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

  function normalizeUiState(input = {}) {
    const fallback = defaultUiState();
    const migrated = migrateLegacySize(input);
    return {
      prompt: String(input.prompt ?? fallback.prompt),
      ratio: String(input.ratio ?? migrated.ratio ?? fallback.ratio),
      resolution: String(
        input.resolution ?? migrated.resolution ?? fallback.resolution,
      ),
      quality: String(input.quality ?? fallback.quality),
      count:
        Number.parseInt(input.count ?? fallback.count, 10) || fallback.count,
      model: String(input.model ?? fallback.model),
      apiBaseUrl: String(input.apiBaseUrl ?? fallback.apiBaseUrl),
      apiModel: String(input.apiModel ?? fallback.apiModel),
      lastPresetId: String(input.lastPresetId ?? fallback.lastPresetId),
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
      model: preset.model,
      lastPresetId: preset.id,
    });
  }

  const api = {
    STORAGE_KEY,
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
