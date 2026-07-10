(function initIcons(globalScope) {
  function refresh() {
    if (!globalScope.lucide) {
      return;
    }
    globalScope.lucide.createIcons({
      attrs: {
        width: 16,
        height: 16,
        "stroke-width": 1.7,
      },
    });
  }

  globalScope.ImageToolsIcons = { refresh };
  refresh();
})(typeof window !== "undefined" ? window : globalThis);
