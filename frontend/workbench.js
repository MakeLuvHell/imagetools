(function initWorkbench(globalScope) {
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

  function defaultWorkbenchState() {
    return {
      sessions: [],
      selectedSessionId: null,
    };
  }

  function applySessionList(state, sessions) {
    const normalized = normalizeSessions(sessions);
    const selectedStillExists = normalized.some(
      (session) => session.id === state.selectedSessionId,
    );
    return {
      sessions: normalized,
      selectedSessionId: selectedStillExists
        ? state.selectedSessionId
        : normalized[0]?.id || null,
    };
  }

  function selectSession(state, sessionId) {
    const numericId = Number(sessionId);
    const exists = state.sessions.some((session) => session.id === numericId);
    return {
      ...state,
      selectedSessionId: exists ? numericId : state.selectedSessionId,
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
      quality: String(composer.quality || "auto"),
      count: String(composer.count || 1),
      output_format: String(composer.outputFormat || "png"),
      output_compression: String(composer.outputCompression ?? 100),
      background: String(composer.background || "auto"),
      moderation: String(composer.moderation || "auto"),
    };
  }

  const api = {
    defaultWorkbenchState,
    normalizeSessions,
    normalizeProviders,
    applySessionList,
    selectSession,
    selectedProvider,
    selectedSession,
    sessionSubtitle,
    buildGenerationFields,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsWorkbench = api;
})(typeof window !== "undefined" ? window : globalThis);
