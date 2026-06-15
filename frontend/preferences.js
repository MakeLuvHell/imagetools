(function initPreferences(globalScope) {
  const STORAGE_KEY = "image-tools-ui-state";

  const QUICK_PRESETS = [
    {
      id: "square-poster",
      label: "方图海报",
      size: "1024x1024",
      quality: "high",
      count: 2,
      model: "gpt-image-2",
      description: "适合封面、海报和通用预览",
    },
    {
      id: "wide-banner",
      label: "横幅横构图",
      size: "1820x1024",
      quality: "high",
      count: 1,
      model: "gpt-image-2",
      description: "适合横图横幅、网页头图",
    },
    {
      id: "mobile-story",
      label: "竖版故事",
      size: "1024x1820",
      quality: "medium",
      count: 2,
      model: "gpt-image-2",
      description: "适合手机屏幕和短视频封面",
    },
    {
      id: "speed-draft",
      label: "快速草稿",
      size: "1024x1024",
      quality: "low",
      count: 4,
      model: "gpt-image-2",
      description: "优先速度，适合先试方向",
    },
  ];

  function defaultUiState() {
    return {
      prompt: "",
      size: "1024x1024",
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

  function normalizeUiState(input = {}) {
    const fallback = defaultUiState();
    return {
      prompt: String(input.prompt ?? fallback.prompt),
      size: String(input.size ?? fallback.size),
      quality: String(input.quality ?? fallback.quality),
      count:
        Number.parseInt(input.count ?? fallback.count, 10) || fallback.count,
      model: String(input.model ?? fallback.model),
      apiBaseUrl: String(input.apiBaseUrl ?? fallback.apiBaseUrl),
      apiModel: String(input.apiModel ?? fallback.apiModel),
      lastPresetId: String(input.lastPresetId ?? fallback.lastPresetId),
    };
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
      size: preset.size,
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
    loadUiState,
    saveUiState,
    applyPreset,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsPreferences = api;
})(typeof window !== "undefined" ? window : globalThis);
