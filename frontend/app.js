const sessionList = document.querySelector("#sessionList");
const sessionFilter = document.querySelector("#sessionFilter");
const searchToggle = document.querySelector("#searchToggle");
const searchPanel = document.querySelector("#searchPanel");
const newSessionBtn = document.querySelector("#newSessionBtn");
const providersBtn = document.querySelector("#providersBtn");
const settingsBtn = document.querySelector("#settingsBtn");
const taskMenuBtn = document.querySelector("#taskMenuBtn");
const taskMenu = document.querySelector("#taskMenu");
const renameSessionBtn = document.querySelector("#renameSessionBtn");
const deleteSessionBtn = document.querySelector("#deleteSessionBtn");
const currentSessionTitle = document.querySelector("#currentSessionTitle");
const currentSessionSubtitle = document.querySelector("#currentSessionSubtitle");
const timeline = document.querySelector("#timeline");
const composerForm = document.querySelector("#composerForm");
const promptInput = document.querySelector("#prompt");
const referenceBtn = document.querySelector("#referenceBtn");
const referenceMenu = document.querySelector("#referenceMenu");
const uploadReferenceBtn = document.querySelector("#uploadReferenceBtn");
const referenceInput = document.querySelector("#referenceInput");
const referencePreview = document.querySelector("#referencePreview");
const referenceName = document.querySelector("#referenceName");
const clearReferenceBtn = document.querySelector("#clearReferenceBtn");
const providerSelect = document.querySelector("#providerSelect");
const modelInput = document.querySelector("#modelInput");
const ratioSelect = document.querySelector("#ratioSelect");
const resolutionSelect = document.querySelector("#resolutionSelect");
const qualitySelect = document.querySelector("#qualitySelect");
const countSelect = document.querySelector("#countSelect");
const outputFormatSelect = document.querySelector("#outputFormatSelect");
const outputCompressionInput = document.querySelector("#outputCompressionInput");
const backgroundSelect = document.querySelector("#backgroundSelect");
const moderationSelect = document.querySelector("#moderationSelect");
const generateBtn = document.querySelector("#generateBtn");
const parameterMenu = document.querySelector("#parameterMenu");
const parameterMenuBtn = document.querySelector("#parameterMenuBtn");
const parameterSummaryText = document.querySelector("#parameterSummaryText");
const providerDialog = document.querySelector("#providerDialog");
const providerDialogClose = document.querySelector("#providerDialogClose");
const providerList = document.querySelector("#providerList");
const addProviderBtn = document.querySelector("#addProviderBtn");
const providerForm = document.querySelector("#providerForm");
const providerEditorTitle = document.querySelector("#providerEditorTitle");
const providerName = document.querySelector("#providerName");
const providerBaseUrl = document.querySelector("#providerBaseUrl");
const providerApiKey = document.querySelector("#providerApiKey");
const providerDefaultModel = document.querySelector("#providerDefaultModel");
const providerIsDefault = document.querySelector("#providerIsDefault");
const providerCancelBtn = document.querySelector("#providerCancelBtn");
const providerSaveBtn = document.querySelector("#providerSaveBtn");
const sessionDialog = document.querySelector("#sessionDialog");
const sessionDialogForm = document.querySelector("#sessionDialogForm");
const sessionDialogTitle = document.querySelector("#sessionDialogTitle");
const sessionDialogMessage = document.querySelector("#sessionDialogMessage");
const sessionTitleField = document.querySelector("#sessionTitleField");
const sessionTitleInput = document.querySelector("#sessionTitleInput");
const sessionDialogCancel = document.querySelector("#sessionDialogCancel");
const sessionDialogSubmit = document.querySelector("#sessionDialogSubmit");
const toast = document.querySelector("#toast");

let toastTimer = null;
let state = window.ImageToolsWorkbench.defaultWorkbenchState();
let providers = [];
let referenceSource = null;
let sessionDialogMode = null;
let editingProviderId = null;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "请求失败");
  }
  return payload;
}

function filteredSessions() {
  const query = sessionFilter.value.trim().toLowerCase();
  if (!query) {
    return state.sessions;
  }
  return state.sessions.filter((session) =>
    session.title.toLowerCase().includes(query),
  );
}

