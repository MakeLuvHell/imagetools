const sessionList = document.querySelector("#sessionList");
const sessionFilter = document.querySelector("#sessionFilter");
const searchToggle = document.querySelector("#searchToggle");
const searchPanel = document.querySelector("#searchPanel");
const newSessionBtn = document.querySelector("#newSessionBtn");
const newProjectBtn = document.querySelector("#newProjectBtn");
const providersBtn = document.querySelector("#providersBtn");
const settingsBtn = document.querySelector("#settingsBtn");
const taskMenuBtn = document.querySelector("#taskMenuBtn");
const taskMenu = document.querySelector("#taskMenu");
const renameSessionBtn = document.querySelector("#renameSessionBtn");
const deleteSessionBtn = document.querySelector("#deleteSessionBtn");
const pinSessionBtn = document.querySelector("#pinSessionBtn");
const organizeSessionBtn = document.querySelector("#organizeSessionBtn");
const sidebarMenu = document.querySelector("#sidebarMenu");
const sidebarMenuPinBtn = document.querySelector("#sidebarMenuPinBtn");
const sidebarMenuOrganizeBtn = document.querySelector("#sidebarMenuOrganizeBtn");
const sidebarMenuRenameProjectBtn = document.querySelector("#sidebarMenuRenameProjectBtn");
const sidebarMenuDeleteProjectBtn = document.querySelector("#sidebarMenuDeleteProjectBtn");
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
const advancedParamsPanel = document.querySelector("#advancedParamsPanel");
const workspace = document.querySelector(".workspace");
const settingsView = document.querySelector("#settingsView");
const settingsBackBtn = document.querySelector("#settingsBackBtn");
const settingsProvidersNav = document.querySelector("#settingsProvidersNav");
const settingsStorageNav = document.querySelector("#settingsStorageNav");
const settingsProvidersPanel = document.querySelector("#settingsProvidersPanel");
const settingsStoragePanel = document.querySelector("#settingsStoragePanel");
const providerList = document.querySelector("#providerList");
const addProviderBtn = document.querySelector("#addProviderBtn");
const providerActionStatus = document.querySelector("#providerActionStatus");
const providerMenu = document.querySelector("#providerMenu");
const providerMenuEditBtn = document.querySelector("#providerMenuEditBtn");
const providerMenuDefaultBtn = document.querySelector("#providerMenuDefaultBtn");
const providerMenuDeleteBtn = document.querySelector("#providerMenuDeleteBtn");
const providerDialog = document.querySelector("#providerDialog");
const providerDialogClose = document.querySelector("#providerDialogClose");
const providerForm = document.querySelector("#providerForm");
const providerEditorTitle = document.querySelector("#providerEditorTitle");
const providerDialogStatus = document.querySelector("#providerDialogStatus");
const providerName = document.querySelector("#providerName");
const providerBaseUrl = document.querySelector("#providerBaseUrl");
const providerApiKey = document.querySelector("#providerApiKey");
const providerDefaultModel = document.querySelector("#providerDefaultModel");
const providerIsDefault = document.querySelector("#providerIsDefault");
const providerCancelBtn = document.querySelector("#providerCancelBtn");
const providerSaveBtn = document.querySelector("#providerSaveBtn");
const providerDeleteDialog = document.querySelector("#providerDeleteDialog");
const providerDeleteForm = document.querySelector("#providerDeleteForm");
const providerDeleteMessage = document.querySelector("#providerDeleteMessage");
const providerDeleteStatus = document.querySelector("#providerDeleteStatus");
const providerDeleteCancel = document.querySelector("#providerDeleteCancel");
const providerDeleteConfirm = document.querySelector("#providerDeleteConfirm");
const storageCurrentPath = document.querySelector("#storageCurrentPath");
const storageChangeBtn = document.querySelector("#storageChangeBtn");
const storagePendingState = document.querySelector("#storagePendingState");
const storagePendingPath = document.querySelector("#storagePendingPath");
const storageIdleState = document.querySelector("#storageIdleState");
const storagePanelStatus = document.querySelector("#storagePanelStatus");
const storageDialog = document.querySelector("#storageDialog");
const storageDialogClose = document.querySelector("#storageDialogClose");
const storageLocationForm = document.querySelector("#storageLocationForm");
const storageDialogStatus = document.querySelector("#storageDialogStatus");
const storageDataDir = document.querySelector("#storageDataDir");
const storageBrowseBtn = document.querySelector("#storageBrowseBtn");
const storageMigrateExisting = document.querySelector("#storageMigrateExisting");
const storageCancelBtn = document.querySelector("#storageCancelBtn");
const storageApplyBtn = document.querySelector("#storageApplyBtn");
const sessionDialog = document.querySelector("#sessionDialog");
const sessionDialogForm = document.querySelector("#sessionDialogForm");
const sessionDialogTitle = document.querySelector("#sessionDialogTitle");
const sessionDialogMessage = document.querySelector("#sessionDialogMessage");
const sessionTitleField = document.querySelector("#sessionTitleField");
const sessionTitleLabel = document.querySelector("#sessionTitleLabel");
const sessionTitleInput = document.querySelector("#sessionTitleInput");
const sessionProjectField = document.querySelector("#sessionProjectField");
const sessionProjectSelect = document.querySelector("#sessionProjectSelect");
const sessionDialogCancel = document.querySelector("#sessionDialogCancel");
const sessionDialogSubmit = document.querySelector("#sessionDialogSubmit");
const imagePreviewDialog = document.querySelector("#imagePreviewDialog");
const imagePreviewClose = document.querySelector("#imagePreviewClose");
const imagePreview = document.querySelector("#imagePreview");
const toast = document.querySelector("#toast");

