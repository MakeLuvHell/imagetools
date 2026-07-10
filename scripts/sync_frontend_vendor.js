const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const lucideCjs = require.resolve("lucide");
const lucideRoot = path.resolve(path.dirname(lucideCjs), "../..");
const copies = [
  [
    path.join(lucideRoot, "dist/umd/lucide.min.js"),
    path.join(root, "frontend/vendor/lucide.min.js"),
  ],
  [
    path.join(lucideRoot, "LICENSE"),
    path.join(root, "frontend/vendor/LUCIDE_LICENSE"),
  ],
  [
    path.join(root, "src-tauri/icons/icon.png"),
    path.join(root, "frontend/assets/app-icon.png"),
  ],
];

for (const [source, target] of copies) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