function activeDraftKey() {
  return window.ImageToolsWorkbench.draftStorageKey(state.selectedSessionId);
}

function readDraft(sessionId = state.selectedSessionId) {
  return window.ImageToolsWorkbench.parseDraft(
    localStorage.getItem(window.ImageToolsWorkbench.draftStorageKey(sessionId)),
  );
}

function writeDraft(sessionId, draft) {
  localStorage.setItem(
    window.ImageToolsWorkbench.draftStorageKey(sessionId),
    JSON.stringify(draft),
  );
}

function currentDraft() {
  return {
    prompt: promptInput.value,
    providerId: providerSelect.value ? Number(providerSelect.value) : null,
    model: modelInput.value,
    ratio: ratioSelect.value,
    resolution: resolutionSelect.value,
    quality: qualitySelect.value,
    count: Number(countSelect.value || 1),
    outputFormat: outputFormatSelect.value,
    outputCompression: Number(outputCompressionInput.value || 100),
    background: backgroundSelect.value,
    moderation: moderationSelect.value,
    ...(referenceSource ? { referenceSource } : {}),
  };
}

function saveActiveDraft() {
  writeDraft(state.selectedSessionId, currentDraft());
}

function restoreActiveDraft() {
  const draft = readDraft() || {};
  promptInput.value = draft.prompt || "";
  if (
    draft.providerId != null &&
    providers.some((provider) => provider.id === Number(draft.providerId))
  ) {
    providerSelect.value = String(draft.providerId);
  }
  const provider = window.ImageToolsWorkbench.selectedProvider(
    providers,
    providerSelect.value,
  );
  modelInput.value = draft.model || provider?.defaultModel || "gpt-image-2";
  ratioSelect.value = draft.ratio || "1:1";
  resolutionSelect.value = draft.resolution || "standard";
  qualitySelect.value = draft.quality || "auto";
  countSelect.value = String(draft.count || 1);
  outputFormatSelect.value = draft.outputFormat || "png";
  outputCompressionInput.value = String(draft.outputCompression ?? 100);
  backgroundSelect.value = draft.background || "auto";
  moderationSelect.value = draft.moderation || "auto";
  referenceSource = draft.referenceSource || null;
  referenceInput.value = "";
  referencePreview.hidden = !referenceSource;
  referenceName.textContent = referenceSource ? "历史结果图" : "";
  syncReferenceState();
  syncTransparentBackground();
  resizePrompt();
}

function resizePrompt() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 144)}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > 144 ? "auto" : "hidden";
}

function syncReferenceState() {
  const hasReference = Boolean(referenceSource || referenceInput.files[0]);
  const next = window.ImageToolsWorkbench.normalizeComposerForReference(
    { count: Number(countSelect.value || 1) },
    hasReference,
  );
  countSelect.value = String(next.count);
  countSelect.disabled = hasReference;
  parameterSummaryText.textContent = window.ImageToolsWorkbench.parameterSummary(
    currentDraft(),
  );
}

function syncTransparentBackground() {
  const transparentOption = backgroundSelect.querySelector(
    'option[value="transparent"]',
  );
  const supported =
    window.ImageToolsPreferences.supportsTransparentBackground(modelInput.value) &&
    outputFormatSelect.value !== "jpeg";
  transparentOption.disabled = !supported;
  if (!supported && backgroundSelect.value === "transparent") {
    backgroundSelect.value = "auto";
  }
}

function renderSessions() {
  const sessions = filteredSessions();
  window.ImageToolsUi.renderSessionList(
    sessionList,
    sessions,
    state.selectedSessionId,
    selectExistingSession,
  );
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "sidebar-empty";
    empty.textContent = state.sessions.length ? "没有匹配的会话" : "还没有会话";
    sessionList.appendChild(empty);
  }
}

function renderEmptyTimeline(message, detail) {
  timeline.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-workspace";
  const title = document.createElement("strong");
  title.textContent = message;
  const text = document.createElement("span");
  text.textContent = detail;
  empty.append(title, text);
  timeline.appendChild(empty);
}

