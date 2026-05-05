/**
 * 供 deploy-pages-prod / deploy-pages-test 共用（同一密钥来源）。
 * 优先级：环境变量 JWT_SECRET > 项目根 .env.deploy.local（单行 JWT_SECRET=...）
 */
const fs = require("fs");
const path = require("path");

function loadJwtSecret(rootDir) {
  var fromEnv = String(process.env.JWT_SECRET || "").trim();
  if (fromEnv) return fromEnv;

  var envFile = path.join(rootDir, ".env.deploy.local");
  if (!fs.existsSync(envFile)) return "";

  var text = fs.readFileSync(envFile, "utf8");
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") continue;
    var m = /^\s*JWT_SECRET\s*=\s*(.*)$/.exec(line);
    if (m) {
      var v = m[1].trim();
      if ((v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') || (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'")) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return "";
}

module.exports = { loadJwtSecret };
