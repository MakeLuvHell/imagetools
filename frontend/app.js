const sessionList = document.querySelector("#sessionList");
const sessionFilter = document.querySelector("#sessionFilter");
const newSessionBtn = document.querySelector("#newSessionBtn");
const renameSessionBtn = document.querySelector("#renameSessionBtn");
const deleteSessionBtn = document.querySelector("#deleteSessionBtn");
const currentSessionTitle = document.querySelector("#currentSessionTitle");
const currentSessionSubtitle = document.querySelector("#currentSessionSubtitle");
const timeline = document.querySelector("#timeline");
const composerForm = document.querySelector("#composerForm");
const promptInput = document.querySelector("#prompt");
const referenceBtn = document.querySelector("#referenceBtn");
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
const toast = document.querySelector("#toast");

let toastTimer = null;
let state = window.ImageToolsWorkbench.defaultWorkbenchState();
let providers = [];

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

function renderSessions() {
  sessionList.innerHTML = "";
  const sessions = filteredSessions();
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-workspace";
    empty.textContent = state.sessions.length ? "没有匹配的会话" : "还没有会话";
    sessionList.appendChild(empty);
    return;
  }

  sessions.forEach((session) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `session-item ${
      session.id === state.selectedSessionId ? "active" : ""
    }`;

    const thumb = document.createElement("span");
    thumb.className = "session-thumb";
    if (session.recentThumbnailPath) {
      const image = document.createElement("img");
      image.src = `/files/${session.recentThumbnailPath}`;
      image.alt = "";
      thumb.appendChild(image);
    } else {
      thumb.textContent = session.title.slice(0, 1).toUpperCase();
    }

    const copy = document.createElement("span");
    copy.className = "session-copy";
    const title = document.createElement("strong");
    title.textContent = session.title;
    const subtitle = document.createElement("span");
    subtitle.textContent = window.ImageToolsWorkbench.sessionSubtitle(session);
    copy.append(title, subtitle);

    button.append(thumb, copy);
    button.addEventListener("click", () => {
      state = window.ImageToolsWorkbench.selectSession(state, session.id);
      render();
      loadTimeline(session.id);
    });
    sessionList.appendChild(button);
  });
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
    article.appendChild(header);
    timeline.appendChild(article);
  });
}

async function loadTimeline(sessionId) {
  if (!sessionId) {
    renderEmptyTimeline("还没有打开的创作会话", "左侧会保存每个主题的生成历史和最近缩略图。");
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
  currentSessionTitle.textContent = session ? session.title : "选择一个会话";
  currentSessionSubtitle.textContent = window.ImageToolsWorkbench.sessionSubtitle(session);
  renameSessionBtn.disabled = !hasSession;
  deleteSessionBtn.disabled = !hasSession;
  referenceBtn.disabled = !hasSession;
  generateBtn.disabled = !hasSession || !hasProvider;
  promptInput.disabled = !hasSession;
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
  providerSelect.innerHTML = "";
  if (!providers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未配置 Provider";
    providerSelect.appendChild(option);
    modelInput.value = "gpt-image-2";
    renderCurrentSession();
    return;
  }
  providers.forEach((provider) => {
    const option = document.createElement("option");
    option.value = String(provider.id);
    option.textContent = provider.name;
    providerSelect.appendChild(option);
  });
  const selected =
    providers.find((provider) => provider.isDefault) || providers[0];
  providerSelect.value = String(selected.id);
  modelInput.value = selected.defaultModel;
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

async function createSession() {
  const title = window.prompt("会话名称", "新会话") || "";
  try {
    const session = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(readJson);
    state = {
      ...state,
      selectedSessionId: session.id,
    };
    await loadSessions();
  } catch (error) {
    showToast(error.message);
  }
}

async function renameSession() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (!session) {
    return;
  }
  const title = window.prompt("重命名会话", session.title);
  if (title === null) {
    return;
  }
  try {
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(readJson);
    await loadSessions();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteSession() {
  const session = window.ImageToolsWorkbench.selectedSession(state);
  if (!session || !window.confirm(`删除会话“${session.title}”？`)) {
    return;
  }
  try {
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    state = {
      ...state,
      selectedSessionId: null,
    };
    await loadSessions();
  } catch (error) {
    showToast(error.message);
  }
}

function handleComposerSubmit(event) {
  event.preventDefault();
  const session = window.ImageToolsWorkbench.selectedSession(state);
  const provider = window.ImageToolsWorkbench.selectedProvider(
    providers,
    providerSelect.value,
  );
  const prompt = promptInput.value.trim();
  if (!session) {
    showToast("请先选择会话");
    return;
  }
  if (!provider) {
    showToast("请先配置 Provider");
    return;
  }
  if (!prompt) {
    showToast("请先输入提示词");
    promptInput.focus();
    return;
  }

  const fields = window.ImageToolsWorkbench.buildGenerationFields(
    {
      sessionId: session.id,
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
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  if (referenceInput.files[0]) {
    formData.append("reference", referenceInput.files[0]);
  }

  generateBtn.disabled = true;
  generateBtn.textContent = "生成中...";
  fetch("/api/generate", {
    method: "POST",
    body: formData,
  })
    .then(readJson)
    .then(async () => {
      showToast("生成完成");
      await loadTimeline(session.id);
      await loadSessions();
    })
    .catch((error) => {
      showToast(error.message);
      loadTimeline(session.id);
    })
    .finally(() => {
      generateBtn.disabled = false;
      generateBtn.textContent = "生成";
    });
}

newSessionBtn.addEventListener("click", createSession);
renameSessionBtn.addEventListener("click", renameSession);
deleteSessionBtn.addEventListener("click", deleteSession);
sessionFilter.addEventListener("input", renderSessions);
composerForm.addEventListener("submit", handleComposerSubmit);
providerSelect.addEventListener("change", () => {
  const provider = window.ImageToolsWorkbench.selectedProvider(
    providers,
    providerSelect.value,
  );
  if (provider) {
    modelInput.value = provider.defaultModel;
  }
});
referenceBtn.addEventListener("click", () => referenceInput.click());
referenceInput.addEventListener("change", () => {
  const file = referenceInput.files[0];
  referencePreview.hidden = !file;
  referenceName.textContent = file ? file.name : "";
});
clearReferenceBtn.addEventListener("click", () => {
  referenceInput.value = "";
  referencePreview.hidden = true;
  referenceName.textContent = "";
});

render();
loadSessions();
loadProviders();
