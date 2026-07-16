const { spawn } = require("node:child_process");

const args = process.argv.slice(2);

if (args.includes("--release")) {
  console.error("desktop:dev --release is not supported because it requires the bundled backend sidecar.");
  process.exitCode = 2;
} else {
  const tauri = process.platform === "win32" ? "tauri.cmd" : "tauri";
  const child = spawn(tauri, ["dev", ...args], {
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
