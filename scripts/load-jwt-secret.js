/**
 * 供 deploy-pages-prod / deploy-pages-test 共用（同一密钥来源）。
 * 优先级：环境变量 JWT_SECRET > 项目根 .env.deploy.local（单行 JWT_SECRET=...）
 */
const fs = require("fs");
const path = require("path");

function unquote(v) {
  v = String(v || "").trim();
  if ((v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') || (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'")) {
    v = v.slice(1, -1);
  }
  return v;
}

function loadDeployVar(rootDir, name) {
  var fromEnv = String(process.env[name] || "").trim();
  if (fromEnv) return fromEnv;

  var envFile = path.join(rootDir, ".env.deploy.local");
  if (!fs.existsSync(envFile)) return "";

  var text = fs.readFileSync(envFile, "utf8");
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") continue;
    var eq = line.indexOf("=");
    if (eq <= 0) continue;
    var key = line.slice(0, eq).trim();
    if (key === name) {
      return unquote(line.slice(eq + 1));
    }
  }
  return "";
}

function loadJwtSecret(rootDir) {
  return loadDeployVar(rootDir, "JWT_SECRET");
}

module.exports = { loadDeployVar, loadJwtSecret };
