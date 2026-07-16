const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..", "frontend");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch (_error) {
    return null;
  }
  const relative = pathname === "/"
    ? "index.html"
    : pathname.replace(/^\/static\//, "/").replace(/^\/+/, "");
  const target = path.resolve(frontendRoot, relative);
  return target.startsWith(`${frontendRoot}${path.sep}`) ? target : null;
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  const target = resolveRequestPath(request.url);
  if (!target) {
    response.writeHead(403).end();
    return;
  }
  fs.stat(target, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(target)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(target).pipe(response);
  });
});

server.listen(8765, "127.0.0.1");