function renderTimelineRuns(runs) {
  timeline.innerHTML = "";
  if (!runs.length) {
    renderEmptyTimeline("这个会话还没有生成记录", "底部 Composer 会在下一步接入生成。");
    return;
  }
  runs.forEach((run) => {
    const article = document.createElement("article");
    article.className = "timeline-run";
    const header = document.createElement("header");
    const prompt = document.createElement("strong");
    prompt.textContent = run.prompt || "无提示词";
    const status = document.createElement("span");
    status.className = "status-chip";
    status.textContent = run.status;
    header.append(prompt, status);

    const chips = document.createElement("div");
    chips.className = "run-chips";
    [
      run.provider_name,
      run.model,
      run.parameters?.size,
      run.parameters?.quality,
      `${run.parameters?.count || 1} 张`,
    ]
      .filter(Boolean)
      .forEach((value) => {
        const chip = document.createElement("span");
        chip.textContent = value;
        chips.appendChild(chip);
      });

    const actions = document.createElement("div");
    actions.className = "run-actions";
    const copyParams = document.createElement("button");
    copyParams.type = "button";
    copyParams.className = "secondary-button";
    copyParams.textContent = "复制参数到输入区";
    copyParams.addEventListener("click", () => applyRunToComposer(run));
    actions.appendChild(copyParams);

    const details = document.createElement("details");
    details.className = "run-details";
    const summary = document.createElement("summary");
    summary.textContent = "详情";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(run.parameters || {}, null, 2);
    details.append(summary, pre);

    article.append(header, chips, actions, details);
    if (run.status === "failed") {
      const error = document.createElement("pre");
      error.className = "run-error";
      error.textContent = run.error_message || "生成失败";
      article.appendChild(error);
    }
    if (Array.isArray(run.images) && run.images.length) {
      article.appendChild(renderRunImages(run));
    }
    timeline.appendChild(article);
  });
}

function renderRunImages(run) {
  const grid = document.createElement("div");
  grid.className = "run-image-grid";
  run.images.forEach((image, index) => {
    const card = document.createElement("figure");
    card.className = "run-image";
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = `生成结果 ${index + 1}`;

    const actions = document.createElement("figcaption");
    const preview = document.createElement("button");
    preview.type = "button";
    preview.textContent = "预览";
    preview.addEventListener("click", () => window.open(image.url, "_blank"));

    const download = document.createElement("a");
    download.href = image.url;
    download.download = image.filename || `image-tools-${index + 1}.png`;
    download.textContent = "下载";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制链接";
    copy.addEventListener("click", () => copyImageLink(image.url));

    const reference = document.createElement("button");
    reference.type = "button";
    reference.textContent = "设为参考图";
    reference.addEventListener("click", () => setReferenceFromUrl(image.url));

    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.textContent = "基于此图继续";
    continueButton.addEventListener("click", async () => {
      applyRunToComposer(run);
      await setReferenceFromUrl(image.url);
      promptInput.focus();
    });

    actions.append(preview, download, copy, reference, continueButton);
    card.append(img, actions);
    grid.appendChild(card);
  });
  return grid;
}

async function copyImageLink(url) {
  const absoluteUrl = new URL(url, location.origin).href;
  await navigator.clipboard.writeText(absoluteUrl);
  showToast("图片链接已复制");
}

async function setReferenceFromUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], `reference_${Date.now()}.png`, {
      type: blob.type || "image/png",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    referenceInput.files = transfer.files;
    referenceSource = { kind: "result", url };
    referencePreview.hidden = false;
    referenceName.textContent = file.name;
    syncReferenceState();
    saveActiveDraft();
    showToast("已设为参考图");
  } catch (error) {
    showToast(`设置参考图失败：${error.message}`);
  }
}

