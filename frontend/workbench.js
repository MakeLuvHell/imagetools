(function initWorkbench(globalScope) {
  const RESOLUTION_LABELS = {
    standard: "标准",
    medium: "高清",
    large: "超清",
  };
  const DRAFT_FIELDS = [
    "prompt",
    "providerId",
    "model",
    "ratio",
    "resolution",
    "quality",
    "count",
    "outputFormat",
    "outputCompression",
    "background",
    "moderation",
    "referenceSource",
  ];

  function normalizeSessions(sessions = []) {
    return sessions.map((session) => ({
      id: Number(session.id),
      title: String(session.title || "未命名会话"),
      recentThumbnailPath: session.recent_thumbnail_path || session.recentThumbnailPath || "",
      createdAt: session.created_at || session.createdAt || "",
      updatedAt: session.updated_at || session.updatedAt || "",
    }));
  }

  function normalizeProviders(providers = []) {
    return providers.map((provider) => ({
      id: Number(provider.id),
      name: String(provider.name || "Provider"),
      baseUrl: String(provider.base_url || provider.baseUrl || ""),
      defaultModel: String(
        provider.default_model || provider.defaultModel || "gpt-image-2",
      ),
      isDefault: Boolean(provider.is_default ?? provider.isDefault),
      apiKeySet: Boolean(provider.api_key_set ?? provider.apiKeySet),
    }));
  }

  function selectedProvider(providers, providerId) {
    const numericId = Number(providerId);
    return providers.find((provider) => provider.id === numericId) || null;
  }

  function preferredProvider(providers, providerId) {
    return (
      selectedProvider(providers, providerId) ||
      providers.find((provider) => provider.isDefault) ||
      providers[0] ||
      null
    );
  }

  function buildProviderPayload(provider) {
    return {
      name: String(provider.name || "").trim(),
      base_url: String(provider.baseUrl || "").trim(),
      api_key: String(provider.apiKey || ""),
      default_model:
        String(provider.defaultModel || "gpt-image-2").trim() || "gpt-image-2",
      is_default: Boolean(provider.isDefault),
    };
  }

  function defaultWorkbenchState() {
    return {
      sessions: [],
      selectedSessionId: null,
      view: "new-task",
      pendingRunsBySession: {},
    };
  }

  function applySessionList(state, sessions) {
    const normalized = normalizeSessions(sessions);
    const selectedStillExists = normalized.some(
      (session) => session.id === state.selectedSessionId,
    );
    return {
      ...state,
      sessions: normalized,
      selectedSessionId: selectedStillExists ? state.selectedSessionId : null,
      view: selectedStillExists ? "session" : "new-task",
    };
  }

  function selectSession(state, sessionId) {
    const numericId = Number(sessionId);
    const exists = state.sessions.some((session) => session.id === numericId);
    return {
      ...state,
      selectedSessionId: exists ? numericId : state.selectedSessionId,
      view: exists ? "session" : state.view,
    };
  }

  function selectNewTask(state) {
    return {
      ...state,
      selectedSessionId: null,
      view: "new-task",
    };
  }

  function deriveSessionTitle(prompt, maxLength = 36) {
    const firstLine = String(prompt || "").split(/\r?\n/, 1)[0];
    const normalized = firstLine.replace(/\s+/g, " ").trim() || "新任务";
    return Array.from(normalized).slice(0, maxLength).join("");
  }

  function draftStorageKey(sessionId) {
    return sessionId == null
      ? "imagetools:draft:new"
      : `imagetools:draft:session:${Number(sessionId)}`;
  }

  function parseDraft(raw) {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }
      return Object.fromEntries(
        DRAFT_FIELDS.filter((key) => value[key] !== undefined).map((key) => [
          key,
          value[key],
        ]),
      );
    } catch {
      return null;
    }
  }

  function parameterSummary(composer) {
    const resolution = RESOLUTION_LABELS[composer.resolution] || "标准";
    return `${composer.ratio || "1:1"} · ${resolution} · ${Number(composer.count || 1)} 张`;
  }

  function shouldSubmitComposer(event) {
    return event.key === "Enter" && !event.shiftKey && !event.isComposing;
  }

  function normalizeComposerForReference(composer, hasReference) {
    return {
      ...composer,
      count: hasReference ? 1 : Number(composer.count || 1),
      hasReference: Boolean(hasReference),
    };
  }

  function pendingRunsForSession(state, sessionId) {
    return Object.values(state.pendingRunsBySession?.[Number(sessionId)] || {});
  }

  function addPendingRun(state, sessionId, run) {
    const numericSessionId = Number(sessionId);
    const submissionId = String(run.submissionId);
    const sessionRuns = state.pendingRunsBySession?.[numericSessionId] || {};
    return {
      ...state,
      pendingRunsBySession: {
        ...state.pendingRunsBySession,
        [numericSessionId]: {
          ...sessionRuns,
          [submissionId]: { ...run },
        },
      },
    };
  }

  function failPendingRun(state, sessionId, submissionId, error) {
    const numericSessionId = Number(sessionId);
    const sessionRuns = state.pendingRunsBySession?.[numericSessionId];
    const run = sessionRuns?.[submissionId];
    if (!run) {
      return state;
    }
    return {
      ...state,
      pendingRunsBySession: {
        ...state.pendingRunsBySession,
        [numericSessionId]: {
          ...sessionRuns,
          [submissionId]: {
            ...run,
            status: "failed",
            error: String(error || "生成失败"),
          },
        },
      },
    };
  }

  function removePendingRun(state, sessionId, submissionId) {
    const numericSessionId = Number(sessionId);
    const sessionRuns = state.pendingRunsBySession?.[numericSessionId];
    if (!sessionRuns?.[submissionId]) {
      return state;
    }
    const nextSessionRuns = { ...sessionRuns };
    delete nextSessionRuns[submissionId];
    const pendingRunsBySession = { ...state.pendingRunsBySession };
    if (Object.keys(nextSessionRuns).length) {
      pendingRunsBySession[numericSessionId] = nextSessionRuns;
    } else {
      delete pendingRunsBySession[numericSessionId];
    }
    return { ...state, pendingRunsBySession };
  }

  function createOptimisticRun(composer, temporaryId) {
    return {
      id: temporaryId,
      submissionId: temporaryId,
      sessionId: Number(composer.sessionId),
      optimistic: true,
      status: "running",
      prompt: String(composer.prompt || "").trim(),
      provider_name: composer.providerName,
      model: composer.model,
      parameters: {
        ratio: composer.ratio,
        resolution: composer.resolution,
        quality: composer.quality,
        count: Number(composer.count || 1),
      },
      images: [],
    };
  }

  function selectedSession(state) {
    return (
      state.sessions.find((session) => session.id === state.selectedSessionId) ||
      null
    );
  }

  function sessionSubtitle(session) {
    if (!session) {
      return "选择或新建一个会话";
    }
    const updated = session.updatedAt
      ? new Date(session.updatedAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "刚刚";
    return `更新于 ${updated}`;
  }

  function buildGenerationFields(composer, preferences) {
    const dimensions = preferences.resolveDimensions(
      composer.ratio,
      composer.resolution,
    );
    return {
      session_id: String(composer.sessionId),
      provider_id: String(composer.providerId),
      prompt: String(composer.prompt || "").trim(),
      model: String(composer.model || "gpt-image-2").trim() || "gpt-image-2",
      width: String(dimensions.width),
      height: String(dimensions.height),
      ratio: String(composer.ratio || ""),
      resolution: String(composer.resolution || ""),
      quality: String(composer.quality || "auto"),
      count: String(composer.count || 1),
      output_format: String(composer.outputFormat || "png"),
      output_compression: String(composer.outputCompression ?? 100),
      background: String(composer.background || "auto"),
      moderation: String(composer.moderation || "auto"),
    };
  }

  function composerStateFromRun(run) {
    const parameters = run.parameters || {};
    return {
      prompt: String(run.prompt || ""),
      providerId: run.provider_id == null ? null : Number(run.provider_id),
      model: String(run.model || "gpt-image-2"),
      ratio: String(parameters.ratio || "1:1"),
      resolution: String(parameters.resolution || "standard"),
      quality: String(parameters.quality || "auto"),
      count: Number(parameters.count || 1),
      outputFormat: String(parameters.output_format || "png"),
      outputCompression: Number(parameters.output_compression ?? 100),
      background: String(parameters.background || "auto"),
      moderation: String(parameters.moderation || "auto"),
    };
  }

  const api = {
    defaultWorkbenchState,
    normalizeSessions,
    normalizeProviders,
    applySessionList,
    selectSession,
    selectNewTask,
    selectedProvider,
    preferredProvider,
    buildProviderPayload,
    selectedSession,
    sessionSubtitle,
    deriveSessionTitle,
    draftStorageKey,
    parseDraft,
    parameterSummary,
    shouldSubmitComposer,
    normalizeComposerForReference,
    pendingRunsForSession,
    addPendingRun,
    failPendingRun,
    removePendingRun,
    createOptimisticRun,
    buildGenerationFields,
    composerStateFromRun,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsWorkbench = api;
})(typeof window !== "undefined" ? window : globalThis);
