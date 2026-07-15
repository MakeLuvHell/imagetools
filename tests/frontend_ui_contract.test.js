const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
const styles = fs.readFileSync(
  path.join(root, "frontend", "styles.css"),
  "utf8",
);
const app = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");

function parseHexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  assert.ok(match, `expected a six-digit hex color, received ${value}`);
  return [0, 2, 4].map((offset) =>
    Number.parseInt(match[1].slice(offset, offset + 2), 16),
  );
}

function relativeLuminance(value) {
  const channels = parseHexColor(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function lightThemeToken(name) {
  const lightRoot = styles.match(/^:root\s*\{([^}]*)\}/s);
  assert.ok(lightRoot, "light theme root is present");
  const token = lightRoot[1].match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(token, `light theme --${name} token is present`);
  return token[1];
}

function manualThemeToken(mode, name) {
  const manualRoot = styles.match(
    new RegExp(`:root\\[data-theme="${mode}"\\]\\s*\\{([^}]*)\\}`, "s"),
  );
  assert.ok(manualRoot, `${mode} manual theme root is present`);
  const token = manualRoot[1].match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"),
  );
  assert.ok(token, `${mode} manual theme --${name} token is present`);
  return token[1];
}

test("shell exposes Codex Windows task regions without permanent parameter columns", () => {
  for (const id of [
    "newSessionBtn",
    "sessionList",
    "timeline",
    "composerForm",
    "parameterMenu",
    "settingsView",
    "sessionDialog",
    "imagePreviewDialog",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /class="composer-controls"/);
  assert.doesNotMatch(html, /Scheduled|Plugins|Sites|terminal-stage/);
  assert.match(html, /data-lucide="search"/);
  assert.doesNotMatch(html, /class="(?:window|titlebar)/);
});

test("transitional shell preserves controls consumed by the current app", () => {
  for (const id of [
    "currentSessionTitle",
    "currentSessionSubtitle",
    "renameSessionBtn",
    "deleteSessionBtn",
    "prompt",
    "providerSelect",
    "modelInput",
    "ratioSelect",
    "resolutionSelect",
    "qualitySelect",
    "countSelect",
    "outputFormatSelect",
    "outputCompressionInput",
    "backgroundSelect",
    "moderationSelect",
    "referenceInput",
    "referenceBtn",
    "generateBtn",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("offline icon scripts load before application orchestration", () => {
  const sources = [...html.matchAll(/<script src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(sources, [
    "/static/theme.js",
    "/static/preferences.js",
    "/static/workbench.js",
    "/static/vendor/lucide.min.js",
    "/static/icons.js",
    "/static/ui.js",
    "/static/app.js",
  ]);
  assert.ok(
    html.indexOf('<script src="/static/theme.js"></script>') <
      html.indexOf('<link rel="stylesheet" href="/static/styles.css" />'),
    "theme bootstrap loads before the stylesheet",
  );
  assert.equal(fs.existsSync(path.join(root, "frontend", "theme.js")), true);
  assert.equal(
    fs.existsSync(path.join(root, "frontend", "vendor", "lucide.min.js")),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(root, "frontend", "vendor", "LUCIDE_LICENSE")),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(root, "frontend", "assets", "app-icon.png")),
    true,
  );
});

test("shell follows system themes and keeps Windows desktop geometry", () => {
  assert.match(styles, /color-scheme:\s*light dark/);
  assert.match(styles, /--sidebar-width:\s*clamp\(248px,\s*20\.3vw,\s*360px\)/);
  assert.match(styles, /--task-width:\s*760px/);
  assert.match(styles, /--composer-width:\s*746px/);
  assert.match(styles, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(styles, /@media\s*\(max-width:\s*1040px\)/);
});

test("Composer keeps controls in context and popover layers", () => {
  assert.match(html, /class="composer-context"/);
  assert.match(html, /id="referenceMenu"/);
  assert.match(html, /id="parameterMenu"/);
  assert.match(html, /id="advancedParamsPanel"/);
  assert.match(html, /id="referenceInput"/);
  assert.match(html, /id="providerSelect"/);
  assert.doesNotMatch(html, /class="composer-controls"/);
});

test("Provider settings uses a scan-first list and dedicated task dialogs", () => {
  for (const id of [
    "providerList",
    "addProviderBtn",
    "providerDialog",
    "providerForm",
    "providerDialogStatus",
    "providerMenu",
    "providerDeleteDialog",
    "providerDeleteMessage",
    "providerDeleteStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const providerPanelStart = html.indexOf('<section id="settingsProvidersPanel"');
  const storagePanelStart = html.indexOf('<section id="settingsStoragePanel"');
  assert.notEqual(providerPanelStart, -1);
  assert.ok(storagePanelStart > providerPanelStart);
  const providerPanel = html.slice(providerPanelStart, storagePanelStart);
  assert.doesNotMatch(providerPanel, /id="providerForm"/);

  assert.match(app, /function openNewProviderDialog\(/);
  assert.match(app, /function openEditProviderDialog\(/);
  assert.match(app, /function openProviderDeleteDialog\(/);
});

test("settings uses a dedicated workspace view with separate provider and storage navigation", () => {
  for (const id of [
    "settingsView",
    "settingsBackBtn",
    "settingsAppearanceNav",
    "settingsProvidersNav",
    "settingsStorageNav",
    "settingsAppearancePanel",
    "settingsProvidersPanel",
    "settingsStoragePanel",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(
    html,
    /id="settingsView" class="settings-view" role="region" aria-label="设置" hidden/,
  );
  for (const className of [
    "settings-shell",
    "settings-sidebar",
    "settings-nav-label",
    "settings-nav",
    "settings-main",
    "settings-page-heading",
  ]) {
    assert.match(html, new RegExp(`class="[^"]*${className}[^"]*"`));
  }
  assert.match(html, /class="settings-nav" aria-label="设置分类"/);
  assert.match(html, /id="settingsAppearanceNav"[^>]*aria-current="page"/);
  assert.match(html, /id="settingsProvidersNav"[^>]*aria-current="false"/);
  assert.match(html, /id="settingsStorageNav"[^>]*aria-current="false"/);
  assert.match(
    html,
    /id="settingsProvidersPanel" class="settings-panel" aria-labelledby="settingsProvidersTitle"/,
  );
  assert.match(app, /function openSettingsView\(tab, opener\)/);
  assert.match(app, /function closeSettingsView\(\)/);
  assert.match(styles, /\.settings-view/);
  assert.match(styles, /\.settings-nav/);
});

test("settings exposes an Appearance panel with a three-mode radio group", () => {
  for (const id of [
    "settingsAppearanceNav",
    "settingsAppearancePanel",
    "settingsAppearanceTitle",
    "themeModeGroup",
    "themeStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const value of ["system", "light", "dark"]) {
    assert.match(
      html,
      new RegExp(`name="themeMode"[^>]*value="${value}"`),
    );
  }
  assert.match(html, /data-lucide="monitor"/);
  assert.match(html, /data-lucide="sun"/);
  assert.match(html, /data-lucide="moon"/);
  assert.match(html, /id="themeStatus"[^>]*role="status"/);
});

test("manual theme selectors override the system color scheme", () => {
  assert.match(styles, /:root\[data-theme="light"\]/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /color-scheme:\s*light;/);
  assert.match(styles, /color-scheme:\s*dark;/);
  assert.match(styles, /\.theme-segmented-control/);
  assert.match(styles, /input:checked\s*\+\s*span/);
  assert.match(styles, /input:focus-visible\s*\+\s*span/);
});

test("Appearance radio focus uses an opaque accent with WCAG non-text contrast", () => {
  const focusRule = styles.match(
    /\.theme-segmented-control input:focus-visible\s*\+\s*span\s*\{([^}]*)\}/,
  );
  assert.ok(focusRule, "Appearance radio focus rule is present");
  assert.match(focusRule[1], /outline:\s*2px solid var\(--accent\)/);
  assert.match(focusRule[1], /outline-offset:\s*1px/);

  for (const mode of ["light", "dark"]) {
    const ratio = contrastRatio(
      manualThemeToken(mode, "accent"),
      manualThemeToken(mode, "surface-subtle"),
    );
    assert.ok(
      ratio >= 3,
      `${mode} --accent contrast on --surface-subtle is ${ratio.toFixed(3)}:1; expected at least 3:1`,
    );
  }
});

test("settings navigation uses a restrained neutral active state", () => {
  const activeRule = styles.match(
    /\.settings-nav button\[aria-current="page"\]\s*\{([^}]*)\}/,
  );
  assert.ok(activeRule, "active settings navigation rule is present");
  assert.match(activeRule[1], /background:\s*var\(--surface-hover\)/);
  assert.doesNotMatch(activeRule[1], /var\(--accent\)/);
});

test("light theme muted text meets WCAG AA on settings surfaces", () => {
  const muted = lightThemeToken("muted");
  for (const background of ["bg", "surface-hover"]) {
    const ratio = contrastRatio(muted, lightThemeToken(background));
    assert.ok(
      ratio >= 4.5,
      `--muted contrast on --${background} is ${ratio.toFixed(3)}:1; expected at least 4.5:1`,
    );
  }
});

test("storage settings separates current status from the change dialog", () => {
  for (const id of [
    "storageCurrentPath",
    "storageChangeBtn",
    "storagePendingState",
    "storagePendingPath",
    "storageIdleState",
    "storagePanelStatus",
    "storageDialog",
    "storageDataDir",
    "storageMigrateExisting",
    "storageBrowseBtn",
    "storageApplyBtn",
    "storageDialogStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const storagePanelStart = html.indexOf('<section id="settingsStoragePanel"');
  const storagePanelEnd = html.indexOf("</main>", storagePanelStart);
  assert.notEqual(storagePanelStart, -1);
  assert.ok(storagePanelEnd > storagePanelStart);
  const storagePanel = html.slice(storagePanelStart, storagePanelEnd);
  assert.doesNotMatch(storagePanel, /id="storageDataDir"/);

  assert.match(html, /id="storageDataDir"[^>]*required/);
  assert.match(app, /function beginStorageChange\(/);
  assert.match(app, /function openStorageDialog\(/);
  assert.match(app, /pick_data_directory/);
  assert.match(html, /data-lucide="folder-open"/);
});

test("temporary layers use restrained motion with a reduced-motion fallback", () => {
  assert.match(styles, /--motion-fast:\s*120ms/);
  assert.match(styles, /--motion-dialog:\s*160ms/);
  assert.match(styles, /\.popover\[data-motion="opening"\]/);
  assert.match(styles, /\.app-dialog\[data-motion="closing"\]/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
