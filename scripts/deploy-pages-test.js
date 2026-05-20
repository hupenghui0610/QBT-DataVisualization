/**
 * Deploy the Cloudflare Pages test project.
 * The test project's production branch is `test`; sensitive values are stored
 * as Pages secrets in Cloudflare, not injected into wrangler.toml.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const prodPath = path.join(root, "wrangler.toml");
const testPath = path.join(root, "wrangler.test.toml");
const backupPath = path.join(root, "wrangler.toml.deploy-backup");

if (!fs.existsSync(testPath)) {
  console.error("Missing wrangler.test.toml");
  process.exit(1);
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, prodPath);
    fs.unlinkSync(backupPath);
  }
}

process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

try {
  fs.copyFileSync(prodPath, backupPath);
  fs.copyFileSync(testPath, prodPath);

  const r = spawnSync(
    "npx",
    [
      "wrangler",
      "pages",
      "deploy",
      "dist",
      "--project-name=qbt-datavisualization-test",
      "--branch=test",
      "--commit-dirty=true",
    ],
    { stdio: "inherit", cwd: root, shell: true, env: process.env }
  );
  process.exitCode = r.status ?? 1;
} finally {
  restore();
}
