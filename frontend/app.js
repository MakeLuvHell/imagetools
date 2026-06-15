const settingsForm = document.querySelector("#settingsForm");
const generateForm = document.querySelector("#generateForm");
const apiBaseUrlInput = document.querySelector("#apiBaseUrl");
const apiKeyInput = document.querySelector("#apiKey");
const apiModelInput = document.querySelector("#apiModel");
const settingsStatus = document.querySelector("#settingsStatus");
const promptInput = document.querySelector("#prompt");
const clearPromptBtn = document.querySelector("#clearPromptBtn");
const presetList = document.querySelector("#presetList");
const lastPresetText = document.querySelector("#lastPresetText");
const resetOptionsBtn = document.querySelector("#resetOptionsBtn");
const referenceInput = document.querySelector("#reference");
const referenceText = document.querySelector("#referenceText");
const referencePreview = document.querySelector("#referencePreview");
const clearReferenceBtn = document.querySelector("#clearReferenceBtn");
const ratioSelect = document.querySelector("#ratio");
const resolutionSelect = document.querySelector("#resolution");
const modelInput = document.querySelector("#model");
const qualitySelect = document.querySelector("#quality");
const countSelect = document.querySelector("#count");
const generateBtn = document.querySelector("#generateBtn");
const clearResultsBtn = document.querySelector("#clearResultsBtn");
const emptyState = document.querySelector("#emptyState");
const loadingState = document.querySelector("#loadingState");
const errorState = document.querySelector("#errorState");
const errorText = document.querySelector("#errorText");
const copyErrorBtn = document.querySelector("#copyErrorBtn");
const resultGrid = document.querySelector("#resultGrid");
const resultMeta = document.querySelector("#resultMeta");
const optionSummary = document.querySelector("#optionSummary");
const toast = document.querySelector("#toast");

let toastTimer = null;
let currentState = window.ImageToolsPreferences.defaultUiState();
let apiKeyWasSaved = false;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

function setPanelState(state) {
  emptyState.hidden = state !== "empty";
  loadingState.hidden = state !== "loading";
  errorState.hidden = state !== "error";
  resultGrid.hidden = state !== "results";
}

function currentModel() {
  return modelInput.value.trim() || apiModelInput.value.trim() || "gpt-image-2";
}

function readUiStateFromForm() {
  return window.ImageToolsPreferences.normalizeUiState({
    prompt: promptInput.value,
    ratio: ratioSelect.value,
    resolution: resolutionSelect.value,
    quality: qualitySelect.value,
    count: countSelect.value,
    model: currentModel(),
    apiBaseUrl: apiBaseUrlInput.value,
    apiModel: apiModelInput.value,
    lastPresetId: currentState.lastPresetId,
  });
}

function persistUiState() {
  currentState = readUiStateFromForm();
  window.ImageToolsPreferences.saveUiState(localStorage, currentState);
  renderOptionSummary();
  renderPresetButtons();
}

function applyUiState(state) {
  currentState = window.ImageToolsPreferences.normalizeUiState(state);
  promptInput.value = currentState.prompt;
  ratioSelect.value = currentState.ratio;
  resolutionSelect.value = currentState.resolution;
  qualitySelect.value = currentState.quality;
  countSelect.value = String(currentState.count);
  modelInput.value = currentState.model;
  if (currentState.apiBaseUrl) {
    apiBaseUrlInput.value = currentState.apiBaseUrl;
  }
  if (currentState.apiModel) {
    apiModelInput.value = currentState.apiModel;
  }
  renderOptionSummary();
  renderPresetButtons();
}

function selectedPreset() {
  return (
    window.ImageToolsPreferences.QUICK_PRESETS.find(
      (preset) => preset.id === currentState.lastPresetId,
    ) || null
  );
}

function renderOptionSummary() {
  const state = readUiStateFromForm();
  const preset = selectedPreset();
  optionSummary.innerHTML = "";
  [
    preset ? preset.label : "自定义",
    state.ratio,
    formatResolution(state.ratio, state.resolution),
    state.quality === "auto" ? "质量自动" : `渲染质量 ${state.quality}`,
    `${state.count} 张`,
  ].forEach((item) => {
    const chip = document.createElement("span");
    chip.textContent = item;
    optionSummary.appendChild(chip);
  });
  lastPresetText.textContent = preset
    ? `上次使用：${preset.label}`
    : "自动记住上次参数";
}

function formatResolution(ratio, resolution) {
  const dimensions = window.ImageToolsPreferences.resolveDimensions(
    ratio,
    resolution,
  );
  const labelMap = {
    standard: "标准",
    medium: "高清",
    large: "超清",
  };
  return `${labelMap[resolution] || "标准"} ${dimensions.width}x${dimensions.height}`;
}

