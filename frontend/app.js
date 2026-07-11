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
const storageLocationForm = document.querySelector("#storageLocationForm");
const storageCurrentPath = document.querySelector("#storageCurrentPath");
const storageDataDir = document.querySelector("#storageDataDir");
const storageMigrateExisting = document.querySelector("#storageMigrateExisting");
const storageApplyBtn = document.querySelector("#storageApplyBtn");
const storageLocationStatus = document.querySelector("#storageLocationStatus");
const sessionDialog = document.querySelector("#sessionDialog");
const sessionDialogForm = document.querySelector("#sessionDialogForm");
const sessionDialogTitle = document.querySelector("#sessionDialogTitle");
const sessionDialogMessage = document.querySelector("#sessionDialogMessage");
const sessionTitleField = document.querySelector("#sessionTitleField");
const sessionTitleInput = document.querySelector("#sessionTitleInput");
const sessionDialogCancel = document.querySelector("#sessionDialogCancel");
const sessionDialogSubmit = document.querySelector("#sessionDialogSubmit");
const imagePreviewDialog = document.querySelector("#imagePreviewDialog");
const imagePreviewClose = document.querySelector("#imagePreviewClose");
const imagePreview = document.querySelector("#imagePreview");
const toast = document.querySelector("#toast");

let toastTimer = null;
let state = window.ImageToolsWorkbench.defaultWorkbenchState();
let providers = [];
let referenceSource = null;
let sessionDialogMode = null;
let editingProviderId = null;
let newTaskSubmissionLocked = false;
const runsBySession = {};

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

function closeTaskMenu(options) {
  return window.ImageToolsUi.closeLayer(taskMenu, taskMenuBtn, options);
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
    openProviderDialog(providersBtn);
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
  }
  sessionDialogMode = null;
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

function openProviderDialog(opener) {
  window.ImageToolsUi.openDialog(providerDialog, opener);
  renderProviderManager();
  startNewProvider();
  void loadStorageLocation(opener === settingsBtn);
}

function closeProviderDialog() {
  window.ImageToolsUi.closeDialog(providerDialog);
}

function renderStorageLocation(location, message = "") {
  storageCurrentPath.value = location.active_data_dir || "";
  storageDataDir.value = location.pending_data_dir || location.active_data_dir || "";
  storageMigrateExisting.checked = false;
  storageLocationStatus.textContent = message;
  storageLocationStatus.hidden = !message;
}

async function loadStorageLocation(focusInput = false) {
  try {
    renderStorageLocation(await fetch("/api/storage-location").then(readJson));
    if (focusInput && providerDialog.open) {
      storageDataDir.focus();
    }
  } catch (error) {
    storageLocationStatus.textContent = error.message;
    storageLocationStatus.hidden = false;
  }
}

async function handleStorageLocationSubmit(event) {
  event.preventDefault();
  storageApplyBtn.disabled = true;
  storageLocationStatus.hidden = true;
  try {
    const location = await fetch("/api/storage-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_dir: storageDataDir.value.trim(),
        migrate_existing: storageMigrateExisting.checked,
      }),
    }).then(readJson);
    renderStorageLocation(location, "已设置新位置，重启应用后生效。");
  } catch (error) {
    storageLocationStatus.textContent = error.message;
    storageLocationStatus.hidden = false;
  } finally {
    storageApplyBtn.disabled = false;
  }
}

function handleEscape(event) {
  if (event.key !== "Escape") return;
  if (window.ImageToolsUi.isLayerOpen(taskMenu)) {
    void closeTaskMenu({ restoreFocus: true });
  }
  if (window.ImageToolsUi.isLayerOpen(searchPanel)) {
    void window.ImageToolsUi.closeLayer(searchPanel, searchToggle, {
      restoreFocus: true,
    });
  }
  if (window.ImageToolsUi.isLayerOpen(parameterMenu)) {
    void closeParameterMenu({ restoreFocus: true });
  }
  if (window.ImageToolsUi.isLayerOpen(referenceMenu)) {
    void closeReferenceMenu({ restoreFocus: true });
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
providerCancelBtn.addEventListener("click", closeProviderDialog);
providerForm.addEventListener("submit", handleProviderSubmit);
storageLocationForm.addEventListener("submit", handleStorageLocationSubmit);
imagePreviewClose.addEventListener("click", closeImagePreview);
imagePreviewDialog.addEventListener("cancel", cancelImagePreview);
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
