/**
 * 正式服 Cloudflare Pages：prepare-dist 之后由本脚本部署。
 * CLI 直连部署时，Dashboard 里的 Secret 往往不会注入到 Functions env，与测试服相同需通过 [vars] 注入 JWT_SECRET。
 *
 * 部署前任选其一：PowerShell 设置 $env:JWT_SECRET="与线上一致的密钥"；
 * 或在项目根创建 .env.deploy.local（已 gitignore），单行：JWT_SECRET=你的密钥（与 deploy:test 共用同一文件、同一密钥）
 *
 * 若报错 “Binding name 'JWT_SECRET' already in use”：说明控制台仍配置了同名 Secret，
 * 请在 Workers & Pages → qbt-datavisualization → Settings → Variables and Secrets 中删除 JWT_SECRET（Secret），
 * 仅保留本脚本通过环境变量写入 [vars] 的方式（删除后重新部署一次即可）。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadJwtSecret } = require("./load-jwt-secret.js");

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
    console.error("  PowerShell: $env:JWT_SECRET=\"你的密钥\"; npm run deploy:prod");
    console.error("密钥须与线上一致（团队密码库）；Cloudflare 无法导出已保存的 Secret 明文。");
    process.exit(1);
  }

  var wranglerText = fs.readFileSync(wranglerPath, "utf8");
  if (/^\s*JWT_SECRET\s*=/m.test(wranglerText)) {
    console.error("wrangler.toml 中请勿提交 JWT_SECRET= 行，请删除后仅通过环境变量注入。");
    process.exit(1);
  }
  wranglerText = wranglerText.replace(
    /^(\[vars\]\s*\n)/m,
    `$1JWT_SECRET = ${JSON.stringify(jwt)}\n`
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