function renderPresetButtons() {
  presetList.innerHTML = "";
  window.ImageToolsPreferences.QUICK_PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preset-button ${currentState.lastPresetId === preset.id ? "active" : ""}`;
    button.innerHTML = `<strong>${preset.label}</strong><span>${preset.description}</span>`;
    button.addEventListener("click", () => {
      const next = window.ImageToolsPreferences.applyPreset(
        readUiStateFromForm(),
        preset,
      );
      applyUiState(next);
      persistUiState();
      showToast(`已切换到 ${preset.label}`);
    });
    presetList.appendChild(button);
  });
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "请求失败");
  }
  return payload;
}

async function loadSettings() {
  try {
    applyUiState(window.ImageToolsPreferences.loadUiState(localStorage));
    const settings = await fetch("/api/settings").then(readJson);
    apiBaseUrlInput.value = settings.base_url || currentState.apiBaseUrl || "";
    apiKeyInput.value = "";
    apiKeyWasSaved = Boolean(settings.api_key_set);
    apiModelInput.value =
      settings.model || currentState.apiModel || "gpt-image-2";
    modelInput.value = currentState.model || settings.model || "gpt-image-2";
    settingsStatus.textContent = settings.api_key_set
      ? "已保存 API Key"
      : "尚未保存 API Key";
    persistUiState();
  } catch (error) {
    settingsStatus.textContent = "读取设置失败";
    showToast(error.message);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = {
    base_url: apiBaseUrlInput.value.trim(),
    api_key: apiKeyInput.value.trim(),
    model: apiModelInput.value.trim() || "gpt-image-2",
  };
  if (!payload.base_url || (!payload.api_key && !apiKeyWasSaved)) {
    showToast("请填写 API 地址和 API Key");
    return;
  }

  const button = settingsForm.querySelector("button");
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    const settings = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(readJson);
    apiKeyInput.value = "";
    apiKeyWasSaved = Boolean(settings.api_key_set);
    apiModelInput.value = settings.model || payload.model;
    modelInput.value = settings.model || payload.model;
    settingsStatus.textContent = "已保存 API Key";
    persistUiState();
    showToast("设置已保存");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "保存设置";
  }
}

function clearReference() {
  referenceInput.value = "";
  referencePreview.src = "";
  referencePreview.hidden = true;
  clearReferenceBtn.hidden = true;
  referenceText.textContent = "选择图片用于图生图";
}

function handleReferenceChange() {
  const file = referenceInput.files[0];
  if (!file) {
    clearReference();
    return;
  }
  referenceText.textContent = file.name;
  referencePreview.src = URL.createObjectURL(file);
  referencePreview.hidden = false;
  clearReferenceBtn.hidden = false;
}

async function urlToFile(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], `reference_${Date.now()}.png`, {
    type: blob.type || "image/png",
  });
}

async function useAsReference(url) {
  try {
    const file = await urlToFile(url);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    referenceInput.files = transfer.files;
    handleReferenceChange();
    showToast("已设为参考图");
  } catch (error) {
    showToast(`设置参考图失败：${error.message}`);
  }
}

function renderImages(images, prompt) {
  resultGrid.innerHTML = "";
  images.forEach((src, index) => {
    const absoluteUrl = new URL(src, location.origin).href;
    const card = document.createElement("article");
    card.className = "image-card";

    const image = document.createElement("img");
    image.src = src;
    image.alt = `生成图片 ${index + 1}`;

    const actions = document.createElement("div");
    actions.className = "image-actions";

    const download = document.createElement("a");
    download.href = src;
    download.download = `image-tools-${Date.now()}-${index + 1}.png`;
    download.textContent = "下载";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(absoluteUrl);
      showToast("图片链接已复制");
    });

    const reference = document.createElement("button");
    reference.type = "button";
    reference.textContent = "参考";
    reference.addEventListener("click", () => useAsReference(src));

    actions.append(download, copy, reference);
    card.append(image, actions);
    resultGrid.appendChild(card);
  });
  resultMeta.textContent = `${images.length} 张 · ${prompt.slice(0, 42) || "无提示词"}`;
  setPanelState("results");
}

function renderError(message) {
  errorText.textContent = message || "未知错误";
  resultMeta.textContent = "生成失败";
  setPanelState("error");
}

async function submitGeneration(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) {
    showToast("请先输入提示词");
    promptInput.focus();
    return;
  }

  const dimensions = window.ImageToolsPreferences.resolveDimensions(
    ratioSelect.value,
    resolutionSelect.value,
  );
  const data = new FormData();
  data.append("prompt", prompt);
  data.append("model", currentModel());
  data.append("quality", qualitySelect.value);
  data.append("count", countSelect.value);
  data.append("width", dimensions.width);
  data.append("height", dimensions.height);
  if (referenceInput.files[0]) {
    data.append("reference", referenceInput.files[0]);
  }

  generateBtn.disabled = true;
  generateBtn.textContent = "生成中...";
  resultMeta.textContent = "正在请求接口";
  setPanelState("loading");

  try {
    const result = await fetch("/api/generate", {
      method: "POST",
      body: data,
    }).then(readJson);
    renderImages(result.images || [], prompt);
    persistUiState();
  } catch (error) {
    renderError(error.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "生成图片";
  }
}

function clearResults() {
  resultGrid.innerHTML = "";
  resultMeta.textContent = "等待输入提示词";
  setPanelState("empty");
}

settingsForm.addEventListener("submit", saveSettings);
generateForm.addEventListener("submit", submitGeneration);
generateForm.addEventListener("input", persistUiState);
generateForm.addEventListener("change", persistUiState);
settingsForm.addEventListener("input", persistUiState);
referenceInput.addEventListener("change", handleReferenceChange);
clearReferenceBtn.addEventListener("click", clearReference);
clearResultsBtn.addEventListener("click", clearResults);
clearPromptBtn.addEventListener("click", () => {
  promptInput.value = "";
  persistUiState();
  promptInput.focus();
});
resetOptionsBtn.addEventListener("click", () => {
  applyUiState({
    ...readUiStateFromForm(),
    ratio: "1:1",
    resolution: "standard",
    quality: "auto",
    count: 1,
    model: apiModelInput.value || "gpt-image-2",
    lastPresetId: "",
  });
  persistUiState();
  showToast("已恢复默认参数");
});
copyErrorBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(errorText.textContent);
  showToast("错误信息已复制");
});

setPanelState("empty");
applyUiState(window.ImageToolsPreferences.loadUiState(localStorage));
loadSettings();