function applyRunToComposer(run) {
  const next = window.ImageToolsWorkbench.composerStateFromRun(run);
  promptInput.value = next.prompt;
  if (next.providerId && providers.some((provider) => provider.id === next.providerId)) {
    providerSelect.value = String(next.providerId);
  }
  modelInput.value = next.model;
  ratioSelect.value = next.ratio;
  resolutionSelect.value = next.resolution;
  qualitySelect.value = next.quality;
  countSelect.value = String(next.count);
  outputFormatSelect.value = next.outputFormat;
  outputCompressionInput.value = String(next.outputCompression);
  backgroundSelect.value = next.background;
  moderationSelect.value = next.moderation;
  showToast("已复制参数到输入区");
}

async function loadTimeline(sessionId) {
  if (!sessionId) {
    window.ImageToolsUi.renderNewTask(timeline);
    return;
  }
  try {
    const runs = await fetch(`/api/sessions/${sessionId}/runs`).then(readJson);
    if (sessionId === state.selectedSessionId) {
      renderTimelineRuns(runs);
    }
  } catch (error) {
    renderEmptyTimeline("读取时间线失败", error.message);
  }
}

function renderCurrentSession() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  const hasSession = Boolean(session);
  const hasProvider = providers.length > 0;
  window.ImageToolsUi.renderTaskHeader(
    currentSessionTitle,
    currentSessionSubtitle,
    session,
  );
  taskMenuBtn.disabled = !hasSession;
  renameSessionBtn.disabled = !hasSession;
  deleteSessionBtn.disabled = !hasSession;
  referenceBtn.disabled = false;
  generateBtn.disabled = !hasProvider;
  promptInput.disabled = false;
}

function render() {
  renderSessions();
  renderCurrentSession();
}

async function loadSessions() {
  try {
    const sessions = await fetch("/api/sessions").then(readJson);
    state = window.ImageToolsWorkbench.applySessionList(state, sessions);
    render();
    await loadTimeline(state.selectedSessionId);
  } catch (error) {
    showToast(error.message);
  }
}

function renderProviders() {
  const previousId = Number(providerSelect.value);
  providerSelect.innerHTML = "";
  if (!providers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未配置 Provider";
    providerSelect.appendChild(option);
    modelInput.value = "gpt-image-2";
    renderProviderManager();
    renderCurrentSession();
    return;
  }
  providers.forEach((provider) => {
    const option = document.createElement("option");
    option.value = String(provider.id);
    option.textContent = provider.name;
    providerSelect.appendChild(option);
  });
  const selected = window.ImageToolsWorkbench.preferredProvider(
    providers,
    previousId,
  );
  providerSelect.value = String(selected.id);
  modelInput.value = selected.defaultModel;
  renderProviderManager();
  restoreActiveDraft();
  renderCurrentSession();
}

async function loadProviders() {
  try {
    providers = window.ImageToolsWorkbench.normalizeProviders(
      await fetch("/api/providers").then(readJson),
    );
    renderProviders();
  } catch (error) {
    showToast(error.message);
  }
}

function renderProviderManager() {
  window.ImageToolsUi.renderProviderList(
    providerList,
    providers,
    Number(providerSelect.value),
    handleProviderAction,
  );
  if (!providers.length) {
    const empty = document.createElement("p");
    empty.className = "provider-empty";
    empty.textContent = "尚未配置 Provider";
    providerList.appendChild(empty);
  }
}

function startNewProvider() {
  editingProviderId = null;
  providerEditorTitle.textContent = "新增 Provider";
  providerForm.reset();
  providerDefaultModel.value = "gpt-image-2";
  providerApiKey.value = "";
  providerApiKey.placeholder = "输入 API Key";
  providerName.focus();
}

function editProvider(providerId) {
  const provider = providers.find((item) => item.id === Number(providerId));
  if (!provider) return;
  editingProviderId = provider.id;
  providerEditorTitle.textContent = `编辑 ${provider.name}`;
  providerName.value = provider.name;
  providerBaseUrl.value = provider.baseUrl;
  providerApiKey.value = "";
  providerApiKey.placeholder = provider.apiKeySet
    ? "已保存，留空则保持不变"
    : "输入 API Key";
  providerDefaultModel.value = provider.defaultModel;
  providerIsDefault.checked = provider.isDefault;
  providerName.focus();
}

async function mutateProvider(url, options) {
  providerSaveBtn.disabled = true;
  try {
    await fetch(url, options).then(readJson);
    await loadProviders();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  } finally {
    providerSaveBtn.disabled = false;
  }
}

