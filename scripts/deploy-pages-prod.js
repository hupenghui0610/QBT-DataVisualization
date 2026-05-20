/**
 * Deploy the Cloudflare Pages production project.
 * Wrangler direct deploys do not reliably inherit Pages dashboard secrets in
 * this project, so production deploy injects required runtime secrets into a
 * temporary wrangler.toml and restores the checked-out file afterwards.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadDeployVar, loadJwtSecret } = require("./load-jwt-secret.js");

const root = path.join(__dirname, "..");
const wranglerPath = path.join(root, "wrangler.toml");
const backupPath = path.join(root, "wrangler.toml.deploy-backup");

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, wranglerPath);
    try {
      fs.unlinkSync(backupPath);
    } catch (e) {}
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
  fs.copyFileSync(wranglerPath, backupPath);

  var jwt = loadJwtSecret(root);
  if (!jwt) {
    console.error("未找到 JWT_SECRET：请设置环境变量，或在项目根创建 .env.deploy.local（见 .env.deploy.local.example）。");
    console.error("  PowerShell: $env:JWT_SECRET=\"你的密钥\"; npm run deploy");
    process.exit(1);
  }

  var feishuAuthSecret = loadDeployVar(root, "FEISHU_AUTH_APP_SECRET");
  var wranglerText = fs.readFileSync(wranglerPath, "utf8");
  if (/^\s*JWT_SECRET\s*=/m.test(wranglerText)) {
    console.error("wrangler.toml 中请勿提交 JWT_SECRET= 行，请删除后仅通过部署脚本临时注入。");
    process.exit(1);
  }
  wranglerText = wranglerText.replace(
    /^(\[vars\]\s*\n)/m,
    `$1JWT_SECRET = ${JSON.stringify(jwt)}\n` +
      (feishuAuthSecret ? `FEISHU_AUTH_APP_SECRET = ${JSON.stringify(feishuAuthSecret)}\n` : "")
  );
  fs.writeFileSync(wranglerPath, wranglerText);

  const r = spawnSync(
    "npx",
    [
      "wrangler",
      "pages",
      "deploy",
      "dist",
      "--project-name=qbt-datavisualization",
      "--branch=main",
      "--commit-dirty=true",
    ],
    { stdio: "inherit", cwd: root, shell: true, env: process.env }
  );
  process.exitCode = r.status ?? 1;
} finally {
  restore();
}
