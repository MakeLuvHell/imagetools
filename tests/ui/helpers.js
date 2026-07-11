const fs = require("node:fs");
const path = require("node:path");

const IMAGE_BYTES = fs.readFileSync(
  path.join(__dirname, "..", "..", "frontend", "assets", "app-icon.png"),
);

async function installApiMocks(page, overrides = {}) {
  const state = {
    sessionsCreated: 0,
    requestLog: [],
    generateBodies: [],
    nextRunId: 20,
    sessions: overrides.sessions || [
      {
        id: 1,
        title: "夏季饮品广告图",
        updated_at: "2026-07-10T12:00:00Z",
      },
    ],
    projects: overrides.projects || [],
    providers:
      overrides.providers === undefined
        ? [
            {
              id: 1,
              name: "Default",
              base_url: "https://api.example/v1",
              default_model: "gpt-image-2",
              is_default: true,
              api_key_set: true,
            },
          ]
        : overrides.providers,
    runs: overrides.runs || { 1: [] },
    storageLocation: overrides.storageLocation || {
      active_data_dir: "C:\\Users\\creator\\AppData\\Roaming\\com.imagetools.desktop",
      default_data_dir: "C:\\Users\\creator\\AppData\\Roaming\\com.imagetools.desktop",
      pending_data_dir: null,
      is_custom: false,
    },
    storageRequests: [],
  };

  await page.route("**/api/providers", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: state.providers });
    }
    return route.fulfill({ status: 200, json: state.providers[0] || {} });
  });
  await page.route("**/api/storage-location", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: state.storageLocation });
    }
    const body = route.request().postDataJSON();
    state.storageRequests.push(body);
    if (overrides.storageLocationError) {
      return route.fulfill({ status: 400, json: { detail: overrides.storageLocationError } });
    }
    state.storageLocation = {
      ...state.storageLocation,
      pending_data_dir: body.data_dir,
      restart_required: true,
    };
    return route.fulfill({ json: state.storageLocation });
  });
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: state.projects });
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const project = { id: state.projects.length + 1, name: body.name };
      state.projects.push(project);
      return route.fulfill({ status: 200, json: project });
    }
    return route.fulfill({ status: 405, json: { detail: "Method not allowed" } });
  });
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const session = {
        id: 2,
        title: body.title,
        updated_at: "2026-07-10T12:01:00Z",
      };
      state.sessionsCreated += 1;
      state.requestLog.push("session");
      state.sessions.unshift(session);
      state.runs[2] = [];
      return route.fulfill({ status: 200, json: session });
    }
    return route.fulfill({ json: state.sessions });
  });
  await page.route(/\/api\/sessions\/(\d+)(?:\/pin)?$/, async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const sessionId = Number(parts[3]);
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return route.fulfill({ status: 404, json: { detail: "会话不存在。" } });
    }
    if (parts[4] === "pin") {
      session.is_pinned = route.request().method() === "POST";
      return route.fulfill({ json: session });
    }
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      if (Object.hasOwn(body, "title")) session.title = body.title;
      if (Object.hasOwn(body, "project_id")) session.project_id = body.project_id;
      return route.fulfill({ json: session });
    }
    return route.fulfill({ json: session });
  });
  await page.route(/\/api\/sessions\/(\d+)\/runs$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    return route.fulfill({ json: state.runs[id] || [] });
  });
  await page.route("**/api/generate", async (route) => {
    const body = route.request().postData() || "";
    state.requestLog.push("generate");
    state.generateBodies.push(body);
    const sessionId = Number(
      body.match(/name="session_id"\r\n\r\n(\d+)/)?.[1] || 0,
    );
    if (overrides.generateFailure) {
      return route.abort("connectionfailed");
    }
    state.runs[sessionId] = [
      ...(state.runs[sessionId] || []),
      {
        id: state.nextRunId++,
        status: overrides.generateStatus || "succeeded",
        prompt: "夏季饮品海报",
        provider_name: "Default",
        model: "gpt-image-2",
        parameters: { ratio: "1:1", resolution: "standard", count: 1 },
        error_message:
          overrides.generateStatus === "failed" ? "上游服务超时" : null,
        images:
          overrides.generateStatus === "failed"
            ? []
            : [{ url: "/files/images/result.png", filename: "result.png" }],
      },
    ];
    return route.fulfill({
      json: {
        kind: "text_to_image",
        model: "gpt-image-2",
        size: "1024x1024",
        images: ["/files/images/result.png"],
      },
    });
  });
  await page.route("**/files/images/*.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: IMAGE_BYTES }),
  );
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:8765") {
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  });
  return state;
}

async function settleUi(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
}

module.exports = { installApiMocks, settleUi };