let toastTimer = null;
let state = window.ImageToolsWorkbench.defaultWorkbenchState();
let providers = [];
let projects = [];
let referenceSource = null;
let sessionDialogMode = null;
let sessionDialogTarget = null;
let sidebarMenuTarget = null;
let sidebarMenuTrigger = null;
let editingProviderId = null;
let providerSettingsStatus = "loading";
let providerSettingsError = "";
let providerMenuTarget = null;
let providerMenuTrigger = null;
let providerDeleteTarget = null;
let providerSaveToken = 0;
let providerLoadToken = 0;
let storageLocation = null;
let storageViewGeneration = 0;
let storageLoadGeneration = 0;
let storageDialogGeneration = 0;
let newTaskSubmissionLocked = false;
let settingsOpener = null;
const runsBySession = {};

function setInlineStatus(element, message, tone = "") {
  element.textContent = message;
  element.hidden = !message;
  if (tone) {
    element.dataset.tone = tone;
  } else {
    delete element.dataset.tone;
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  window.ImageToolsUi.openLayer(toast);
  toastTimer = setTimeout(() => {
    void window.ImageToolsUi.closeLayer(toast);
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
    window.ImageToolsWorkbench.groupSessions(sessions, projects),
    state.selectedSessionId,
    {
      onSelect: selectExistingSession,
      onSessionAction: openSidebarSessionMenu,
      onProjectAction: openSidebarProjectMenu,
    },
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
  if (!runs.length) {
    renderEmptyTimeline("这个会话还没有生成记录", "从 Composer 开始新的生成。");
    return;
  }
  window.ImageToolsUi.renderTaskRuns(timeline, runs, {
    onPreview: openImagePreview,
    onDownload: downloadImage,
    onCopyLink: (image) => copyImageLink(image.url),
    onSetReference: (image) => setReferenceFromUrl(image.url),
    onContinue: async (image, run) => {
      applyRunToComposer(run);
      await setReferenceFromUrl(image.url);
      promptInput.focus();
    },
    onRetry: (run) => {
      if (run.optimistic && run.submissionId) {
        state = window.ImageToolsWorkbench.removePendingRun(
          state,
          state.selectedSessionId,
          run.submissionId,
        );
      }
      applyRunToComposer(run);
      composerForm.requestSubmit();
    },
    onCopyError: (run) => navigator.clipboard.writeText(run.error_message || "生成失败"),
    onCopyParameters: applyRunToComposer,
  });
}

function openImagePreview(image) {
  imagePreview.src = image.url;
  window.ImageToolsUi.openDialog(imagePreviewDialog, document.activeElement);
}

function closeImagePreview() {
  window.ImageToolsUi.closeDialog(imagePreviewDialog);
  imagePreview.removeAttribute("src");
}

function cancelImagePreview(event) {
  event.preventDefault();
  closeImagePreview();
}

function downloadImage(image) {
  const link = document.createElement("a");
  link.href = image.url;
  link.download = image.filename || "image-tools-result.png";
  link.click();
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
    runsBySession[sessionId] = runs;
    if (sessionId === state.selectedSessionId) {
      renderTimelineRuns([
        ...runs,
        ...window.ImageToolsWorkbench.pendingRunsForSession(state, sessionId),
      ]);
    }
    return runs;
  } catch (error) {
    if (sessionId === state.selectedSessionId) {
      renderEmptyTimeline("读取时间线失败", error.message);
    }
    return [];
  }
}

function renderCurrentSession() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  const hasSession = Boolean(session);
  const hasProvider = providers.length > 0;
  const hasInFlight = window.ImageToolsWorkbench
    .pendingRunsForSession(state, state.selectedSessionId)
    .some((run) => run.status === "running");
  window.ImageToolsUi.renderTaskHeader(
    currentSessionTitle,
    currentSessionSubtitle,
    session,
  );
  taskMenuBtn.disabled = !hasSession;
  renameSessionBtn.disabled = !hasSession;
  deleteSessionBtn.disabled = !hasSession;
  pinSessionBtn.disabled = !hasSession;
  organizeSessionBtn.disabled = !hasSession;
  if (session) {
    pinSessionBtn.querySelector("span").textContent = session.isPinned ? "取消置顶" : "置顶";
  }
  referenceBtn.disabled = false;
  generateBtn.disabled = !hasProvider || hasInFlight;
  promptInput.disabled = false;
}

function render() {
  renderSessions();
  renderCurrentSession();
}

async function loadSessions() {
  try {
    const [sessions, loadedProjects] = await Promise.all([
      fetch("/api/sessions").then(readJson),
      fetch("/api/projects").then(readJson),
    ]);
    projects = window.ImageToolsWorkbench.normalizeProjects(loadedProjects);
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

async function loadProviders({ showLoading = false } = {}) {
  const token = ++providerLoadToken;
  if (showLoading) {
    providerSettingsStatus = "loading";
    providerSettingsError = "";
    renderProviderManager();
  }
  try {
    const loadedProviders = window.ImageToolsWorkbench.normalizeProviders(
      await fetch("/api/providers").then(readJson),
    );
    if (token !== providerLoadToken) return false;
    providers = loadedProviders;
    providerSettingsStatus = "ready";
    providerSettingsError = "";
    renderProviders();
    return true;
  } catch (error) {
    if (token !== providerLoadToken) return false;
    providerSettingsStatus = "error";
    providerSettingsError = error.message;
    renderProviderManager();
    if (settingsView.hidden) showToast(error.message);
    return false;
  }
}

function renderProviderManager() {
  window.ImageToolsUi.renderProviderSettings(
    providerList,
    {
      status: providerSettingsStatus,
      providers,
      error: providerSettingsError,
    },
    {
      onAdd: (event) => openNewProviderDialog(event?.currentTarget || addProviderBtn),
      onEdit: (provider, trigger) => openEditProviderDialog(provider.id, trigger),
      onMenu: (provider, trigger) => toggleProviderMenu(provider, trigger),
      onRetry: () => void loadProviders({ showLoading: true }),
    },
  );
}

function providerRowMain(providerId) {
  return providerList.querySelector(
    `[data-provider-id="${Number(providerId)}"] .provider-row-main`,
  );
}

function resetProviderForm() {
  providerForm.reset();
  providerDefaultModel.value = "gpt-image-2";
  providerApiKey.value = "";
  providerApiKey.placeholder = "输入 API Key";
  providerSaveBtn.disabled = false;
  providerCancelBtn.disabled = false;
  providerDialogClose.disabled = false;
  providerSaveBtn.textContent = "保存";
  setInlineStatus(providerDialogStatus, "");
}

function openNewProviderDialog(opener) {
  editingProviderId = null;
  providerSaveToken += 1;
  resetProviderForm();
  providerEditorTitle.textContent = "添加 Provider";
  window.ImageToolsUi.openDialog(providerDialog, opener);
  providerName.focus();
}

function openEditProviderDialog(providerId, opener) {
  const provider = providers.find((item) => item.id === Number(providerId));
  if (!provider) return;
  editingProviderId = provider.id;
  providerSaveToken += 1;
  resetProviderForm();
  providerEditorTitle.textContent = "编辑 Provider";
  providerName.value = provider.name;
  providerBaseUrl.value = provider.baseUrl;
  providerApiKey.placeholder = provider.apiKeySet
    ? "已保存，留空则保持不变"
    : "输入 API Key";
  providerDefaultModel.value = provider.defaultModel;
  providerIsDefault.checked = provider.isDefault;
  window.ImageToolsUi.openDialog(providerDialog, opener);
  providerName.focus();
}

function closeProviderDialog() {
  if (providerSaveBtn.disabled) return Promise.resolve();
  providerSaveToken += 1;
  editingProviderId = null;
  return window.ImageToolsUi.closeDialog(providerDialog).then(resetProviderForm);
}

function handleProviderDialogCancel(event) {
  event.preventDefault();
  void closeProviderDialog();
}

function closeProviderMenu(options) {
  const trigger = providerMenuTrigger;
  providerMenuTarget = null;
  providerMenuTrigger = null;
  return window.ImageToolsUi.closeLayer(providerMenu, trigger, options);
}

function toggleProviderMenu(provider, trigger) {
  const isSameMenu =
    window.ImageToolsUi.isLayerOpen(providerMenu) &&
    providerMenuTarget?.id === provider.id;
  if (isSameMenu) {
    void closeProviderMenu({ restoreFocus: true });
    return;
  }

  if (window.ImageToolsUi.isLayerOpen(providerMenu)) {
    void closeProviderMenu();
  }
  providerMenuTarget = provider;
  providerMenuTrigger = trigger;
  providerMenuDefaultBtn.hidden = provider.isDefault;
  window.ImageToolsUi.openAnchoredLayer(providerMenu, trigger);
  providerMenuEditBtn.focus();
}

async function editProviderFromMenu() {
  const providerId = providerMenuTarget?.id;
  const opener = providerRowMain(providerId);
  await closeProviderMenu();
  if (providerId != null) openEditProviderDialog(providerId, opener);
}

async function setDefaultProviderFromMenu() {
  const providerId = providerMenuTarget?.id;
  await closeProviderMenu();
  if (providerId == null) return;
  setInlineStatus(providerActionStatus, "");
  try {
    await fetch(`/api/providers/${providerId}/default`, {
      method: "POST",
    }).then(readJson);
    await loadProviders();
    (providerRowMain(providerId) || addProviderBtn).focus();
  } catch (error) {
    setInlineStatus(providerActionStatus, error.message, "error");
    (providerRowMain(providerId) || addProviderBtn).focus();
  }
}

function openProviderDeleteDialog(providerId, opener) {
  const provider = providers.find((item) => item.id === Number(providerId));
  if (!provider) return;
  providerDeleteTarget = provider;
  providerDeleteMessage.textContent = `确定删除“${provider.name}”吗？此操作无法撤销。`;
  setInlineStatus(providerDeleteStatus, "");
  providerDeleteCancel.disabled = false;
  providerDeleteConfirm.disabled = false;
  window.ImageToolsUi.openDialog(providerDeleteDialog, opener);
}

async function deleteProviderFromMenu() {
  const providerId = providerMenuTarget?.id;
  const opener = providerMenuTrigger;
  await closeProviderMenu();
  if (providerId != null) openProviderDeleteDialog(providerId, opener);
}

function closeProviderDeleteDialog() {
  if (providerDeleteConfirm.disabled) return Promise.resolve();
  providerDeleteTarget = null;
  return window.ImageToolsUi.closeDialog(providerDeleteDialog);
}

function handleProviderDeleteCancel(event) {
  event.preventDefault();
  void closeProviderDeleteDialog();
}

async function handleProviderDeleteSubmit(event) {
  event.preventDefault();
  const providerId = providerDeleteTarget?.id;
  if (providerId == null) return;
  providerDeleteCancel.disabled = true;
  providerDeleteConfirm.disabled = true;
  setInlineStatus(providerDeleteStatus, "");
  try {
    await fetch(`/api/providers/${providerId}`, { method: "DELETE" }).then(readJson);
    await window.ImageToolsUi.closeDialog(providerDeleteDialog);
    providerDeleteTarget = null;
    await loadProviders();
    (providerList.querySelector(".provider-row-main") || addProviderBtn).focus();
  } catch (error) {
    setInlineStatus(providerDeleteStatus, error.message, "error");
  } finally {
    providerDeleteCancel.disabled = false;
    providerDeleteConfirm.disabled = false;
  }
}

async function handleProviderSubmit(event) {
  event.preventDefault();
  const token = ++providerSaveToken;
  const providerId = editingProviderId;
  const payload = window.ImageToolsWorkbench.buildProviderPayload({
    name: providerName.value,
    baseUrl: providerBaseUrl.value,
    apiKey: providerApiKey.value,
    defaultModel: providerDefaultModel.value,
    isDefault: providerIsDefault.checked,
  });
  const method = providerId == null ? "POST" : "PATCH";
  const url =
    providerId == null
      ? "/api/providers"
      : `/api/providers/${providerId}`;
  setInlineStatus(providerDialogStatus, "");
  providerSaveBtn.disabled = true;
  providerCancelBtn.disabled = true;
  providerDialogClose.disabled = true;
  providerSaveBtn.textContent = "保存中";
  try {
    const saved = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(readJson);
    if (token !== providerSaveToken || !providerDialog.open) return;
    const savedId = Number(saved.id ?? providerId);
    await window.ImageToolsUi.closeDialog(providerDialog);
    if (token !== providerSaveToken) return;
    resetProviderForm();
    editingProviderId = null;
    const loaded = await loadProviders();
    if (token !== providerSaveToken) return;
    if (loaded) (providerRowMain(savedId) || addProviderBtn).focus();
  } catch (error) {
    if (token === providerSaveToken && providerDialog.open) {
      setInlineStatus(providerDialogStatus, error.message, "error");
    }
  } finally {
    if (token === providerSaveToken) {
      providerSaveBtn.disabled = false;
      providerCancelBtn.disabled = false;
      providerDialogClose.disabled = false;
      providerSaveBtn.textContent = "保存";
    }
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

function closeTaskMenu(options) {
  return window.ImageToolsUi.closeLayer(taskMenu, taskMenuBtn, options);
}

function closeSidebarMenu(options) {
  return window.ImageToolsUi.closeLayer(sidebarMenu, sidebarMenuTrigger, options);
}

function openSidebarSessionMenu(session, trigger) {
  sidebarMenuTarget = { type: "session", value: session };
  sidebarMenuTrigger = trigger;
  sidebarMenuPinBtn.hidden = false;
  sidebarMenuOrganizeBtn.hidden = false;
  sidebarMenuRenameProjectBtn.hidden = true;
  sidebarMenuDeleteProjectBtn.hidden = true;
  sidebarMenuPinBtn.querySelector("span").textContent = session.isPinned ? "取消置顶" : "置顶";
  window.ImageToolsUi.openAnchoredLayer(sidebarMenu, trigger);
  sidebarMenuPinBtn.focus();
}

function openSidebarProjectMenu(project, trigger) {
  sidebarMenuTarget = { type: "project", value: project };
  sidebarMenuTrigger = trigger;
  sidebarMenuPinBtn.hidden = true;
  sidebarMenuOrganizeBtn.hidden = true;
  sidebarMenuRenameProjectBtn.hidden = false;
  sidebarMenuDeleteProjectBtn.hidden = false;
  window.ImageToolsUi.openAnchoredLayer(sidebarMenu, trigger);
  sidebarMenuRenameProjectBtn.focus();
}

function populateProjectSelect(selectedProjectId) {
  sessionProjectSelect.replaceChildren();
  const unassigned = document.createElement("option");
  unassigned.value = "";
  unassigned.textContent = "不属于任何项目";
  sessionProjectSelect.appendChild(unassigned);
  for (const project of projects) {
    const option = document.createElement("option");
    option.value = String(project.id);
    option.textContent = project.name;
    sessionProjectSelect.appendChild(option);
  }
  sessionProjectSelect.value = selectedProjectId == null ? "" : String(selectedProjectId);
}

function openOrganizeSessionDialog(session, opener) {
  void closeSidebarMenu();
  void closeTaskMenu();
  sessionDialogMode = "organize";
  sessionDialogTarget = session;
  sessionDialogTitle.textContent = "整理会话";
  sessionDialogMessage.hidden = true;
  sessionTitleField.hidden = true;
  sessionProjectField.hidden = false;
  populateProjectSelect(session.projectId);
  sessionDialogSubmit.textContent = "保存";
  sessionDialogSubmit.classList.remove("danger");
  window.ImageToolsUi.openDialog(sessionDialog, opener || sidebarMenuTrigger || taskMenuBtn);
  sessionProjectSelect.focus();
}

function openProjectDialog(mode, project = null, opener = newProjectBtn) {
  void closeSidebarMenu();
  sessionDialogMode = mode;
  sessionDialogTarget = project;
  sessionDialogTitle.textContent = mode === "project-create" ? "新建项目" : "重命名项目";
  sessionDialogMessage.hidden = true;
  sessionTitleField.hidden = false;
  sessionTitleLabel.textContent = "项目名称";
  sessionTitleInput.disabled = false;
  sessionTitleInput.value = project?.name || "";
  sessionProjectField.hidden = true;
  sessionDialogSubmit.textContent = "保存";
  sessionDialogSubmit.classList.remove("danger");
  window.ImageToolsUi.openDialog(sessionDialog, opener);
  sessionTitleInput.select();
}

function openDeleteProjectDialog(project, opener) {
  void closeSidebarMenu();
  sessionDialogMode = "project-delete";
  sessionDialogTarget = project;
  sessionDialogTitle.textContent = "删除项目";
  sessionDialogMessage.textContent = `确定删除“${project.name}”吗？其中的会话会保留在会话列表中。`;
  sessionDialogMessage.hidden = false;
  sessionTitleField.hidden = true;
  sessionProjectField.hidden = true;
  sessionDialogSubmit.textContent = "删除";
  sessionDialogSubmit.classList.add("danger");
  window.ImageToolsUi.openDialog(sessionDialog, opener);
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
  sessionTitleLabel.textContent = "名称";
  sessionTitleInput.disabled = false;
  sessionTitleInput.value = session.title;
  sessionProjectField.hidden = true;
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
  sessionProjectField.hidden = true;
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

async function updateSessionProject(session, projectId) {
  try {
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    }).then(readJson);
    await loadSessions();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function setSessionPinned(session) {
  try {
    await fetch(`/api/sessions/${session.id}/pin`, {
      method: session.isPinned ? "DELETE" : "POST",
    }).then(readJson);
    await loadSessions();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function saveProject(mode, project, name) {
  try {
    const url = mode === "project-create" ? "/api/projects" : `/api/projects/${project.id}`;
    await fetch(url, {
      method: mode === "project-create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(readJson);
    await loadSessions();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function deleteProject(project) {
  try {
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" }).then(readJson);
    await loadSessions();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function handleComposerSubmit(event) {
  event.preventDefault();
  if (
    window.ImageToolsWorkbench
      .pendingRunsForSession(state, state.selectedSessionId)
      .some((run) => run.status === "running")
  ) {
    return;
  }
  const provider = window.ImageToolsWorkbench.selectedProvider(
    providers,
    providerSelect.value,
  );
  const prompt = promptInput.value.trim();
  if (!provider) {
    showToast("请先配置 Provider");
    openSettingsView("providers", providersBtn);
    return;
  }
  if (!prompt) {
    showToast("请先输入提示词");
    promptInput.focus();
    return;
  }

  const locksNewTask = state.selectedSessionId == null;
  if (locksNewTask && newTaskSubmissionLocked) return;
  if (locksNewTask) newTaskSubmissionLocked = true;

  const wasNewTask = state.selectedSessionId == null;
  let sessionId = null;
  let submissionId = null;
  let pendingRun = null;
  let previousServerCount = 0;
  let requestError = null;
  try {
    sessionId = await ensureSessionForSubmit(prompt);
    previousServerCount = (runsBySession[sessionId] || []).length;
    submissionId = globalThis.crypto?.randomUUID?.() || `pending-${Date.now()}`;
    pendingRun = window.ImageToolsWorkbench.createOptimisticRun(
      {
        sessionId,
        providerId: provider.id,
        providerName: provider.name,
        prompt,
        model: modelInput.value || provider.defaultModel,
        ratio: ratioSelect.value,
        resolution: resolutionSelect.value,
        quality: qualitySelect.value,
        count: countSelect.value,
      },
      submissionId,
    );
    state = window.ImageToolsWorkbench.addPendingRun(
      state,
      sessionId,
      pendingRun,
    );
    renderCurrentSession();
    renderTimelineRuns([
      ...(runsBySession[sessionId] || []),
      ...window.ImageToolsWorkbench.pendingRunsForSession(state, sessionId),
    ]);
    generateBtn.setAttribute("aria-label", "生成中");
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
  } catch (error) {
    requestError = error.message;
    showToast(error.message);
  } finally {
    if (sessionId && pendingRun) {
      const serverRuns = await fetch(`/api/sessions/${sessionId}/runs`)
        .then(readJson)
        .catch(() => runsBySession[sessionId] || []);
      runsBySession[sessionId] = serverRuns;
      const reconciled = window.ImageToolsWorkbench.reconcileSubmission(
        serverRuns,
        pendingRun,
        previousServerCount,
        requestError,
      );
      const persisted = serverRuns.length > previousServerCount;
      const localError =
        requestError || "无法确认生成状态，请刷新后重试";
      state = persisted
        ? window.ImageToolsWorkbench.removePendingRun(state, sessionId, submissionId)
        : window.ImageToolsWorkbench.failPendingRun(
            state,
            sessionId,
            submissionId,
            localError,
          );
      if (persisted) {
        localStorage.removeItem(
          window.ImageToolsWorkbench.draftStorageKey(sessionId),
        );
        if (wasNewTask) {
          localStorage.removeItem(window.ImageToolsWorkbench.draftStorageKey(null));
        }
        promptInput.value = "";
        referenceInput.value = "";
        referenceSource = null;
        referencePreview.hidden = true;
        referenceName.textContent = "";
        syncReferenceState();
        resizePrompt();
      }
      if (state.selectedSessionId === sessionId) {
        renderTimelineRuns(
          persisted
            ? reconciled
            : [
                ...serverRuns,
                ...window.ImageToolsWorkbench.pendingRunsForSession(state, sessionId),
              ],
        );
      }
      await loadSessions();
    }
    renderCurrentSession();
    generateBtn.setAttribute("aria-label", "开始生成");
    if (locksNewTask) newTaskSubmissionLocked = false;
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
  } else if (sessionDialogMode === "organize") {
    const projectId = sessionProjectSelect.value ? Number(sessionProjectSelect.value) : null;
    if (!(await updateSessionProject(sessionDialogTarget, projectId))) return;
  } else if (sessionDialogMode === "project-create" || sessionDialogMode === "project-rename") {
    const name = sessionTitleInput.value.trim();
    if (!name) {
      sessionTitleInput.focus();
      return;
    }
    if (!(await saveProject(sessionDialogMode, sessionDialogTarget, name))) return;
  } else if (sessionDialogMode === "project-delete") {
    if (!(await deleteProject(sessionDialogTarget))) return;
  }
  sessionDialogMode = null;
  sessionDialogTarget = null;
  window.ImageToolsUi.closeDialog(sessionDialog);
}

function toggleSearch() {
  const opening = !window.ImageToolsUi.isLayerOpen(searchPanel);
  if (opening) {
    window.ImageToolsUi.openLayer(searchPanel, searchToggle, {
      placement: "top",
    });
    sessionFilter.focus();
  } else {
    void window.ImageToolsUi.closeLayer(searchPanel, searchToggle, {
      restoreFocus: true,
    });
  }
}

function isStorageViewCurrent(generation) {
  return (
    generation === storageViewGeneration &&
    !settingsView.hidden &&
    !settingsStoragePanel.hidden
  );
}

function invalidateStorageView() {
  storageViewGeneration += 1;
}

function activateStorageView() {
  storageViewGeneration += 1;
  storageChangeBtn.disabled = false;
  void loadStorageLocation();
  storageChangeBtn.focus();
}

function selectSettingsTab(tab) {
  const providersActive = tab === "providers";
  settingsProvidersNav.setAttribute("aria-current", providersActive ? "page" : "false");
  settingsStorageNav.setAttribute("aria-current", providersActive ? "false" : "page");
  settingsProvidersPanel.hidden = !providersActive;
  settingsStoragePanel.hidden = providersActive;
}

function openSettingsView(tab, opener) {
  settingsOpener = opener;
  settingsView.hidden = false;
  workspace.classList.add("settings-open");
  selectSettingsTab(tab);
  setInlineStatus(providerActionStatus, "");
  renderProviderManager();
  if (tab === "storage") {
    activateStorageView();
  } else {
    invalidateStorageView();
    addProviderBtn.focus();
  }
}

function closeSettingsView() {
  void closeProviderMenu();
  invalidateStorageView();
  settingsView.hidden = true;
  workspace.classList.remove("settings-open");
  settingsOpener?.focus();
  settingsOpener = null;
}

function renderStorageLocation(location, message = "") {
  storageLocation = location;
  storageCurrentPath.value = location.active_data_dir || "";
  const pendingPath = location.pending_data_dir || "";
  storagePendingPath.value = pendingPath;
  storagePendingState.hidden = !pendingPath;
  storageIdleState.hidden = Boolean(pendingPath);
  setInlineStatus(storagePanelStatus, message);
}

async function loadStorageLocation({ announce = "" } = {}) {
  const viewGeneration = storageViewGeneration;
  if (!isStorageViewCurrent(viewGeneration)) return null;
  const loadGeneration = ++storageLoadGeneration;
  setInlineStatus(storagePanelStatus, "正在读取工作区数据位置。");
  try {
    const location = await fetch("/api/storage-location").then(readJson);
    if (
      loadGeneration !== storageLoadGeneration ||
      !isStorageViewCurrent(viewGeneration)
    ) {
      return null;
    }
    renderStorageLocation(location, announce);
    return location;
  } catch (error) {
    if (
      loadGeneration !== storageLoadGeneration ||
      !isStorageViewCurrent(viewGeneration)
    ) {
      return null;
    }
    setInlineStatus(storagePanelStatus, error.message, "error");
    return null;
  }
}

function openStorageDialog(opener, dataDir, error = "") {
  storageDialogGeneration += 1;
  storageLocationForm.reset();
  storageDataDir.value =
    dataDir !== undefined
      ? dataDir
      : storageLocation?.pending_data_dir || storageLocation?.active_data_dir || "";
  storageMigrateExisting.checked = true;
  storageBrowseBtn.disabled = false;
  storageCancelBtn.disabled = false;
  storageDialogClose.disabled = false;
  storageApplyBtn.disabled = false;
  storageApplyBtn.textContent = "应用更改";
  setInlineStatus(storageDialogStatus, error, error ? "error" : "");
  window.ImageToolsUi.openDialog(storageDialog, opener);
  storageDataDir.focus();
}

function closeStorageDialog() {
  if (storageApplyBtn.disabled) return Promise.resolve();
  storageDialogGeneration += 1;
  return window.ImageToolsUi.closeDialog(storageDialog);
}

function isStorageDialogCurrent(generation) {
  return generation === storageDialogGeneration && storageDialog.open;
}

function handleStorageDialogCancel(event) {
  event.preventDefault();
  void closeStorageDialog();
}

async function invokeStoragePicker() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") {
    return { available: false, selected: null };
  }
  try {
    const selected = await invoke("pick_data_directory");
    return { available: true, selected: selected || null, error: "" };
  } catch (error) {
    const message = typeof error === "string" ? error : error?.message;
    return {
      available: true,
      selected: null,
      error: message || "无法打开系统目录选择器。",
    };
  }
}

async function beginStorageChange() {
  const viewGeneration = storageViewGeneration;
  if (!isStorageViewCurrent(viewGeneration) || storageChangeBtn.disabled) return;
  const opener = storageChangeBtn;
  storageChangeBtn.disabled = true;
  try {
    const result = await invokeStoragePicker();
    if (!isStorageViewCurrent(viewGeneration)) return;
    if (!result.available) {
      openStorageDialog(opener);
    } else if (result.error) {
      openStorageDialog(opener, undefined, result.error);
    } else if (result.selected) {
      openStorageDialog(opener, result.selected);
    }
  } finally {
    if (isStorageViewCurrent(viewGeneration)) {
      storageChangeBtn.disabled = false;
    }
  }
}

async function browseStorageDirectory() {
  const dialogGeneration = storageDialogGeneration;
  if (
    !isStorageDialogCurrent(dialogGeneration) ||
    storageBrowseBtn.disabled
  ) {
    return;
  }
  storageBrowseBtn.disabled = true;
  try {
    const result = await invokeStoragePicker();
    if (!isStorageDialogCurrent(dialogGeneration)) return;
    if (!result.available) {
      storageDataDir.focus();
    } else if (result.error) {
      setInlineStatus(storageDialogStatus, result.error, "error");
      storageDataDir.focus();
    } else if (result.selected) {
      storageDataDir.value = result.selected;
      setInlineStatus(storageDialogStatus, "");
      storageDataDir.focus();
    } else {
      storageDataDir.focus();
    }
  } finally {
    if (isStorageDialogCurrent(dialogGeneration)) {
      storageBrowseBtn.disabled = false;
    }
  }
}

async function handleStorageLocationSubmit(event) {
  event.preventDefault();
  const dialogGeneration = storageDialogGeneration;
  if (
    !isStorageDialogCurrent(dialogGeneration) ||
    storageApplyBtn.disabled
  ) {
    return;
  }
  storageApplyBtn.disabled = true;
  storageCancelBtn.disabled = true;
  storageDialogClose.disabled = true;
  storageApplyBtn.textContent = "应用中";
  setInlineStatus(storageDialogStatus, "");
  try {
    await fetch("/api/storage-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_dir: storageDataDir.value.trim(),
        migrate_existing: storageMigrateExisting.checked,
      }),
    }).then(readJson);
    if (!isStorageDialogCurrent(dialogGeneration)) return;
    storageDialogGeneration += 1;
    await window.ImageToolsUi.closeDialog(storageDialog);
    await loadStorageLocation({
      announce: "已安排数据位置变更，重启应用后生效。",
    });
  } catch (error) {
    if (isStorageDialogCurrent(dialogGeneration)) {
      setInlineStatus(storageDialogStatus, error.message, "error");
    }
  } finally {
    if (isStorageDialogCurrent(dialogGeneration)) {
      storageApplyBtn.disabled = false;
      storageCancelBtn.disabled = false;
      storageDialogClose.disabled = false;
      storageApplyBtn.textContent = "应用更改";
    }
  }
}

function handleEscape(event) {
  if (event.key !== "Escape") return;
  if (
    providerDialog.open ||
    providerDeleteDialog.open ||
    storageDialog.open ||
    sessionDialog.open ||
    imagePreviewDialog.open
  ) {
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(providerMenu)) {
    event.preventDefault();
    void closeProviderMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(taskMenu)) {
    void closeTaskMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(sidebarMenu)) {
    void closeSidebarMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(searchPanel)) {
    void window.ImageToolsUi.closeLayer(searchPanel, searchToggle, {
      restoreFocus: true,
    });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(parameterMenu)) {
    void closeParameterMenu({ restoreFocus: true });
    return;
  }
  if (window.ImageToolsUi.isLayerOpen(referenceMenu)) {
    void closeReferenceMenu({ restoreFocus: true });
    return;
  }
  if (!settingsView.hidden) {
    closeSettingsView();
  }
}

function toggleTaskMenu() {
  const opening = !window.ImageToolsUi.isLayerOpen(taskMenu);
  if (opening) {
    window.ImageToolsUi.openLayer(taskMenu, taskMenuBtn, {
      placement: "bottom",
    });
    renameSessionBtn.focus();
  } else {
    void closeTaskMenu({ restoreFocus: true });
  }
}

function closeParameterMenu(options) {
  return window.ImageToolsUi.closeLayer(
    parameterMenu,
    parameterMenuBtn,
    options,
  );
}

function toggleParameterMenu() {
  const opening = !window.ImageToolsUi.isLayerOpen(parameterMenu);
  void closeTaskMenu();
  void closeReferenceMenu();
  if (opening) {
    window.ImageToolsUi.openAnchoredLayer(parameterMenu, parameterMenuBtn);
    ratioSelect.focus();
  } else {
    void closeParameterMenu({ restoreFocus: true });
  }
}

function handleMenuKeydown(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const items = [
    ...event.currentTarget.querySelectorAll(
      "button:not(:disabled), select:not(:disabled), input:not(:disabled)",
    ),
  ].filter((element) => !element.closest("[hidden]"));
  if (!items.length) return;
  const current = Math.max(0, items.indexOf(document.activeElement));
  let next = current;
  if (event.key === "ArrowDown") next = (current + 1) % items.length;
  if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = items.length - 1;
  event.preventDefault();
  items[next].focus();
}

function closeReferenceMenu(options) {
  return window.ImageToolsUi.closeLayer(referenceMenu, referenceBtn, options);
}

function toggleReferenceMenu() {
  const opening = !window.ImageToolsUi.isLayerOpen(referenceMenu);
  void closeTaskMenu();
  void closeParameterMenu();
  if (opening) {
    window.ImageToolsUi.openAnchoredLayer(referenceMenu, referenceBtn);
    uploadReferenceBtn.focus();
  } else {
    void closeReferenceMenu({ restoreFocus: true });
  }
}

function handlePromptKeydown(event) {
  if (!window.ImageToolsWorkbench.shouldSubmitComposer(event)) return;
  event.preventDefault();
  composerForm.requestSubmit();
}

function handleOutsideClick(event) {
  if (
    window.ImageToolsUi.isLayerOpen(providerMenu) &&
    !providerMenu.contains(event.target) &&
    !event.target.closest?.(".provider-row-menu")
  ) {
    void closeProviderMenu();
  }
  if (
    window.ImageToolsUi.isLayerOpen(sidebarMenu) &&
    !sidebarMenu.contains(event.target) &&
    !sidebarMenuTrigger?.contains(event.target)
  ) {
    void closeSidebarMenu();
  }
  if (
    window.ImageToolsUi.isLayerOpen(parameterMenu) &&
    !parameterMenu.contains(event.target) &&
    !parameterMenuBtn.contains(event.target)
  ) {
    void closeParameterMenu();
  }
  if (
    window.ImageToolsUi.isLayerOpen(referenceMenu) &&
    !referenceMenu.contains(event.target) &&
    !referenceBtn.contains(event.target)
  ) {
    void closeReferenceMenu();
  }
}

function repositionComposerMenus() {
  if (window.ImageToolsUi.isLayerOpen(parameterMenu)) {
    window.ImageToolsUi.positionAnchoredLayer(parameterMenu, parameterMenuBtn);
  }
  if (window.ImageToolsUi.isLayerOpen(referenceMenu)) {
    window.ImageToolsUi.positionAnchoredLayer(referenceMenu, referenceBtn);
  }
}

function closeSessionDialog() {
  sessionDialogMode = null;
  window.ImageToolsUi.closeDialog(sessionDialog);
}

function handleDialogCancel(event) {
  event.preventDefault();
  if (event.currentTarget === sessionDialog) closeSessionDialog();
}

function saveDraftFromInput() {
  saveActiveDraft();
  parameterSummaryText.textContent = window.ImageToolsWorkbench.parameterSummary(
    currentDraft(),
  );
}

newSessionBtn.addEventListener("click", startNewTask);
newProjectBtn.addEventListener("click", () => openProjectDialog("project-create"));
searchToggle.addEventListener("click", toggleSearch);
providersBtn.addEventListener("click", () => openSettingsView("providers", providersBtn));
settingsBtn.addEventListener("click", () => openSettingsView("storage", settingsBtn));
settingsBackBtn.addEventListener("click", closeSettingsView);
settingsProvidersNav.addEventListener("click", () => {
  invalidateStorageView();
  selectSettingsTab("providers");
  renderProviderManager();
  addProviderBtn.focus();
});
settingsStorageNav.addEventListener("click", () => {
  selectSettingsTab("storage");
  activateStorageView();
});
addProviderBtn.addEventListener("click", () => openNewProviderDialog(addProviderBtn));
providerDialogClose.addEventListener("click", () => void closeProviderDialog());
providerCancelBtn.addEventListener("click", () => void closeProviderDialog());
providerDialog.addEventListener("cancel", handleProviderDialogCancel);
providerForm.addEventListener("submit", handleProviderSubmit);
providerMenuEditBtn.addEventListener("click", () => void editProviderFromMenu());
providerMenuDefaultBtn.addEventListener("click", () => void setDefaultProviderFromMenu());
providerMenuDeleteBtn.addEventListener("click", () => void deleteProviderFromMenu());
providerMenu.addEventListener("keydown", handleMenuKeydown);
providerDeleteCancel.addEventListener("click", () => void closeProviderDeleteDialog());
providerDeleteDialog.addEventListener("cancel", handleProviderDeleteCancel);
providerDeleteForm.addEventListener("submit", handleProviderDeleteSubmit);
storageChangeBtn.addEventListener("click", () => void beginStorageChange());
storageDialogClose.addEventListener("click", () => void closeStorageDialog());
storageCancelBtn.addEventListener("click", () => void closeStorageDialog());
storageDialog.addEventListener("cancel", handleStorageDialogCancel);
storageLocationForm.addEventListener("submit", handleStorageLocationSubmit);
storageBrowseBtn.addEventListener("click", () => void browseStorageDirectory());
imagePreviewClose.addEventListener("click", closeImagePreview);
imagePreviewDialog.addEventListener("cancel", cancelImagePreview);
taskMenuBtn.addEventListener("click", toggleTaskMenu);
renameSessionBtn.addEventListener("click", openRenameDialog);
deleteSessionBtn.addEventListener("click", openDeleteDialog);
pinSessionBtn.addEventListener("click", async () => {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (session) await setSessionPinned(session);
  void closeTaskMenu({ restoreFocus: true });
});
organizeSessionBtn.addEventListener("click", () => {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (session) openOrganizeSessionDialog(session, taskMenuBtn);
});
sidebarMenuPinBtn.addEventListener("click", async () => {
  if (sidebarMenuTarget?.type === "session") await setSessionPinned(sidebarMenuTarget.value);
  void closeSidebarMenu({ restoreFocus: true });
});
sidebarMenuOrganizeBtn.addEventListener("click", () => {
  if (sidebarMenuTarget?.type === "session") {
    openOrganizeSessionDialog(sidebarMenuTarget.value, sidebarMenuTrigger);
  }
});
sidebarMenuRenameProjectBtn.addEventListener("click", () => {
  if (sidebarMenuTarget?.type === "project") {
    openProjectDialog("project-rename", sidebarMenuTarget.value, sidebarMenuTrigger);
  }
});
sidebarMenuDeleteProjectBtn.addEventListener("click", () => {
  if (sidebarMenuTarget?.type === "project") {
    openDeleteProjectDialog(sidebarMenuTarget.value, sidebarMenuTrigger);
  }
});
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
advancedParamsPanel.addEventListener("toggle", () => {
  if (window.ImageToolsUi.isLayerOpen(parameterMenu)) {
    window.ImageToolsUi.positionAnchoredLayer(parameterMenu, parameterMenuBtn);
  }
});
parameterMenu.addEventListener("keydown", handleMenuKeydown);
referenceMenu.addEventListener("keydown", handleMenuKeydown);
taskMenu.addEventListener("keydown", handleMenuKeydown);
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
window.addEventListener("resize", repositionComposerMenus);

render();
restoreActiveDraft();
loadSessions();
loadProviders();