async function handleProviderAction(action, providerId) {
  if (action === "edit") {
    editProvider(providerId);
    return;
  }
  if (action === "default") {
    await mutateProvider(`/api/providers/${providerId}/default`, {
      method: "POST",
    });
    return;
  }
  if (action === "delete") {
    const deleted = await mutateProvider(`/api/providers/${providerId}`, {
      method: "DELETE",
    });
    if (deleted && editingProviderId === Number(providerId)) startNewProvider();
  }
}

async function handleProviderSubmit(event) {
  event.preventDefault();
  const payload = window.ImageToolsWorkbench.buildProviderPayload({
    name: providerName.value,
    baseUrl: providerBaseUrl.value,
    apiKey: providerApiKey.value,
    defaultModel: providerDefaultModel.value,
    isDefault: providerIsDefault.checked,
  });
  const method = editingProviderId == null ? "POST" : "PATCH";
  const url =
    editingProviderId == null
      ? "/api/providers"
      : `/api/providers/${editingProviderId}`;
  if (await mutateProvider(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })) {
    const saved = providers.find((provider) => provider.name === payload.name);
    if (saved) editProvider(saved.id);
  }
}

function startNewTask() {
  saveActiveDraft();
  state = window.ImageToolsWorkbench.selectNewTask(state);
  restoreActiveDraft();
  render();
  window.ImageToolsUi.renderNewTask(timeline);
  promptInput.focus();
}

async function selectExistingSession(sessionId) {
  if (sessionId === state.selectedSessionId) {
    return;
  }
  saveActiveDraft();
  state = window.ImageToolsWorkbench.selectSession(state, sessionId);
  restoreActiveDraft();
  render();
  await loadTimeline(sessionId);
}

async function ensureSessionForSubmit(prompt) {
  if (state.selectedSessionId != null) {
    return state.selectedSessionId;
  }
  const draft = currentDraft();
  const session = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: window.ImageToolsWorkbench.deriveSessionTitle(prompt),
    }),
  }).then(readJson);
  await loadSessions();
  state = window.ImageToolsWorkbench.selectSession(state, session.id);
  writeDraft(session.id, draft);
  render();
  return session.id;
}

function closeTaskMenu() {
  taskMenu.hidden = true;
  taskMenuBtn.setAttribute("aria-expanded", "false");
}

function openRenameDialog() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (!session) {
    return;
  }
  closeTaskMenu();
  sessionDialogMode = "rename";
  sessionDialogTitle.textContent = "重命名会话";
  sessionDialogMessage.hidden = true;
  sessionTitleField.hidden = false;
  sessionTitleInput.disabled = false;
  sessionTitleInput.value = session.title;
  sessionDialogSubmit.textContent = "保存";
  sessionDialogSubmit.classList.remove("danger");
  window.ImageToolsUi.openDialog(sessionDialog, taskMenuBtn);
  sessionTitleInput.select();
}

function openDeleteDialog() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (!session) {
    return;
  }
  closeTaskMenu();
  sessionDialogMode = "delete";
  sessionDialogTitle.textContent = "删除会话";
  sessionDialogMessage.textContent = `确定删除“${session.title}”及其生成记录吗？`;
  sessionDialogMessage.hidden = false;
  sessionTitleField.hidden = true;
  sessionTitleInput.disabled = true;
  sessionDialogSubmit.textContent = "删除";
  sessionDialogSubmit.classList.add("danger");
  window.ImageToolsUi.openDialog(sessionDialog, taskMenuBtn);
}

