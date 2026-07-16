const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/ui",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "retain-on-failure",
  },
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  webServer: {
    command: "node scripts/serve_frontend_tests.js",
    url: "http://127.0.0.1:8765/",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
