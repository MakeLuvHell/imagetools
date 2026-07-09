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

  const api = {
    defaultWorkbenchState,
    normalizeSessions,
    applySessionList,
    selectSession,
    selectedSession,
    sessionSubtitle,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsWorkbench = api;
})(typeof window !== "undefined" ? window : globalThis);
