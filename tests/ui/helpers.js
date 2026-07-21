function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function commandError(message, code = "test.error") {
  return { code, message, diagnostic: null };
}

async function installApiMocks(page, overrides = {}) {
  const initialProviders = overrides.providers === undefined
    ? [{
        id: 1,
        protocol: "openai_compatible",
        name: "Default",
        base_url: "https://api.example/v1",
        default_model: "gpt-image-2",
        is_default: true,
        api_key_set: true,
      }]
    : overrides.providers;
  const providerIds = initialProviders
    .map((provider) => Number(provider.id))
    .filter(Number.isFinite);
  const state = {
    sessionsCreated: 0,
    requestLog: [],
    generateBodies: [],
    generationStarted: 0,
    stagedReferences: [],
    discardedReferenceTokens: [],
    nextRunId: 20,
    sessions: overrides.sessions || [{
      id: 1,
      title: "夏季饮品广告图",
      updated_at: "2026-07-10T12:00:00Z",
    }],
    sessionRequests: [],
    projects: overrides.projects || [],
    providers: initialProviders,
    providerRequests: [],
    providerProbeRequests: [],
    providerListRequests: 0,
    providerListResponses: 0,
    providerListResponseOrder: [],
    nextProviderId: Math.max(0, ...providerIds) + 1,
    runs: overrides.runs || { 1: [] },
    storageLocation: overrides.storageLocation || {
      active_data_dir: "C:\\Users\\creator\\AppData\\Roaming\\com.imagetools.desktop",
      default_data_dir: "C:\\Users\\creator\\AppData\\Roaming\\com.imagetools.desktop",
      pending_data_dir: null,
      is_custom: false,
    },
    storageRequests: [],
    storageGetRequests: 0,
    storageGetResponses: 0,
    storageGetRequestOrder: [],
    storageGetResponseOrder: [],
    storagePostRequests: 0,
    storagePostResponses: 0,
    storagePostRequestOrder: [],
    storagePostResponseOrder: [],
    storageRequestOrder: [],
  };

  async function call(method, args) {
    if (method === "listProviders") {
      const ordinal = ++state.providerListRequests;
      const snapshot = state.providers.map((provider) => ({ ...provider }));
      await delay(Number(overrides.providerListDelaysMs?.[ordinal - 1] || 0));
      state.providerListResponses += 1;
      state.providerListResponseOrder.push(ordinal);
      if (overrides.providerListError) throw commandError(overrides.providerListError);
      return snapshot;
    }
    if (method === "createProvider") {
      if (overrides.providerMutationError) throw commandError(overrides.providerMutationError);
      const [body] = args;
      state.providerRequests.push({ method: "POST", id: null, body });
      if (body.is_default) state.providers.forEach((provider) => { provider.is_default = false; });
      const provider = {
        id: state.nextProviderId++,
        protocol: body.protocol,
        name: body.name,
        base_url: body.base_url,
        default_model: body.default_model,
        is_default: Boolean(body.is_default),
        api_key_set: Boolean(body.api_key),
        available_models: body.available_models || [],
        models_refreshed_at: body.models_refreshed_at || null,
      };
      state.providers.push(provider);
      return provider;
    }
    if (method === "getProvider") {
      const provider = state.providers.find((item) => Number(item.id) === Number(args[0]));
      if (!provider) throw commandError("Provider 不存在。", "provider.not_found");
      return { ...provider };
    }
    if (method === "updateProvider") {
      if (overrides.providerMutationError) throw commandError(overrides.providerMutationError);
      const [providerId, body] = args;
      const provider = state.providers.find((item) => Number(item.id) === Number(providerId));
      if (!provider) throw commandError("Provider 不存在。", "provider.not_found");
      state.providerRequests.push({ method: "PATCH", id: providerId, body });
      Object.assign(provider, {
        protocol: body.protocol,
        name: body.name,
        base_url: body.base_url,
        default_model: body.default_model,
        available_models: body.available_models || provider.available_models || [],
        models_refreshed_at: body.models_refreshed_at || provider.models_refreshed_at || null,
      });
      if (body.api_key) provider.api_key_set = true;
      if (body.is_default) {
        state.providers.forEach((item) => { item.is_default = Number(item.id) === Number(providerId); });
      } else {
        provider.is_default = false;
      }
      return { ...provider };
    }
    if (method === "deleteProvider") {
      if (overrides.providerMutationError) throw commandError(overrides.providerMutationError);
      const [providerId] = args;
      state.providerRequests.push({ method: "DELETE", id: providerId, body: null });
      state.providers = state.providers.filter((item) => Number(item.id) !== Number(providerId));
      return null;
    }
    if (method === "setDefaultProvider") {
      if (overrides.providerMutationError) throw commandError(overrides.providerMutationError);
      const [providerId] = args;
      state.providerRequests.push({ method: "POST", id: providerId, body: null });
      state.providers.forEach((item) => { item.is_default = Number(item.id) === Number(providerId); });
      return { ...state.providers.find((item) => Number(item.id) === Number(providerId)) };
    }
    if (method === "testProviderConnection") {
      state.providerProbeRequests.push({ method: "test", body: args[0] });
      if (overrides.providerProbeError) throw commandError(overrides.providerProbeError);
      return {
        ok: true,
        elapsed_ms: 42,
        checked_at: "2026-07-21T00:00:00Z",
        message: "连接成功。",
      };
    }
    if (method === "discoverProviderModels") {
      state.providerProbeRequests.push({ method: "discover", body: args[0] });
      if (overrides.providerDiscoveryError) throw commandError(overrides.providerDiscoveryError);
      return {
        models: overrides.discoveredModels || ["grok-imagine-image", "custom-image"],
        models_refreshed_at: "2026-07-21T00:00:00Z",
      };
    }
    if (method === "getStorageLocation") {
      const ordinal = ++state.storageGetRequests;
      const snapshot = { ...state.storageLocation };
      state.storageGetRequestOrder.push(ordinal);
      state.storageRequestOrder.push({ method: "GET", ordinal });
      await delay(Number(overrides.storageGetDelaysMs?.[ordinal - 1] || 0));
      state.storageGetResponses += 1;
      state.storageGetResponseOrder.push(ordinal);
      if (overrides.storageLoadError) throw commandError(overrides.storageLoadError);
      return snapshot;
    }
    if (method === "updateStorageLocation") {
      const [body] = args;
      const ordinal = ++state.storagePostRequests;
      state.storageRequests.push(body);
      state.storagePostRequestOrder.push(ordinal);
      state.storageRequestOrder.push({ method: "POST", ordinal });
      let response;
      if (overrides.storageLocationError) {
        response = commandError(overrides.storageLocationError);
      } else {
        state.storageLocation = {
          ...state.storageLocation,
          pending_data_dir: body.data_dir,
          restart_required: true,
        };
        response = { ...state.storageLocation };
      }
      await delay(Number(overrides.storagePostDelaysMs?.[ordinal - 1] || 0));
      state.storagePostResponses += 1;
      state.storagePostResponseOrder.push(ordinal);
      if (overrides.storageLocationError) throw response;
      return response;
    }
    if (method === "listProjects") return state.projects.map((project) => ({ ...project }));
    if (method === "createProject") {
      const [body] = args;
      const project = { id: state.projects.length + 1, name: body.name };
      state.projects.push(project);
      return { ...project };
    }
    if (method === "updateProject") {
      const [projectId, body] = args;
      const project = state.projects.find((item) => Number(item.id) === Number(projectId));
      Object.assign(project, body);
      return { ...project };
    }
    if (method === "deleteProject") {
      state.projects = state.projects.filter((item) => Number(item.id) !== Number(args[0]));
      return null;
    }
    if (method === "listSessions") return state.sessions.map((session) => ({ ...session }));
    if (method === "createSession") {
      const [body] = args;
      const session = { id: 2, title: body.title, updated_at: "2026-07-10T12:01:00Z" };
      state.sessionsCreated += 1;
      state.requestLog.push("session");
      state.sessions.unshift(session);
      state.runs[2] = [];
      return { ...session };
    }
    if (method === "getSession") {
      const session = state.sessions.find((item) => Number(item.id) === Number(args[0]));
      if (!session) throw commandError("会话不存在。", "session.not_found");
      return { ...session };
    }
    if (method === "updateSession") {
      const [sessionId, body] = args;
      const session = state.sessions.find((item) => Number(item.id) === Number(sessionId));
      if (!session) throw commandError("会话不存在。", "session.not_found");
      state.sessionRequests.push({ method: "PATCH", sessionId: Number(sessionId), body });
      if (overrides.sessionUpdateError) {
        throw commandError(overrides.sessionUpdateError, "session.update_failed");
      }
      if (Object.hasOwn(body, "title")) session.title = body.title;
      if (Object.hasOwn(body, "project_id")) session.project_id = body.project_id;
      if (Object.hasOwn(body, "is_pinned")) session.is_pinned = body.is_pinned;
      return { ...session };
    }
    if (method === "deleteSession") {
      state.sessionRequests.push({ method: "DELETE", sessionId: Number(args[0]), body: null });
      state.sessions = state.sessions.filter((item) => Number(item.id) !== Number(args[0]));
      return null;
    }
    if (method === "setSessionPinned") {
      const [sessionId, pinned] = args;
      const session = state.sessions.find((item) => Number(item.id) === Number(sessionId));
      state.sessionRequests.push({ method: "PIN", sessionId: Number(sessionId), body: pinned });
      session.is_pinned = pinned;
      return { ...session };
    }
    if (method === "listSessionRuns") return (state.runs[Number(args[0])] || []).map((run) => ({ ...run }));
    if (method === "saveImage") return true;
    if (method === "stageReference") {
      const [reference] = args;
      if (overrides.stageReferenceError) {
        throw commandError(overrides.stageReferenceError, "reference.stage_failed");
      }
      state.stagedReferences.push(reference);
      return { token: `reference-token-${state.stagedReferences.length}` };
    }
    if (method === "discardStagedReferences") {
      state.discardedReferenceTokens.push(...args[0]);
      return null;
    }
    if (method === "generate") {
      const [body] = args;
      state.generationStarted += 1;
      await delay(Number(overrides.generateDelayMs || 0));
      state.requestLog.push("generate");
      state.generateBodies.push(body);
      if (overrides.generateFailure) throw commandError("桌面后端请求失败。", "desktop.invoke_failed");
      const sessionId = Number(body.session_id);
      state.runs[sessionId] = [
        ...(state.runs[sessionId] || []),
        {
          id: state.nextRunId++,
          session_id: sessionId,
          status: overrides.generateStatus || "succeeded",
          prompt: body.prompt,
          provider_name: "Default",
          model: body.model,
          parameters: { ratio: body.ratio, resolution: body.resolution, count: body.count },
          error_message: overrides.generateStatus === "failed" ? "上游服务超时" : null,
          images: overrides.generateStatus === "failed" ? [] : [{
            id: 1,
            url: "/assets/app-icon.png",
            filename: "result.png",
            mime_type: "image/png",
          }],
        },
      ];
      return {
        kind: body.references?.length ? "image_to_image" : "text_to_image",
        model: body.model,
        size: `${body.width}x${body.height}`,
        images: ["/assets/app-icon.png"],
      };
    }
    throw commandError(`未实现测试 Desktop API 方法：${method}`);
  }

  await page.exposeFunction("__imageToolsDesktopApiCall", call);
  await page.addInitScript(() => {
    const methods = [
      "getSettings", "updateSettings", "getStorageLocation", "updateStorageLocation",
      "listProviders", "createProvider", "getProvider", "updateProvider", "deleteProvider",
      "setDefaultProvider", "listProjects", "createProject", "updateProject", "deleteProject",
      "testProviderConnection", "discoverProviderModels",
      "listSessions", "createSession", "getSession", "updateSession", "deleteSession",
      "setSessionPinned", "listSessionRuns", "saveImage", "stageReference",
      "discardStagedReferences", "generate",
    ];
    window.__IMAGE_TOOLS_DESKTOP_API_MOCK__ = Object.fromEntries(
      methods.map((method) => [method, (...args) => window.__imageToolsDesktopApiCall(method, args)]),
    );
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:8765") return route.abort("blockedbyclient");
    return route.fallback();
  });
  return state;
}

async function settleUi(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
}

module.exports = { installApiMocks, settleUi };
