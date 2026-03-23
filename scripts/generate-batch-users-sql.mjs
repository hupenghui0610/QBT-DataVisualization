/**
 * 为多名用户生成相同明文密码的独立 PBKDF2 哈希并输出 INSERT SQL（UTF-8）。
 * 用法: node scripts/generate-batch-users-sql.mjs [密码] [--out 路径.sql]
 * 勿将含明文的文件提交到仓库。
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var __dirname = path.dirname(fileURLToPath(import.meta.url));

var PBKDF2_ITERATIONS = 100000;
var PBKDF2_HASH_LEN = 32;

function bytesToHex(buf) {
  return Buffer.from(buf).toString('hex');
}

function hashPassword(plain) {
  var salt = crypto.randomBytes(16);
  var hash = crypto.pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_HASH_LEN, 'sha256');
  return 'pbkdf2$sha256$' + PBKDF2_ITERATIONS + '$' + bytesToHex(salt) + '$' + bytesToHex(hash);
}

function escSql(str) {
  return String(str).replace(/'/g, "''");
}

var args = process.argv.slice(2);
var outIdx = args.indexOf('--out');
var outPath = outIdx >= 0 && args[outIdx + 1] ? path.resolve(__dirname, '..', args[outIdx + 1]) : null;
if (outIdx >= 0) args.splice(outIdx, 2);
var plain = args[0] || 'xbs2026';

var rows = [
  ['邱澈', '15017590539'],
  ['陈伟', '13570031276'],
  ['陈勇辉', '15017552460'],
  ['黄倩', '13572014438'],
  ['林楷鹏', '13432066796'],
  ['潘潇', '13922793572'],
  ['徐海鹏', '18310611895'],
  ['张兵', '18665118810'],
  ['张紫媚', '15017517600'],
  ['郑广宇', '13450254044'],
  ['郑侠松', '18620229042'],
  ['朱新宇', '18122335512'],
];

var lines = [];
for (var i = 0; i < rows.length; i++) {
  var name = rows[i][0];
  var phone = rows[i][1];
  var h = hashPassword(plain);
  lines.push(
    "INSERT INTO users (name, phone, password_hash, token_version, is_admin) VALUES ('" +
      escSql(name) +
      "', '" +
      escSql(phone) +
      "', '" +
      escSql(h) +
      "', 0, 0);"
  );
}
var text = lines.join('\n') + '\n';
if (outPath) {
  fs.writeFileSync(outPath, text, { encoding: 'utf8' });
  console.error('已写入: ' + outPath);
} else {
  process.stdout.write(text);
}
