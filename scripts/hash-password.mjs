#!/usr/bin/env node
/**
 * 生成与 functions/_lib/crypto.js 一致的 PBKDF2 密码哈希，供 wrangler d1 execute 插入用户。
 * 用法: node scripts/hash-password.mjs "你的初始密码"
 * 勿将明文密码提交到仓库。
 */
import crypto from 'crypto';

var PBKDF2_ITERATIONS = 100000;
var PBKDF2_HASH_LEN = 32;

function bytesToHex(buf) {
  return Buffer.from(buf).toString('hex');
}

var pwd = process.argv[2];
if (!pwd || pwd.length < 1) {
  console.error('用法: node scripts/hash-password.mjs "<密码>"');
  process.exit(1);
}

var salt = crypto.randomBytes(16);
var hash = crypto.pbkdf2Sync(pwd, salt, PBKDF2_ITERATIONS, PBKDF2_HASH_LEN, 'sha256');
var stored = 'pbkdf2$sha256$' + PBKDF2_ITERATIONS + '$' + bytesToHex(salt) + '$' + bytesToHex(hash);
console.log(stored);
