(function initUi(globalScope) {
  const dialogOpeners = new WeakMap();
  const dialogKeyHandlers = new WeakMap();
  const motionStates = new WeakMap();

  function focusableElements(dialog) {
    return [...dialog.querySelectorAll("input, select, textarea, button, [href], [tabindex]")].filter(
      (element) =>
        !element.disabled &&
        element.tabIndex !== -1 &&
        !element.closest("[hidden]"),
    );
  }

  function refreshIcons() {
    globalScope.ImageToolsIcons?.refresh();
  }

  function anchoredLayerPosition({
    anchor,
    layer,
    viewport,
    gap = 8,
    padding = 12,
  }) {
    const topPosition = anchor.top - layer.height - gap;
    const bottomPosition = anchor.bottom + gap;
    const fitsAbove = topPosition >= padding;
    const fitsBelow =
      bottomPosition + layer.height <= viewport.height - padding;
    const placement = fitsAbove || !fitsBelow ? "top" : "bottom";
    const desiredTop = placement === "top" ? topPosition : bottomPosition;
    const maxLeft = Math.max(
      padding,
      viewport.width - layer.width - padding,
    );
    const maxTop = Math.max(
      padding,
      viewport.height - layer.height - padding,
    );
    return {
      left: Math.min(Math.max(anchor.left, padding), maxLeft),
      top: Math.min(Math.max(desiredTop, padding), maxTop),
      placement,
    };
  }

  function currentAnimations(element) {
    if (typeof element.getAnimations !== "function") return [];
    return element
      .getAnimations({ subtree: true })
      .filter((animation) => animation.playState !== "finished");
  }

  function cancelAnimations(element) {
    for (const animation of currentAnimations(element)) animation.cancel();
  }

  function startMotion(element, phase) {
    cancelAnimations(element);
    delete element.dataset.motion;
    void element.offsetWidth;
    element.dataset.motion = phase;
    return currentAnimations(element);
  }

  function finishMotion(element, token, animations, callback) {
    if (!animations.length) {
      callback();
      return Promise.resolve();
    }
    return Promise.allSettled(animations.map((animation) => animation.finished)).then(
      () => {
        if (motionStates.get(element)?.token === token) callback();
      },
    );
  }

  function beginOpen(element, trigger, placement) {
    const token = {};
    motionStates.set(element, { token, status: "opening" });
    element.hidden = false;
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    if (placement) element.dataset.placement = placement;
    return token;
  }

  function runOpenMotion(element, token) {
    const animations = startMotion(element, "opening");
    void finishMotion(element, token, animations, () => {
      motionStates.set(element, { token, status: "open" });
      element.dataset.motion = "open";
    });
  }

  function openLayer(element, trigger, { placement = "bottom" } = {}) {
    const token = beginOpen(element, trigger, placement);
    runOpenMotion(element, token);
  }

  function positionAnchoredLayer(
    element,
    trigger,
    { gap = 8, padding = 12 } = {},
  ) {
    const view = element.ownerDocument.defaultView || globalScope;
    const position = anchoredLayerPosition({
      anchor: trigger.getBoundingClientRect(),
      layer: element.getBoundingClientRect(),
      viewport: { width: view.innerWidth, height: view.innerHeight },
      gap,
      padding,
    });
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
    element.dataset.placement = position.placement;
    return position;
  }

  function openAnchoredLayer(element, trigger, options = {}) {
    const token = beginOpen(element, trigger);
    const position = positionAnchoredLayer(element, trigger, options);
    runOpenMotion(element, token);
    return position;
  }

  function isLayerOpen(element) {
    if (element.hidden) return false;
    return motionStates.get(element)?.status !== "closing";
  }

  function closeLayer(
    element,
    trigger,
    { restoreFocus = false } = {},
  ) {
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (element.hidden) {
      if (restoreFocus) trigger?.focus();
      return Promise.resolve();
    }
    const current = motionStates.get(element);
    if (current?.status === "closing") {
      if (restoreFocus) current.restoreFocus = true;
      return current.promise || Promise.resolve();
    }

    const token = {};
    const state = { token, status: "closing", restoreFocus };
    motionStates.set(element, state);
    const animations = startMotion(element, "closing");
    state.promise = finishMotion(element, token, animations, () => {
      element.hidden = true;
      delete element.dataset.motion;
      motionStates.delete(element);
      if (state.restoreFocus) trigger?.focus();
    });
    return state.promise;
  }

  function renderSessionItem(document, session, selectedSessionId, callbacks, { nested = false } = {}) {
    const row = document.createElement("div");
    row.className = `session-row${nested ? " project-session-row" : ""}`;
    row.dataset.sessionId = String(session.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-item";
    button.textContent = session.title;
    button.title = session.title;
    if (session.id === selectedSessionId) {
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => callbacks.onSelect?.(session.id));
    row.appendChild(button);
    if (callbacks.onSessionPointerDown) {
      row.addEventListener("pointerdown", (event) => {
        if (event.target.closest?.(".session-row-action")) return;
        callbacks.onSessionPointerDown(session, event);
      });
    }
    if (callbacks.onSessionAction) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "session-row-action icon-button";
      action.setAttribute("aria-label", `会话操作 ${session.title}`);
      action.title = "会话操作";
      action.innerHTML = '<i data-lucide="ellipsis"></i>';
      action.addEventListener("click", () => callbacks.onSessionAction(session, action));
      row.appendChild(action);
    }
    return row;
  }

  function appendGroup(document, container, title, content) {
    if (!content.childElementCount) return;
    const section = document.createElement("section");
    section.className = "session-group";
    const heading = document.createElement("h2");
    heading.className = "session-group-title";
    heading.textContent = title;
    section.append(heading, content);
    container.appendChild(section);
  }

  function renderSessionList(container, sessions, selectedSessionId, onSelect) {
    container.replaceChildren();
    const document = container.ownerDocument;
    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        container.appendChild(
          renderSessionItem(document, session, selectedSessionId, { onSelect }),
        );
      }
      refreshIcons();
      return;
    }
    const callbacks = onSelect || {};
    const pinned = document.createElement("div");
    for (const session of sessions.pinned || []) {
      pinned.appendChild(renderSessionItem(document, session, selectedSessionId, callbacks));
    }
    appendGroup(document, container, "置顶", pinned);

    const projects = document.createElement("div");
    for (const group of sessions.projects || []) {
      const projectBlock = document.createElement("div");
      projectBlock.className = "project-block";
      const projectRow = document.createElement("div");
      projectRow.className = "project-row project-drop-target";
      projectRow.dataset.projectId = String(group.project.id);
      const collapsed = callbacks.collapsedProjectIds?.has(group.project.id) || false;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "project-toggle icon-button";
      toggle.dataset.projectToggle = String(group.project.id);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute(
        "aria-label",
        `${collapsed ? "展开" : "收起"}项目 ${group.project.name}`,
      );
      toggle.innerHTML = `<i data-lucide="${collapsed ? "chevron-right" : "chevron-down"}"></i>`;
      toggle.addEventListener("click", () =>
        callbacks.onProjectToggle?.(group.project.id),
      );
      const projectIcon = document.createElement("i");
      projectIcon.className = "project-icon";
      projectIcon.setAttribute("data-lucide", "folder");
      const projectName = document.createElement("span");
      projectName.className = "project-name";
      projectName.textContent = group.project.name;
      projectRow.append(toggle, projectIcon, projectName);
      if (callbacks.onProjectAction) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "project-row-action icon-button";
        action.setAttribute("aria-label", `管理项目 ${group.project.name}`);
        action.title = "管理项目";
        action.innerHTML = '<i data-lucide="ellipsis"></i>';
        action.addEventListener("click", () => callbacks.onProjectAction(group.project, action));
        projectRow.appendChild(action);
      }
      const children = document.createElement("div");
      children.className = "project-children";
      children.dataset.projectSessions = String(group.project.id);
      children.hidden = collapsed;
      for (const session of group.sessions) {
        children.appendChild(
          renderSessionItem(document, session, selectedSessionId, callbacks, { nested: true }),
        );
      }
      projectBlock.append(projectRow, children);
      projects.appendChild(projectBlock);
    }
    appendGroup(document, container, "项目", projects);

    const ungrouped = document.createElement("div");
    for (const session of sessions.ungrouped || []) {
      ungrouped.appendChild(renderSessionItem(document, session, selectedSessionId, callbacks));
    }
    appendGroup(document, container, "会话", ungrouped);
    refreshIcons();
  }

  function renderNewTask(timeline) {
    const document = timeline.ownerDocument;
    const empty = document.createElement("div");
    empty.className = "empty-workspace";
    const image = document.createElement("img");
    image.src = "/assets/app-icon.png";
    image.alt = "";
    const title = document.createElement("h2");
    title.textContent = "今天想创作什么？";
    empty.append(image, title);
    timeline.replaceChildren(empty);
  }

  function settingsStateAction(document, label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialog-button";
    button.textContent = label;
    if (callback) button.addEventListener("click", callback);
    return button;
  }

  function renderProviderSettings(container, state, callbacks = {}) {
    const document = container.ownerDocument;
    const status = state?.status || "ready";
    const providers = state?.providers || [];
    container.replaceChildren();
    container.removeAttribute("aria-busy");

    if (status === "loading") {
      container.setAttribute("aria-busy", "true");
      for (let index = 0; index < 2; index += 1) {
        const skeleton = document.createElement("div");
        skeleton.className = "settings-skeleton-row";
        skeleton.setAttribute("aria-hidden", "true");
        container.appendChild(skeleton);
      }
      return;
    }

    if (status === "error") {
      const error = document.createElement("div");
      error.className = "settings-error-state";
      error.setAttribute("role", "alert");
      const title = document.createElement("strong");
      title.textContent = "无法加载 Provider";
      const message = document.createElement("p");
      message.textContent = state?.error || "请求失败";
      error.append(
        title,
        message,
        settingsStateAction(document, "重试", callbacks.onRetry),
      );
      container.appendChild(error);
      return;
    }

    if (!providers.length) {
      const empty = document.createElement("div");
      empty.className = "settings-empty-state";
      const title = document.createElement("strong");
      title.textContent = "尚未配置 Provider";
      const message = document.createElement("p");
      message.textContent = "添加一个图片 API 连接后即可开始生成。";
      empty.append(
        title,
        message,
        settingsStateAction(document, "添加 Provider", callbacks.onAdd),
      );
      container.appendChild(empty);
      return;
    }

    for (const provider of providers) {
      const row = document.createElement("article");
      row.className = "provider-row";
      row.dataset.providerId = String(provider.id);

      const main = document.createElement("button");
      main.type = "button";
      main.className = "provider-row-main";
      main.setAttribute("aria-label", `编辑 Provider ${provider.name}`);
      main.addEventListener("click", () => callbacks.onEdit?.(provider, main));

      const avatar = document.createElement("span");
      avatar.className = "provider-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = String(provider.name || "").trim().charAt(0).toUpperCase() || "P";

      const copy = document.createElement("span");
      copy.className = "provider-copy";
      const nameLine = document.createElement("span");
      nameLine.className = "provider-name-line";
      const name = document.createElement("strong");
      name.textContent = provider.name;
      nameLine.appendChild(name);
      if (provider.isDefault) {
        const badge = document.createElement("span");
        badge.className = "provider-default";
        badge.textContent = "默认";
        nameLine.appendChild(badge);
      }
      const detail = document.createElement("span");
      detail.className = "provider-detail";
      const protocolLabels = {
        openai_compatible: "OpenAI Compatible",
        xai_images: "xAI Imagine",
        gemini_native: "Gemini Native",
      };
      const protocolLabel = protocolLabels[provider.protocol];
      detail.textContent = `${protocolLabel ? `${protocolLabel} · ` : ""}${provider.defaultModel} · ${
        provider.apiKeySet ? "API Key 已配置" : "API Key 未配置"
      }`;
      copy.append(nameLine, detail);
      main.append(avatar, copy);

      const menu = document.createElement("button");
      menu.type = "button";
      menu.className = "provider-row-menu icon-button";
      menu.setAttribute("aria-label", `管理 Provider ${provider.name}`);
      menu.setAttribute("aria-haspopup", "menu");
      menu.setAttribute("aria-expanded", "false");
      menu.title = "Provider 操作";
      menu.innerHTML = '<i data-lucide="ellipsis"></i>';
      menu.addEventListener("click", () => callbacks.onMenu?.(provider, menu));

      row.append(main, menu);
      container.appendChild(row);
    }
    refreshIcons();
  }

  function actionButton(document, icon, label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `<i data-lucide="${icon}"></i>`;
    if (callback) button.addEventListener("click", callback);
    return button;
  }

  function renderTaskRuns(container, runs, callbacks = {}) {
    const document = container.ownerDocument;
    container.replaceChildren();
    for (const run of runs) {
      const article = document.createElement("article");
      article.className = "task-run";
      article.dataset.runId = String(run.id);
      if (run.submissionId) {
        article.dataset.submissionId = String(run.submissionId);
      }

      const prompt = document.createElement("div");
      prompt.className = "user-prompt";
      prompt.textContent = run.prompt || "无提示词";
      const response = document.createElement("div");
      response.className = `run-response status-${run.status}`;

      const meta = document.createElement("div");
      meta.className = "run-meta";
      const status = document.createElement("span");
      status.textContent =
        run.status === "running"
          ? "生成中"
          : run.status === "succeeded"
            ? "已完成"
            : "生成失败";
      const summary = document.createElement("span");
      summary.textContent = [run.provider_name, run.model].filter(Boolean).join(" · ");
      meta.append(status, summary);
      response.appendChild(meta);

      if (run.status === "running") {
        const progress = document.createElement("div");
        progress.className = "run-progress";
        progress.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>正在生成图片</span>';
        response.appendChild(progress);
        const skeletons = document.createElement("div");
        skeletons.className = "result-grid skeleton-grid";
        const count = Math.max(1, Number(run.parameters?.count || 1));
        for (let index = 0; index < count; index += 1) {
          const skeleton = document.createElement("div");
          skeleton.className = "result-skeleton";
          skeletons.appendChild(skeleton);
        }
        response.appendChild(skeletons);
      }

      if (run.status === "succeeded" && run.images?.length) {
        const grid = document.createElement("div");
        grid.className = `result-grid result-count-${Math.min(run.images.length, 4)}`;
        for (const image of run.images) {
          const figure = document.createElement("figure");
          figure.className = "result-image";
          const preview = document.createElement("button");
          preview.type = "button";
          preview.className = "result-preview";
          preview.setAttribute("aria-label", "预览图片");
          const element = document.createElement("img");
          element.src = image.url;
          element.alt = "生成结果";
          preview.appendChild(element);
          preview.addEventListener("click", () => callbacks.onPreview?.(image, run));
          const actions = document.createElement("figcaption");
          actions.append(
            actionButton(document, "download", "下载", () => callbacks.onDownload?.(image, run)),
            actionButton(document, "copy", "复制链接", () => callbacks.onCopyLink?.(image, run)),
            actionButton(document, "image-plus", "设为参考图", () => callbacks.onSetReference?.(image, run)),
          );
          figure.append(preview, actions);
          grid.appendChild(figure);
        }
        response.appendChild(grid);
      }

      if (run.status === "failed") {
        const error = document.createElement("p");
        error.className = "run-error";
        error.textContent = run.error_message || "生成失败";
        const actions = document.createElement("div");
        actions.className = "run-failure-actions";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "重试";
        retry.addEventListener("click", () => callbacks.onRetry?.(run));
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "复制错误";
        copy.addEventListener("click", () => callbacks.onCopyError?.(run));
        actions.append(retry, copy);
        response.append(error, actions);
      }

      const parameters = document.createElement("button");
      parameters.type = "button";
      parameters.className = "copy-parameters-button";
      parameters.textContent = "复制参数";
      parameters.addEventListener("click", () => callbacks.onCopyParameters?.(run));
      const details = document.createElement("details");
      details.className = "run-details";
      const detailsSummary = document.createElement("summary");
      detailsSummary.textContent = "详情";
      const detailContent = document.createElement("pre");
      detailContent.textContent = JSON.stringify(run.parameters || {}, null, 2);
      details.append(detailsSummary, detailContent);
      response.append(parameters, details);
      article.append(prompt, response);
      container.appendChild(article);
    }
    refreshIcons();
  }

  function latestScrollTop(container) {
    if (!container) return 0;
    return Math.max(0, Number(container.scrollHeight) - Number(container.clientHeight));
  }

  function scrollTimelineToLatest(container) {
    const top = latestScrollTop(container);
    if (container) container.scrollTop = top;
    return top;
  }

  function startPromptHandoff({
    document,
    sourceRect,
    target,
    scrollContainer = null,
    text,
    reducedMotion = false,
  }) {
    const idle = {
      cleanup() {},
      finished: Promise.resolve(),
    };
    if (reducedMotion || !document?.body || !sourceRect || !target) {
      scrollTimelineToLatest(scrollContainer);
      return idle;
    }

    const targetRect = target.getBoundingClientRect();
    const scrollStart = Number(scrollContainer?.scrollTop || 0);
    const scrollEnd = latestScrollTop(scrollContainer);
    const scrollDistance = scrollEnd - scrollStart;
    if (
      !sourceRect.width ||
      !sourceRect.height ||
      !targetRect.width ||
      !targetRect.height
    ) {
      scrollTimelineToLatest(scrollContainer);
      return idle;
    }

    const clone = document.createElement("div");
    clone.className = "prompt-handoff";
    clone.textContent = String(text || "");
    clone.dataset.duration = "250";
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    document.body.appendChild(clone);
    const run = target.closest?.(".task-run") || null;
    target.classList.add("is-handoff-hidden");
    run?.classList.add("is-handoff-pending");

    let animation = null;
    let scrollFrame = null;
    let resolveScroll = null;
    let scrollSettled = false;
    let cleaned = false;
    const finishScroll = () => {
      if (scrollSettled) return;
      scrollSettled = true;
      if (scrollFrame != null) {
        document.defaultView?.cancelAnimationFrame?.(scrollFrame);
        scrollFrame = null;
      }
      scrollTimelineToLatest(scrollContainer);
      resolveScroll?.();
    };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      animation?.cancel?.();
      finishScroll();
      clone.remove();
      target.classList.remove("is-handoff-hidden");
      run?.classList.remove("is-handoff-pending");
    };

    if (typeof clone.animate !== "function") {
      cleanup();
      return idle;
    }

    const translateX = targetRect.left - sourceRect.left;
    const translateY = targetRect.top - scrollDistance - sourceRect.top;
    const scaleX = targetRect.width / sourceRect.width;
    const scaleY = targetRect.height / sourceRect.height;
    animation = clone.animate(
      [
        { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
        {
          transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
          opacity: 1,
        },
      ],
      {
        duration: 250,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        fill: "forwards",
      },
    );
    const view = document.defaultView;
    const scrollFinished = new Promise((resolve) => {
      resolveScroll = resolve;
      if (
        !scrollContainer ||
        scrollDistance === 0 ||
        typeof view?.requestAnimationFrame !== "function"
      ) {
        finishScroll();
        return;
      }
      const startedAt = view.performance.now();
      const step = (timestamp) => {
        if (scrollSettled) return;
        const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / 250));
        const eased = 1 - Math.pow(1 - progress, 3);
        scrollContainer.scrollTop = scrollStart + scrollDistance * eased;
        if (progress >= 1) {
          finishScroll();
        } else {
          scrollFrame = view.requestAnimationFrame(step);
        }
      };
      scrollFrame = view.requestAnimationFrame(step);
    });
    const finished = Promise.all([
      Promise.resolve(animation.finished).catch(() => undefined),
      scrollFinished,
    ]).finally(cleanup);
    return { cleanup, finished };
  }

  function renderTaskHeader(titleElement, subtitleElement, session) {
    titleElement.textContent = session ? session.title : "新任务";
    subtitleElement.textContent = session ? "图片创作会话" : "图片创作";
  }

  function openDialog(dialog, opener) {
    dialogOpeners.set(dialog, opener || dialog.ownerDocument.activeElement);
    if (!dialog.open) {
      dialog.showModal();
    }
    const token = beginOpen(dialog);
    runOpenMotion(dialog, token);
    const focusable = focusableElements(dialog);
    focusable[0]?.focus();
    const keyHandler = (event) => {
      if (event.key !== "Tab") return;
      const elements = focusableElements(dialog);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && dialog.ownerDocument.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && dialog.ownerDocument.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousHandler = dialogKeyHandlers.get(dialog);
    if (previousHandler) dialog.removeEventListener("keydown", previousHandler);
    dialog.addEventListener("keydown", keyHandler);
    dialogKeyHandlers.set(dialog, keyHandler);
  }

  function closeDialog(dialog, returnValue) {
    const opener = dialogOpeners.get(dialog);
    const keyHandler = dialogKeyHandlers.get(dialog);
    if (!dialog.open) {
      opener?.focus();
      return Promise.resolve();
    }
    const current = motionStates.get(dialog);
    if (current?.status === "closing") return current.promise;

    const token = {};
    const state = { token, status: "closing" };
    motionStates.set(dialog, state);
    const animations = startMotion(dialog, "closing");
    state.promise = finishMotion(dialog, token, animations, () => {
      dialog.close(returnValue);
      if (keyHandler) dialog.removeEventListener("keydown", keyHandler);
      dialogOpeners.delete(dialog);
      dialogKeyHandlers.delete(dialog);
      delete dialog.dataset.motion;
      motionStates.delete(dialog);
      opener?.focus();
    });
    return state.promise;
  }

  const api = {
    anchoredLayerPosition,
    openLayer,
    openAnchoredLayer,
    positionAnchoredLayer,
    closeLayer,
    isLayerOpen,
    renderSessionList,
    renderNewTask,
    renderProviderSettings,
    renderTaskRuns,
    scrollTimelineToLatest,
    startPromptHandoff,
    renderTaskHeader,
    openDialog,
    closeDialog,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsUi = api;
})(typeof window !== "undefined" ? window : globalThis);
