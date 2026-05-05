/**
 * Cloudflare Pages 不支持 `wrangler -c` / `--env`，测试服部署前临时使用 wrangler.test.toml。
 * JWT_SECRET 与 deploy-pages-prod 同源（.env.deploy.local 或环境变量），本仓库约定正式与测试同一密钥；D1 仍用 wrangler.test.toml 中的测试库。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadJwtSecret } = require("./load-jwt-secret.js");

const root = path.join(__dirname, "..");
const prodPath = path.join(root, "wrangler.toml");
const testPath = path.join(root, "wrangler.test.toml");
const backupPath = path.join(root, "wrangler.toml.deploy-backup");

if (!fs.existsSync(testPath)) {
  console.error("缺少 wrangler.test.toml");
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

  // 仅通过 wrangler [vars] 注入时，CLI 部署的 Functions 才能稳定读到 JWT_SECRET；
  // `wrangler pages secret put` 的密钥在本项目直连部署场景下未进入 env（与 Dashboard 行为不一致）。
  var jwt = loadJwtSecret(root);
  if (!jwt) {
    console.error(
      "未找到 JWT_SECRET：请设置环境变量，或在项目根创建 .env.deploy.local（见 .env.deploy.local.example）。"
    );
    console.error(
      "  PowerShell: $env:JWT_SECRET=\"你的密钥\"; npm run deploy:test"
    );
    console.error(
      "说明：Cloudflare 不提供「导出已保存 Secret」的接口，无法从正式服自动读取明文，只能从团队备份或密码库复制。"
    );
    process.exit(1);
  }
  var wranglerText = fs.readFileSync(prodPath, "utf8");
  if (/^\s*JWT_SECRET\s*=/m.test(wranglerText)) {
    console.error(
      "wrangler.test.toml 中请勿手写 JWT_SECRET= 行，请删除后仅通过环境变量注入。"
    );
    process.exit(1);
  }
  wranglerText = wranglerText.replace(
    /^(\[vars\]\s*\n)/m,
    `$1JWT_SECRET = ${JSON.stringify(jwt)}\n`
  );
  fs.writeFileSync(prodPath, wranglerText);

  const r = spawnSync(
    "npx",
    [
      "wrangler",
      "pages",
      "deploy",
      "dist",
      "--project-name=qbt-datavisualization-test",
      "--branch=main",
      "--commit-dirty=true",
    ],
    { stdio: "inherit", cwd: root, shell: true, env: process.env }
  );
  process.exitCode = r.status ?? 1;
} finally {
  restore();
}
