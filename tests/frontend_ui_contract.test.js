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

test("shell exposes Codex Windows task regions without permanent parameter columns", () => {
  for (const id of [
    "newSessionBtn",
    "sessionList",
    "timeline",
    "composerForm",
    "parameterMenu",
    "providerDialog",
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
    "/static/preferences.js",
    "/static/workbench.js",
    "/static/vendor/lucide.min.js",
    "/static/icons.js",
    "/static/ui.js",
    "/static/app.js",
  ]);
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
  assert.match(styles, /--sidebar-width:\s*clamp\(248px,\s*20\.3vw,\s*280px\)/);
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

test("Provider Cancel closes the settings dialog", () => {
  assert.match(
    app,
    /providerCancelBtn\.addEventListener\("click", closeProviderDialog\)/,
  );
});

test("temporary layers use restrained motion with a reduced-motion fallback", () => {
  assert.match(styles, /--motion-fast:\s*120ms/);
  assert.match(styles, /--motion-dialog:\s*160ms/);
  assert.match(styles, /\.popover\[data-motion="opening"\]/);
  assert.match(styles, /\.app-dialog\[data-motion="closing"\]/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
