const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const themeSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "frontend", "theme.js"),
  "utf8",
);

async function startThemeServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/theme.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(themeSource);
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head>
          <script>window.__TAURI__ = { core: { invoke: async () => null } };</script>
          <script src="/theme.js"></script>
        </head>
        <body></body>
      </html>`);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test("Tauri theme preference survives a loopback port change before paint", async ({
  page,
}) => {
  const servers = [];
  try {
    servers.push(await startThemeServer());
    servers.push(await startThemeServer());

    await page.goto(servers[0].url);
    const saved = await page.evaluate(() =>
      window.ImageToolsTheme.saveMode(localStorage, "dark", document),
    );
    expect(saved).toEqual({ mode: "dark", error: "" });
    expect(
      await page.evaluate(() => localStorage.getItem("image-tools-theme")),
    ).toBe("dark");

    await page.goto(servers[1].url);
    expect(
      await page.evaluate(() => localStorage.getItem("image-tools-theme")),
    ).toBeNull();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => window.ImageToolsThemeBootstrap.mode)).toBe(
      "dark",
    );
  } finally {
    await Promise.allSettled(servers.map((server) => server.close()));
  }
});
