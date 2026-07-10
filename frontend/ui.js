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
    renderTaskHeader,
    openDialog,
    closeDialog,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.ImageToolsUi = api;
})(typeof window !== "undefined" ? window : globalThis);