async function renameSession(title) {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (!session) return;
  try {
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    }).then(readJson);
    await loadSessions();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function deleteSession() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (!session) return;
  try {
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    localStorage.removeItem(window.ImageToolsWorkbench.draftStorageKey(session.id));
    state = window.ImageToolsWorkbench.selectNewTask(state);
    await loadSessions();
    restoreActiveDraft();
    render();
    window.ImageToolsUi.renderNewTask(timeline);
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function handleComposerSubmit(event) {
  event.preventDefault();
  const provider = window.ImageToolsWorkbench.selectedProvider(
    providers,
    providerSelect.value,
  );
  const prompt = promptInput.value.trim();
  if (!provider) {
    showToast("请先配置 Provider");
    return;
  }
  if (!prompt) {
    showToast("请先输入提示词");
    promptInput.focus();
    return;
  }

  generateBtn.disabled = true;
  generateBtn.setAttribute("aria-label", "生成中");
  try {
    const sessionId = await ensureSessionForSubmit(prompt);
    const fields = window.ImageToolsWorkbench.buildGenerationFields(
      {
        sessionId,
        providerId: provider.id,
        prompt,
        model: modelInput.value || provider.defaultModel,
        ratio: ratioSelect.value,
        resolution: resolutionSelect.value,
        quality: qualitySelect.value,
        count: countSelect.value,
        outputFormat: outputFormatSelect.value,
        outputCompression: outputCompressionInput.value,
        background: backgroundSelect.value,
        moderation: moderationSelect.value,
      },
      window.ImageToolsPreferences,
    );
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    if (referenceInput.files[0]) {
      formData.append("reference", referenceInput.files[0]);
    }
    await fetch("/api/generate", { method: "POST", body: formData }).then(readJson);
    showToast("生成完成");
    await loadTimeline(sessionId);
    await loadSessions();
  } catch (error) {
    showToast(error.message);
    if (state.selectedSessionId) {
      await loadTimeline(state.selectedSessionId);
    }
  } finally {
    generateBtn.disabled = providers.length === 0;
    generateBtn.setAttribute("aria-label", "开始生成");
  }
}

async function handleSessionDialogSubmit(event) {
  event.preventDefault();
  if (sessionDialogMode === "rename") {
    const title = sessionTitleInput.value.trim();
    if (!title) {
      sessionTitleInput.focus();
      return;
    }
    if (!(await renameSession(title))) return;
  } else if (sessionDialogMode === "delete") {
    if (!(await deleteSession())) return;
  }
  sessionDialogMode = null;
  window.ImageToolsUi.closeDialog(sessionDialog);
}

function toggleSearch() {
  searchPanel.hidden = !searchPanel.hidden;
  if (!searchPanel.hidden) {
    sessionFilter.focus();
  }
}

function openProviderDialog(opener) {
  window.ImageToolsUi.openDialog(providerDialog, opener);
  renderProviderManager();
  startNewProvider();
}

function closeProviderDialog() {
  window.ImageToolsUi.closeDialog(providerDialog);
}

function handleEscape(event) {
  if (event.key !== "Escape") return;
  if (!taskMenu.hidden) {
    closeTaskMenu();
    taskMenuBtn.focus();
  }
  if (!searchPanel.hidden) {
    searchPanel.hidden = true;
    searchToggle.focus();
  }
  if (!parameterMenu.hidden) {
    parameterMenu.hidden = true;
    parameterMenuBtn.setAttribute("aria-expanded", "false");
    parameterMenuBtn.focus();
  }
  if (!referenceMenu.hidden) {
    referenceMenu.hidden = true;
    referenceBtn.setAttribute("aria-expanded", "false");
    referenceBtn.focus();
  }
}

function toggleTaskMenu() {
  const opening = taskMenu.hidden;
  taskMenu.hidden = !opening;
  taskMenuBtn.setAttribute("aria-expanded", String(opening));
  if (opening) {
    renameSessionBtn.focus();
  }
}

function toggleParameterMenu() {
  const opening = parameterMenu.hidden;
  closeTaskMenu();
  closeReferenceMenu();
  parameterMenu.hidden = !opening;
  parameterMenuBtn.setAttribute("aria-expanded", String(opening));
  if (opening) {
    ratioSelect.focus();
  }
}

function closeReferenceMenu() {
  referenceMenu.hidden = true;
  referenceBtn.setAttribute("aria-expanded", "false");
}

function toggleReferenceMenu() {
  const opening = referenceMenu.hidden;
  closeTaskMenu();
  parameterMenu.hidden = true;
  parameterMenuBtn.setAttribute("aria-expanded", "false");
  referenceMenu.hidden = !opening;
  referenceBtn.setAttribute("aria-expanded", String(opening));
  if (opening) uploadReferenceBtn.focus();
}

function handlePromptKeydown(event) {
  if (!window.ImageToolsWorkbench.shouldSubmitComposer(event)) return;
  event.preventDefault();
  composerForm.requestSubmit();
}

function handleOutsideClick(event) {
  if (!parameterMenu.hidden && !parameterMenu.contains(event.target) && !parameterMenuBtn.contains(event.target)) {
    parameterMenu.hidden = true;
    parameterMenuBtn.setAttribute("aria-expanded", "false");
  }
  if (!referenceMenu.hidden && !referenceMenu.contains(event.target) && !referenceBtn.contains(event.target)) {
    closeReferenceMenu();
  }
}

function closeSessionDialog() {
  sessionDialogMode = null;
  window.ImageToolsUi.closeDialog(sessionDialog);
}

function handleDialogCancel(event) {
  event.preventDefault();
  if (event.currentTarget === sessionDialog) {
    closeSessionDialog();
  } else {
    closeProviderDialog();
  }
}

function saveDraftFromInput() {
  saveActiveDraft();
  parameterSummaryText.textContent = window.ImageToolsWorkbench.parameterSummary(
    currentDraft(),
  );
}

newSessionBtn.addEventListener("click", startNewTask);
searchToggle.addEventListener("click", toggleSearch);
providersBtn.addEventListener("click", () => openProviderDialog(providersBtn));
settingsBtn.addEventListener("click", () => openProviderDialog(settingsBtn));
providerDialogClose.addEventListener("click", closeProviderDialog);
providerDialog.addEventListener("cancel", handleDialogCancel);
addProviderBtn.addEventListener("click", startNewProvider);
providerCancelBtn.addEventListener("click", startNewProvider);
providerForm.addEventListener("submit", handleProviderSubmit);
taskMenuBtn.addEventListener("click", toggleTaskMenu);
renameSessionBtn.addEventListener("click", openRenameDialog);
deleteSessionBtn.addEventListener("click", openDeleteDialog);
sessionDialogForm.addEventListener("submit", handleSessionDialogSubmit);
sessionDialogCancel.addEventListener("click", closeSessionDialog);
sessionDialog.addEventListener("cancel", handleDialogCancel);
parameterMenuBtn.addEventListener("click", toggleParameterMenu);
document.addEventListener("keydown", handleEscape);
document.addEventListener("pointerdown", handleOutsideClick);
sessionFilter.addEventListener("input", renderSessions);
composerForm.addEventListener("submit", handleComposerSubmit);
composerForm.addEventListener("input", saveDraftFromInput);
promptInput.addEventListener("input", resizePrompt);
promptInput.addEventListener("keydown", handlePromptKeydown);
parameterMenu.addEventListener("input", saveDraftFromInput);
parameterMenu.addEventListener("change", saveDraftFromInput);
providerSelect.addEventListener("change", () => {
  const provider = window.ImageToolsWorkbench.selectedProvider(
    providers,
    providerSelect.value,
  );
  if (provider) {
    modelInput.value = provider.defaultModel;
    syncTransparentBackground();
    saveActiveDraft();
  }
});
referenceBtn.addEventListener("click", toggleReferenceMenu);
uploadReferenceBtn.addEventListener("click", () => {
  closeReferenceMenu();
  referenceInput.click();
});
referenceInput.addEventListener("change", () => {
  const file = referenceInput.files[0];
  referenceSource = null;
  referencePreview.hidden = !file;
  referenceName.textContent = file ? file.name : "";
  syncReferenceState();
  saveActiveDraft();
});
clearReferenceBtn.addEventListener("click", () => {
  referenceInput.value = "";
  referenceSource = null;
  referencePreview.hidden = true;
  referenceName.textContent = "";
  syncReferenceState();
  saveActiveDraft();
});
modelInput.addEventListener("input", syncTransparentBackground);
outputFormatSelect.addEventListener("change", syncTransparentBackground);

render();
restoreActiveDraft();
loadSessions();
loadProviders();
