const { defineConfig } = require("@playwright/test");
const path = require("node:path");

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
    command: "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765",
    url: "http://127.0.0.1:8765/api/health",
    reuseExistingServer: false,
    env: {
      ...process.env,
      IMAGE_TOOLS_DATA_DIR: path.join(
        __dirname,
        "test-results/playwright-data",
      ),
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
