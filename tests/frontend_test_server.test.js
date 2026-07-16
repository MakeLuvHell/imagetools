const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function request(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port: 8765,
      path: pathname,
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try {
      if (await request("/") === 200) return;
    } catch (_error) {
      // The child has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("server did not start");
}

test("frontend test server rejects hostile paths and remains available", async () => {
  const child = spawn(process.execPath, ["scripts/serve_frontend_tests.js"], {
    cwd: root,
    stdio: "ignore",
  });
  try {
    await waitForServer(child);
    for (const pathname of ["/%00", "/%", "/%2e%2e%2fpackage.json", "/%2fetc/passwd"]) {
      const status = await request(pathname);
      assert.ok(status >= 400 && status < 500, `${pathname} returned ${status}`);
    }
    assert.equal(await request("/"), 200);
    assert.equal(child.exitCode, null);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
});
