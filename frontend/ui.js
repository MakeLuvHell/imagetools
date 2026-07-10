(function initUi(globalScope) {
  const dialogOpeners = new WeakMap();
  const dialogKeyHandlers = new WeakMap();

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

  function renderSessionList(container, sessions, selectedSessionId, onSelect) {
    container.replaceChildren();
    for (const session of sessions) {
      const button = container.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "session-item";
      button.textContent = session.title;
      button.title = session.title;
      if (session.id === selectedSessionId) {
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => onSelect(session.id));
      container.appendChild(button);
    }
    refreshIcons();
  }

  function renderNewTask(timeline) {
    const document = timeline.ownerDocument;
    const empty = document.createElement("div");
    empty.className = "empty-workspace";
    const image = document.createElement("img");
    image.src = "/static/assets/app-icon.png";
    image.alt = "";
    const title = document.createElement("h2");
    title.textContent = "今天想创作什么？";
    empty.append(image, title);
    timeline.replaceChildren(empty);
  }

  function renderProviderList(
    container,
    providers,
    selectedProviderId,
    onAction,
  ) {
    const document = container.ownerDocument;
    container.replaceChildren();
    for (const provider of providers) {
      const row = document.createElement("article");
      row.className = "provider-row";
      row.dataset.providerId = String(provider.id);
      if (provider.id === Number(selectedProviderId)) {
        row.classList.add("selected");
      }
      const copy = document.createElement("div");
      copy.className = "provider-copy";
      const name = document.createElement("strong");
      name.textContent = provider.name;
      const model = document.createElement("span");
      model.textContent = provider.defaultModel;
      const keyStatus = document.createElement("span");
      keyStatus.textContent = provider.apiKeySet ? "已配置密钥" : "未配置密钥";
      copy.append(name, model, keyStatus);
      if (provider.isDefault) {
        const badge = document.createElement("span");
        badge.className = "provider-default";
        badge.textContent = "默认";
        copy.appendChild(badge);
      }

      const actions = document.createElement("div");
      actions.className = "provider-actions";
      const definitions = [
        ["default", "star", "设为默认"],
        ["edit", "pencil", "编辑"],
        ["delete", "trash-2", "删除"],
      ];
      for (const [action, icon, label] of definitions) {
        if (action === "default" && provider.isDefault) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `icon-button${action === "delete" ? " danger-icon" : ""}`;
        button.dataset.action = action;
        button.setAttribute("aria-label", label);
        button.title = label;
        button.innerHTML = `<i data-lucide="${icon}"></i>`;
        if (action === "delete") {
          button.className = "provider-delete-button";
          const text = document.createElement("span");
          text.textContent = label;
          button.appendChild(text);
        }
        button.addEventListener("click", () => onAction(action, provider.id));
        actions.appendChild(button);
      }
      row.append(copy, actions);
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
          const continueButton = document.createElement("button");
          continueButton.type = "button";
          continueButton.className = "continue-button";
          continueButton.textContent = "基于结果继续";
          continueButton.addEventListener("click", () => callbacks.onContinue?.(image, run));
          actions.appendChild(continueButton);
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

  function renderTaskHeader(titleElement, subtitleElement, session) {
    titleElement.textContent = session ? session.title : "新任务";
    subtitleElement.textContent = session ? "图片创作会话" : "图片创作";
  }

  function openDialog(dialog, opener) {
    dialogOpeners.set(dialog, opener || dialog.ownerDocument.activeElement);
    if (!dialog.open) {
      dialog.showModal();
    }
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
    if (dialog.open) {
      dialog.close(returnValue);
    }
    const opener = dialogOpeners.get(dialog);
    const keyHandler = dialogKeyHandlers.get(dialog);
    if (keyHandler) dialog.removeEventListener("keydown", keyHandler);
    dialogOpeners.delete(dialog);
    dialogKeyHandlers.delete(dialog);
    opener?.focus();
  }

  const api = {
    renderSessionList,
    renderNewTask,
    renderProviderList,
    renderTaskRuns,
    renderTaskHeader,
    openDialog,
    closeDialog,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsUi = api;
})(typeof window !== "undefined" ? window : globalThis);
