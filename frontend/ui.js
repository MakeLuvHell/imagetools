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
    const title = document.createElement("strong");
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
    renderTaskHeader,
    openDialog,
    closeDialog,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsUi = api;
})(typeof window !== "undefined" ? window : globalThis);
