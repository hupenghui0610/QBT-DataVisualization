var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// _lib/http.js
function jsonResponse(data, status, corsOrigin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(corsOrigin)
    }
  });
}
function corsHeaders(origin) {
  var o = origin || "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
function getBearer(request) {
  var h = request.headers.get("Authorization") || "";
  var m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
var init_http = __esm({
  "_lib/http.js"() {
    init_functionsRoutes_0_43621812355026957();
    __name(jsonResponse, "jsonResponse");
    __name(corsHeaders, "corsHeaders");
    __name(getBearer, "getBearer");
  }
});

// _lib/crypto.js
function bytesToHex(u8) {
  return [...u8].map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToBase64Url(buf) {
  var bin = "";
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  var bin = atob(s);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hashPassword(plain) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, ["deriveBits"]);
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_HASH_LEN * 8
  );
  return "pbkdf2$sha256$" + PBKDF2_ITERATIONS + "$" + bytesToHex(salt) + "$" + bytesToHex(new Uint8Array(bits));
}
async function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== "string") return false;
  var parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  var iterations = parseInt(parts[2], 10);
  if (iterations !== PBKDF2_ITERATIONS) return false;
  var salt = hexToBytes(parts[3]);
  var expected = hexToBytes(parts[4]);
  if (expected.length !== PBKDF2_HASH_LEN) return false;
  var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, ["deriveBits"]);
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_HASH_LEN * 8
  );
  var got = new Uint8Array(bits);
  if (got.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}
function jsonToBase64Url(obj) {
  return bytesToBase64Url(enc.encode(JSON.stringify(obj)));
}
async function signJwt(payload, secret) {
  var header = { alg: "HS256", typ: "JWT" };
  var h = jsonToBase64Url(header);
  var p = jsonToBase64Url(payload);
  var data = enc.encode(h + "." + p);
  var key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  var sig = await crypto.subtle.sign("HMAC", key, data);
  return h + "." + p + "." + bytesToBase64Url(new Uint8Array(sig));
}
async function verifyJwt(token, secret) {
  var parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("invalid_token");
  var data = enc.encode(parts[0] + "." + parts[1]);
  var sig = base64UrlToBytes(parts[2]);
  var key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  var ok = await crypto.subtle.verify("HMAC", key, sig, data);
  if (!ok) throw new Error("bad_sig");
  var payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  var now = Math.floor(Date.now() / 1e3);
  if (payload.exp != null && now > payload.exp) throw new Error("expired");
  return payload;
}
var PBKDF2_ITERATIONS, PBKDF2_HASH_LEN, JWT_EXP_SECONDS, enc;
var init_crypto = __esm({
  "_lib/crypto.js"() {
    init_functionsRoutes_0_43621812355026957();
    PBKDF2_ITERATIONS = 1e5;
    PBKDF2_HASH_LEN = 32;
    JWT_EXP_SECONDS = 30 * 24 * 60 * 60;
    enc = new TextEncoder();
    __name(bytesToHex, "bytesToHex");
    __name(hexToBytes, "hexToBytes");
    __name(bytesToBase64Url, "bytesToBase64Url");
    __name(base64UrlToBytes, "base64UrlToBytes");
    __name(hashPassword, "hashPassword");
    __name(verifyPassword, "verifyPassword");
    __name(jsonToBase64Url, "jsonToBase64Url");
    __name(signJwt, "signJwt");
    __name(verifyJwt, "verifyJwt");
  }
});

// _lib/session.js
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    is_admin: !!row.is_admin
  };
}
async function authenticateRequest(request, env) {
  var origin = request.headers.get("Origin") || void 0;
  var secret = env.JWT_SECRET;
  if (!secret) {
    return { error: jsonResponse({ error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E JWT_SECRET" }, 500, origin) };
  }
  var token = getBearer(request);
  if (!token) {
    return { error: jsonResponse({ error: "\u672A\u767B\u5F55" }, 401, origin) };
  }
  var payload;
  try {
    payload = await verifyJwt(token, secret);
  } catch (e) {
    return { error: jsonResponse({ error: "\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" }, 401, origin) };
  }
  var uid = payload.sub;
  if (uid == null) {
    return { error: jsonResponse({ error: "\u65E0\u6548\u4EE4\u724C" }, 401, origin) };
  }
  var row = await env.DB.prepare(
    "SELECT id, name, phone, password_hash, token_version, is_admin, created_at FROM users WHERE id = ?"
  ).bind(uid).first();
  if (!row) {
    return { error: jsonResponse({ error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 401, origin) };
  }
  var tv = payload.tv;
  if (tv !== row.token_version) {
    return { error: jsonResponse({ error: "\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" }, 401, origin) };
  }
  return { user: publicUser(row), row };
}
function utcIsoMinute() {
  var d = /* @__PURE__ */ new Date();
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
}
var init_session = __esm({
  "_lib/session.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_crypto();
    init_http();
    __name(publicUser, "publicUser");
    __name(authenticateRequest, "authenticateRequest");
    __name(utcIsoMinute, "utcIsoMinute");
    __name(clientIp, "clientIp");
  }
});

// api/admin/access-logs.js
async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: "\u65E0\u6743\u8BBF\u95EE" }, 403, origin);
  }
  var url = new URL(request.url);
  var limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 500);
  var offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
  var countRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM access_logs").first();
  var total = 0;
  if (countRow && countRow.n != null) {
    total = typeof countRow.n === "number" ? countRow.n : parseInt(String(countRow.n), 10) || 0;
  }
  var rows = await env.DB.prepare(
    `SELECT a.id, a.user_id, a.accessed_at, a.city, a.country, a.client_ip,
            u.name AS user_name, u.phone AS user_phone
     FROM access_logs a
     JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return jsonResponse({ rows: rows.results || [], total }, 200, origin);
}
async function onRequestOptions(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_access_logs = __esm({
  "api/admin/access-logs.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    __name(onRequestGet, "onRequestGet");
    __name(onRequestOptions, "onRequestOptions");
  }
});

// api/admin/login-security-events.js
async function onRequestGet2(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: "\u65E0\u6743\u8BBF\u95EE" }, 403, origin);
  }
  var url = new URL(request.url);
  var limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  var offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
  var countRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_security_events").first();
  var total = 0;
  if (countRow && countRow.n != null) {
    total = typeof countRow.n === "number" ? countRow.n : parseInt(String(countRow.n), 10) || 0;
  }
  var rows = await env.DB.prepare(
    `SELECT id, scope_type, scope_key, event_type, phone, user_id, client_ip, meta_json, created_at
     FROM login_security_events
     ORDER BY id DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return jsonResponse({ rows: rows.results || [], total }, 200, origin);
}
async function onRequestOptions2(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_login_security_events = __esm({
  "api/admin/login-security-events.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    __name(onRequestGet2, "onRequestGet");
    __name(onRequestOptions2, "onRequestOptions");
  }
});

// api/admin/users.js
async function onRequestGet3(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: "\u65E0\u6743\u8BBF\u95EE" }, 403, origin);
  }
  var res = await env.DB.prepare(
    "SELECT id, name, phone, is_admin, created_at FROM users ORDER BY id ASC"
  ).all();
  var rows = (res.results || []).map(function(r) {
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      is_admin: !!r.is_admin,
      created_at: r.created_at
    };
  });
  return jsonResponse({ users: rows }, 200, origin);
}
async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: "\u65E0\u6743\u64CD\u4F5C" }, 403, origin);
  }
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF" }, 400, origin);
  }
  var name = typeof body.name === "string" ? body.name.trim() : "";
  var phone = typeof body.phone === "string" ? body.phone.trim() : "";
  var password = typeof body.password === "string" ? body.password : "";
  if (!name || !phone || !password) {
    return jsonResponse({ error: "\u8BF7\u586B\u5199\u59D3\u540D\u3001\u8D26\u53F7\u4E0E\u521D\u59CB\u5BC6\u7801" }, 400, origin);
  }
  if (password.length < 6) {
    return jsonResponse({ error: "\u521D\u59CB\u5BC6\u7801\u81F3\u5C11 6 \u4F4D" }, 400, origin);
  }
  if (!/^1\d{10}$/.test(phone)) {
    return jsonResponse({ error: "\u8D26\u53F7\u9700\u4E3A 11 \u4F4D\u624B\u673A\u53F7" }, 400, origin);
  }
  var dup = await env.DB.prepare("SELECT id FROM users WHERE phone = ?").bind(phone).first();
  if (dup) {
    return jsonResponse({ error: "\u8BE5\u624B\u673A\u53F7\u5DF2\u5B58\u5728" }, 409, origin);
  }
  var pwdHash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (name, phone, password_hash, token_version, is_admin) VALUES (?, ?, ?, 0, 0)").bind(name, phone, pwdHash).run();
  var row = await env.DB.prepare("SELECT id, name, phone, is_admin, created_at FROM users WHERE phone = ?").bind(phone).first();
  return jsonResponse({ ok: true, user: row ? publicUser(row) : null }, 200, origin);
}
async function onRequestOptions3(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_users = __esm({
  "api/admin/users.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_crypto();
    init_http();
    init_session();
    __name(onRequestGet3, "onRequestGet");
    __name(onRequestPost, "onRequestPost");
    __name(onRequestOptions3, "onRequestOptions");
  }
});

// api/auth/change-password.js
async function onRequestPost2(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF" }, 400, origin);
  }
  var oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
  var newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!oldPassword || !newPassword) {
    return jsonResponse({ error: "\u8BF7\u586B\u5199\u539F\u5BC6\u7801\u548C\u65B0\u5BC6\u7801" }, 400, origin);
  }
  if (newPassword.length < 6) {
    return jsonResponse({ error: "\u65B0\u5BC6\u7801\u81F3\u5C11 6 \u4F4D" }, 400, origin);
  }
  var okOld = await verifyPassword(oldPassword, auth.row.password_hash);
  if (!okOld) {
    return jsonResponse({ error: "\u539F\u5BC6\u7801\u9519\u8BEF" }, 401, origin);
  }
  var newHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").bind(newHash, auth.row.id).run();
  return jsonResponse({ ok: true, message: "\u5BC6\u7801\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" }, 200, origin);
}
async function onRequestOptions4(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_change_password = __esm({
  "api/auth/change-password.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_crypto();
    init_http();
    init_session();
    __name(onRequestPost2, "onRequestPost");
    __name(onRequestOptions4, "onRequestOptions");
  }
});

// _lib/login-security.js
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function addMinutes(iso, minutes) {
  var d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}
function laterIso(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return a > b ? a : b;
}
async function sleepMs(ms) {
  if (!ms || ms <= 0) return;
  await new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}
function loginScopeKeyForIp(request) {
  return String(clientIp(request) || "").trim() || "unknown";
}
async function recordSecurityEvent(env, payload) {
  var metaJson = payload.meta ? JSON.stringify(payload.meta) : null;
  return env.DB.prepare(
    "INSERT INTO login_security_events (scope_type, scope_key, event_type, phone, user_id, client_ip, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    payload.scopeType,
    payload.scopeKey,
    payload.eventType,
    payload.phone || null,
    payload.userId != null ? payload.userId : null,
    payload.clientIp || null,
    metaJson,
    payload.createdAt || nowIso()
  ).run();
}
async function getActiveBlock(env, scopeType, scopeKey, now) {
  var row = await env.DB.prepare(
    "SELECT scope_type, scope_key, blocked_until, reason FROM login_security_blocks WHERE scope_type = ? AND scope_key = ? AND blocked_until > ? LIMIT 1"
  ).bind(scopeType, scopeKey, now || nowIso()).first();
  return row || null;
}
async function upsertBlock(env, scopeType, scopeKey, blockedUntil, reason, now) {
  var ts = now || nowIso();
  await env.DB.prepare(
    "INSERT INTO login_security_blocks (scope_type, scope_key, blocked_until, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(scope_type, scope_key) DO UPDATE SET blocked_until = excluded.blocked_until, reason = excluded.reason, updated_at = excluded.updated_at"
  ).bind(scopeType, scopeKey, blockedUntil, reason || null, ts, ts).run();
}
async function clearBlock(env, scopeType, scopeKey) {
  await env.DB.prepare("DELETE FROM login_security_blocks WHERE scope_type = ? AND scope_key = ?").bind(scopeType, scopeKey).run();
}
async function getLatestSuccessAt(env, phone) {
  if (!phone) return "";
  var row = await env.DB.prepare(
    "SELECT created_at FROM login_security_events WHERE scope_type = 'account' AND scope_key = ? AND event_type = 'login_success' ORDER BY created_at DESC LIMIT 1"
  ).bind(phone).first();
  return row && row.created_at || "";
}
async function countRecentAccountFailures(env, phone, windowMinutes, now) {
  if (!phone) return 0;
  var current = now || nowIso();
  var windowStart = addMinutes(current, -windowMinutes);
  var lastSuccessAt = await getLatestSuccessAt(env, phone);
  var effectiveStart = laterIso(windowStart, lastSuccessAt);
  var row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM login_security_events WHERE scope_type = 'account' AND scope_key = ? AND event_type = 'login_failed' AND created_at >= ?"
  ).bind(phone, effectiveStart).first();
  return row && typeof row.c === "number" ? row.c : Number(row && row.c || 0);
}
async function countRecentIpFailures(env, ip, windowMinutes, now) {
  if (!ip) return 0;
  var current = now || nowIso();
  var windowStart = addMinutes(current, -windowMinutes);
  var row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM login_security_events WHERE scope_type = 'ip' AND scope_key = ? AND event_type = 'login_failed' AND created_at >= ?"
  ).bind(ip, windowStart).first();
  return row && typeof row.c === "number" ? row.c : Number(row && row.c || 0);
}
async function registerFailedLogin(env, request, phone, userId) {
  var now = nowIso();
  var ip = loginScopeKeyForIp(request);
  if (phone) {
    await recordSecurityEvent(env, {
      scopeType: "account",
      scopeKey: phone,
      eventType: "login_failed",
      phone,
      userId,
      clientIp: ip,
      createdAt: now
    });
  }
  await recordSecurityEvent(env, {
    scopeType: "ip",
    scopeKey: ip,
    eventType: "login_failed",
    phone: phone || null,
    userId,
    clientIp: ip,
    createdAt: now
  });
  var accountShortCount = phone ? await countRecentAccountFailures(env, phone, ACCOUNT_FAIL_SHORT_WINDOW_MIN, now) : 0;
  var accountLongCount = phone ? await countRecentAccountFailures(env, phone, ACCOUNT_FAIL_LONG_WINDOW_MIN, now) : 0;
  var ipCount = await countRecentIpFailures(env, ip, IP_FAIL_WINDOW_MIN, now);
  var accountLockedUntil = "";
  if (phone && accountLongCount >= ACCOUNT_FAIL_LONG_LIMIT) {
    accountLockedUntil = addMinutes(now, ACCOUNT_FAIL_LONG_LOCK_MIN);
    await upsertBlock(env, "account", phone, accountLockedUntil, "account_fail_long", now);
    await recordSecurityEvent(env, {
      scopeType: "account",
      scopeKey: phone,
      eventType: "account_locked",
      phone,
      userId,
      clientIp: ip,
      createdAt: now,
      meta: { rule: "20m_5x", blockedUntil: accountLockedUntil }
    });
  } else if (phone && accountShortCount >= ACCOUNT_FAIL_SHORT_LIMIT) {
    accountLockedUntil = addMinutes(now, ACCOUNT_FAIL_SHORT_LOCK_MIN);
    await upsertBlock(env, "account", phone, accountLockedUntil, "account_fail_short", now);
    await recordSecurityEvent(env, {
      scopeType: "account",
      scopeKey: phone,
      eventType: "account_locked",
      phone,
      userId,
      clientIp: ip,
      createdAt: now,
      meta: { rule: "10m_3x", blockedUntil: accountLockedUntil }
    });
  }
  var ipBlockedUntil = "";
  if (ipCount >= IP_FAIL_LIMIT) {
    ipBlockedUntil = addMinutes(now, IP_FAIL_LOCK_MIN);
    await upsertBlock(env, "ip", ip, ipBlockedUntil, "ip_fail_window", now);
    await recordSecurityEvent(env, {
      scopeType: "ip",
      scopeKey: ip,
      eventType: "ip_blocked",
      phone: phone || null,
      userId,
      clientIp: ip,
      createdAt: now,
      meta: { rule: "10m_20x", blockedUntil: ipBlockedUntil }
    });
  }
  return {
    now,
    accountShortCount,
    accountLongCount,
    ipCount,
    accountLockedUntil,
    ipBlockedUntil
  };
}
async function registerSuccessfulLogin(env, request, row) {
  var now = nowIso();
  var ip = loginScopeKeyForIp(request);
  await clearBlock(env, "account", row.phone);
  await recordSecurityEvent(env, {
    scopeType: "account",
    scopeKey: row.phone,
    eventType: "login_success",
    phone: row.phone,
    userId: row.id,
    clientIp: ip,
    createdAt: now
  });
  await recordSecurityEvent(env, {
    scopeType: "ip",
    scopeKey: ip,
    eventType: "login_success",
    phone: row.phone,
    userId: row.id,
    clientIp: ip,
    createdAt: now
  });
}
async function getCurrentLoginRestrictions(env, request, phone) {
  var now = nowIso();
  var ip = loginScopeKeyForIp(request);
  return {
    now,
    ip,
    accountBlock: phone ? await getActiveBlock(env, "account", phone, now) : null,
    ipBlock: await getActiveBlock(env, "ip", ip, now)
  };
}
function failedLoginDelayMs(accountShortCount, ipCount) {
  var step = Math.max(Number(accountShortCount) || 0, Number(ipCount) || 0);
  if (step < 3) return 0;
  if (step === 3) return 1e3;
  if (step === 4) return 2e3;
  return 4e3;
}
var ACCOUNT_FAIL_SHORT_WINDOW_MIN, ACCOUNT_FAIL_SHORT_LIMIT, ACCOUNT_FAIL_SHORT_LOCK_MIN, ACCOUNT_FAIL_LONG_WINDOW_MIN, ACCOUNT_FAIL_LONG_LIMIT, ACCOUNT_FAIL_LONG_LOCK_MIN, IP_FAIL_WINDOW_MIN, IP_FAIL_LIMIT, IP_FAIL_LOCK_MIN;
var init_login_security = __esm({
  "_lib/login-security.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_session();
    ACCOUNT_FAIL_SHORT_WINDOW_MIN = 10;
    ACCOUNT_FAIL_SHORT_LIMIT = 3;
    ACCOUNT_FAIL_SHORT_LOCK_MIN = 5;
    ACCOUNT_FAIL_LONG_WINDOW_MIN = 20;
    ACCOUNT_FAIL_LONG_LIMIT = 5;
    ACCOUNT_FAIL_LONG_LOCK_MIN = 15;
    IP_FAIL_WINDOW_MIN = 10;
    IP_FAIL_LIMIT = 20;
    IP_FAIL_LOCK_MIN = 30;
    __name(nowIso, "nowIso");
    __name(addMinutes, "addMinutes");
    __name(laterIso, "laterIso");
    __name(sleepMs, "sleepMs");
    __name(loginScopeKeyForIp, "loginScopeKeyForIp");
    __name(recordSecurityEvent, "recordSecurityEvent");
    __name(getActiveBlock, "getActiveBlock");
    __name(upsertBlock, "upsertBlock");
    __name(clearBlock, "clearBlock");
    __name(getLatestSuccessAt, "getLatestSuccessAt");
    __name(countRecentAccountFailures, "countRecentAccountFailures");
    __name(countRecentIpFailures, "countRecentIpFailures");
    __name(registerFailedLogin, "registerFailedLogin");
    __name(registerSuccessfulLogin, "registerSuccessfulLogin");
    __name(getCurrentLoginRestrictions, "getCurrentLoginRestrictions");
    __name(failedLoginDelayMs, "failedLoginDelayMs");
  }
});

// api/auth/login.js
async function onRequestPost3(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  if (!env.JWT_SECRET) {
    return jsonResponse({ error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E JWT_SECRET" }, 500, origin);
  }
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF" }, 400, origin);
  }
  var phone = typeof body.phone === "string" ? body.phone.trim() : "";
  var password = typeof body.password === "string" ? body.password : "";
  if (!phone || !password) {
    return jsonResponse({ error: "\u8BF7\u8F93\u5165\u624B\u673A\u53F7\u548C\u5BC6\u7801" }, 400, origin);
  }
  var restrictions = await getCurrentLoginRestrictions(env, request, phone);
  if (restrictions.ipBlock) {
    await recordSecurityEvent(env, {
      scopeType: "ip",
      scopeKey: restrictions.ip,
      eventType: "login_rejected",
      phone,
      clientIp: restrictions.ip,
      createdAt: restrictions.now,
      meta: { reason: "ip_blocked" }
    });
    return jsonResponse({ error: "\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }, 429, origin);
  }
  if (restrictions.accountBlock) {
    await recordSecurityEvent(env, {
      scopeType: "account",
      scopeKey: phone,
      eventType: "login_rejected",
      phone,
      clientIp: restrictions.ip,
      createdAt: restrictions.now,
      meta: { reason: "account_locked" }
    });
    return jsonResponse({ error: "\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }, 429, origin);
  }
  var row = await env.DB.prepare(
    "SELECT id, name, phone, password_hash, token_version, is_admin FROM users WHERE phone = ?"
  ).bind(phone).first();
  if (!row) {
    var missingResult = await registerFailedLogin(env, request, phone, null);
    await sleepMs(failedLoginDelayMs(missingResult.accountShortCount, missingResult.ipCount));
    return jsonResponse({ error: "\u8D26\u53F7\u6216\u5BC6\u7801\u9519\u8BEF" }, 401, origin);
  }
  var ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    var failedResult = await registerFailedLogin(env, request, row.phone, row.id);
    await sleepMs(failedLoginDelayMs(failedResult.accountShortCount, failedResult.ipCount));
    if (failedResult.accountLockedUntil || failedResult.ipBlockedUntil) {
      return jsonResponse({ error: "\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }, 429, origin);
    }
    return jsonResponse({ error: "\u8D26\u53F7\u6216\u5BC6\u7801\u9519\u8BEF" }, 401, origin);
  }
  await registerSuccessfulLogin(env, request, row);
  var now = Math.floor(Date.now() / 1e3);
  var token = await signJwt(
    {
      sub: row.id,
      phone: row.phone,
      name: row.name,
      adm: row.is_admin ? 1 : 0,
      tv: row.token_version,
      iat: now,
      exp: now + JWT_EXP_SECONDS
    },
    env.JWT_SECRET
  );
  return jsonResponse({ token, user: publicUser(row) }, 200, origin);
}
async function onRequestOptions5(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_login = __esm({
  "api/auth/login.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_crypto();
    init_http();
    init_session();
    init_login_security();
    __name(onRequestPost3, "onRequestPost");
    __name(onRequestOptions5, "onRequestOptions");
  }
});

// api/auth/ping.js
async function onRequestPost4(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  var cf = request.cf || {};
  var city = cf.city || "";
  var country = cf.country || "";
  var ip = clientIp(request);
  var userName = String(auth.row && auth.row.name || "").trim();
  if (userName !== "\u80E1\u9E4F\u8F89") {
    var normalizedIp = String(ip || "");
    var cutoff = new Date(Date.now() - 4 * 60 * 60 * 1e3);
    cutoff.setUTCSeconds(0, 0);
    var cutoffIso = cutoff.toISOString();
    var exists = await env.DB.prepare(
      "SELECT 1 AS ok FROM access_logs WHERE user_id = ? AND IFNULL(client_ip, '') = ? AND accessed_at >= ? LIMIT 1"
    ).bind(auth.row.id, normalizedIp, cutoffIso).first();
    if (!exists) {
      var accessedAt = utcIsoMinute();
      await env.DB.prepare(
        "INSERT INTO access_logs (user_id, accessed_at, city, country, client_ip) VALUES (?, ?, ?, ?, ?)"
      ).bind(auth.row.id, accessedAt, city || null, country || null, normalizedIp || null).run();
    }
  }
  return jsonResponse({ ok: true, user: auth.user }, 200, origin);
}
async function onRequestOptions6(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_ping = __esm({
  "api/auth/ping.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    __name(onRequestPost4, "onRequestPost");
    __name(onRequestOptions6, "onRequestOptions");
  }
});

// _lib/feishu.js
async function getFeishuTenantToken(env) {
  var appId = env.FEISHU_APP_ID;
  var appSecret = env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("FEISHU_NOT_CONFIGURED");
  }
  var now = Date.now();
  if (tokenCache.token && tokenCache.expireAtMs > now + 6e4) {
    return tokenCache.token;
  }
  var res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: String(appId), app_secret: String(appSecret) })
  });
  var json = await res.json();
  if (json.code !== 0) {
    var err = new Error(json.msg || "feishu_tenant_token_failed");
    err.feishuCode = json.code;
    throw err;
  }
  var token = json.tenant_access_token;
  var expireSec = typeof json.expire === "number" ? json.expire : 7200;
  tokenCache.token = token;
  tokenCache.expireAtMs = now + Math.max(60, expireSec - 120) * 1e3;
  return token;
}
async function fetchSheetValuesV2(env, spreadsheetToken, range, options) {
  var accessToken = await getFeishuTenantToken(env);
  var pathToken = encodeURIComponent(spreadsheetToken);
  var pathRange = encodeURIComponent(range);
  var qs = "";
  if (options && options.valueRenderOption) {
    var vro = encodeURIComponent(String(options.valueRenderOption));
    qs = "?value_render_option=" + vro + "&valueRenderOption=" + vro;
  }
  var url = "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/" + pathToken + "/values/" + pathRange + qs;
  var res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
  var json = await res.json();
  return json;
}
async function fetchSpreadsheetSheetsV3(env, spreadsheetToken) {
  var accessToken = await getFeishuTenantToken(env);
  var pathToken = encodeURIComponent(spreadsheetToken);
  var url = "https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/" + pathToken + "/sheets/query";
  var res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
  var json = await res.json();
  return json;
}
var tokenCache;
var init_feishu = __esm({
  "_lib/feishu.js"() {
    init_functionsRoutes_0_43621812355026957();
    tokenCache = { token: null, expireAtMs: 0 };
    __name(getFeishuTenantToken, "getFeishuTenantToken");
    __name(fetchSheetValuesV2, "fetchSheetValuesV2");
    __name(fetchSpreadsheetSheetsV3, "fetchSpreadsheetSheetsV3");
  }
});

// ../shared/industry-data-builder.cjs
var require_industry_data_builder = __commonJS({
  "../shared/industry-data-builder.cjs"(exports, module) {
    init_functionsRoutes_0_43621812355026957();
    var FIXED_TOP_BRANDS = [
      "\u5B66\u800C\u601D",
      "\u79D1\u5927\u8BAF\u98DE",
      "\u4F5C\u4E1A\u5E2E",
      "\u5C0F\u733F",
      "\u5C0F\u5EA6",
      "BBK/\u6B65\u6B65\u9AD8",
      "SEEWO/\u5E0C\u6C83",
      "BOE/\u4EAC\u4E1C\u65B9",
      "\u6E05\u5317\u9053\u8FDC",
      "\u667A\u80FD\u7CBE\u51C6\u5B66"
    ];
    function isPriceSegment01k(seg) {
      const s = String(seg == null ? "" : seg).trim().toLowerCase();
      return s === "0-1k";
    }
    __name(isPriceSegment01k, "isPriceSegment01k");
    function canonicalBrandKey(name) {
      return String(name || "").trim().toLowerCase().replace(/[\/／&＆()（）\-\s·.]+/g, "");
    }
    __name(canonicalBrandKey, "canonicalBrandKey");
    function normalizeBrand(name) {
      const s = String(name || "").trim();
      if (!s) return "";
      const key = canonicalBrandKey(s);
      const aliasRules = [
        { brand: "\u5B66\u800C\u601D", keys: ["\u5B66\u800C\u601D"] },
        { brand: "\u79D1\u5927\u8BAF\u98DE", keys: ["\u79D1\u5927\u8BAF\u98DE", "\u8BAF\u98DE"] },
        { brand: "\u4F5C\u4E1A\u5E2E", keys: ["\u4F5C\u4E1A\u5E2E"] },
        { brand: "\u5C0F\u733F", keys: ["\u5C0F\u733F"] },
        { brand: "\u5C0F\u5EA6", keys: ["\u5C0F\u5EA6"] },
        { brand: "BBK/\u6B65\u6B65\u9AD8", keys: ["bbk\u6B65\u6B65\u9AD8", "\u6B65\u6B65\u9AD8", "bbk"] },
        { brand: "SEEWO/\u5E0C\u6C83", keys: ["seewo\u5E0C\u6C83", "\u5E0C\u6C83", "seewo"] },
        { brand: "BOE/\u4EAC\u4E1C\u65B9", keys: ["boe\u4EAC\u4E1C\u65B9", "\u4EAC\u4E1C\u65B9", "boe"] },
        { brand: "\u6E05\u5317\u9053\u8FDC", keys: ["\u6E05\u5317\u9053\u8FDC"] },
        { brand: "\u667A\u80FD\u7CBE\u51C6\u5B66", keys: ["\u667A\u80FD\u7CBE\u51C6\u5B66", "\u7CBE\u51C6\u5B66"] }
      ];
      for (const rule of aliasRules) {
        if (rule.keys.some((alias) => key === alias || key.includes(alias) || alias.includes(key))) {
          return rule.brand;
        }
      }
      return s;
    }
    __name(normalizeBrand, "normalizeBrand");
    function parseNumberCell2(v) {
      if (v == null || v === "") return 0;
      if (typeof v === "number" && isFinite(v)) return v;
      const s = String(v).replace(/[,，\s\u00a0]/g, "");
      const wan = s.match(/^(-?[\d.]+)\s*万$/);
      if (wan) {
        const n2 = parseFloat(wan[1]);
        return isFinite(n2) ? n2 * 1e4 : 0;
      }
      const n = parseFloat(s);
      return isFinite(n) ? n : 0;
    }
    __name(parseNumberCell2, "parseNumberCell");
    function excelDateToStr(serial) {
      if (typeof serial === "number" && isFinite(serial)) {
        const utcDays = Math.floor(serial - 25569);
        const d = new Date(utcDays * 86400 * 1e3);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      const raw = String(serial == null ? "" : serial).trim();
      if (!raw) return "";
      const normalized = raw.replace(/[./]/g, "-");
      const match2 = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (match2) {
        return `${match2[1]}-${String(match2[2]).padStart(2, "0")}-${String(match2[3]).padStart(2, "0")}`;
      }
      return raw.slice(0, 10);
    }
    __name(excelDateToStr, "excelDateToStr");
    function hasAnyValue(row) {
      return Array.isArray(row) && row.some((v) => v != null && String(v).trim() !== "");
    }
    __name(hasAnyValue, "hasAnyValue");
    function parseDaPanRowsFromValues(values) {
      const header = Array.isArray(values) && values.length ? values[0] : [];
      let rows = (values || []).slice(1).filter(hasAnyValue).map((r) => ({
        \u6E20\u9053: r[0],
        \u4EF7\u683C\u6BB5: r[1],
        \u65E5\u671F: r[2],
        \u65E5\u671F_str: excelDateToStr(r[2]),
        \u9500\u91CF: parseNumberCell2(r[3]),
        \u9500\u552E\u989D: parseNumberCell2(r[4])
      })).filter((r) => r.\u6E20\u9053 || r.\u4EF7\u683C\u6BB5 || r.\u65E5\u671F_str || r.\u9500\u91CF || r.\u9500\u552E\u989D);
      rows = rows.filter((r) => !isPriceSegment01k(r.\u4EF7\u683C\u6BB5));
      return { header, rows };
    }
    __name(parseDaPanRowsFromValues, "parseDaPanRowsFromValues");
    function parseBrandRowsFromValues(values) {
      const header = (values && values[0] || []).map((h) => String(h || "").trim());
      const hasCategory = header.includes("\u7C7B\u76EE\u540D\u79F0");
      const col = hasCategory ? { \u6E20\u9053: 0, \u54C1\u724C: 2, \u4EF7\u683C\u6BB5: 3, \u65E5\u671F: 4, \u9500\u91CF: 5, \u9500\u552E\u989D: 6 } : { \u6E20\u9053: 0, \u54C1\u724C: 1, \u4EF7\u683C\u6BB5: 2, \u65E5\u671F: 3, \u9500\u91CF: 4, \u9500\u552E\u989D: 5 };
      let rows = (values || []).slice(1).filter(hasAnyValue).map((r) => ({
        \u6E20\u9053: r[col.\u6E20\u9053],
        \u54C1\u724C: normalizeBrand(r[col.\u54C1\u724C]),
        \u4EF7\u683C\u6BB5: r[col.\u4EF7\u683C\u6BB5],
        \u65E5\u671F: r[col.\u65E5\u671F],
        \u65E5\u671F_str: excelDateToStr(r[col.\u65E5\u671F]),
        \u9500\u91CF: parseNumberCell2(r[col.\u9500\u91CF]),
        \u9500\u552E\u989D: parseNumberCell2(r[col.\u9500\u552E\u989D])
      })).filter((r) => r.\u54C1\u724C || r.\u6E20\u9053 || r.\u4EF7\u683C\u6BB5 || r.\u65E5\u671F_str || r.\u9500\u91CF || r.\u9500\u552E\u989D);
      rows = rows.filter((r) => !isPriceSegment01k(r.\u4EF7\u683C\u6BB5));
      return { header, rows };
    }
    __name(parseBrandRowsFromValues, "parseBrandRowsFromValues");
    function dimension1_channel(rows) {
      const totalSales = rows.reduce((s, r) => s + r.\u9500\u91CF, 0);
      const totalAmount = rows.reduce((s, r) => s + r.\u9500\u552E\u989D, 0);
      const byChannel = {};
      rows.forEach((r) => {
        if (!byChannel[r.\u6E20\u9053]) byChannel[r.\u6E20\u9053] = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byChannel[r.\u6E20\u9053].\u9500\u91CF += r.\u9500\u91CF;
        byChannel[r.\u6E20\u9053].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const list = Object.entries(byChannel).map(([\u6E20\u9053, v]) => ({
        \u6E20\u9053,
        \u9500\u91CF: v.\u9500\u91CF,
        \u9500\u552E\u989D: v.\u9500\u552E\u989D,
        \u9500\u91CF\u5360\u6BD4: totalSales ? v.\u9500\u91CF / totalSales : 0,
        \u9500\u552E\u989D\u5360\u6BD4: totalAmount ? v.\u9500\u552E\u989D / totalAmount : 0,
        \u5BA2\u5355\u4EF7: v.\u9500\u91CF ? v.\u9500\u552E\u989D / v.\u9500\u91CF : 0
      }));
      return {
        \u8BF4\u660E: "\u5404\u6E20\u9053\u9500\u91CF\u5408\u8BA1\u3001\u9500\u552E\u989D\u5408\u8BA1\u3001\u5360\u6BD4\u3001\u5BA2\u5355\u4EF7\uFF08\u5DF2\u5254\u96640-1k\uFF09",
        \u5168\u76D8\u9500\u91CF\u5408\u8BA1: totalSales,
        \u5168\u76D8\u9500\u552E\u989D\u5408\u8BA1: totalAmount,
        \u6309\u6E20\u9053: list
      };
    }
    __name(dimension1_channel, "dimension1_channel");
    function dimension2_priceRange(rows) {
      const totalSales = rows.reduce((s, r) => s + r.\u9500\u91CF, 0);
      const totalAmount = rows.reduce((s, r) => s + r.\u9500\u552E\u989D, 0);
      const byPrice = {};
      rows.forEach((r) => {
        if (!byPrice[r.\u4EF7\u683C\u6BB5]) byPrice[r.\u4EF7\u683C\u6BB5] = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byPrice[r.\u4EF7\u683C\u6BB5].\u9500\u91CF += r.\u9500\u91CF;
        byPrice[r.\u4EF7\u683C\u6BB5].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const list = Object.entries(byPrice).map(([\u4EF7\u683C\u6BB5, v]) => ({
        \u4EF7\u683C\u6BB5,
        \u9500\u91CF: v.\u9500\u91CF,
        \u9500\u552E\u989D: v.\u9500\u552E\u989D,
        \u9500\u91CF\u5360\u6BD4: totalSales ? v.\u9500\u91CF / totalSales : 0,
        \u9500\u552E\u989D\u5360\u6BD4: totalAmount ? v.\u9500\u552E\u989D / totalAmount : 0,
        \u9500\u91CF\u5360\u6BD4\u4E0E\u9500\u552E\u989D\u5360\u6BD4\u5DEE: totalSales && totalAmount ? v.\u9500\u91CF / totalSales - v.\u9500\u552E\u989D / totalAmount : 0
      }));
      return {
        \u8BF4\u660E: "\u5404\u4EF7\u683C\u6BB5\u9500\u91CF\u3001\u9500\u552E\u989D\u3001\u5360\u6BD4\uFF08\u5DF2\u5254\u96640-1k\uFF09",
        \u5168\u76D8\u9500\u91CF\u5408\u8BA1: totalSales,
        \u5168\u76D8\u9500\u552E\u989D\u5408\u8BA1: totalAmount,
        \u6309\u4EF7\u683C\u6BB5: list
      };
    }
    __name(dimension2_priceRange, "dimension2_priceRange");
    function dimension3_timeTrend(rows) {
      const byDate = {};
      rows.forEach((r) => {
        const d = r.\u65E5\u671F_str;
        if (!byDate[d]) byDate[d] = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byDate[d].\u9500\u91CF += r.\u9500\u91CF;
        byDate[d].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const dates = Object.keys(byDate).sort();
      const list = dates.map((d, i) => {
        const curr = byDate[d];
        const prev = i > 0 ? byDate[dates[i - 1]] : null;
        const [cy, cm] = d.split("-");
        const targetYear = parseInt(cy, 10) - 1;
        const lastYearSum = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        dates.forEach((x) => {
          const [yx, mx] = x.split("-");
          if (parseInt(yx, 10) === targetYear && mx === cm) {
            lastYearSum.\u9500\u91CF += byDate[x].\u9500\u91CF;
            lastYearSum.\u9500\u552E\u989D += byDate[x].\u9500\u552E\u989D;
          }
        });
        return {
          \u65E5\u671F: d,
          \u9500\u91CF: curr.\u9500\u91CF,
          \u9500\u552E\u989D: curr.\u9500\u552E\u989D,
          \u9500\u91CF\u73AF\u6BD4: prev && prev.\u9500\u91CF ? curr.\u9500\u91CF / prev.\u9500\u91CF - 1 : null,
          \u9500\u552E\u989D\u73AF\u6BD4: prev && prev.\u9500\u552E\u989D ? curr.\u9500\u552E\u989D / prev.\u9500\u552E\u989D - 1 : null,
          \u9500\u91CF\u540C\u6BD4: lastYearSum.\u9500\u91CF ? curr.\u9500\u91CF / lastYearSum.\u9500\u91CF - 1 : null,
          \u9500\u552E\u989D\u540C\u6BD4: lastYearSum.\u9500\u552E\u989D ? curr.\u9500\u552E\u989D / lastYearSum.\u9500\u552E\u989D - 1 : null
        };
      });
      return { \u8BF4\u660E: "\u5168\u76D8\u6708\u5EA6\u9500\u91CF\u3001\u9500\u552E\u989D\u3001\u73AF\u6BD4/\u540C\u6BD4", \u6309\u65E5\u671F: list };
    }
    __name(dimension3_timeTrend, "dimension3_timeTrend");
    function dimension4_channelTime(rows) {
      const byChannelDate = {};
      const byDateTotal = {};
      const byDateTotalAmount = {};
      rows.forEach((r) => {
        const key = `${r.\u6E20\u9053}	${r.\u65E5\u671F_str}`;
        if (!byChannelDate[key]) byChannelDate[key] = { \u6E20\u9053: r.\u6E20\u9053, \u65E5\u671F: r.\u65E5\u671F_str, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byChannelDate[key].\u9500\u91CF += r.\u9500\u91CF;
        byChannelDate[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
        byDateTotal[r.\u65E5\u671F_str] = (byDateTotal[r.\u65E5\u671F_str] || 0) + r.\u9500\u91CF;
        byDateTotalAmount[r.\u65E5\u671F_str] = (byDateTotalAmount[r.\u65E5\u671F_str] || 0) + r.\u9500\u552E\u989D;
      });
      const list = Object.values(byChannelDate).map((v) => ({
        ...v,
        \u5F53\u6708\u5168\u76D8\u9500\u91CF: byDateTotal[v.\u65E5\u671F] || 0,
        \u5F53\u6708\u5168\u76D8\u9500\u552E\u989D: byDateTotalAmount[v.\u65E5\u671F] || 0,
        \u5F53\u6708\u9500\u91CF\u5360\u6BD4: byDateTotal[v.\u65E5\u671F] ? v.\u9500\u91CF / byDateTotal[v.\u65E5\u671F] : 0,
        \u5F53\u6708\u9500\u552E\u989D\u5360\u6BD4: byDateTotalAmount[v.\u65E5\u671F] ? v.\u9500\u552E\u989D / byDateTotalAmount[v.\u65E5\u671F] : 0
      }));
      return { \u8BF4\u660E: "\u5404\u6E20\u9053\u6309\u6708\u9500\u91CF\u3001\u9500\u552E\u989D\u53CA\u5F53\u6708\u5360\u6BD4", \u6309\u6E20\u9053\u4E0E\u65E5\u671F: list };
    }
    __name(dimension4_channelTime, "dimension4_channelTime");
    function dimension5_priceTime(rows) {
      const byPriceDate = {};
      const byDateTotal = {};
      const byDateTotalAmount = {};
      rows.forEach((r) => {
        const key = `${r.\u4EF7\u683C\u6BB5}	${r.\u65E5\u671F_str}`;
        if (!byPriceDate[key]) byPriceDate[key] = { \u4EF7\u683C\u6BB5: r.\u4EF7\u683C\u6BB5, \u65E5\u671F: r.\u65E5\u671F_str, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byPriceDate[key].\u9500\u91CF += r.\u9500\u91CF;
        byPriceDate[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
        byDateTotal[r.\u65E5\u671F_str] = (byDateTotal[r.\u65E5\u671F_str] || 0) + r.\u9500\u91CF;
        byDateTotalAmount[r.\u65E5\u671F_str] = (byDateTotalAmount[r.\u65E5\u671F_str] || 0) + r.\u9500\u552E\u989D;
      });
      const list = Object.values(byPriceDate).map((v) => ({
        ...v,
        \u5F53\u6708\u9500\u91CF\u5360\u6BD4: byDateTotal[v.\u65E5\u671F] ? v.\u9500\u91CF / byDateTotal[v.\u65E5\u671F] : 0,
        \u5F53\u6708\u9500\u552E\u989D\u5360\u6BD4: byDateTotalAmount[v.\u65E5\u671F] ? v.\u9500\u552E\u989D / byDateTotalAmount[v.\u65E5\u671F] : 0
      }));
      return { \u8BF4\u660E: "\u5404\u4EF7\u683C\u6BB5\u6708\u5EA6\u9500\u91CF\u3001\u9500\u552E\u989D\u53CA\u5F53\u6708\u5360\u6BD4", \u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F: list };
    }
    __name(dimension5_priceTime, "dimension5_priceTime");
    function dimension6_channelPrice(rows) {
      const byChannel = {};
      const byChannelAmount = {};
      rows.forEach((r) => {
        byChannel[r.\u6E20\u9053] = (byChannel[r.\u6E20\u9053] || 0) + r.\u9500\u91CF;
        byChannelAmount[r.\u6E20\u9053] = (byChannelAmount[r.\u6E20\u9053] || 0) + r.\u9500\u552E\u989D;
      });
      const byKey = {};
      rows.forEach((r) => {
        const key = `${r.\u6E20\u9053}	${r.\u4EF7\u683C\u6BB5}`;
        if (!byKey[key]) byKey[key] = { \u6E20\u9053: r.\u6E20\u9053, \u4EF7\u683C\u6BB5: r.\u4EF7\u683C\u6BB5, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byKey[key].\u9500\u91CF += r.\u9500\u91CF;
        byKey[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const list = Object.values(byKey).map((v) => ({
        ...v,
        \u5BA2\u5355\u4EF7: v.\u9500\u91CF ? v.\u9500\u552E\u989D / v.\u9500\u91CF : 0,
        \u6E20\u9053\u5185\u9500\u91CF\u5360\u6BD4: byChannel[v.\u6E20\u9053] ? v.\u9500\u91CF / byChannel[v.\u6E20\u9053] : 0,
        \u6E20\u9053\u5185\u9500\u552E\u989D\u5360\u6BD4: byChannelAmount[v.\u6E20\u9053] ? v.\u9500\u552E\u989D / byChannelAmount[v.\u6E20\u9053] : 0
      }));
      return { \u8BF4\u660E: "\u5404\u6E20\u9053\u5728\u5404\u4EF7\u683C\u6BB5\u7684\u9500\u91CF\u3001\u9500\u552E\u989D\u3001\u5BA2\u5355\u4EF7\u3001\u6E20\u9053\u5185\u5360\u6BD4\uFF08\u5DF2\u5254\u96640-1k\uFF09", \u6309\u6E20\u9053\u4E0E\u4EF7\u683C\u6BB5: list };
    }
    __name(dimension6_channelPrice, "dimension6_channelPrice");
    function dimension7_channelPriceTime(rows) {
      const byDateTotal = {};
      const byDateTotalAmount = {};
      rows.forEach((r) => {
        byDateTotal[r.\u65E5\u671F_str] = (byDateTotal[r.\u65E5\u671F_str] || 0) + r.\u9500\u91CF;
        byDateTotalAmount[r.\u65E5\u671F_str] = (byDateTotalAmount[r.\u65E5\u671F_str] || 0) + r.\u9500\u552E\u989D;
      });
      const byKey = {};
      rows.forEach((r) => {
        const key = `${r.\u6E20\u9053}	${r.\u4EF7\u683C\u6BB5}	${r.\u65E5\u671F_str}`;
        if (!byKey[key]) byKey[key] = { \u6E20\u9053: r.\u6E20\u9053, \u4EF7\u683C\u6BB5: r.\u4EF7\u683C\u6BB5, \u65E5\u671F: r.\u65E5\u671F_str, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byKey[key].\u9500\u91CF += r.\u9500\u91CF;
        byKey[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const list = Object.values(byKey).map((v) => ({
        ...v,
        \u5F53\u6708\u9500\u91CF\u5360\u6BD4: byDateTotal[v.\u65E5\u671F] ? v.\u9500\u91CF / byDateTotal[v.\u65E5\u671F] : 0,
        \u5F53\u6708\u9500\u552E\u989D\u5360\u6BD4: byDateTotalAmount[v.\u65E5\u671F] ? v.\u9500\u552E\u989D / byDateTotalAmount[v.\u65E5\u671F] : 0
      }));
      return { \u8BF4\u660E: "\u5404\u6E20\u9053\xD7\u4EF7\u683C\u6BB5\xD7\u65E5\u671F\u7684\u6708\u5EA6\u9500\u91CF\u3001\u9500\u552E\u989D\u53CA\u5F53\u6708\u5360\u6BD4", \u6309\u6E20\u9053\u4E0E\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F: list };
    }
    __name(dimension7_channelPriceTime, "dimension7_channelPriceTime");
    function dimension8_avgPrice(rows) {
      const d1 = dimension1_channel(rows);
      const d2 = dimension2_priceRange(rows);
      const d6 = dimension6_channelPrice(rows);
      const byDate = {};
      rows.forEach((r) => {
        if (!byDate[r.\u65E5\u671F_str]) byDate[r.\u65E5\u671F_str] = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byDate[r.\u65E5\u671F_str].\u9500\u91CF += r.\u9500\u91CF;
        byDate[r.\u65E5\u671F_str].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const \u6309\u65F6\u95F4\u5BA2\u5355\u4EF7 = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([\u65E5\u671F, v]) => ({ \u65E5\u671F, \u9500\u91CF: v.\u9500\u91CF, \u9500\u552E\u989D: v.\u9500\u552E\u989D, \u5BA2\u5355\u4EF7: v.\u9500\u91CF ? v.\u9500\u552E\u989D / v.\u9500\u91CF : 0 }));
      return {
        \u8BF4\u660E: "\u5404\u7EF4\u5EA6\u4E0B\u5BA2\u5355\u4EF7\uFF08\u5DF2\u5254\u96640-1k\uFF09",
        \u6309\u6E20\u9053: d1.\u6309\u6E20\u9053.map((x) => ({ \u6E20\u9053: x.\u6E20\u9053, \u5BA2\u5355\u4EF7: x.\u5BA2\u5355\u4EF7 })),
        \u6309\u4EF7\u683C\u6BB5: d2.\u6309\u4EF7\u683C\u6BB5.map((x) => ({ \u4EF7\u683C\u6BB5: x.\u4EF7\u683C\u6BB5, \u5BA2\u5355\u4EF7: x.\u9500\u91CF ? x.\u9500\u552E\u989D / x.\u9500\u91CF : 0 })),
        \u6309\u6E20\u9053\u4E0E\u4EF7\u683C\u6BB5: d6.\u6309\u6E20\u9053\u4E0E\u4EF7\u683C\u6BB5.map((x) => ({ \u6E20\u9053: x.\u6E20\u9053, \u4EF7\u683C\u6BB5: x.\u4EF7\u683C\u6BB5, \u5BA2\u5355\u4EF7: x.\u5BA2\u5355\u4EF7 })),
        \u6309\u65F6\u95F4: \u6309\u65F6\u95F4\u5BA2\u5355\u4EF7
      };
    }
    __name(dimension8_avgPrice, "dimension8_avgPrice");
    function dimension9_shareGrowth(rows) {
      const d4 = dimension4_channelTime(rows);
      const d5 = dimension5_priceTime(rows);
      const byDateChannel = {};
      d4.\u6309\u6E20\u9053\u4E0E\u65E5\u671F.forEach((v) => {
        if (!byDateChannel[v.\u65E5\u671F]) byDateChannel[v.\u65E5\u671F] = {};
        byDateChannel[v.\u65E5\u671F][v.\u6E20\u9053] = v.\u5F53\u6708\u9500\u91CF\u5360\u6BD4;
      });
      const dates = Object.keys(byDateChannel).sort();
      const \u6E20\u9053\u9500\u91CF\u5360\u6BD4\u968F\u65F6\u95F4 = [];
      dates.forEach((d, i) => {
        const prev = i > 0 ? byDateChannel[dates[i - 1]] : null;
        Object.entries(byDateChannel[d]).forEach(([\u6E20\u9053, \u5360\u6BD4]) => {
          \u6E20\u9053\u9500\u91CF\u5360\u6BD4\u968F\u65F6\u95F4.push({
            \u65E5\u671F: d,
            \u6E20\u9053,
            \u9500\u91CF\u5360\u6BD4: \u5360\u6BD4,
            \u9500\u91CF\u5360\u6BD4\u73AF\u6BD4: prev && prev[\u6E20\u9053] != null && prev[\u6E20\u9053] !== 0 ? \u5360\u6BD4 / prev[\u6E20\u9053] - 1 : null
          });
        });
      });
      const byDatePrice = {};
      d5.\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F.forEach((v) => {
        if (!byDatePrice[v.\u65E5\u671F]) byDatePrice[v.\u65E5\u671F] = {};
        byDatePrice[v.\u65E5\u671F][v.\u4EF7\u683C\u6BB5] = v.\u5F53\u6708\u9500\u91CF\u5360\u6BD4;
      });
      const \u4EF7\u683C\u6BB5\u9500\u91CF\u5360\u6BD4\u968F\u65F6\u95F4 = [];
      dates.forEach((d, i) => {
        const prev = i > 0 ? byDatePrice[dates[i - 1]] : null;
        Object.entries(byDatePrice[d] || {}).forEach(([\u4EF7\u683C\u6BB5, \u5360\u6BD4]) => {
          \u4EF7\u683C\u6BB5\u9500\u91CF\u5360\u6BD4\u968F\u65F6\u95F4.push({
            \u65E5\u671F: d,
            \u4EF7\u683C\u6BB5,
            \u9500\u91CF\u5360\u6BD4: \u5360\u6BD4,
            \u9500\u91CF\u5360\u6BD4\u73AF\u6BD4: prev && prev[\u4EF7\u683C\u6BB5] != null && prev[\u4EF7\u683C\u6BB5] !== 0 ? \u5360\u6BD4 / prev[\u4EF7\u683C\u6BB5] - 1 : null
          });
        });
      });
      return { \u8BF4\u660E: "\u5404\u6E20\u9053/\u4EF7\u683C\u6BB5\u6309\u6708\u5360\u6BD4\u53CA\u5360\u6BD4\u73AF\u6BD4", \u6E20\u9053\u9500\u91CF\u5360\u6BD4\u968F\u65F6\u95F4, \u4EF7\u683C\u6BB5\u9500\u91CF\u5360\u6BD4\u968F\u65F6\u95F4 };
    }
    __name(dimension9_shareGrowth, "dimension9_shareGrowth");
    function dimension10_ranking(rows) {
      const d1 = dimension1_channel(rows);
      const d2 = dimension2_priceRange(rows);
      const byChannel = d1.\u6309\u6E20\u9053.sort((a, b) => b.\u9500\u91CF - a.\u9500\u91CF);
      const totalSales = d1.\u5168\u76D8\u9500\u91CF\u5408\u8BA1;
      const totalAmount = d1.\u5168\u76D8\u9500\u552E\u989D\u5408\u8BA1;
      let sumS = 0;
      let sumA = 0;
      const \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D = byChannel.map((x, i) => {
        sumS += x.\u9500\u91CF;
        sumA += x.\u9500\u552E\u989D;
        return {
          \u6392\u540D: i + 1,
          \u6E20\u9053: x.\u6E20\u9053,
          \u9500\u91CF: x.\u9500\u91CF,
          \u9500\u552E\u989D: x.\u9500\u552E\u989D,
          \u9500\u91CF\u5360\u6BD4: x.\u9500\u91CF\u5360\u6BD4,
          CRn_\u9500\u91CF: totalSales ? sumS / totalSales : 0,
          CRn_\u9500\u552E\u989D: totalAmount ? sumA / totalAmount : 0
        };
      });
      const \u6E20\u9053\u6309\u9500\u552E\u989D\u6392\u540D = [...d1.\u6309\u6E20\u9053].sort((a, b) => b.\u9500\u552E\u989D - a.\u9500\u552E\u989D).map((x, i) => ({
        \u6392\u540D: i + 1,
        \u6E20\u9053: x.\u6E20\u9053,
        \u9500\u552E\u989D: x.\u9500\u552E\u989D,
        \u9500\u91CF: x.\u9500\u91CF
      }));
      const byPrice = d2.\u6309\u4EF7\u683C\u6BB5.sort((a, b) => b.\u9500\u91CF - a.\u9500\u91CF);
      let sumPS = 0;
      let sumPA = 0;
      const \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D = byPrice.map((x, i) => {
        sumPS += x.\u9500\u91CF;
        sumPA += x.\u9500\u552E\u989D;
        return {
          \u6392\u540D: i + 1,
          \u4EF7\u683C\u6BB5: x.\u4EF7\u683C\u6BB5,
          \u9500\u91CF: x.\u9500\u91CF,
          \u9500\u552E\u989D: x.\u9500\u552E\u989D,
          \u9500\u91CF\u5360\u6BD4: x.\u9500\u91CF\u5360\u6BD4,
          CRn_\u9500\u91CF: d2.\u5168\u76D8\u9500\u91CF\u5408\u8BA1 ? sumPS / d2.\u5168\u76D8\u9500\u91CF\u5408\u8BA1 : 0,
          CRn_\u9500\u552E\u989D: d2.\u5168\u76D8\u9500\u552E\u989D\u5408\u8BA1 ? sumPA / d2.\u5168\u76D8\u9500\u552E\u989D\u5408\u8BA1 : 0
        };
      });
      const cr1 = \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[0];
      const cr2 = \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[1];
      const cr3 = \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[2];
      return {
        \u8BF4\u660E: "\u6E20\u9053/\u4EF7\u683C\u6BB5 \u9500\u91CF\u4E0E\u9500\u552E\u989D\u6392\u540D\u3001CR1/CR2/CR3",
        \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D,
        \u6E20\u9053\u6309\u9500\u552E\u989D\u6392\u540D,
        \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D,
        \u6E20\u9053\u96C6\u4E2D\u5EA6: {
          CR1_\u9500\u91CF: cr1 ? cr1.CRn_\u9500\u91CF : 0,
          CR2_\u9500\u91CF: cr2 ? \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[1].CRn_\u9500\u91CF : 0,
          CR3_\u9500\u91CF: cr3 ? \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[2].CRn_\u9500\u91CF : 0,
          CR1_\u9500\u552E\u989D: cr1 ? cr1.CRn_\u9500\u552E\u989D : 0,
          CR2_\u9500\u552E\u989D: cr2 ? \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[1].CRn_\u9500\u552E\u989D : 0,
          CR3_\u9500\u552E\u989D: cr3 ? \u6E20\u9053\u6309\u9500\u91CF\u6392\u540D[2].CRn_\u9500\u552E\u989D : 0
        },
        \u4EF7\u683C\u6BB5\u96C6\u4E2D\u5EA6: {
          CR1_\u9500\u91CF: \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D[0] ? \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D[0].CRn_\u9500\u91CF : 0,
          CR2_\u9500\u91CF: \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D[1] ? \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D[1].CRn_\u9500\u91CF : 0,
          CR3_\u9500\u91CF: \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D[2] ? \u4EF7\u683C\u6BB5\u6309\u9500\u91CF\u6392\u540D[2].CRn_\u9500\u91CF : 0
        }
      };
    }
    __name(dimension10_ranking, "dimension10_ranking");
    function filterTopRows(rows, topBrands) {
      const set = new Set(topBrands);
      return rows.filter((r) => set.has(r.\u54C1\u724C));
    }
    __name(filterTopRows, "filterTopRows");
    function feature1_\u9500\u91CF\u9500\u989D\u5BF9\u6BD4(rows, topBrands) {
      const byBrand = {};
      rows.forEach((r) => {
        if (!byBrand[r.\u54C1\u724C]) byBrand[r.\u54C1\u724C] = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byBrand[r.\u54C1\u724C].\u9500\u91CF += r.\u9500\u91CF;
        byBrand[r.\u54C1\u724C].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const totalSales = rows.reduce((s, r) => s + r.\u9500\u91CF, 0);
      const totalAmount = rows.reduce((s, r) => s + r.\u9500\u552E\u989D, 0);
      const \u6309\u54C1\u724C = topBrands.map((\u54C1\u724C) => {
        const v = byBrand[\u54C1\u724C] || { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        return { \u54C1\u724C, \u9500\u91CF: v.\u9500\u91CF, \u9500\u552E\u989D: v.\u9500\u552E\u989D, \u9500\u91CF\u5360\u6BD4: totalSales ? v.\u9500\u91CF / totalSales : 0, \u9500\u552E\u989D\u5360\u6BD4: totalAmount ? v.\u9500\u552E\u989D / totalAmount : 0 };
      });
      return { \u8BF4\u660E: "\u524D\u5341\u5927\u54C1\u724C\u9500\u91CF\u3001\u9500\u552E\u989D\u5BF9\u6BD4", \u6309\u54C1\u724C };
    }
    __name(feature1_\u9500\u91CF\u9500\u989D\u5BF9\u6BD4, "feature1_\u9500\u91CF\u9500\u989D\u5BF9\u6BD4");
    function feature2_\u5404\u54C1\u724C\u4E09\u5927\u6E20\u9053\u5360\u6BD4(rows, topBrands) {
      const byBrand = {};
      const byBrandAmount = {};
      rows.forEach((r) => {
        byBrand[r.\u54C1\u724C] = (byBrand[r.\u54C1\u724C] || 0) + r.\u9500\u91CF;
        byBrandAmount[r.\u54C1\u724C] = (byBrandAmount[r.\u54C1\u724C] || 0) + r.\u9500\u552E\u989D;
      });
      const byKey = {};
      rows.forEach((r) => {
        const key = `${r.\u54C1\u724C}	${r.\u6E20\u9053}`;
        if (!byKey[key]) byKey[key] = { \u54C1\u724C: r.\u54C1\u724C, \u6E20\u9053: r.\u6E20\u9053, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byKey[key].\u9500\u91CF += r.\u9500\u91CF;
        byKey[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const \u6309\u54C1\u724C\u4E0E\u6E20\u9053 = Object.values(byKey).filter((v) => topBrands.includes(v.\u54C1\u724C)).map((v) => ({
        ...v,
        \u54C1\u724C\u5185\u9500\u91CF\u5360\u6BD4: byBrand[v.\u54C1\u724C] ? v.\u9500\u91CF / byBrand[v.\u54C1\u724C] : 0,
        \u54C1\u724C\u5185\u9500\u552E\u989D\u5360\u6BD4: byBrandAmount[v.\u54C1\u724C] ? v.\u9500\u552E\u989D / byBrandAmount[v.\u54C1\u724C] : 0
      }));
      return { \u8BF4\u660E: "\u524D\u5341\u5927\u54C1\u724C\u5728\u4E09\u5927\u6E20\u9053\u7684\u9500\u91CF\u3001\u9500\u552E\u989D\u53CA\u54C1\u724C\u5185\u5360\u6BD4", \u6309\u54C1\u724C\u4E0E\u6E20\u9053 };
    }
    __name(feature2_\u5404\u54C1\u724C\u4E09\u5927\u6E20\u9053\u5360\u6BD4, "feature2_\u5404\u54C1\u724C\u4E09\u5927\u6E20\u9053\u5360\u6BD4");
    function feature3_\u5404\u6708\u4EFD\u5E02\u573A\u5360\u6709\u7387(allRows, topRows, topBrands) {
      const byDateTotal = {};
      allRows.forEach((r) => {
        byDateTotal[r.\u65E5\u671F_str] = (byDateTotal[r.\u65E5\u671F_str] || 0) + r.\u9500\u91CF;
      });
      const byBrandDate = {};
      topRows.forEach((r) => {
        const key = `${r.\u54C1\u724C}	${r.\u65E5\u671F_str}`;
        if (!byBrandDate[key]) byBrandDate[key] = { \u54C1\u724C: r.\u54C1\u724C, \u65E5\u671F: r.\u65E5\u671F_str, \u9500\u91CF: 0 };
        byBrandDate[key].\u9500\u91CF += r.\u9500\u91CF;
      });
      const dates = [...new Set(allRows.map((r) => r.\u65E5\u671F_str))].sort();
      const \u5404\u54C1\u724C\u6309\u65E5\u671F\u5E02\u5360\u7387 = {};
      topBrands.forEach((\u54C1\u724C) => {
        \u5404\u54C1\u724C\u6309\u65E5\u671F\u5E02\u5360\u7387[\u54C1\u724C] = dates.map((\u65E5\u671F) => {
          const total = byDateTotal[\u65E5\u671F] || 0;
          const key = `${\u54C1\u724C}	${\u65E5\u671F}`;
          const \u9500\u91CF = byBrandDate[key] && byBrandDate[key].\u9500\u91CF || 0;
          return total ? \u9500\u91CF / total : 0;
        });
      });
      return { \u8BF4\u660E: "\u524D\u5341\u5927\u54C1\u724C\u5404\u6708\u4EFD\u5E02\u573A\u5360\u6709\u7387\uFF0C\u7528\u4E8E\u5806\u53E0\u9762\u79EF\u56FE", \u6309\u65E5\u671F: dates, \u5404\u54C1\u724C\u6309\u65E5\u671F\u5E02\u5360\u7387 };
    }
    __name(feature3_\u5404\u6708\u4EFD\u5E02\u573A\u5360\u6709\u7387, "feature3_\u5404\u6708\u4EFD\u5E02\u573A\u5360\u6709\u7387");
    function feature5_\u5BA2\u5355\u4EF7\u5BF9\u6BD4(rows, topBrands) {
      const byBrand = {};
      rows.forEach((r) => {
        if (!byBrand[r.\u54C1\u724C]) byBrand[r.\u54C1\u724C] = { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byBrand[r.\u54C1\u724C].\u9500\u91CF += r.\u9500\u91CF;
        byBrand[r.\u54C1\u724C].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      const \u6309\u54C1\u724C = topBrands.map((\u54C1\u724C) => {
        const v = byBrand[\u54C1\u724C] || { \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        return { \u54C1\u724C, \u9500\u91CF: v.\u9500\u91CF, \u9500\u552E\u989D: v.\u9500\u552E\u989D, \u5BA2\u5355\u4EF7: v.\u9500\u91CF ? v.\u9500\u552E\u989D / v.\u9500\u91CF : 0 };
      });
      return { \u8BF4\u660E: "\u524D\u5341\u5927\u54C1\u724C\u5BA2\u5355\u4EF7\u5BF9\u6BD4", \u6309\u54C1\u724C };
    }
    __name(feature5_\u5BA2\u5355\u4EF7\u5BF9\u6BD4, "feature5_\u5BA2\u5355\u4EF7\u5BF9\u6BD4");
    function feature6_\u5404\u54C1\u724C\u4EF7\u683C\u6BB5\u9500\u91CF\u968F\u65F6\u95F4(rows, topBrands) {
      const byBrand = {};
      topBrands.forEach((\u54C1\u724C) => {
        byBrand[\u54C1\u724C] = { \u6309\u65E5\u671F: [], \u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F: {} };
      });
      const dateSet = /* @__PURE__ */ new Set();
      rows.forEach((r) => dateSet.add(r.\u65E5\u671F_str));
      const dates = [...dateSet].sort();
      topBrands.forEach((\u54C1\u724C) => {
        byBrand[\u54C1\u724C].\u6309\u65E5\u671F = dates;
      });
      rows.forEach((r) => {
        const key = `${r.\u54C1\u724C}	${r.\u4EF7\u683C\u6BB5}	${r.\u65E5\u671F_str}`;
        if (!byBrand[r.\u54C1\u724C]) return;
        if (!byBrand[r.\u54C1\u724C].\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F[r.\u4EF7\u683C\u6BB5]) byBrand[r.\u54C1\u724C].\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F[r.\u4EF7\u683C\u6BB5] = {};
        byBrand[r.\u54C1\u724C].\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F[r.\u4EF7\u683C\u6BB5][r.\u65E5\u671F_str] = (byBrand[r.\u54C1\u724C].\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F[r.\u4EF7\u683C\u6BB5][r.\u65E5\u671F_str] || 0) + r.\u9500\u91CF;
      });
      const \u6309\u54C1\u724C = {};
      topBrands.forEach((\u54C1\u724C) => {
        const \u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F = byBrand[\u54C1\u724C].\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F;
        const \u4EF7\u683C\u6BB5\u5217\u8868 = Object.keys(\u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F).sort();
        \u6309\u54C1\u724C[\u54C1\u724C] = {
          \u6309\u65E5\u671F: byBrand[\u54C1\u724C].\u6309\u65E5\u671F,
          \u4EF7\u683C\u6BB5\u5217\u8868,
          \u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F: \u4EF7\u683C\u6BB5\u5217\u8868.map((\u4EF7\u683C\u6BB5) => ({
            \u4EF7\u683C\u6BB5,
            \u6309\u65E5\u671F: dates.map((\u65E5\u671F) => ({ \u65E5\u671F, \u9500\u91CF: \u6309\u4EF7\u683C\u6BB5\u4E0E\u65E5\u671F[\u4EF7\u683C\u6BB5][\u65E5\u671F] || 0 }))
          }))
        };
      });
      return { \u8BF4\u660E: "\u524D\u5341\u5927\u54C1\u724C\u6BCF\u4E2A\u54C1\u724C\u5728\u4E0D\u540C\u4EF7\u683C\u6BB5\u4E2D\u7684\u9500\u91CF\u968F\u65F6\u95F4\uFF0C\u6BCF\u54C1\u724C\u53EF\u7ED8\u4E00\u5806\u53E0\u9762\u79EF\u56FE", \u6309\u54C1\u724C };
    }
    __name(feature6_\u5404\u54C1\u724C\u4EF7\u683C\u6BB5\u9500\u91CF\u968F\u65F6\u95F4, "feature6_\u5404\u54C1\u724C\u4EF7\u683C\u6BB5\u9500\u91CF\u968F\u65F6\u95F4");
    function feature_\u54C1\u724C\u4E0E\u65E5\u671F(rowsTop) {
      const byKey = {};
      rowsTop.forEach((r) => {
        const key = `${r.\u54C1\u724C}	${r.\u65E5\u671F_str}`;
        if (!byKey[key]) byKey[key] = { \u54C1\u724C: r.\u54C1\u724C, \u65E5\u671F: r.\u65E5\u671F_str, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byKey[key].\u9500\u91CF += r.\u9500\u91CF;
        byKey[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      return Object.values(byKey);
    }
    __name(feature_\u54C1\u724C\u4E0E\u65E5\u671F, "feature_\u54C1\u724C\u4E0E\u65E5\u671F");
    function feature_\u54C1\u724C\u4E0E\u6E20\u9053\u4E0E\u65E5\u671F(rowsTop) {
      const byKey = {};
      rowsTop.forEach((r) => {
        const key = `${r.\u54C1\u724C}	${r.\u6E20\u9053}	${r.\u65E5\u671F_str}`;
        if (!byKey[key]) byKey[key] = { \u54C1\u724C: r.\u54C1\u724C, \u6E20\u9053: r.\u6E20\u9053, \u65E5\u671F: r.\u65E5\u671F_str, \u9500\u91CF: 0, \u9500\u552E\u989D: 0 };
        byKey[key].\u9500\u91CF += r.\u9500\u91CF;
        byKey[key].\u9500\u552E\u989D += r.\u9500\u552E\u989D;
      });
      return Object.values(byKey);
    }
    __name(feature_\u54C1\u724C\u4E0E\u6E20\u9053\u4E0E\u65E5\u671F, "feature_\u54C1\u724C\u4E0E\u6E20\u9053\u4E0E\u65E5\u671F");
    function buildDaPanPayloadFromValues(values, sourceLabel) {
      const parsed = parseDaPanRowsFromValues(values);
      const rows = parsed.rows;
      return {
        \u6570\u636E\u8BF4\u660E: {
          \u6570\u636E\u6E90: sourceLabel || "sheet1",
          \u63D0\u53D6\u65F6\u95F4: (/* @__PURE__ */ new Date()).toISOString(),
          \u539F\u59CB\u884C\u6570: rows.length
        },
        \u7EF4\u5EA6\u4E00_\u6E20\u9053\u7EF4\u5EA6: dimension1_channel(rows),
        \u7EF4\u5EA6\u4E8C_\u4EF7\u683C\u6BB5\u7EF4\u5EA6: dimension2_priceRange(rows),
        \u7EF4\u5EA6\u4E09_\u65F6\u95F4\u8D8B\u52BF: dimension3_timeTrend(rows),
        \u7EF4\u5EA6\u56DB_\u6E20\u9053\u4E0E\u65F6\u95F4: dimension4_channelTime(rows),
        \u7EF4\u5EA6\u4E94_\u4EF7\u683C\u6BB5\u4E0E\u65F6\u95F4: dimension5_priceTime(rows),
        \u7EF4\u5EA6\u516D_\u6E20\u9053\u4E0E\u4EF7\u683C\u6BB5: dimension6_channelPrice(rows),
        \u7EF4\u5EA6\u4E03_\u6E20\u9053\u4E0E\u4EF7\u683C\u6BB5\u4E0E\u65F6\u95F4: dimension7_channelPriceTime(rows),
        \u7EF4\u5EA6\u516B_\u5BA2\u5355\u4EF7\u884D\u751F: dimension8_avgPrice(rows),
        \u7EF4\u5EA6\u4E5D_\u589E\u957F\u4E0E\u5360\u6BD4: dimension9_shareGrowth(rows),
        \u7EF4\u5EA6\u5341_\u96C6\u4E2D\u5EA6\u4E0E\u6392\u540D: dimension10_ranking(rows)
      };
    }
    __name(buildDaPanPayloadFromValues, "buildDaPanPayloadFromValues");
    function buildBrandPayloadFromValues(values, sourceLabel) {
      const parsed = parseBrandRowsFromValues(values);
      const rows = parsed.rows;
      const topBrands = FIXED_TOP_BRANDS.slice();
      const rowsTop = filterTopRows(rows, topBrands);
      return {
        \u6570\u636E\u8BF4\u660E: {
          \u6570\u636E\u6E90: sourceLabel || "sheet2",
          \u63D0\u53D6\u65F6\u95F4: (/* @__PURE__ */ new Date()).toISOString(),
          \u539F\u59CB\u884C\u6570: rows.length,
          \u524D\u5341\u5927\u54C1\u724C: topBrands
        },
        "\u54C1\u724C\u9500\u91CF/\u9500\u989D": feature1_\u9500\u91CF\u9500\u989D\u5BF9\u6BD4(rowsTop, topBrands),
        "\u54C1\u724C\u6E20\u9053\u5360\u6BD4": feature2_\u5404\u54C1\u724C\u4E09\u5927\u6E20\u9053\u5360\u6BD4(rowsTop, topBrands),
        "\u54C1\u724C\u5E02\u5360\u7387": feature3_\u5404\u6708\u4EFD\u5E02\u573A\u5360\u6709\u7387(rows, rowsTop, topBrands),
        "\u54C1\u724C\u5BA2\u5355\u4EF7": feature5_\u5BA2\u5355\u4EF7\u5BF9\u6BD4(rowsTop, topBrands),
        "\u54C1\u724C\u4EF7\u683C\u6BB5\u5206\u5E03": feature6_\u5404\u54C1\u724C\u4EF7\u683C\u6BB5\u9500\u91CF\u968F\u65F6\u95F4(rowsTop, topBrands),
        \u54C1\u724C\u4E0E\u65E5\u671F: feature_\u54C1\u724C\u4E0E\u65E5\u671F(rowsTop),
        \u54C1\u724C\u4E0E\u6E20\u9053\u4E0E\u65E5\u671F: feature_\u54C1\u724C\u4E0E\u6E20\u9053\u4E0E\u65E5\u671F(rowsTop)
      };
    }
    __name(buildBrandPayloadFromValues, "buildBrandPayloadFromValues");
    module.exports = {
      FIXED_TOP_BRANDS,
      isPriceSegment01k,
      normalizeBrand,
      excelDateToStr,
      parseDaPanRowsFromValues,
      parseBrandRowsFromValues,
      buildDaPanPayloadFromValues,
      buildBrandPayloadFromValues
    };
  }
});

// api/data/features-brand-top10.js
async function sha256Hex(s) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  var arr = new Uint8Array(buf);
  var hex = "";
  for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}
function sortSheetsByUiIndex(sheets) {
  var arr = (sheets || []).slice();
  arr.sort(function(a, b) {
    var ia = a && typeof a.index === "number" ? a.index : 1e9;
    var ib = b && typeof b.index === "number" ? b.index : 1e9;
    return ia - ib;
  });
  return arr;
}
async function resolveSheetRange(env, spreadsheetToken, sortedIndex, explicitRange) {
  if (explicitRange && String(explicitRange).trim()) return String(explicitRange).trim();
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    throw new Error(sheetsJson && sheetsJson.msg || "\u884C\u4E1A\u54C1\u724C\u5DE5\u4F5C\u8868\u89E3\u6790\u5931\u8D25");
  }
  var sheets = sortSheetsByUiIndex(sheetsJson.data && sheetsJson.data.sheets || []);
  var sheet = sheets[sortedIndex];
  if (!sheet || !sheet.sheet_id) {
    throw new Error("\u884C\u4E1A\u54C1\u724C\u7F3A\u5C11 sheet" + String(sortedIndex + 1));
  }
  var rowCount = sheet && sheet.grid_properties && typeof sheet.grid_properties.row_count === "number" && sheet.grid_properties.row_count > 0 ? sheet.grid_properties.row_count : DEFAULT_LAST_ROW;
  return String(sheet.sheet_id) + "!A1:G" + String(Math.max(DEFAULT_LAST_ROW, rowCount));
}
async function onRequestGet4(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var url = new URL(request.url);
  var forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("nocache") === "1";
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_INDUSTRY_SPREADSHEET_TOKEN;
  if (!spreadsheetToken) {
    return jsonResponse(
      { error: "\u672A\u914D\u7F6E FEISHU_INDUSTRY_SPREADSHEET_TOKEN\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u884C\u4E1A\u54C1\u724C sheet2" },
      503,
      origin
    );
  }
  try {
    var range = await resolveSheetRange(env, spreadsheetToken, 1, env.FEISHU_INDUSTRY_BRAND_RANGE);
    var cacheRequest = null;
    if (!forceRefresh) {
      var keyPayload = "industry:brand:" + spreadsheetToken + ":" + range;
      var hash = await sha256Hex(keyPayload);
      cacheRequest = new Request("https://industry-brand.cache/" + hash);
      var hit = await caches.default.match(cacheRequest);
      if (hit) {
        var body = await hit.text();
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-QBT-Industry-Brand-Cache": "HIT",
            ...corsHeaders(origin)
          }
        });
      }
    }
    var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "UnformattedValue" });
    if (!feishuJson || feishuJson.code !== 0) {
      return jsonResponse(
        { error: feishuJson && feishuJson.msg || "\u884C\u4E1A\u54C1\u724C sheet2 \u8BFB\u53D6\u5931\u8D25", feishuCode: feishuJson && feishuJson.code },
        502,
        origin
      );
    }
    var values = feishuJson.data && feishuJson.data.valueRange && feishuJson.data.valueRange.values || [];
    var payload = import_industry_data_builder.default.buildBrandPayloadFromValues(values, "feishu:" + range);
    var jsonBody = JSON.stringify(payload);
    var res = new Response(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-QBT-Industry-Brand-Cache": forceRefresh ? "REFRESH" : "MISS",
        ...corsHeaders(origin)
      }
    });
    if (cacheRequest || !forceRefresh) {
      try {
        var cacheReq = cacheRequest || new Request("https://industry-brand.cache/" + await sha256Hex("industry:brand:" + spreadsheetToken + ":" + range));
        await caches.default.put(
          cacheReq,
          new Response(jsonBody, {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "max-age=2592000"
            }
          })
        );
      } catch (ePut) {
      }
    }
    return res;
  } catch (e) {
    return jsonResponse(
      { error: "\u62C9\u53D6\u884C\u4E1A\u54C1\u724C\u6570\u636E\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions7(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var import_industry_data_builder, DEFAULT_LAST_ROW;
var init_features_brand_top10 = __esm({
  "api/data/features-brand-top10.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_http();
    init_session();
    init_feishu();
    import_industry_data_builder = __toESM(require_industry_data_builder());
    DEFAULT_LAST_ROW = 2e4;
    __name(sha256Hex, "sha256Hex");
    __name(sortSheetsByUiIndex, "sortSheetsByUiIndex");
    __name(resolveSheetRange, "resolveSheetRange");
    __name(onRequestGet4, "onRequestGet");
    __name(onRequestOptions7, "onRequestOptions");
  }
});

// api/data/features-output.js
async function sha256Hex2(s) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  var arr = new Uint8Array(buf);
  var hex = "";
  for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}
function sortSheetsByUiIndex2(sheets) {
  var arr = (sheets || []).slice();
  arr.sort(function(a, b) {
    var ia = a && typeof a.index === "number" ? a.index : 1e9;
    var ib = b && typeof b.index === "number" ? b.index : 1e9;
    return ia - ib;
  });
  return arr;
}
async function resolveSheetRange2(env, spreadsheetToken, sortedIndex, explicitRange) {
  if (explicitRange && String(explicitRange).trim()) return String(explicitRange).trim();
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    throw new Error(sheetsJson && sheetsJson.msg || "\u884C\u4E1A\u6570\u636E\u5DE5\u4F5C\u8868\u89E3\u6790\u5931\u8D25");
  }
  var sheets = sortSheetsByUiIndex2(sheetsJson.data && sheetsJson.data.sheets || []);
  var sheet = sheets[sortedIndex];
  if (!sheet || !sheet.sheet_id) {
    throw new Error("\u884C\u4E1A\u6570\u636E\u7F3A\u5C11 sheet" + String(sortedIndex + 1));
  }
  var rowCount = sheet && sheet.grid_properties && typeof sheet.grid_properties.row_count === "number" && sheet.grid_properties.row_count > 0 ? sheet.grid_properties.row_count : DEFAULT_LAST_ROW2;
  return String(sheet.sheet_id) + "!A1:E" + String(Math.max(DEFAULT_LAST_ROW2, rowCount));
}
async function onRequestGet5(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var url = new URL(request.url);
  var forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("nocache") === "1";
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_INDUSTRY_SPREADSHEET_TOKEN;
  if (!spreadsheetToken) {
    return jsonResponse(
      { error: "\u672A\u914D\u7F6E FEISHU_INDUSTRY_SPREADSHEET_TOKEN\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u884C\u4E1A\u5927\u76D8 sheet1" },
      503,
      origin
    );
  }
  try {
    var range = await resolveSheetRange2(env, spreadsheetToken, 0, env.FEISHU_INDUSTRY_DAPAN_RANGE);
    var cacheRequest = null;
    if (!forceRefresh) {
      var keyPayload = "industry:dapan:" + spreadsheetToken + ":" + range;
      var hash = await sha256Hex2(keyPayload);
      cacheRequest = new Request("https://industry-dapan.cache/" + hash);
      var hit = await caches.default.match(cacheRequest);
      if (hit) {
        var body = await hit.text();
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-QBT-Industry-DaPan-Cache": "HIT",
            ...corsHeaders(origin)
          }
        });
      }
    }
    var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "UnformattedValue" });
    if (!feishuJson || feishuJson.code !== 0) {
      return jsonResponse(
        { error: feishuJson && feishuJson.msg || "\u884C\u4E1A\u5927\u76D8 sheet1 \u8BFB\u53D6\u5931\u8D25", feishuCode: feishuJson && feishuJson.code },
        502,
        origin
      );
    }
    var values = feishuJson.data && feishuJson.data.valueRange && feishuJson.data.valueRange.values || [];
    var payload = import_industry_data_builder2.default.buildDaPanPayloadFromValues(values, "feishu:" + range);
    var jsonBody = JSON.stringify(payload);
    var res = new Response(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-QBT-Industry-DaPan-Cache": forceRefresh ? "REFRESH" : "MISS",
        ...corsHeaders(origin)
      }
    });
    if (cacheRequest || !forceRefresh) {
      try {
        var cacheReq = cacheRequest || new Request("https://industry-dapan.cache/" + await sha256Hex2("industry:dapan:" + spreadsheetToken + ":" + range));
        await caches.default.put(
          cacheReq,
          new Response(jsonBody, {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "max-age=2592000"
            }
          })
        );
      } catch (ePut) {
      }
    }
    return res;
  } catch (e) {
    return jsonResponse(
      { error: "\u62C9\u53D6\u884C\u4E1A\u5927\u76D8\u6570\u636E\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions8(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var import_industry_data_builder2, DEFAULT_LAST_ROW2;
var init_features_output = __esm({
  "api/data/features-output.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_http();
    init_session();
    init_feishu();
    import_industry_data_builder2 = __toESM(require_industry_data_builder());
    DEFAULT_LAST_ROW2 = 2e4;
    __name(sha256Hex2, "sha256Hex");
    __name(sortSheetsByUiIndex2, "sortSheetsByUiIndex");
    __name(resolveSheetRange2, "resolveSheetRange");
    __name(onRequestGet5, "onRequestGet");
    __name(onRequestOptions8, "onRequestOptions");
  }
});

// api/data/feishu-channel-order-trend.js
function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}
function orderRangeUsesIColumnOrigin(orderRange) {
  var bang = orderRange.indexOf("!");
  if (bang < 0) return false;
  return /I[0-9]*:/i.test(orderRange.slice(bang + 1));
}
function ymdFromExcelSerial(serial) {
  var whole = Math.floor(Number(serial));
  if (whole < 1 || whole > 6e6) return null;
  var utc_days = whole - 25569;
  var ms = utc_days * 86400 * 1e3;
  var dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}
function parseDayFromAH(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !isNaN(v)) {
    return ymdFromExcelSerial(v);
  }
  var str = String(v).trim();
  if (!str) return null;
  var numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6e6) {
    var fromSerial = ymdFromExcelSerial(numOnly);
    if (fromSerial) return fromSerial;
  }
  var part = str.split(/\s+/)[0];
  var parts = part.split(/[\/\-]/);
  if (parts.length >= 3) {
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (y && m && d) return y + "-" + pad2(m) + "-" + pad2(d);
  }
  var t = Date.parse(str.replace(/\//g, "-"));
  if (!isNaN(t)) {
    var dt2 = new Date(t);
    return dt2.getFullYear() + "-" + pad2(dt2.getMonth() + 1) + "-" + pad2(dt2.getDate());
  }
  return null;
}
function parseAmount(v) {
  if (v == null || v === "") return 0;
  var n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
async function sha256Hex3(s) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  var arr = new Uint8Array(buf);
  var hex = "";
  for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}
async function onRequestGet6(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var channelRange = env.FEISHU_CHANNEL_MAP_RANGE || DEFAULT_CHANNEL_RANGE;
  var orderRange = env.FEISHU_ORDER_DETAIL_RANGE || DEFAULT_ORDER_RANGE;
  var skipRows = parseInt(env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || "1", 10);
  if (isNaN(skipRows) || skipRows < 0) skipRows = 1;
  var narrowOrderCols = orderRangeUsesIColumnOrigin(orderRange);
  var colI = narrowOrderCols ? COL_I_NARROW : COL_I_FULL;
  var colAO = narrowOrderCols ? COL_AO_NARROW : COL_AO_FULL;
  var colAH = narrowOrderCols ? COL_AH_NARROW : COL_AH_FULL;
  var colAK = narrowOrderCols ? COL_AK_NARROW : COL_AK_FULL;
  var orderVro = env.FEISHU_CHANNEL_ORDER_VALUE_RENDER || "UnformattedValue";
  if (orderVro !== "FormattedValue" && orderVro !== "UnformattedValue" && orderVro !== "ToString") {
    orderVro = "UnformattedValue";
  }
  var cacheTtlSec = parseInt(env.FEISHU_CHANNEL_ORDER_CACHE_TTL_SEC != null ? env.FEISHU_CHANNEL_ORDER_CACHE_TTL_SEC : "120", 10);
  if (isNaN(cacheTtlSec) || cacheTtlSec < 0) cacheTtlSec = 120;
  var cacheRequest = null;
  if (cacheTtlSec > 0 && auth.user && auth.user.id != null) {
    var keyPayload = "cot:" + auth.user.id + ":" + spreadsheetToken + ":" + channelRange + ":" + orderRange + ":" + skipRows + ":" + orderVro + ":" + (narrowOrderCols ? "n" : "w") + ":v2-daren-count";
    var hash = await sha256Hex3(keyPayload);
    cacheRequest = new Request("https://feishu-channel-order-trend.cache/" + hash);
    var hit = await caches.default.match(cacheRequest);
    if (hit) {
      var body = await hit.text();
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-QBT-Channel-Order-Trend-Cache": "HIT",
          ...corsHeaders(origin)
        }
      });
    }
  }
  try {
    var chJson;
    var ordJson;
    try {
      var pair = await Promise.all([
        fetchSheetValuesV2(env, spreadsheetToken, channelRange, { valueRenderOption: "FormattedValue" }),
        fetchSheetValuesV2(env, spreadsheetToken, orderRange, { valueRenderOption: orderVro })
      ]);
      chJson = pair[0];
      ordJson = pair[1];
    } catch (e) {
      return jsonResponse(
        { error: "\u98DE\u4E66\u8868\u683C\u8BFB\u53D6\u5F02\u5E38", detail: e && e.message ? e.message : String(e) },
        502,
        origin
      );
    }
    if (!chJson || chJson.code !== 0) {
      return jsonResponse(
        {
          error: chJson && chJson.msg || "\u98DE\u4E66\u6E20\u9053\u8868\u8BFB\u53D6\u5931\u8D25",
          feishuCode: chJson && chJson.code
        },
        502,
        origin
      );
    }
    if (!ordJson || ordJson.code !== 0) {
      return jsonResponse(
        {
          error: ordJson && ordJson.msg || "\u98DE\u4E66\u8BA2\u5355\u8868\u8BFB\u53D6\u5931\u8D25",
          feishuCode: ordJson && ordJson.code
        },
        502,
        origin
      );
    }
    var chValues = chJson.data && chJson.data.valueRange && chJson.data.valueRange.values || [];
    var ordValues = ordJson.data && ordJson.data.valueRange && ordJson.data.valueRange.values || [];
    var darenToChannel = {};
    for (var r = skipRows; r < chValues.length; r++) {
      var crow = chValues[r] || [];
      var chName = String(crow[0] || "").trim();
      var darenId = String(crow[4] || "").trim();
      if (!chName || !darenId) continue;
      if (darenToChannel[darenId] === void 0) darenToChannel[darenId] = chName;
    }
    var channelSet = {};
    for (var d0 in darenToChannel) {
      channelSet[darenToChannel[d0]] = true;
    }
    var channels = Object.keys(channelSet).sort();
    var totals = {};
    var darenSumByDayChannel = {};
    for (var ri = skipRows; ri < ordValues.length; ri++) {
      var row = ordValues[ri] || [];
      var needLen = colAO > colAK ? colAO : colAK;
      if (row.length <= needLen) continue;
      var status = String(row[colAK] || "").trim();
      if (status === "\u5DF2\u5173\u95ED") continue;
      var daren = String(row[colAO] || "").trim();
      if (!daren) continue;
      var channel = darenToChannel[daren];
      if (!channel) continue;
      var day = parseDayFromAH(row[colAH]);
      if (!day) continue;
      var amt = parseAmount(row[colI]);
      if (!totals[day]) totals[day] = {};
      totals[day][channel] = (totals[day][channel] || 0) + amt;
      if (!darenSumByDayChannel[day]) darenSumByDayChannel[day] = {};
      if (!darenSumByDayChannel[day][channel]) darenSumByDayChannel[day][channel] = {};
      var dmap = darenSumByDayChannel[day][channel];
      dmap[daren] = (dmap[daren] || 0) + amt;
    }
    var dates = Object.keys(totals).filter(Boolean).sort();
    var amountByChannel = {};
    for (var ci = 0; ci < channels.length; ci++) {
      var cname = channels[ci];
      amountByChannel[cname] = dates.map(function(dt) {
        return totals[dt] && totals[dt][cname] != null ? totals[dt][cname] : 0;
      });
    }
    var darenCountByChannel = {};
    for (var ci2 = 0; ci2 < channels.length; ci2++) {
      var cname2 = channels[ci2];
      darenCountByChannel[cname2] = dates.map(function(dt) {
        var dm = darenSumByDayChannel[dt] && darenSumByDayChannel[dt][cname2];
        if (!dm) return 0;
        var n = 0;
        for (var did in dm) {
          if (dm[did] > 0) n++;
        }
        return n;
      });
    }
    var payload = {
      spreadsheetToken,
      channelRange,
      orderRange,
      dates,
      channels,
      amountByChannel,
      darenCountByChannel
    };
    var jsonBody = JSON.stringify(payload);
    var res = new Response(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-QBT-Channel-Order-Trend-Cache": "MISS",
        ...corsHeaders(origin)
      }
    });
    if (cacheRequest && cacheTtlSec > 0) {
      try {
        await caches.default.put(
          cacheRequest,
          new Response(jsonBody, {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "max-age=" + cacheTtlSec
            }
          })
        );
      } catch (ePut) {
      }
    }
    return res;
  } catch (e) {
    return jsonResponse(
      { error: "\u6E20\u9053\u8BA2\u5355\u8D8B\u52BF\u805A\u5408\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions9(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN, DEFAULT_CHANNEL_RANGE, DEFAULT_ORDER_RANGE, COL_I_FULL, COL_AO_FULL, COL_AH_FULL, COL_AK_FULL, COL_I_NARROW, COL_AO_NARROW, COL_AH_NARROW, COL_AK_NARROW;
var init_feishu_channel_order_trend = __esm({
  "api/data/feishu-channel-order-trend.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN = "P1zusUMg2haMGctskH6cydLqn5e";
    DEFAULT_CHANNEL_RANGE = "ghju03!A1:E2000";
    DEFAULT_ORDER_RANGE = "tuec5U!I1:AO20000";
    COL_I_FULL = 8;
    COL_AO_FULL = 40;
    COL_AH_FULL = 33;
    COL_AK_FULL = 36;
    COL_I_NARROW = 0;
    COL_AO_NARROW = 32;
    COL_AH_NARROW = 25;
    COL_AK_NARROW = 28;
    __name(pad2, "pad2");
    __name(orderRangeUsesIColumnOrigin, "orderRangeUsesIColumnOrigin");
    __name(ymdFromExcelSerial, "ymdFromExcelSerial");
    __name(parseDayFromAH, "parseDayFromAH");
    __name(parseAmount, "parseAmount");
    __name(sha256Hex3, "sha256Hex");
    __name(onRequestGet6, "onRequestGet");
    __name(onRequestOptions9, "onRequestOptions");
  }
});

// api/data/feishu-daily-sales.js
function splitRange(range) {
  var i = String(range || "").indexOf("!");
  if (i < 0) return { sheetPart: String(range || ""), addrPart: "A1:ZZ20000" };
  return { sheetPart: String(range || "").slice(0, i), addrPart: String(range || "").slice(i + 1) || "A1:ZZ20000" };
}
function hasBrokenSheetName(range) {
  var parsed = splitRange(range);
  var s = String(parsed.sheetPart || "");
  return !s || s.indexOf("?") >= 0 || s === "undefined" || s === "null";
}
function isSheetNotFound(feishuJson) {
  var msg = String(feishuJson && feishuJson.msg || "");
  return msg.indexOf("not found sheetId") >= 0 || msg.indexOf("sheetId not found") >= 0;
}
function isDataExceeded(feishuJson) {
  var msg = String(feishuJson && feishuJson.msg || "");
  return msg.indexOf("data exceeded") >= 0 && msg.indexOf("10485760") >= 0;
}
function shrinkRangeMaxRows(range, maxRows) {
  var parsed = splitRange(range);
  var addr = String(parsed.addrPart || "");
  var m = addr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return null;
  var c1 = m[1];
  var r1 = parseInt(m[2], 10);
  var c2 = m[3];
  var r2 = parseInt(m[4], 10);
  if (!isFinite(r1) || !isFinite(r2) || r2 <= 0 || maxRows <= 0) return null;
  var target = Math.min(r2, maxRows);
  if (target >= r2) return null;
  if (target <= r1) target = r1 + 1;
  return String(parsed.sheetPart || "") + "!" + c1 + String(r1) + ":" + c2 + String(target);
}
function mergeMainAndModelData(mainValues, modelValues) {
  if (!mainValues || !mainValues.length) return mainValues || [];
  if (!modelValues || !modelValues.length) return mainValues;
  var result = [];
  var maxRows = Math.max(mainValues.length, modelValues.length);
  var AO_COLUMN_INDEX = 40;
  for (var i = 0; i < maxRows; i++) {
    var mainRow = mainValues[i] || [];
    var modelRow = modelValues[i] || [];
    var mergedRow = new Array(Math.max(mainRow.length, AO_COLUMN_INDEX + modelRow.length)).fill("");
    for (var j = 0; j < mainRow.length; j++) {
      mergedRow[j] = mainRow[j];
    }
    for (var k = 0; k < modelRow.length; k++) {
      mergedRow[AO_COLUMN_INDEX + k] = modelRow[k];
    }
    result.push(mergedRow);
  }
  return result;
}
async function resolveRangeBySheetTitle(env, spreadsheetToken, rangeMaybeTitle) {
  var parsed = splitRange(rangeMaybeTitle);
  if (!parsed.sheetPart) return null;
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) return null;
  var sheets = sheetsJson.data && sheetsJson.data.sheets || [];
  var exact = sheets.find(function(s) {
    return String(s.title || "").trim() === parsed.sheetPart.trim();
  });
  var fuzzy = exact ? null : sheets.find(function(s) {
    return String(s.title || "").indexOf(parsed.sheetPart) >= 0 || parsed.sheetPart.indexOf(String(s.title || "")) >= 0;
  });
  var hit = exact || fuzzy;
  if (!hit || !hit.sheet_id) return null;
  return String(hit.sheet_id) + "!" + parsed.addrPart;
}
async function resolveRange2Fallback(env, spreadsheetToken, range2) {
  var parsed = splitRange(range2);
  var addr = parsed.addrPart || "A1:Z20000";
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) return null;
  var sheets = sheetsJson.data && sheetsJson.data.sheets || [];
  if (!sheets.length) return null;
  var byName = sheets.find(function(s) {
    var t = String(s.title || "");
    return t.indexOf("\u4EB2\u5B50\u5C4F") >= 0 || t.indexOf("\u4EB2\u5B50") >= 0;
  });
  var second = sheets.length >= 2 ? sheets[1] : null;
  var hit = byName || second || sheets[0];
  if (!hit || !hit.sheet_id) return null;
  return String(hit.sheet_id) + "!" + addr;
}
async function fetchRangeWithAutoResolve(env, spreadsheetToken, rawRange) {
  var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, rawRange);
  var finalRange = rawRange;
  if (feishuJson.code !== 0 && isSheetNotFound(feishuJson)) {
    var resolved = await resolveRangeBySheetTitle(env, spreadsheetToken, rawRange);
    if (resolved) {
      var retry = await fetchSheetValuesV2(env, spreadsheetToken, resolved);
      if (retry.code === 0) {
        feishuJson = retry;
        finalRange = resolved;
      }
    }
  }
  if (feishuJson.code !== 0 && isDataExceeded(feishuJson)) {
    var caps = [12e3, 8e3, 6e3, 4e3, 3e3, 2e3];
    for (var i = 0; i < caps.length; i++) {
      var smaller = shrinkRangeMaxRows(finalRange, caps[i]);
      if (!smaller) continue;
      var retry2 = await fetchSheetValuesV2(env, spreadsheetToken, smaller);
      if (retry2 && retry2.code === 0) {
        feishuJson = retry2;
        finalRange = smaller;
        break;
      }
      if (retry2 && retry2.code !== 0) {
        feishuJson = retry2;
        finalRange = smaller;
        if (!isDataExceeded(retry2)) break;
      }
    }
  }
  return { feishuJson, finalRange };
}
async function onRequestGet7(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN2;
  var range = env.FEISHU_SHEET_RANGE || DEFAULT_RANGE;
  var rangeModel = env.FEISHU_SHEET_RANGE_MODEL || DEFAULT_RANGE_MODEL;
  var range2 = env.FEISHU_SHEET_RANGE_2 || DEFAULT_RANGE_2;
  try {
    var r1 = await fetchRangeWithAutoResolve(env, spreadsheetToken, range);
    if (r1.feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (r1.feishuJson.msg || "\u98DE\u4E66\u8868\u683C\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF") + "\uFF08\u4E3Bsheet range=" + String(r1.finalRange || range) + "\uFF09",
          feishuCode: r1.feishuJson.code
        },
        502,
        origin
      );
    }
    var rModel = await fetchRangeWithAutoResolve(env, spreadsheetToken, rangeModel);
    var modelValues = [];
    if (rModel.feishuJson.code === 0) {
      modelValues = rModel.feishuJson.data?.valueRange?.values || [];
    }
    var safeRange2 = hasBrokenSheetName(range2) ? DEFAULT_RANGE_2 : range2;
    var r2 = await fetchRangeWithAutoResolve(env, spreadsheetToken, safeRange2);
    if (r2.feishuJson.code !== 0 && isSheetNotFound(r2.feishuJson)) {
      var fb2 = await resolveRange2Fallback(env, spreadsheetToken, safeRange2);
      if (fb2) {
        var r2b = await fetchRangeWithAutoResolve(env, spreadsheetToken, fb2);
        if (r2b.feishuJson.code === 0) r2 = r2b;
      }
    }
    var mainValues = r1.feishuJson.data?.valueRange?.values || [];
    var mergedValues = mergeMainAndModelData(mainValues, modelValues);
    var data = r1.feishuJson.data || {};
    var data2 = r2.feishuJson?.data || {};
    var payload = {
      spreadsheetToken,
      range: r1.finalRange,
      rangeModel: rModel.finalRange,
      range2: r2.finalRange,
      revision: data.revision,
      valueRange: { range: r1.finalRange, majorDimension: "ROWS", values: mergedValues },
      revision2: data2.revision,
      valueRange2: data2.valueRange
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    var msg = e && e.message === "FEISHU_NOT_CONFIGURED" ? "\u98DE\u4E66\u5E94\u7528\u672A\u914D\u7F6E" : String(e && e.message || e);
    return jsonResponse({ error: "\u62C9\u53D6\u98DE\u4E66\u8868\u683C\u5931\u8D25", detail: msg }, 502, origin);
  }
}
async function onRequestOptions10(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN2, DEFAULT_RANGE, DEFAULT_RANGE_MODEL, DEFAULT_RANGE_2;
var init_feishu_daily_sales = __esm({
  "api/data/feishu-daily-sales.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN2 = "EBwmsjjArhutvWtM2E9cLUMGnYd";
    DEFAULT_RANGE = "0VWscb!A1:H20000";
    DEFAULT_RANGE_MODEL = "0VWscb!AO1:BZ20000";
    DEFAULT_RANGE_2 = "\u4EB2\u5B50\u5C4F\u65E5\u62A5\u6570!A1:Z20000";
    __name(splitRange, "splitRange");
    __name(hasBrokenSheetName, "hasBrokenSheetName");
    __name(isSheetNotFound, "isSheetNotFound");
    __name(isDataExceeded, "isDataExceeded");
    __name(shrinkRangeMaxRows, "shrinkRangeMaxRows");
    __name(mergeMainAndModelData, "mergeMainAndModelData");
    __name(resolveRangeBySheetTitle, "resolveRangeBySheetTitle");
    __name(resolveRange2Fallback, "resolveRange2Fallback");
    __name(fetchRangeWithAutoResolve, "fetchRangeWithAutoResolve");
    __name(onRequestGet7, "onRequestGet");
    __name(onRequestOptions10, "onRequestOptions");
  }
});

// api/data/feishu-douyin-daily-trend.js
async function onRequestGet8(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_DOUYIN_TREND_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN3;
  var range = env.FEISHU_DOUYIN_TREND_RANGE || DEFAULT_RANGE2;
  try {
    var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "FormattedValue" });
    if (!feishuJson || feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: feishuJson && feishuJson.msg || "\u98DE\u4E66\u8868\u683C\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF",
          feishuCode: feishuJson && feishuJson.code
        },
        502,
        origin
      );
    }
    var data = feishuJson.data || {};
    var payload = {
      spreadsheetToken,
      range,
      revision: data.revision,
      valueRange: data.valueRange || { values: [] }
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse(
      { error: "\u62C9\u53D6\u98DE\u4E66\u6296\u97F3\u65E5\u5EA6\u8D8B\u52BF\u8868\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions11(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN3, DEFAULT_RANGE2;
var init_feishu_douyin_daily_trend = __esm({
  "api/data/feishu-douyin-daily-trend.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN3 = "P1zusUMg2haMGctskH6cydLqn5e";
    DEFAULT_RANGE2 = "8f2cd8!A1:N20000";
    __name(onRequestGet8, "onRequestGet");
    __name(onRequestOptions11, "onRequestOptions");
  }
});

// api/data/feishu-douyin-model-distribution.js
function pad22(n) {
  return n < 10 ? "0" + n : String(n);
}
function ymdFromExcelSerial2(serial) {
  var whole = Math.floor(Number(serial));
  if (whole < 1 || whole > 6e6) return null;
  var utc_days = whole - 25569;
  var ms = utc_days * 86400 * 1e3;
  var dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  return dt.getFullYear() + "-" + pad22(dt.getMonth() + 1) + "-" + pad22(dt.getDate());
}
function parseDayFromAH2(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !isNaN(v)) return ymdFromExcelSerial2(v);
  var str = String(v).trim();
  if (!str) return null;
  var numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6e6) {
    var fs = ymdFromExcelSerial2(numOnly);
    if (fs) return fs;
  }
  var part = str.split(/\s+/)[0];
  var parts = part.split(/[\/\-]/);
  if (parts.length >= 3) {
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (y && m && d) return y + "-" + pad22(m) + "-" + pad22(d);
  }
  var t = Date.parse(str.replace(/\//g, "-"));
  if (!isNaN(t)) {
    var dt2 = new Date(t);
    return dt2.getFullYear() + "-" + pad22(dt2.getMonth() + 1) + "-" + pad22(dt2.getDate());
  }
  return null;
}
function parseQty(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && !isNaN(v)) {
    if (v < 0) return 0;
    return Math.round(v);
  }
  var s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[\uFF10-\uFF19]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 65296 + 48);
  });
  s = s.replace(/,/g, "").replace(/\u00a0/g, "").replace(/\u3000/g, "");
  var n = parseFloat(s);
  if (!isNaN(n) && n >= 0) return Math.round(n);
  var compact = s.replace(/\s+/g, "");
  n = parseFloat(compact);
  if (!isNaN(n) && n >= 0) return Math.round(n);
  var m = compact.match(/-?\d+(?:\.\d+)?/);
  if (m) {
    n = parseFloat(m[0]);
    if (!isNaN(n) && n >= 0) return Math.round(n);
  }
  return 0;
}
function buildRulesSorted(rowsAB) {
  var raw = [];
  (rowsAB || []).forEach(function(row, idx) {
    var kw = row && row[0] != null ? String(row[0]).trim() : "";
    if (!kw) return;
    var model = row && row[1] != null ? String(row[1]).trim() : "";
    raw.push({ keyword: kw, model: model || "\u672A\u5339\u914D", rowIndex: idx });
  });
  raw.sort(function(a, b) {
    var d = b.keyword.length - a.keyword.length;
    return d !== 0 ? d : a.rowIndex - b.rowIndex;
  });
  return raw;
}
function matchModel(productName, rules) {
  var name = String(productName == null ? "" : productName).trim();
  if (!name) return "\u672A\u5339\u914D";
  var lower = name.toLowerCase();
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var k = r.keyword.toLowerCase();
    if (k && lower.indexOf(k) !== -1) return r.model;
  }
  return "\u672A\u5339\u914D";
}
function orderRangeHasColumnC(orderRange) {
  var bang = orderRange.indexOf("!");
  if (bang < 0) return false;
  var frag = orderRange.slice(bang + 1);
  return /^A/i.test(frag) || /^B/i.test(frag) || /^C/i.test(frag);
}
function extractSheetId(range) {
  var bang = range.indexOf("!");
  if (bang < 0) return null;
  return range.slice(0, bang);
}
async function fetchSingleColumn(env, spreadsheetToken, sheetId, colLetter, startRow, endRow) {
  var range = sheetId + "!" + colLetter + startRow + ":" + colLetter + endRow;
  var result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "FormattedValue" });
  if (!result || result.code !== 0) {
    return { success: false, error: result?.msg || "\u8BFB\u53D6\u5931\u8D25", code: result?.code };
  }
  var values = result.data && result.data.valueRange && result.data.valueRange.values || [];
  return { success: true, values };
}
function mergeColumnsToRows(columns, rowCount) {
  var result = [];
  for (var i = 0; i < rowCount; i++) {
    var row = new Array(41).fill("");
    if (columns.C && columns.C[i]) row[COL_C] = columns.C[i][0];
    if (columns.E && columns.E[i]) row[COL_E] = columns.E[i][0];
    if (columns.AH && columns.AH[i]) row[COL_AH] = columns.AH[i][0];
    if (columns.AK && columns.AK[i]) row[COL_AK] = columns.AK[i][0];
    if (columns.AO && columns.AO[i]) row[COL_AO] = columns.AO[i][0];
    result.push(row);
  }
  return result;
}
async function onRequestGet9(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN4;
  var orderRange = env.FEISHU_DOUYIN_MODEL_ORDER_RANGE || env.FEISHU_ORDER_DETAIL_RANGE || DEFAULT_ORDER_RANGE2;
  if (!orderRangeHasColumnC(orderRange)) {
    return jsonResponse(
      {
        error: "\u8BA2\u5355 range \u987B\u4ECE A/B/C \u5217\u8D77\u4EE5\u5305\u542B\u5546\u54C1\u540D(C)\u3002\u8BF7\u8BBE\u7F6E FEISHU_DOUYIN_MODEL_ORDER_RANGE=tuec5U!A2:AO20000"
      },
      400,
      origin
    );
  }
  var cutover = env.FEISHU_DP_CUTOVER_DATE && String(env.FEISHU_DP_CUTOVER_DATE).trim() ? String(env.FEISHU_DP_CUTOVER_DATE).trim() : "2026-04-01";
  var urlObj = new URL(request.url);
  var qStart = urlObj.searchParams.get("start");
  var qEnd = urlObj.searchParams.get("end");
  try {
    var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
    if (!sheetsJson || sheetsJson.code !== 0) {
      return jsonResponse(
        { error: sheetsJson && sheetsJson.msg || "\u98DE\u4E66\u5B50\u8868\u5217\u8868\u5931\u8D25", feishuCode: sheetsJson && sheetsJson.code },
        502,
        origin
      );
    }
    var sheets = sheetsJson.data && sheetsJson.data.sheets ? sheetsJson.data.sheets : [];
    var byTitle = /* @__PURE__ */ __name(function(n) {
      return sheets.find(function(s) {
        return String(s.title || "").toLowerCase() === n;
      });
    }, "byTitle");
    var sMap = byTitle("sheet3") || sheets[2];
    if (!sMap) {
      return jsonResponse({ error: "\u672A\u627E\u5230\u4EA7\u54C1\u578B\u53F7\u6620\u5C04\u8868\uFF08sheet3\uFF09" }, 502, origin);
    }
    var mapRow = Math.min(Math.max(typeof (sMap.grid_properties || {}).row_count === "number" ? sMap.grid_properties.row_count : 2e3, 2), 1e4);
    var mapRange = sMap.sheet_id + "!A2:B" + mapRow;
    var mapJson = await fetchSheetValuesV2(env, spreadsheetToken, mapRange, { valueRenderOption: "FormattedValue" });
    if (!mapJson || mapJson.code !== 0) {
      return jsonResponse(
        { error: mapJson && mapJson.msg || "\u8BFB\u53D6\u578B\u53F7\u6620\u5C04\u8868\u5931\u8D25", feishuCode: mapJson && mapJson.code },
        502,
        origin
      );
    }
    var rowsAB = mapJson.data && mapJson.data.valueRange && mapJson.data.valueRange.values || [];
    var rules = buildRulesSorted(rowsAB);
    var sheetId = extractSheetId(orderRange);
    if (!sheetId) {
      return jsonResponse({ error: "\u65E0\u6CD5\u89E3\u6790sheetId" }, 400, origin);
    }
    var colResults = await Promise.all([
      fetchSingleColumn(env, spreadsheetToken, sheetId, "C", 2, 2e4),
      // 商品名
      fetchSingleColumn(env, spreadsheetToken, sheetId, "E", 2, 2e4),
      // 数量
      fetchSingleColumn(env, spreadsheetToken, sheetId, "AH", 2, 2e4),
      // 日期
      fetchSingleColumn(env, spreadsheetToken, sheetId, "AK", 2, 2e4),
      // 状态
      fetchSingleColumn(env, spreadsheetToken, sheetId, "AO", 2, 2e4)
      // 达人ID
    ]);
    var errors = [];
    colResults.forEach(function(r, idx) {
      if (!r.success) errors.push(REQUIRED_COLS[idx] + ":" + r.error);
    });
    if (errors.length > 0) {
      return jsonResponse({ error: "\u8BFB\u53D6\u5217\u5931\u8D25: " + errors.join(", ") }, 502, origin);
    }
    var actualRowCount = Math.max(
      colResults[0].values.length,
      colResults[1].values.length,
      colResults[2].values.length,
      colResults[3].values.length,
      colResults[4].values.length
    );
    var ordValues = mergeColumnsToRows({
      C: colResults[0].values,
      E: colResults[1].values,
      AH: colResults[2].values,
      AK: colResults[3].values,
      AO: colResults[4].values
    }, actualRowCount);
    var qtyDp = {};
    var qtyDaren = {};
    var meta = {
      skippedClosed: 0,
      skippedSpecialBeforeCutover: 0,
      skippedNoProduct: 0,
      skippedDateRange: 0,
      rowsCountedDp: 0,
      rowsCountedDaren: 0
    };
    var skipRows = 0;
    for (var ri = skipRows; ri < ordValues.length; ri++) {
      var row = ordValues[ri] || [];
      if (row.length <= COL_AO) continue;
      var status = String(row[COL_AK] || "").trim();
      if (status === "\u5DF2\u5173\u95ED") {
        meta.skippedClosed++;
        continue;
      }
      var daren = String(row[COL_AO] || "").trim();
      var day = parseDayFromAH2(row[COL_AH]);
      if (qStart && qEnd && qStart <= qEnd) {
        if (day == null || day < qStart || day > qEnd) {
          meta.skippedDateRange++;
          continue;
        }
      }
      if (SPECIAL_DP_CUTOVER_DAREN_IDS[daren]) {
        if (day == null || day < cutover) {
          meta.skippedSpecialBeforeCutover++;
          continue;
        }
      }
      var product = row[COL_C] != null ? String(row[COL_C]).trim() : "";
      if (!product) {
        meta.skippedNoProduct++;
        continue;
      }
      var model = matchModel(product, rules);
      var q = parseQty(row[COL_E]);
      var bucketDp = false;
      if (SPECIAL_DP_CUTOVER_DAREN_IDS[daren] && day != null && day >= cutover) {
        bucketDp = true;
      } else if (DP_DAREN_IDS[daren]) {
        bucketDp = true;
      }
      if (bucketDp) {
        qtyDp[model] = (qtyDp[model] || 0) + q;
        meta.rowsCountedDp++;
      } else {
        qtyDaren[model] = (qtyDaren[model] || 0) + q;
        meta.rowsCountedDaren++;
      }
    }
    var modelSet = {};
    Object.keys(qtyDp).forEach(function(k) {
      modelSet[k] = true;
    });
    Object.keys(qtyDaren).forEach(function(k) {
      modelSet[k] = true;
    });
    var models = Object.keys(modelSet).sort(function(a, b) {
      return a.localeCompare(b, "zh-CN");
    });
    return new Response(
      JSON.stringify({
        spreadsheetToken,
        orderRange,
        mapSheetTitle: sMap.title,
        cutover,
        models,
        qtyByModelDp: qtyDp,
        qtyByModelDaren: qtyDaren,
        meta
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          ...corsHeaders(origin)
        }
      }
    );
  } catch (e) {
    return jsonResponse(
      { error: "\u6296\u97F3\u578B\u53F7\u5206\u5E03\u805A\u5408\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions12(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN4, DEFAULT_ORDER_RANGE2, REQUIRED_COLS, COL_C, COL_E, COL_AH, COL_AK, COL_AO, DP_DAREN_IDS, SPECIAL_DP_CUTOVER_DAREN_IDS;
var init_feishu_douyin_model_distribution = __esm({
  "api/data/feishu-douyin-model-distribution.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN4 = "P1zusUMg2haMGctskH6cydLqn5e";
    DEFAULT_ORDER_RANGE2 = "tuec5U!A2:AO20000";
    REQUIRED_COLS = ["C", "E", "AH", "AK", "AO"];
    COL_C = 2;
    COL_E = 4;
    COL_AH = 33;
    COL_AK = 36;
    COL_AO = 40;
    DP_DAREN_IDS = {
      "100740124329": true,
      "2872348280361767": true,
      "58892651868": true,
      "1614499448100063": true,
      "301699496948925": true
    };
    SPECIAL_DP_CUTOVER_DAREN_IDS = {
      "151063260317056": true,
      "284088526715758": true
    };
    __name(pad22, "pad2");
    __name(ymdFromExcelSerial2, "ymdFromExcelSerial");
    __name(parseDayFromAH2, "parseDayFromAH");
    __name(parseQty, "parseQty");
    __name(buildRulesSorted, "buildRulesSorted");
    __name(matchModel, "matchModel");
    __name(orderRangeHasColumnC, "orderRangeHasColumnC");
    __name(extractSheetId, "extractSheetId");
    __name(fetchSingleColumn, "fetchSingleColumn");
    __name(mergeColumnsToRows, "mergeColumnsToRows");
    __name(onRequestGet9, "onRequestGet");
    __name(onRequestOptions12, "onRequestOptions");
  }
});

// api/data/feishu-douyin-sales.js
function numFromCell(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^[\s\u00a0]*[=＝]/.test(v)) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  var s = String(v).replace(/[,，\s\u00a0]/g, "");
  var wan = s.match(/^([\d.]+)\s*万/);
  if (wan) {
    var w = parseFloat(wan[1]);
    return isFinite(w) ? w * 1e4 : null;
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function isFormulaText(v) {
  return typeof v === "string" && /^[\s\u00a0]*[=＝]/.test(v);
}
function mergeFmtUnfValueRanges(fmtValues, unfValues) {
  if (!fmtValues && !unfValues) return [];
  if (!fmtValues) return unfValues;
  if (!unfValues) return fmtValues;
  var rows = Math.max(fmtValues.length, unfValues.length);
  var out = [];
  for (var r = 0; r < rows; r++) {
    var fr = fmtValues[r] || [];
    var ur = unfValues[r] || [];
    var cols = Math.max(fr.length, ur.length);
    var row = [];
    for (var c = 0; c < cols; c++) {
      var f = fr[c];
      var u = ur[c];
      if (c === 0) {
        row[c] = f != null && f !== "" ? f : u;
        continue;
      }
      var fn = isFormulaText(f) ? null : numFromCell(f);
      var un = isFormulaText(u) ? null : numFromCell(u);
      if (fn != null && un != null) {
        row[c] = Math.abs(fn) >= Math.abs(un) ? f : u;
      } else if (fn != null) {
        row[c] = f;
      } else if (un != null) {
        row[c] = u;
      } else if (!isFormulaText(f) && f != null && f !== "") {
        row[c] = f;
      } else if (!isFormulaText(u) && u != null && u !== "") {
        row[c] = u;
      } else {
        row[c] = f != null && f !== "" ? f : u;
      }
    }
    out.push(row);
  }
  return out;
}
async function fetchSheetRangeMerged(env, spreadsheetToken, range) {
  var fmt = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "FormattedValue" });
  var unf = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "UnformattedValue" });
  if (fmt.code !== 0) return { feishuJson: fmt, values: null };
  var vf = fmt.data && fmt.data.valueRange && fmt.data.valueRange.values || [];
  if (unf.code !== 0) {
    return { feishuJson: fmt, values: vf };
  }
  var vu = unf.data && unf.data.valueRange && unf.data.valueRange.values || [];
  return { feishuJson: fmt, values: mergeFmtUnfValueRanges(vf, vu) };
}
function sortSheetsByUiIndex3(sheets) {
  var arr = (sheets || []).slice();
  var hasAny = arr.some(function(s) {
    return s && typeof s.index === "number" && isFinite(s.index);
  });
  if (!hasAny) return arr;
  arr.sort(function(a, b) {
    var ia = a && typeof a.index === "number" ? a.index : 1e9;
    var ib = b && typeof b.index === "number" ? b.index : 1e9;
    return ia - ib;
  });
  return arr;
}
async function buildSheetRangeList(env, spreadsheetToken) {
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    return { error: sheetsJson, ranges: null };
  }
  var sheets = sortSheetsByUiIndex3(sheetsJson.data && sheetsJson.data.sheets || []);
  if (sheets.length < 3) {
    return { error: { code: 40001, msg: "\u6296\u97F3\u8868 sheet \u6570\u91CF\u4E0D\u8DB3 3 \u4E2A" }, ranges: null };
  }
  var s1 = sheets[0] && sheets[0].sheet_id ? String(sheets[0].sheet_id) : "";
  var s2 = sheets[1] && sheets[1].sheet_id ? String(sheets[1].sheet_id) : "";
  var s3 = sheets[2] && sheets[2].sheet_id ? String(sheets[2].sheet_id) : "";
  if (!s1 || !s2 || !s3) {
    return { error: { code: 40002, msg: "\u6296\u97F3\u8868\u7F3A\u5C11 sheet_id" }, ranges: null };
  }
  return {
    error: null,
    ranges: {
      /** sheet1 需覆盖 D/F/H/J（自播GMV、达人GMV、自播GSV、达人GSV） */
      range1: s1 + "!A1:J20000",
      /** sheet2 需覆盖 G/K（自播GMV、自播GSV） */
      range2: s2 + "!A1:K20000",
      /** sheet3 亲子屏：G 列 GMV、K 列 GSV（与 sheet2 学习机列位一致） */
      range3: s3 + "!A1:K20000",
      sheetMeta: [
        { title: sheets[0].title || "", sheet_id: s1, index: sheets[0].index },
        { title: sheets[1].title || "", sheet_id: s2, index: sheets[1].index },
        { title: sheets[2].title || "", sheet_id: s3, index: sheets[2].index }
      ]
    }
  };
}
async function onRequestGet10(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_DOUYIN_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN5;
  try {
    var resolved = await buildSheetRangeList(env, spreadsheetToken);
    if (resolved.error || !resolved.ranges) {
      return jsonResponse(
        {
          error: resolved.error && resolved.error.msg || "\u6296\u97F3\u8868\u5DE5\u4F5C\u8868\u89E3\u6790\u5931\u8D25",
          feishuCode: resolved.error && resolved.error.code
        },
        502,
        origin
      );
    }
    var range1 = resolved.ranges.range1;
    var range2 = resolved.ranges.range2;
    var range3 = resolved.ranges.range3;
    var m1 = await fetchSheetRangeMerged(env, spreadsheetToken, range1);
    var m2 = await fetchSheetRangeMerged(env, spreadsheetToken, range2);
    var m3 = await fetchSheetRangeMerged(env, spreadsheetToken, range3);
    if (!m1.feishuJson || m1.feishuJson.code !== 0) {
      var e1 = m1.feishuJson || {};
      return jsonResponse({ error: e1.msg || "\u6296\u97F3sheet1\u8BFB\u53D6\u5931\u8D25", feishuCode: e1.code }, 502, origin);
    }
    if (!m2.feishuJson || m2.feishuJson.code !== 0) {
      var e2 = m2.feishuJson || {};
      return jsonResponse({ error: e2.msg || "\u6296\u97F3sheet2\u8BFB\u53D6\u5931\u8D25", feishuCode: e2.code }, 502, origin);
    }
    if (!m3.feishuJson || m3.feishuJson.code !== 0) {
      var e3 = m3.feishuJson || {};
      return jsonResponse({ error: e3.msg || "\u6296\u97F3sheet3\u8BFB\u53D6\u5931\u8D25", feishuCode: e3.code }, 502, origin);
    }
    var d1 = m1.feishuJson.data || {};
    var d2 = m2.feishuJson.data || {};
    var d3 = m3.feishuJson.data || {};
    var vr1 = d1.valueRange || {};
    var vr2 = d2.valueRange || {};
    var vr3 = d3.valueRange || {};
    var payload = {
      spreadsheetToken,
      range: range1,
      range2,
      range3,
      sheetMeta: resolved.ranges.sheetMeta,
      revision: d1.revision,
      revision2: d2.revision,
      revision3: d3.revision,
      valueRange: { range: vr1.range || range1, majorDimension: "ROWS", values: m1.values || [] },
      valueRange2: { range: vr2.range || range2, majorDimension: "ROWS", values: m2.values || [] },
      valueRange3: { range: vr3.range || range3, majorDimension: "ROWS", values: m3.values || [] }
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse(
      { error: "\u62C9\u53D6\u98DE\u4E66\u6296\u97F3\u8868\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions13(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN5;
var init_feishu_douyin_sales = __esm({
  "api/data/feishu-douyin-sales.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN5 = "X2jWseyDuh5invtFhgGcfgnCnWf";
    __name(numFromCell, "numFromCell");
    __name(isFormulaText, "isFormulaText");
    __name(mergeFmtUnfValueRanges, "mergeFmtUnfValueRanges");
    __name(fetchSheetRangeMerged, "fetchSheetRangeMerged");
    __name(sortSheetsByUiIndex3, "sortSheetsByUiIndex");
    __name(buildSheetRangeList, "buildSheetRangeList");
    __name(onRequestGet10, "onRequestGet");
    __name(onRequestOptions13, "onRequestOptions");
  }
});

// api/data/feishu-gmv-combined.js
function expandRangeEndColumnToH(range) {
  var s = String(range || "");
  var i = s.indexOf("!");
  if (i < 0) return range;
  var addr = s.slice(i + 1);
  var m = addr.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!m) return range;
  var c2 = m[3].toUpperCase();
  if (c2 === "G") {
    return s.slice(0, i + 1) + m[1] + m[2] + ":H" + m[4];
  }
  return range;
}
function excelColLettersToNum1Based(letters) {
  var s = String(letters || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return 0;
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n;
}
function excelNum1BasedToColLetters(n) {
  if (n < 1) n = 1;
  var s = "";
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function expandRangeEndColumnToAtLeast(range, minEndColLetters) {
  var minN = excelColLettersToNum1Based(minEndColLetters);
  if (minN < 1) return range;
  var s = String(range || "");
  var i = s.indexOf("!");
  if (i < 0) return range;
  var m = s.slice(i + 1).match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!m) return range;
  var endN = excelColLettersToNum1Based(m[3]);
  if (endN >= minN) return range;
  return s.slice(0, i + 1) + m[1] + m[2] + ":" + excelNum1BasedToColLetters(minN) + m[4];
}
function maxRowLength(values) {
  var mx = 0;
  if (!values || !values.length) return 0;
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (row && row.length > mx) mx = row.length;
  }
  return mx;
}
function numFromCell2(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^[\s\u00a0]*[=＝]/.test(v)) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  var s = String(v).replace(/[,，\s\u00a0]/g, "");
  var wan = s.match(/^([\d.]+)\s*万/);
  if (wan) {
    var w = parseFloat(wan[1]);
    return isFinite(w) ? w * 1e4 : null;
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function isFormulaText2(v) {
  return typeof v === "string" && /^[\s\u00a0]*[=＝]/.test(v);
}
async function resolveJdGmvRange(env, spreadsheetToken, explicitRange) {
  var ex = explicitRange && String(explicitRange).trim();
  if (ex) return { range: ex, source: "FEISHU_JD_GMV_RANGE" };
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    return { range: null, source: "auto", reason: "sheets_query_failed" };
  }
  var sheets = sheetsJson.data && sheetsJson.data.sheets || [];
  if (sheets.length < 3) {
    return { range: null, source: "auto", reason: "less_than_3_sheets", sheetCount: sheets.length };
  }
  var t = sheets[2];
  if (!t || !t.sheet_id) {
    return { range: null, source: "auto", reason: "no_third_sheet_id" };
  }
  return {
    range: String(t.sheet_id) + "!A1:F20000",
    source: "auto",
    sheetTitle: t.title || "",
    sheetIndex: 2
  };
}
function sortSheetsByUiIndex4(sheets) {
  var arr = (sheets || []).slice();
  var hasAny = arr.some(function(s) {
    return s && typeof s.index === "number" && isFinite(s.index);
  });
  if (!hasAny) return arr;
  arr.sort(function(a, b) {
    var ia = a && typeof a.index === "number" ? a.index : 1e9;
    var ib = b && typeof b.index === "number" ? b.index : 1e9;
    return ia - ib;
  });
  return arr;
}
async function resolveJdSheetRangeBySortedIndex(env, spreadsheetToken, sortedIndex, endColLetter) {
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    return { range: null, source: "auto", reason: "sheets_query_failed" };
  }
  var sheetsRaw = sheetsJson.data && sheetsJson.data.sheets || [];
  var sheets = sortSheetsByUiIndex4(sheetsRaw);
  if (sheets.length <= sortedIndex) {
    return { range: null, source: "auto", reason: "less_than_n_sheets", sheetCount: sheets.length, sortedIndex };
  }
  var t = sheets[sortedIndex];
  if (!t || !t.sheet_id) {
    return { range: null, source: "auto", reason: "no_sheet_id" };
  }
  var c = String(endColLetter || "G").toUpperCase();
  return {
    range: String(t.sheet_id) + "!A1:" + c + "20000",
    source: "auto",
    sheetTitle: t.title || "",
    sortedIndex
  };
}
function statsGridColumn(values, colIndex) {
  var nonEmpty = 0;
  var numericParseable = 0;
  var formulaString = 0;
  var rowsMissingH = 0;
  if (!values || !values.length) {
    return { rowsIterated: 0, nonEmpty: 0, numericParseable: 0, formulaString: 0, rowsMissingH: 0 };
  }
  var limit = Math.min(values.length, 12e3);
  for (var r = 0; r < limit; r++) {
    var row = values[r];
    if (!row) continue;
    if (row.length <= colIndex) {
      rowsMissingH++;
      continue;
    }
    var v = row[colIndex];
    if (v == null || v === "") continue;
    nonEmpty++;
    if (isFormulaText2(v)) formulaString++;
    else if (numFromCell2(v) != null) numericParseable++;
  }
  return {
    rowsIterated: limit,
    nonEmpty,
    numericParseable,
    formulaString,
    rowsMissingH
  };
}
function statsHColumn(values, colIndex) {
  return statsGridColumn(values, colIndex);
}
function mergeTmallValueRanges(fmtValues, unfValues) {
  if (!fmtValues && !unfValues) return [];
  if (!fmtValues) return unfValues;
  if (!unfValues) return fmtValues;
  var rows = Math.max(fmtValues.length, unfValues.length);
  var out = [];
  for (var r = 0; r < rows; r++) {
    var fr = fmtValues[r] || [];
    var ur = unfValues[r] || [];
    var cols = Math.max(fr.length, ur.length);
    var row = [];
    for (var c = 0; c < cols; c++) {
      var f = fr[c];
      var u = ur[c];
      if (c === 0) {
        row[c] = f != null && f !== "" ? f : u;
        continue;
      }
      var fn = isFormulaText2(f) ? null : numFromCell2(f);
      var un = isFormulaText2(u) ? null : numFromCell2(u);
      if (fn != null && un != null) {
        row[c] = Math.abs(fn) >= Math.abs(un) ? f : u;
      } else if (fn != null) {
        row[c] = f;
      } else if (un != null) {
        row[c] = u;
      } else if (!isFormulaText2(f) && f != null && f !== "") {
        row[c] = f;
      } else if (!isFormulaText2(u) && u != null && u !== "") {
        row[c] = u;
      } else {
        row[c] = f != null && f !== "" ? f : u;
      }
    }
    out.push(row);
  }
  return out;
}
function splitRange2(range) {
  var i = String(range || "").indexOf("!");
  if (i < 0) return { sheetPart: String(range || ""), addrPart: "A1:H20000" };
  return { sheetPart: String(range || "").slice(0, i), addrPart: String(range || "").slice(i + 1) || "A1:H20000" };
}
function isSheetNotFound2(feishuJson) {
  var msg = String(feishuJson && feishuJson.msg || "");
  return msg.indexOf("not found sheetId") >= 0 || msg.indexOf("sheetId not found") >= 0;
}
function isDataExceeded2(feishuJson) {
  var msg = String(feishuJson && feishuJson.msg || "");
  return msg.indexOf("data exceeded") >= 0 && msg.indexOf("10485760") >= 0;
}
function shrinkRangeMaxRows2(range, maxRows) {
  var parsed = splitRange2(range);
  var addr = String(parsed.addrPart || "");
  var m = addr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return null;
  var c1 = m[1];
  var r1 = parseInt(m[2], 10);
  var c2 = m[3];
  var r2 = parseInt(m[4], 10);
  if (!isFinite(r1) || !isFinite(r2) || r2 <= 0 || maxRows <= 0) return null;
  var target = Math.min(r2, maxRows);
  if (target >= r2) return null;
  if (target <= r1) target = r1 + 1;
  return String(parsed.sheetPart || "") + "!" + c1 + String(r1) + ":" + c2 + String(target);
}
async function resolveRangeBySheetTitle2(env, spreadsheetToken, rangeMaybeTitle) {
  var parsed = splitRange2(rangeMaybeTitle);
  if (!parsed.sheetPart) return null;
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) return null;
  var sheets = sheetsJson.data && sheetsJson.data.sheets || [];
  var exact = sheets.find(function(s) {
    return String(s.title || "").trim() === parsed.sheetPart.trim();
  });
  var fuzzy = exact ? null : sheets.find(function(s) {
    return String(s.title || "").indexOf(parsed.sheetPart) >= 0 || parsed.sheetPart.indexOf(String(s.title || "")) >= 0;
  });
  var hit = exact || fuzzy;
  if (!hit || !hit.sheet_id) return null;
  return String(hit.sheet_id) + "!" + parsed.addrPart;
}
async function fetchRangeWithAutoResolve2(env, spreadsheetToken, rawRange, sheetFetchOpts) {
  var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, rawRange, sheetFetchOpts);
  var finalRange = rawRange;
  if (feishuJson.code !== 0 && isSheetNotFound2(feishuJson)) {
    var resolved = await resolveRangeBySheetTitle2(env, spreadsheetToken, rawRange);
    if (resolved) {
      var retry = await fetchSheetValuesV2(env, spreadsheetToken, resolved, sheetFetchOpts);
      if (retry.code === 0) {
        feishuJson = retry;
        finalRange = resolved;
      }
    }
  }
  if (feishuJson.code !== 0 && isDataExceeded2(feishuJson)) {
    var caps = [12e3, 8e3, 6e3, 4e3, 3e3, 2e3];
    for (var i = 0; i < caps.length; i++) {
      var smaller = shrinkRangeMaxRows2(finalRange, caps[i]);
      if (!smaller) continue;
      var retry2 = await fetchSheetValuesV2(env, spreadsheetToken, smaller, sheetFetchOpts);
      if (retry2 && retry2.code === 0) {
        feishuJson = retry2;
        finalRange = smaller;
        break;
      }
      if (retry2 && retry2.code !== 0) {
        feishuJson = retry2;
        finalRange = smaller;
        if (!isDataExceeded2(retry2)) break;
      }
    }
  }
  return { feishuJson, finalRange };
}
async function onRequestGet11(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var tmallToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || DEFAULT_TMALL_TOKEN;
  var tmallRangeRaw = env.FEISHU_TMALL_GMV_RANGE || DEFAULT_TMALL_RANGE;
  var tmallRangeAfterH = expandRangeEndColumnToH(tmallRangeRaw);
  var tmallRange = expandRangeEndColumnToAtLeast(tmallRangeAfterH, "N");
  var rangeExpandedFromG = tmallRangeAfterH !== tmallRangeRaw;
  var rangeExpandedPastH = tmallRange !== tmallRangeAfterH;
  try {
    var jdToken = env.FEISHU_SPREADSHEET_TOKEN || DEFAULT_JD_SPREADSHEET_TOKEN;
    var jdRangeInfo = await resolveJdGmvRange(env, jdToken, env.FEISHU_JD_GMV_RANGE);
    var jdRange = jdRangeInfo.range;
    var jdSheet1Info = await resolveJdSheetRangeBySortedIndex(env, jdToken, 0, "G");
    var jdSheet2Info = await resolveJdSheetRangeBySortedIndex(env, jdToken, 1, "G");
    var jdSheet1Range = jdSheet1Info && jdSheet1Info.range;
    var jdSheet2Range = jdSheet2Info && jdSheet2Info.range;
    var rTmFmt;
    var rTmUnf;
    var rJdFmt;
    var rJdUnf;
    var rJd1Fmt;
    var rJd1Unf;
    var rJd2Fmt;
    var rJd2Unf;
    var parallel = [
      fetchRangeWithAutoResolve2(env, tmallToken, tmallRange, { valueRenderOption: "FormattedValue" }).then(function(x) {
        rTmFmt = x;
      }),
      fetchRangeWithAutoResolve2(env, tmallToken, tmallRange, { valueRenderOption: "UnformattedValue" }).then(function(x) {
        rTmUnf = x;
      })
    ];
    if (jdRange) {
      parallel.push(
        fetchRangeWithAutoResolve2(env, jdToken, jdRange, { valueRenderOption: "FormattedValue" }).then(function(x) {
          rJdFmt = x;
        }),
        fetchRangeWithAutoResolve2(env, jdToken, jdRange, { valueRenderOption: "UnformattedValue" }).then(function(x) {
          rJdUnf = x;
        })
      );
    }
    if (jdSheet1Range) {
      parallel.push(
        fetchRangeWithAutoResolve2(env, jdToken, jdSheet1Range, { valueRenderOption: "FormattedValue" }).then(function(x) {
          rJd1Fmt = x;
        }),
        fetchRangeWithAutoResolve2(env, jdToken, jdSheet1Range, { valueRenderOption: "UnformattedValue" }).then(function(x) {
          rJd1Unf = x;
        })
      );
    }
    if (jdSheet2Range) {
      parallel.push(
        fetchRangeWithAutoResolve2(env, jdToken, jdSheet2Range, { valueRenderOption: "FormattedValue" }).then(function(x) {
          rJd2Fmt = x;
        }),
        fetchRangeWithAutoResolve2(env, jdToken, jdSheet2Range, { valueRenderOption: "UnformattedValue" }).then(function(x) {
          rJd2Unf = x;
        })
      );
    }
    await Promise.all(parallel);
    var tmFmtOk = rTmFmt.feishuJson && rTmFmt.feishuJson.code === 0;
    var tmUnfOk = rTmUnf.feishuJson && rTmUnf.feishuJson.code === 0;
    if (!tmFmtOk && !tmUnfOk) {
      var bad = rTmFmt.feishuJson && rTmFmt.feishuJson.code !== 0 ? rTmFmt : rTmUnf;
      return jsonResponse(
        {
          error: (bad.feishuJson && bad.feishuJson.msg ? bad.feishuJson.msg : "\u98DE\u4E66\u8868\u683C\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF") + "\uFF08\u5929\u732BGMV range=" + String(rTmFmt.finalRange || tmallRange) + "\uFF09",
          feishuCode: bad.feishuJson && bad.feishuJson.code
        },
        502,
        origin
      );
    }
    var dTmFmt = tmFmtOk ? rTmFmt.feishuJson.data || {} : {};
    var dTmUnf = tmUnfOk ? rTmUnf.feishuJson.data || {} : {};
    var vrTmFmt = tmFmtOk && dTmFmt.valueRange && dTmFmt.valueRange.values ? dTmFmt.valueRange.values : [];
    var vrTmUnf = tmUnfOk && dTmUnf.valueRange && dTmUnf.valueRange.values ? dTmUnf.valueRange.values : [];
    var mergedTmall = mergeTmallValueRanges(vrTmFmt, vrTmUnf);
    var tmallFinalRange = rTmFmt.finalRange || rTmUnf.finalRange || tmallRange;
    var maxLen = maxRowLength(mergedTmall);
    var hCol = 7;
    var hStatsMerged = statsHColumn(mergedTmall, hCol);
    var hStatsFmt = tmFmtOk ? statsHColumn(vrTmFmt, hCol) : null;
    var hStatsUnf = tmUnfOk ? statsHColumn(vrTmUnf, hCol) : null;
    var mergedJd = [];
    var jdFinalRange = "";
    var jdFmtOk = false;
    var jdUnfOk = false;
    var dJdFmt = {};
    var dJdUnf = {};
    if (jdRange && rJdFmt && rJdUnf) {
      jdFmtOk = rJdFmt.feishuJson && rJdFmt.feishuJson.code === 0;
      jdUnfOk = rJdUnf.feishuJson && rJdUnf.feishuJson.code === 0;
      dJdFmt = jdFmtOk ? rJdFmt.feishuJson.data || {} : {};
      dJdUnf = jdUnfOk ? rJdUnf.feishuJson.data || {} : {};
      var vrJdFmt = jdFmtOk && dJdFmt.valueRange && dJdFmt.valueRange.values ? dJdFmt.valueRange.values : [];
      var vrJdUnf = jdUnfOk && dJdUnf.valueRange && dJdUnf.valueRange.values ? dJdUnf.valueRange.values : [];
      mergedJd = mergeTmallValueRanges(vrJdFmt, vrJdUnf);
      jdFinalRange = rJdFmt.finalRange || rJdUnf.finalRange || jdRange;
    }
    var fCol = 5;
    var jdFStatsMerged = statsGridColumn(mergedJd, fCol);
    var mergedJd1 = [];
    var jd1FinalRange = "";
    if (jdSheet1Range && (rJd1Fmt || rJd1Unf)) {
      var j1FmtOk = rJd1Fmt && rJd1Fmt.feishuJson && rJd1Fmt.feishuJson.code === 0;
      var j1UnfOk = rJd1Unf && rJd1Unf.feishuJson && rJd1Unf.feishuJson.code === 0;
      if (j1FmtOk || j1UnfOk) {
        var dJ1Fmt = j1FmtOk ? rJd1Fmt.feishuJson.data || {} : {};
        var dJ1Unf = j1UnfOk ? rJd1Unf.feishuJson.data || {} : {};
        var vrJ1Fmt = j1FmtOk && dJ1Fmt.valueRange && dJ1Fmt.valueRange.values ? dJ1Fmt.valueRange.values : [];
        var vrJ1Unf = j1UnfOk && dJ1Unf.valueRange && dJ1Unf.valueRange.values ? dJ1Unf.valueRange.values : [];
        mergedJd1 = mergeTmallValueRanges(vrJ1Fmt, vrJ1Unf);
        jd1FinalRange = rJd1Fmt && rJd1Fmt.finalRange || rJd1Unf && rJd1Unf.finalRange || jdSheet1Range;
      }
    }
    var mergedJd2 = [];
    var jd2FinalRange = "";
    if (jdSheet2Range && (rJd2Fmt || rJd2Unf)) {
      var j2FmtOk = rJd2Fmt && rJd2Fmt.feishuJson && rJd2Fmt.feishuJson.code === 0;
      var j2UnfOk = rJd2Unf && rJd2Unf.feishuJson && rJd2Unf.feishuJson.code === 0;
      if (j2FmtOk || j2UnfOk) {
        var dJ2Fmt = j2FmtOk ? rJd2Fmt.feishuJson.data || {} : {};
        var dJ2Unf = j2UnfOk ? rJd2Unf.feishuJson.data || {} : {};
        var vrJ2Fmt = j2FmtOk && dJ2Fmt.valueRange && dJ2Fmt.valueRange.values ? dJ2Fmt.valueRange.values : [];
        var vrJ2Unf = j2UnfOk && dJ2Unf.valueRange && dJ2Unf.valueRange.values ? dJ2Unf.valueRange.values : [];
        mergedJd2 = mergeTmallValueRanges(vrJ2Fmt, vrJ2Unf);
        jd2FinalRange = rJd2Fmt && rJd2Fmt.finalRange || rJd2Unf && rJd2Unf.finalRange || jdSheet2Range;
      }
    }
    var gCol = 6;
    var jd1GStats = statsGridColumn(mergedJd1, gCol);
    var jd2GStats = statsGridColumn(mergedJd2, gCol);
    var payload = {
      tmallSpreadsheetToken: tmallToken,
      tmallRange: tmallFinalRange,
      tmallValueRange: {
        range: tmFmtOk && dTmFmt.valueRange && dTmFmt.valueRange.range || tmUnfOk && dTmUnf.valueRange && dTmUnf.valueRange.range || "",
        majorDimension: "ROWS",
        values: mergedTmall
      },
      tmallValuesMeta: {
        rowCount: mergedTmall.length,
        maxRowLength: maxLen,
        rangeExpandedEndColumnGToH: rangeExpandedFromG,
        rangeExpandedEndColumnToN: rangeExpandedPastH,
        mergedFromFormattedAndUnformatted: tmFmtOk && tmUnfOk,
        hColumnIndex: hCol,
        hColumnStatsMerged: hStatsMerged,
        hColumnStatsFormattedOnly: hStatsFmt,
        hColumnStatsUnformattedOnly: hStatsUnf,
        learnGmvColumnIndex: 10,
        qinziGmvColumnIndex: 12,
        kColumnStatsMerged: statsGridColumn(mergedTmall, 10),
        mColumnStatsMerged: statsGridColumn(mergedTmall, 12),
        lColumnStatsMerged: statsGridColumn(mergedTmall, 11),
        nColumnStatsMerged: statsGridColumn(mergedTmall, 13)
      },
      jdSpreadsheetToken: jdToken,
      jdRange: jdFinalRange || jdRange || "",
      jdRangeResolve: jdRangeInfo,
      jdValueRange: {
        range: jdFmtOk && dJdFmt.valueRange && dJdFmt.valueRange.range || jdUnfOk && dJdUnf.valueRange && dJdUnf.valueRange.range || "",
        majorDimension: "ROWS",
        values: mergedJd
      },
      jdValuesMeta: {
        rowCount: mergedJd.length,
        maxRowLength: maxRowLength(mergedJd),
        fColumnIndex: fCol,
        fColumnStatsMerged: jdFStatsMerged,
        mergedFromFormattedAndUnformatted: jdFmtOk && jdUnfOk
      },
      jdSheet1Range: jd1FinalRange || jdSheet1Range || "",
      jdSheet1RangeResolve: jdSheet1Info || { range: null, source: "auto" },
      jdSheet1ValueRange: {
        range: rJd1Fmt && rJd1Fmt.feishuJson && rJd1Fmt.feishuJson.data && rJd1Fmt.feishuJson.data.valueRange && rJd1Fmt.feishuJson.data.valueRange.range || rJd1Unf && rJd1Unf.feishuJson && rJd1Unf.feishuJson.data && rJd1Unf.feishuJson.data.valueRange && rJd1Unf.feishuJson.data.valueRange.range || "",
        majorDimension: "ROWS",
        values: mergedJd1
      },
      jdSheet1ValuesMeta: {
        rowCount: mergedJd1.length,
        gColumnIndex: gCol,
        gColumnStatsMerged: jd1GStats
      },
      jdSheet2Range: jd2FinalRange || jdSheet2Range || "",
      jdSheet2RangeResolve: jdSheet2Info || { range: null, source: "auto" },
      jdSheet2ValueRange: {
        range: rJd2Fmt && rJd2Fmt.feishuJson && rJd2Fmt.feishuJson.data && rJd2Fmt.feishuJson.data.valueRange && rJd2Fmt.feishuJson.data.valueRange.range || rJd2Unf && rJd2Unf.feishuJson && rJd2Unf.feishuJson.data && rJd2Unf.feishuJson.data.valueRange && rJd2Unf.feishuJson.data.valueRange.range || "",
        majorDimension: "ROWS",
        values: mergedJd2
      },
      jdSheet2ValuesMeta: {
        rowCount: mergedJd2.length,
        gColumnIndex: gCol,
        gColumnStatsMerged: jd2GStats
      }
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    var msg = e && e.message === "FEISHU_NOT_CONFIGURED" ? "\u98DE\u4E66\u5E94\u7528\u672A\u914D\u7F6E" : String(e && e.message || e);
    return jsonResponse({ error: "\u62C9\u53D6\u98DE\u4E66 GMV \u5408\u5E76\u6570\u636E\u5931\u8D25", detail: msg }, 502, origin);
  }
}
async function onRequestOptions14(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_TMALL_TOKEN, DEFAULT_TMALL_RANGE, DEFAULT_JD_SPREADSHEET_TOKEN;
var init_feishu_gmv_combined = __esm({
  "api/data/feishu-gmv-combined.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_TMALL_TOKEN = "WkFuwdxnhio6AckVEeQcohMAnpc";
    DEFAULT_TMALL_RANGE = "2joAvv!A1:M20000";
    DEFAULT_JD_SPREADSHEET_TOKEN = "EBwmsjjArhutvWtM2E9cLUMGnYd";
    __name(expandRangeEndColumnToH, "expandRangeEndColumnToH");
    __name(excelColLettersToNum1Based, "excelColLettersToNum1Based");
    __name(excelNum1BasedToColLetters, "excelNum1BasedToColLetters");
    __name(expandRangeEndColumnToAtLeast, "expandRangeEndColumnToAtLeast");
    __name(maxRowLength, "maxRowLength");
    __name(numFromCell2, "numFromCell");
    __name(isFormulaText2, "isFormulaText");
    __name(resolveJdGmvRange, "resolveJdGmvRange");
    __name(sortSheetsByUiIndex4, "sortSheetsByUiIndex");
    __name(resolveJdSheetRangeBySortedIndex, "resolveJdSheetRangeBySortedIndex");
    __name(statsGridColumn, "statsGridColumn");
    __name(statsHColumn, "statsHColumn");
    __name(mergeTmallValueRanges, "mergeTmallValueRanges");
    __name(splitRange2, "splitRange");
    __name(isSheetNotFound2, "isSheetNotFound");
    __name(isDataExceeded2, "isDataExceeded");
    __name(shrinkRangeMaxRows2, "shrinkRangeMaxRows");
    __name(resolveRangeBySheetTitle2, "resolveRangeBySheetTitle");
    __name(fetchRangeWithAutoResolve2, "fetchRangeWithAutoResolve");
    __name(onRequestGet11, "onRequestGet");
    __name(onRequestOptions14, "onRequestOptions");
  }
});

// api/data/feishu-livestream-funnel.js
function parseDateCell(v) {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    v = v[0];
  }
  var s = String(v).trim();
  var match2 = s.match(/(\d{4})[\/](\d{1,2})[\/](\d{1,2})/);
  if (!match2) {
    match2 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  }
  if (match2) {
    var year = parseInt(match2[1], 10);
    var month = parseInt(match2[2], 10) - 1;
    var day = parseInt(match2[3], 10);
    var d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
function debugValueType(v) {
  if (v === null) return "null";
  if (v === void 0) return "undefined";
  if (Array.isArray(v)) return "array[" + v.length + "]";
  return typeof v + ":" + String(v).substring(0, 50);
}
function padNumber(num, len) {
  var s = String(num);
  while (s.length < len) s = "0" + s;
  return s;
}
function formatDateKey(d) {
  if (!d || isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + padNumber(d.getMonth() + 1, 2) + "-" + padNumber(d.getDate(), 2);
}
function parseNumberCell(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && !isNaN(v)) return v;
  var s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function isHeaderRow(row) {
  if (!row || !row.length) return true;
  var b = String(row[COL_B] || "").trim();
  if (!b) return false;
  var low = b.toLowerCase();
  if (low === "\u4E3B\u64AD" || low === "\u4E3B\u64AD\u6635\u79F0" || low.indexOf("\u6635\u79F0") >= 0) return true;
  if (b === "B" || low === "name") return true;
  return false;
}
function aggregateByAnchor(values, startDate, endDate) {
  var map = /* @__PURE__ */ Object.create(null);
  var start = 0;
  var debugInfo = {};
  if (values.length > 0 && isHeaderRow(values[0])) start = 1;
  for (var r = start; r < values.length; r++) {
    var row = values[r];
    if (!row || !row.length) continue;
    var name = String(row[COL_B] != null ? row[COL_B] : "").trim();
    if (!name) continue;
    var rawDate = row[COL_D];
    var rowDate = parseDateCell(rawDate);
    if (r === start) {
      debugInfo.firstDateRaw = rawDate;
      debugInfo.firstDateType = debugValueType(rawDate);
      debugInfo.firstDateParsed = rowDate;
      debugInfo.firstDateKey = rowDate ? formatDateKey(rowDate) : null;
    }
    if (startDate || endDate) {
      if (!rowDate) continue;
      var rowDateKey = formatDateKey(rowDate);
      if (startDate && rowDateKey < startDate) continue;
      if (endDate && rowDateKey > endDate) continue;
    }
    var exposure = parseNumberCell(row[COL_G]);
    var view = parseNumberCell(row[COL_I]);
    var productExposure = parseNumberCell(row[COL_U]);
    var productClick = parseNumberCell(row[COL_V]);
    var order = parseNumberCell(row[COL_AD]);
    if (!map[name]) {
      map[name] = { name, exposure: 0, view: 0, productExposure: 0, productClick: 0, order: 0, dateSet: /* @__PURE__ */ Object.create(null) };
    }
    var m = map[name];
    m.exposure += exposure;
    m.view += view;
    m.productExposure += productExposure;
    m.productClick += productClick;
    m.order += order;
    if (rowDate) {
      m.dateSet[formatDateKey(rowDate)] = true;
    }
  }
  var list = Object.keys(map).map(function(k) {
    var item = map[k];
    var dates = Object.keys(item.dateSet).sort();
    return {
      name: item.name,
      exposure: item.exposure,
      view: item.view,
      productExposure: item.productExposure,
      productClick: item.productClick,
      order: item.order,
      dates
    };
  });
  list.sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "zh-CN");
  });
  var debugFirstRow = values.length > 1 ? values[1] : null;
  var debugInfo = {};
  return {
    anchors: list,
    debug: {
      firstRowDate: debugFirstRow ? debugFirstRow[COL_D] : null,
      firstRowDateType: debugFirstRow ? debugValueType(debugFirstRow[COL_D]) : null,
      firstRowDateContent: debugFirstRow && Array.isArray(debugFirstRow[COL_D]) ? debugFirstRow[COL_D][0] : null,
      firstRowAnchor: debugFirstRow ? debugFirstRow[COL_B] : null,
      totalRows: values.length,
      dateParseTest: debugFirstRow ? parseDateCell(debugFirstRow[COL_D]) : null,
      firstDateRaw: debugInfo.firstDateRaw,
      firstDateType: debugInfo.firstDateType,
      firstDateParsed: debugInfo.firstDateParsed,
      firstDateKey: debugInfo.firstDateKey
    }
  };
}
async function onRequestGet12(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_LIVESTREAM_FUNNEL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN6;
  var range = env.FEISHU_LIVESTREAM_FUNNEL_RANGE || DEFAULT_RANGE3;
  var url = new URL(request.url);
  var startDate = url.searchParams.get("startDate");
  var endDate = url.searchParams.get("endDate");
  try {
    var values = null;
    var now = Date.now();
    if (__livestreamCache && __livestreamCache.token === spreadsheetToken && now - __livestreamCacheTime < CACHE_TTL_MS) {
      values = __livestreamCache.values;
    } else {
      var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "FormattedValue" });
      if (!feishuJson || feishuJson.code !== 0) {
        return jsonResponse(
          {
            error: feishuJson && feishuJson.msg || "\u98DE\u4E66\u8868\u683C\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF",
            feishuCode: feishuJson && feishuJson.code,
            range
          },
          502,
          origin
        );
      }
      var data = feishuJson.data || {};
      var vr = data.valueRange || {};
      values = vr.values || [];
      __livestreamCache = {
        token: spreadsheetToken,
        values
      };
      __livestreamCacheTime = now;
    }
    var result = aggregateByAnchor(values, startDate, endDate);
    var anchors = result.anchors;
    var debug = result.debug;
    var payload = {
      spreadsheetToken,
      range,
      revision: __livestreamCache ? __livestreamCache.revision : null,
      anchors,
      startDate,
      endDate,
      debug,
      cached: !!__livestreamCache && now - __livestreamCacheTime < CACHE_TTL_MS
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse(
      { error: "\u62C9\u53D6\u76F4\u64AD\u95F4\u6F0F\u6597\u8868\u5931\u8D25", detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions15(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN6, DEFAULT_RANGE3, COL_B, COL_D, COL_G, COL_I, COL_U, COL_V, COL_AD, __livestreamCache, __livestreamCacheTime, CACHE_TTL_MS;
var init_feishu_livestream_funnel = __esm({
  "api/data/feishu-livestream-funnel.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN6 = "P1zusUMg2haMGctskH6cydLqn5e";
    DEFAULT_RANGE3 = "fBPMjm!A1:AD20000";
    COL_B = 1;
    COL_D = 3;
    COL_G = 6;
    COL_I = 8;
    COL_U = 20;
    COL_V = 21;
    COL_AD = 29;
    __name(parseDateCell, "parseDateCell");
    __name(debugValueType, "debugValueType");
    __name(padNumber, "padNumber");
    __name(formatDateKey, "formatDateKey");
    __name(parseNumberCell, "parseNumberCell");
    __name(isHeaderRow, "isHeaderRow");
    __name(aggregateByAnchor, "aggregateByAnchor");
    __livestreamCache = null;
    __livestreamCacheTime = 0;
    CACHE_TTL_MS = 5 * 60 * 1e3;
    __name(onRequestGet12, "onRequestGet");
    __name(onRequestOptions15, "onRequestOptions");
  }
});

// api/data/newretail-gmv-logic.js
function parseDateFromPlatform(value, platform) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return parseExcelSerial(value);
  }
  const str = String(value).trim();
  if (!str) return null;
  const numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str) && numOnly >= 4e4 && numOnly < 6e4) {
    return parseExcelSerial(numOnly);
  }
  return parseStandardDate(str);
}
function parseExcelSerial(serial) {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1e3);
  if (isNaN(d.getTime())) return null;
  return formatDate(d);
}
function parseStandardDate(str) {
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return formatDate(d);
  }
  const normalized = str.replace(/\//g, "-");
  const datePart = normalized.split(/[\sT]/)[0];
  const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return formatDate(d);
    }
  }
  const timestamp = Date.parse(normalized);
  if (!isNaN(timestamp)) {
    return formatDate(new Date(timestamp));
  }
  return null;
}
function formatDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseAmount2(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const str = String(value).replace(/[¥$€,，\s]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}
function parseDarenId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") return "";
  const str = String(value).trim();
  return str === "-" ? "" : str;
}
function parseQuantity(value) {
  if (value == null || value === "") return 1;
  if (typeof value === "number") {
    return isNaN(value) || value <= 0 ? 1 : Math.round(value);
  }
  const str = String(value).trim();
  if (!str) return 1;
  const cleaned = str.replace(/,/g, "").replace(/，/g, "").replace(/[\s\u3000]/g, "");
  const halfWidth = cleaned.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248));
  const num = parseInt(halfWidth, 10);
  return isNaN(num) || num <= 0 ? 1 : num;
}
function buildChannelMaps(chValues) {
  const darenIdToChannel = {};
  const shipinhaoNameToChannel = {};
  const channelList = [];
  for (let r = 1; r < chValues.length; r++) {
    const row = chValues[r] || [];
    const channelName = String(row[0] || "").trim();
    const platform = String(row[1] || "").trim();
    const darenName = String(row[3] || "").trim();
    const darenId = String(row[4] || "").trim();
    if (!channelName) continue;
    channelList.push(channelName);
    if (platform === "\u89C6\u9891\u53F7" && darenName) {
      shipinhaoNameToChannel[darenName] = channelName;
    }
    if (darenId) {
      darenIdToChannel[darenId] = channelName;
    }
  }
  return { darenIdToChannel, shipinhaoNameToChannel };
}
function classifyOrder(darenId, darenName, platform, channelMaps, amount, isGsv = false) {
  let channelName = null;
  if (platform === "shipinhao") {
    if (darenName && channelMaps.shipinhaoNameToChannel[darenName]) {
      channelName = channelMaps.shipinhaoNameToChannel[darenName];
    }
  } else {
    if (darenId && channelMaps.darenIdToChannel[darenId]) {
      channelName = channelMaps.darenIdToChannel[darenId];
    }
  }
  if (!channelName) {
    if (darenId && amount > 0) {
      const key = `${platform}:${darenId}`;
      if (typeof globalThis.__unmatchedDarenIds === "undefined") {
        globalThis.__unmatchedDarenIds = /* @__PURE__ */ new Set();
      }
      if (typeof globalThis.__unmatchedDarenStats === "undefined") {
        globalThis.__unmatchedDarenStats = {};
      }
      if (globalThis.__unmatchedDarenIds.size < 50) {
        globalThis.__unmatchedDarenIds.add(key);
      }
      if (!globalThis.__unmatchedDarenStats[key]) {
        globalThis.__unmatchedDarenStats[key] = {
          platform,
          darenId,
          gmv: 0,
          gsv: 0,
          count: 0
        };
      }
      globalThis.__unmatchedDarenStats[key].count++;
      if (isGsv) {
        globalThis.__unmatchedDarenStats[key].gsv += amount;
      } else {
        globalThis.__unmatchedDarenStats[key].gmv += amount;
      }
    }
    return { category: "fuwu", channel: "\u672A\u77E5" };
  }
  if (channelName.indexOf("\u76F4\u8425") === 0) {
    return { category: null, channel: channelName, skip: true };
  }
  if (channelName.indexOf("\u81EA\u8425") === 0) {
    return { category: null, channel: channelName, skip: true };
  }
  if (channelName.indexOf("DP") === 0) {
    return { category: "dp", channel: channelName, skip: false };
  }
  if (channelName.indexOf("\u76F4\u5BF9") === 0) {
    return { category: "zhidui", channel: channelName, skip: false };
  }
  return { category: "fuwu", channel: channelName, skip: false };
}
function processPlatformOrdersGsv(values, platform, channelMaps) {
  const cfg = PLATFORM_CONFIG[platform];
  const orders = [];
  let skipCount = 0;
  let debugLog = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    if (row.length <= cfg.cols.amount) continue;
    const timeValue = row[cfg.cols.time];
    if (timeValue == null || timeValue === "" || typeof timeValue === "object" && Object.keys(timeValue).length === 0) {
      continue;
    }
    const day = parseDateFromPlatform(timeValue, platform);
    if (!day) continue;
    const amount = parseAmount2(row[cfg.cols.amount]);
    if (amount <= 0) continue;
    let quantity = 1;
    if (cfg.cols.quantity != null && row.length > cfg.cols.quantity) {
      quantity = parseQuantity(row[cfg.cols.quantity]);
    }
    const status = String(row[cfg.cols.status] || "").trim();
    let shouldSkip = false;
    if (platform === "douyin") {
      if (status === "\u5DF2\u5173\u95ED") shouldSkip = true;
    } else if (platform === "xiaohongshu") {
      if (status === "\u5DF2\u53D6\u6D88") shouldSkip = true;
    } else if (platform === "shipinhao") {
      if (status === "\u5DF2\u53D6\u6D88") shouldSkip = true;
    } else if (platform === "kuaishou") {
      if (status === "\u4EA4\u6613\u5173\u95ED" || status === "\u5DF2\u5173\u95ED") shouldSkip = true;
    }
    if (shouldSkip) {
      skipCount++;
      continue;
    }
    let darenId = "";
    let darenName = "";
    if (cfg.cols.darenId != null) {
      darenId = parseDarenId(row[cfg.cols.darenId]);
    }
    if (cfg.cols.darenName != null) {
      darenName = parseDarenId(row[cfg.cols.darenName]);
    }
    if (darenId === "0" || darenId === "0.0" || !darenId && !darenName) {
      skipCount++;
      continue;
    }
    const classification = classifyOrder(darenId, darenName, platform, channelMaps, amount, true);
    if (classification.skip) continue;
    if (darenId === "284088526715758" && day < "2026-04-01") {
      continue;
    }
    orders.push({
      date: day,
      platform,
      amount,
      quantity,
      category: classification.category,
      channel: classification.channel,
      darenId: darenName || darenId || "\u672A\u77E5",
      product: row[cfg.cols.product] || ""
    });
  }
  return { orders, skipCount, debugSkipped: debugLog };
}
function processPlatformOrders(values, platform, channelMaps) {
  const cfg = PLATFORM_CONFIG[platform];
  const orders = [];
  let stats = {
    totalRows: values.length - 1,
    hasTime: 0,
    // 有支付时间
    hasAmount: 0,
    // 有金额
    hasDate: 0,
    // 日期解析成功
    closedSkipped: 0,
    // 已关闭被跳过
    classified: 0,
    // 分类完成
    ziyingSkipped: 0,
    // 直营被跳过
    noChannel: 0,
    // 未映射出渠道
    final: 0
    // 最终保留
  };
  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    if (row.length <= cfg.cols.amount) continue;
    const timeValue = row[cfg.cols.time];
    if (timeValue == null || timeValue === "" || typeof timeValue === "object" && Object.keys(timeValue).length === 0) {
      continue;
    }
    stats.hasTime++;
    const day = parseDateFromPlatform(timeValue, platform);
    if (!day) continue;
    stats.hasDate++;
    const amount = parseAmount2(row[cfg.cols.amount]);
    if (amount <= 0) continue;
    stats.hasAmount++;
    let quantity = 1;
    if (cfg.cols.quantity != null && row.length > cfg.cols.quantity) {
      quantity = parseQuantity(row[cfg.cols.quantity]);
    }
    const status = String(row[cfg.cols.status] || "").trim();
    if (!status) {
      continue;
    }
    let darenId = "";
    let darenName = "";
    if (cfg.cols.darenId != null) {
      darenId = parseDarenId(row[cfg.cols.darenId]);
    }
    if (cfg.cols.darenName != null) {
      darenName = parseDarenId(row[cfg.cols.darenName]);
    }
    if (darenId === "0" || darenId === "0.0" || !darenId && !darenName) {
      continue;
    }
    const classification = classifyOrder(darenId, darenName, platform, channelMaps, amount, false);
    stats.classified++;
    if (classification.skip) {
      stats.ziyingSkipped++;
      continue;
    }
    if (!classification.channel || classification.channel === "\u672A\u77E5") {
      stats.noChannel++;
    }
    if (darenId === "284088526715758" && day < "2026-04-01") {
      continue;
    }
    orders.push({
      date: day,
      platform,
      amount,
      quantity,
      category: classification.category,
      channel: classification.channel,
      darenId: darenName || darenId || "\u672A\u77E5",
      product: row[cfg.cols.product] || ""
    });
    stats.final++;
  }
  return { orders, stats };
}
function aggregateByDayAndCategory(allOrders) {
  const bucket = {};
  allOrders.forEach((order) => {
    const day = order.date;
    if (!bucket[day]) {
      bucket[day] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    bucket[day][order.category] += order.amount;
  });
  return Object.keys(bucket).sort().map((day) => {
    const b = bucket[day];
    return {
      date: day,
      dp: Number((b.dp / 1e4).toFixed(2)),
      zhidui: Number((b.zhidui / 1e4).toFixed(2)),
      fuwu: Number((b.fuwu / 1e4).toFixed(2)),
      total: Number(((b.dp + b.zhidui + b.fuwu) / 1e4).toFixed(2))
    };
  });
}
function aggregateFuwuByChannel(allOrders) {
  const bucket = {};
  const channels = /* @__PURE__ */ new Set();
  allOrders.forEach((order) => {
    if (order.category !== "fuwu") return;
    const day = order.date;
    const channel = order.channel || "\u672A\u77E5";
    if (channel === "\u672A\u77E5") return;
    channels.add(channel);
    if (!bucket[day]) {
      bucket[day] = {};
    }
    if (!bucket[day][channel]) {
      bucket[day][channel] = 0;
    }
    bucket[day][channel] += order.amount;
  });
  const sortedDays = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();
  return {
    days: sortedDays,
    channels: sortedChannels,
    data: sortedDays.map((day) => {
      const dayData = { date: day };
      sortedChannels.forEach((channel) => {
        const amount = bucket[day][channel] || 0;
        dayData[channel] = Number((amount / 1e4).toFixed(2));
      });
      return dayData;
    })
  };
}
function aggregateFuwuByChannelMonthly(dailyPoints) {
  const bucket = {};
  const channels = /* @__PURE__ */ new Set();
  dailyPoints.forEach((p) => {
    const month = p.date.substring(0, 7);
    Object.keys(p).forEach((key) => {
      if (key === "date") return;
      channels.add(key);
      if (!bucket[month]) {
        bucket[month] = {};
      }
      if (!bucket[month][key]) {
        bucket[month][key] = 0;
      }
      bucket[month][key] += p[key];
    });
  });
  const sortedMonths = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();
  return {
    days: sortedMonths,
    channels: sortedChannels,
    data: sortedMonths.map((month) => {
      const monthData = { date: month };
      sortedChannels.forEach((channel) => {
        monthData[channel] = Number((bucket[month][channel] || 0).toFixed(2));
      });
      return monthData;
    })
  };
}
function aggregateFuwuByChannelWeekly(dailyPoints) {
  const bucket = {};
  const channels = /* @__PURE__ */ new Set();
  dailyPoints.forEach((p) => {
    const week = weekStartFromDateStr(p.date);
    if (!week) return;
    Object.keys(p).forEach((key) => {
      if (key === "date") return;
      channels.add(key);
      if (!bucket[week]) {
        bucket[week] = {};
      }
      if (!bucket[week][key]) {
        bucket[week][key] = 0;
      }
      bucket[week][key] += p[key];
    });
  });
  const sortedWeeks = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();
  return {
    days: sortedWeeks,
    channels: sortedChannels,
    data: sortedWeeks.map((week) => {
      const weekData = { date: week };
      sortedChannels.forEach((channel) => {
        weekData[channel] = Number((bucket[week][channel] || 0).toFixed(2));
      });
      return weekData;
    })
  };
}
function aggregateDpByChannel(allOrders) {
  const bucket = {};
  const channels = /* @__PURE__ */ new Set();
  allOrders.forEach((order) => {
    if (order.category !== "dp") return;
    const day = order.date;
    const channel = order.channel || "\u672A\u77E5";
    if (channel === "\u672A\u77E5") return;
    channels.add(channel);
    if (!bucket[day]) {
      bucket[day] = {};
    }
    if (!bucket[day][channel]) {
      bucket[day][channel] = 0;
    }
    bucket[day][channel] += order.amount;
  });
  const sortedDays = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();
  return {
    days: sortedDays,
    channels: sortedChannels,
    data: sortedDays.map((day) => {
      const dayData = { date: day };
      sortedChannels.forEach((channel) => {
        const amount = bucket[day][channel] || 0;
        dayData[channel] = Number((amount / 1e4).toFixed(2));
      });
      return dayData;
    })
  };
}
function aggregateDpByChannelMonthly(dailyPoints) {
  const bucket = {};
  const channels = /* @__PURE__ */ new Set();
  dailyPoints.forEach((p) => {
    const month = p.date.substring(0, 7);
    Object.keys(p).forEach((key) => {
      if (key === "date") return;
      channels.add(key);
      if (!bucket[month]) {
        bucket[month] = {};
      }
      if (!bucket[month][key]) {
        bucket[month][key] = 0;
      }
      bucket[month][key] += p[key];
    });
  });
  const sortedMonths = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();
  return {
    days: sortedMonths,
    channels: sortedChannels,
    data: sortedMonths.map((month) => {
      const monthData = { date: month };
      sortedChannels.forEach((channel) => {
        monthData[channel] = Number((bucket[month][channel] || 0).toFixed(2));
      });
      return monthData;
    })
  };
}
function aggregateDpByChannelWeekly(dailyPoints) {
  const bucket = {};
  const channels = /* @__PURE__ */ new Set();
  dailyPoints.forEach((p) => {
    const week = weekStartFromDateStr(p.date);
    if (!week) return;
    Object.keys(p).forEach((key) => {
      if (key === "date") return;
      channels.add(key);
      if (!bucket[week]) {
        bucket[week] = {};
      }
      if (!bucket[week][key]) {
        bucket[week][key] = 0;
      }
      bucket[week][key] += p[key];
    });
  });
  const sortedWeeks = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();
  return {
    days: sortedWeeks,
    channels: sortedChannels,
    data: sortedWeeks.map((week) => {
      const weekData = { date: week };
      sortedChannels.forEach((channel) => {
        weekData[channel] = Number((bucket[week][channel] || 0).toFixed(2));
      });
      return weekData;
    })
  };
}
function aggregateDpRefundRateByChannel(dpGmvData, dpGsvData) {
  const data = [];
  const gmvMap = {};
  const gsvMap = {};
  dpGmvData.data.forEach((p) => {
    gmvMap[p.date] = p;
  });
  dpGsvData.data.forEach((p) => {
    gsvMap[p.date] = p;
  });
  const allDates = [.../* @__PURE__ */ new Set([...Object.keys(gmvMap), ...Object.keys(gsvMap)])].sort();
  allDates.forEach((date) => {
    const gmvRow = gmvMap[date] || {};
    const gsvRow = gsvMap[date] || {};
    const row = { date };
    dpGmvData.channels.forEach((channel) => {
      const gmv = gmvRow[channel] || 0;
      const gsv = gsvRow[channel] || 0;
      if (gmv > 0) {
        row[channel] = Number((1 - gsv / gmv).toFixed(4));
      } else {
        row[channel] = null;
      }
    });
    data.push(row);
  });
  return {
    days: allDates,
    channels: dpGmvData.channels,
    data
  };
}
function calculateDpTotalsByChannel(dpGmvData, dpGsvData) {
  const totals = {};
  dpGmvData.channels.forEach((ch) => {
    totals[ch] = { gmv: 0, gsv: 0 };
  });
  dpGmvData.data.forEach((p) => {
    dpGmvData.channels.forEach((ch) => {
      totals[ch].gmv += p[ch] || 0;
    });
  });
  dpGsvData.data.forEach((p) => {
    dpGsvData.channels.forEach((ch) => {
      totals[ch].gsv += p[ch] || 0;
    });
  });
  return totals;
}
function weekStartFromDateStr(ds) {
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const wd = d.getDay();
  const diff = wd === 0 ? 6 : wd - 1;
  d.setDate(d.getDate() - diff);
  return formatDate(d);
}
function aggregateByWeek(dailyPoints) {
  const bucket = {};
  dailyPoints.forEach((p) => {
    const ws = weekStartFromDateStr(p.date);
    if (!ws) return;
    if (!bucket[ws]) {
      bucket[ws] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    bucket[ws].dp += p.dp;
    bucket[ws].zhidui += p.zhidui;
    bucket[ws].fuwu += p.fuwu;
  });
  return Object.keys(bucket).sort().map((ws) => {
    const b = bucket[ws];
    return {
      date: ws,
      dp: Number(b.dp.toFixed(2)),
      zhidui: Number(b.zhidui.toFixed(2)),
      fuwu: Number(b.fuwu.toFixed(2)),
      total: Number((b.dp + b.zhidui + b.fuwu).toFixed(2))
    };
  });
}
function monthFromDateStr(ds) {
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return m[1] + "-" + m[2];
}
function aggregateByMonth(dailyPoints) {
  const bucket = {};
  dailyPoints.forEach((p) => {
    const month = monthFromDateStr(p.date);
    if (!month) return;
    if (!bucket[month]) {
      bucket[month] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    bucket[month].dp += p.dp;
    bucket[month].zhidui += p.zhidui;
    bucket[month].fuwu += p.fuwu;
  });
  return Object.keys(bucket).sort().map((m) => {
    const b = bucket[m];
    return {
      date: m,
      dp: Number(b.dp.toFixed(2)),
      zhidui: Number(b.zhidui.toFixed(2)),
      fuwu: Number(b.fuwu.toFixed(2)),
      total: Number((b.dp + b.zhidui + b.fuwu).toFixed(2))
    };
  });
}
function aggregateDpByDarenMonthly(allOrdersGmv, allOrdersGsv) {
  const gmvBucket = {};
  const gsvBucket = {};
  const darenInfo = {};
  allOrdersGmv.forEach((order) => {
    if (order.category !== "dp") return;
    const month = monthFromDateStr(order.date);
    if (!month) return;
    const darenKey = String(order.darenId || "\u672A\u77E5");
    const key = darenKey + ":" + month;
    if (!gmvBucket[key]) {
      gmvBucket[key] = 0;
    }
    gmvBucket[key] += order.amount;
    if (!darenInfo[key]) {
      darenInfo[key] = { channel: order.channel || "\u672A\u77E5", platform: order.platform };
    }
  });
  allOrdersGsv.forEach((order) => {
    if (order.category !== "dp") return;
    const month = monthFromDateStr(order.date);
    if (!month) return;
    const darenKey = String(order.darenId || "\u672A\u77E5");
    const key = darenKey + ":" + month;
    if (!gsvBucket[key]) {
      gsvBucket[key] = 0;
    }
    gsvBucket[key] += order.amount;
  });
  const result = [];
  Object.keys(gmvBucket).sort().forEach((key) => {
    const [darenName, month] = key.split(":");
    const info = darenInfo[key] || { channel: "\u672A\u77E5", platform: "\u672A\u77E5" };
    result.push({
      darenName,
      channel: info.channel,
      platform: info.platform,
      month,
      gmv: Number((gmvBucket[key] / 1e4).toFixed(2)),
      gsv: Number(((gsvBucket[key] || 0) / 1e4).toFixed(2))
    });
  });
  return result;
}
function aggregateModelDistributionByDay(allOrders, modelMapping) {
  const dailyBucket = {};
  const mappingList = modelMapping || [];
  const unmatchedProducts = /* @__PURE__ */ new Set();
  allOrders.forEach((order) => {
    if (!order || !order.product || !order.date) return;
    const productLower = String(order.product).toLowerCase();
    let matchedModelName = null;
    if (productLower.includes("v2")) {
      let containsOtherKeyword = false;
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== "V2" && productLower.includes(kw.toLowerCase())) {
          containsOtherKeyword = true;
          break;
        }
      }
      if (!containsOtherKeyword) {
        for (const mapping of mappingList) {
          if (mapping.keyword === "V2") {
            matchedModelName = mapping.model;
            break;
          }
        }
      }
    }
    if (!matchedModelName) {
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== "V2" && productLower.includes(kw.toLowerCase())) {
          matchedModelName = mapping.model;
          break;
        }
      }
    }
    if (matchedModelName) {
      const day = order.date;
      if (!dailyBucket[day]) {
        dailyBucket[day] = {};
      }
      if (!dailyBucket[day][matchedModelName]) {
        dailyBucket[day][matchedModelName] = { amount: 0, quantity: 0 };
      }
      dailyBucket[day][matchedModelName].amount += order.amount;
      dailyBucket[day][matchedModelName].quantity += order.quantity || 1;
    } else {
      unmatchedProducts.add(order.product);
    }
  });
  if (unmatchedProducts.size > 0) {
    console.log("=== \u672A\u5339\u914D\u5230\u4EA7\u54C1\u578B\u53F7\u7684\u5546\u54C1\u540D\u79F0 ===");
    console.log("\u672A\u5339\u914D\u6570\u91CF:", unmatchedProducts.size);
    console.log("\u672A\u5339\u914D\u5217\u8868:", Array.from(unmatchedProducts).sort());
  }
  const result = [];
  Object.keys(dailyBucket).sort().forEach((day) => {
    const dayData = { date: day };
    Object.keys(dailyBucket[day]).forEach((modelName) => {
      dayData[modelName] = {
        amount: Number((dailyBucket[day][modelName].amount / 1e4).toFixed(2)),
        quantity: dailyBucket[day][modelName].quantity
      };
    });
    result.push(dayData);
  });
  return {
    daily: result,
    unmatchedProducts: Array.from(unmatchedProducts).sort()
  };
}
function aggregateModelDistributionByDayFiltered(allOrders, modelMapping, filterFn) {
  const dailyBucket = {};
  const mappingList = modelMapping || [];
  const unmatchedProducts = /* @__PURE__ */ new Set();
  allOrders.forEach((order) => {
    if (!filterFn(order)) return;
    if (!order || !order.product || !order.date) return;
    const productLower = String(order.product).toLowerCase();
    let matchedModelName = null;
    if (productLower.includes("v2")) {
      let containsOtherKeyword = false;
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== "V2" && productLower.includes(kw.toLowerCase())) {
          containsOtherKeyword = true;
          break;
        }
      }
      if (!containsOtherKeyword) {
        for (const mapping of mappingList) {
          if (mapping.keyword === "V2") {
            matchedModelName = mapping.model;
            break;
          }
        }
      }
    }
    if (!matchedModelName) {
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== "V2" && productLower.includes(kw.toLowerCase())) {
          matchedModelName = mapping.model;
          break;
        }
      }
    }
    if (matchedModelName) {
      const day = order.date;
      if (!dailyBucket[day]) {
        dailyBucket[day] = {};
      }
      if (!dailyBucket[day][matchedModelName]) {
        dailyBucket[day][matchedModelName] = { amount: 0, quantity: 0 };
      }
      dailyBucket[day][matchedModelName].amount += order.amount;
      dailyBucket[day][matchedModelName].quantity += order.quantity || 1;
    } else {
      unmatchedProducts.add(order.product);
    }
  });
  const result = [];
  Object.keys(dailyBucket).sort().forEach((day) => {
    const dayData = { date: day };
    Object.keys(dailyBucket[day]).forEach((modelName) => {
      dayData[modelName] = {
        amount: Number((dailyBucket[day][modelName].amount / 1e4).toFixed(2)),
        quantity: dailyBucket[day][modelName].quantity
      };
    });
    result.push(dayData);
  });
  return {
    daily: result,
    unmatchedProducts: Array.from(unmatchedProducts).sort()
  };
}
function aggregateModelDistributionByDaren(allOrders, modelMapping, filterFn, expectedDarenList, darenIdToDarenNameMap, shipinhaoNameToDarenNameMap) {
  const byDaren = {};
  const darenInfoMap = {};
  const mappingList = modelMapping || [];
  const darenIdMap = darenIdToDarenNameMap || {};
  const shipinhaoMap = shipinhaoNameToDarenNameMap || {};
  if (expectedDarenList && expectedDarenList.length > 0) {
    expectedDarenList.forEach((darenName) => {
      if (darenName && !byDaren[darenName]) {
        byDaren[darenName] = {};
        darenInfoMap[darenName] = "";
      }
    });
  }
  allOrders.forEach((order) => {
    if (!filterFn(order)) return;
    if (!order || !order.product || !order.date) return;
    let darenName = "";
    if (order.platform === "shipinhao") {
      const shipinhaoName = order.darenId || "";
      darenName = shipinhaoMap[shipinhaoName] || shipinhaoName;
    } else {
      const darenId = order.darenId || "";
      darenName = darenIdMap[darenId] || "";
    }
    if (!darenName) return;
    if (!darenInfoMap[darenName]) {
      darenInfoMap[darenName] = { id: order.darenId || "", platforms: /* @__PURE__ */ new Set(), totalAmount: 0 };
    }
    darenInfoMap[darenName].platforms.add(order.platform);
    darenInfoMap[darenName].totalAmount += order.amount;
    if (!byDaren[darenName]) {
      byDaren[darenName] = {};
    }
    const productLower = String(order.product).toLowerCase();
    let matchedModelName = null;
    if (productLower.includes("v2")) {
      let containsOtherKeyword = false;
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== "V2" && productLower.includes(kw.toLowerCase())) {
          containsOtherKeyword = true;
          break;
        }
      }
      if (!containsOtherKeyword) {
        for (const mapping of mappingList) {
          if (mapping.keyword === "V2") {
            matchedModelName = mapping.model;
            break;
          }
        }
      }
    }
    if (!matchedModelName) {
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== "V2" && productLower.includes(kw.toLowerCase())) {
          matchedModelName = mapping.model;
          break;
        }
      }
    }
    if (matchedModelName) {
      const day = order.date;
      if (!byDaren[darenName][day]) {
        byDaren[darenName][day] = {};
      }
      if (!byDaren[darenName][day][matchedModelName]) {
        byDaren[darenName][day][matchedModelName] = { amount: 0, quantity: 0 };
      }
      byDaren[darenName][day][matchedModelName].amount += order.amount;
      byDaren[darenName][day][matchedModelName].quantity += order.quantity || 1;
    }
  });
  const result = {};
  Object.keys(byDaren).forEach((darenName) => {
    const dailyBucket = byDaren[darenName];
    const dailyArray = [];
    Object.keys(dailyBucket).sort().forEach((day) => {
      const dayData = { date: day };
      Object.keys(dailyBucket[day]).forEach((modelName) => {
        dayData[modelName] = {
          amount: Number((dailyBucket[day][modelName].amount / 1e4).toFixed(2)),
          quantity: dailyBucket[day][modelName].quantity
        };
      });
      dailyArray.push(dayData);
    });
    result[darenName] = { daily: dailyArray };
  });
  let darenNames = expectedDarenList && expectedDarenList.length > 0 ? expectedDarenList.filter((name) => byDaren[name] !== void 0) : Object.keys(darenInfoMap).sort((a, b) => a.localeCompare(b, "zh-CN"));
  Object.keys(byDaren).forEach((name) => {
    if (!darenNames.includes(name)) {
      darenNames.push(name);
    }
  });
  const darenList = darenNames.map((name) => {
    const info = darenInfoMap[name] || { id: "", platforms: /* @__PURE__ */ new Set(), totalAmount: 0 };
    return {
      name,
      id: info.id || "",
      platforms: Array.from(info.platforms || []),
      totalAmount: info.totalAmount || 0
    };
  }).filter((item) => item.totalAmount > 0).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return { byDaren: result, darenList };
}
function aggregateRefundRateByDayAndCategory(dailyPointsGmv, dailyPointsGsv) {
  const gmvMap = {};
  dailyPointsGmv.forEach((p) => {
    gmvMap[p.date] = { dp: p.dp || 0, zhidui: p.zhidui || 0, fuwu: p.fuwu || 0 };
  });
  return dailyPointsGsv.map((p) => {
    const gmv = gmvMap[p.date] || { dp: 0, zhidui: 0, fuwu: 0 };
    const rate2 = { date: p.date };
    rate2.dp = gmv.dp > 0 ? Number((1 - p.dp / gmv.dp).toFixed(4)) : null;
    rate2.zhidui = gmv.zhidui > 0 ? Number((1 - p.zhidui / gmv.zhidui).toFixed(4)) : null;
    rate2.fuwu = gmv.fuwu > 0 ? Number((1 - p.fuwu / gmv.fuwu).toFixed(4)) : null;
    const totalGmv = gmv.dp + gmv.zhidui + gmv.fuwu;
    const totalGsv = p.dp + p.zhidui + p.fuwu;
    rate2.total = totalGmv > 0 ? Number((1 - totalGsv / totalGmv).toFixed(4)) : null;
    return rate2;
  });
}
function aggregateRefundRateByWeek(dailyPointsGmv, dailyPointsGsv) {
  const gmvBucket = {};
  dailyPointsGmv.forEach((p) => {
    const ws = weekStartFromDateStr(p.date);
    if (!ws) return;
    if (!gmvBucket[ws]) {
      gmvBucket[ws] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gmvBucket[ws].dp += p.dp;
    gmvBucket[ws].zhidui += p.zhidui;
    gmvBucket[ws].fuwu += p.fuwu;
  });
  const gsvBucket = {};
  dailyPointsGsv.forEach((p) => {
    const ws = weekStartFromDateStr(p.date);
    if (!ws) return;
    if (!gsvBucket[ws]) {
      gsvBucket[ws] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gsvBucket[ws].dp += p.dp;
    gsvBucket[ws].zhidui += p.zhidui;
    gsvBucket[ws].fuwu += p.fuwu;
  });
  return Object.keys(gmvBucket).sort().map((ws) => {
    const gmv = gmvBucket[ws];
    const gsv = gsvBucket[ws] || { dp: 0, zhidui: 0, fuwu: 0 };
    const rate2 = { date: ws };
    rate2.dp = gmv.dp > 0 ? Number((1 - gsv.dp / gmv.dp).toFixed(4)) : null;
    rate2.zhidui = gmv.zhidui > 0 ? Number((1 - gsv.zhidui / gmv.zhidui).toFixed(4)) : null;
    rate2.fuwu = gmv.fuwu > 0 ? Number((1 - gsv.fuwu / gmv.fuwu).toFixed(4)) : null;
    const totalGmv = gmv.dp + gmv.zhidui + gmv.fuwu;
    const totalGsv = gsv.dp + gsv.zhidui + gsv.fuwu;
    rate2.total = totalGmv > 0 ? Number((1 - totalGsv / totalGmv).toFixed(4)) : null;
    return rate2;
  });
}
function aggregateRefundRateByMonth(dailyPointsGmv, dailyPointsGsv) {
  const gmvBucket = {};
  dailyPointsGmv.forEach((p) => {
    const month = monthFromDateStr(p.date);
    if (!month) return;
    if (!gmvBucket[month]) {
      gmvBucket[month] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gmvBucket[month].dp += p.dp;
    gmvBucket[month].zhidui += p.zhidui;
    gmvBucket[month].fuwu += p.fuwu;
  });
  const gsvBucket = {};
  dailyPointsGsv.forEach((p) => {
    const month = monthFromDateStr(p.date);
    if (!month) return;
    if (!gsvBucket[month]) {
      gsvBucket[month] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gsvBucket[month].dp += p.dp;
    gsvBucket[month].zhidui += p.zhidui;
    gsvBucket[month].fuwu += p.fuwu;
  });
  return Object.keys(gmvBucket).sort().map((m) => {
    const gmv = gmvBucket[m];
    const gsv = gsvBucket[m] || { dp: 0, zhidui: 0, fuwu: 0 };
    const rate2 = { date: m };
    rate2.dp = gmv.dp > 0 ? Number((1 - gsv.dp / gmv.dp).toFixed(4)) : null;
    rate2.zhidui = gmv.zhidui > 0 ? Number((1 - gsv.zhidui / gmv.zhidui).toFixed(4)) : null;
    rate2.fuwu = gmv.fuwu > 0 ? Number((1 - gsv.fuwu / gmv.fuwu).toFixed(4)) : null;
    const totalGmv = gmv.dp + gmv.zhidui + gmv.fuwu;
    const totalGsv = gsv.dp + gsv.zhidui + gsv.fuwu;
    rate2.total = totalGmv > 0 ? Number((1 - totalGsv / totalGmv).toFixed(4)) : null;
    return rate2;
  });
}
function aggregateFuwuRefundRateByChannel(fuwuGmvData, fuwuGsvData) {
  const days = fuwuGmvData.days || [];
  const channels = Array.from(/* @__PURE__ */ new Set([
    ...fuwuGmvData.channels || [],
    ...fuwuGsvData.channels || []
  ])).sort();
  const gmvMap = {};
  fuwuGmvData.data.forEach((row) => {
    gmvMap[row.date] = row;
  });
  const gsvMap = {};
  fuwuGsvData.data.forEach((row) => {
    gsvMap[row.date] = row;
  });
  const refundData = days.map((date) => {
    const gmvRow = gmvMap[date] || {};
    const gsvRow = gsvMap[date] || {};
    const rateRow = { date };
    channels.forEach((ch) => {
      const gmvVal = gmvRow[ch] || 0;
      const gsvVal = gsvRow[ch] || 0;
      rateRow[ch] = gmvVal > 0 ? Number((1 - gsvVal / gmvVal).toFixed(4)) : null;
    });
    return rateRow;
  });
  return {
    days,
    channels,
    data: refundData
  };
}
function calculateTotalsByCategory(dailyPointsGmv, dailyPointsGsv) {
  const totals = {
    dp: { gmv: 0, gsv: 0 },
    zhidui: { gmv: 0, gsv: 0 },
    fuwu: { gmv: 0, gsv: 0 }
  };
  dailyPointsGmv.forEach((p) => {
    totals.dp.gmv += p.dp || 0;
    totals.zhidui.gmv += p.zhidui || 0;
    totals.fuwu.gmv += p.fuwu || 0;
  });
  dailyPointsGsv.forEach((p) => {
    totals.dp.gsv += p.dp || 0;
    totals.zhidui.gsv += p.zhidui || 0;
    totals.fuwu.gsv += p.fuwu || 0;
  });
  totals.dp.refundRate = totals.dp.gmv > 0 ? Number((1 - totals.dp.gsv / totals.dp.gmv).toFixed(4)) : null;
  totals.zhidui.refundRate = totals.zhidui.gmv > 0 ? Number((1 - totals.zhidui.gsv / totals.zhidui.gmv).toFixed(4)) : null;
  totals.fuwu.refundRate = totals.fuwu.gmv > 0 ? Number((1 - totals.fuwu.gsv / totals.fuwu.gmv).toFixed(4)) : null;
  return totals;
}
function calculateFuwuTotalsByChannel(fuwuGmvData, fuwuGsvData) {
  const totals = {};
  const channels = fuwuGmvData.channels || [];
  channels.forEach((ch) => {
    totals[ch] = { gmv: 0, gsv: 0, refundRate: null };
  });
  fuwuGmvData.data.forEach((row) => {
    channels.forEach((ch) => {
      totals[ch].gmv += row[ch] || 0;
    });
  });
  fuwuGsvData.data.forEach((row) => {
    channels.forEach((ch) => {
      totals[ch].gsv += row[ch] || 0;
    });
  });
  channels.forEach((ch) => {
    totals[ch].refundRate = totals[ch].gmv > 0 ? Number((1 - totals[ch].gsv / totals[ch].gmv).toFixed(4)) : null;
  });
  return totals;
}
var PLATFORM_CONFIG, CHANNEL_MAP_CONFIG;
var init_newretail_gmv_logic = __esm({
  "api/data/newretail-gmv-logic.js"() {
    init_functionsRoutes_0_43621812355026957();
    PLATFORM_CONFIG = {
      douyin: {
        name: "\u6296\u97F3",
        sheetId: "tuec5U",
        cols: { product: 2, amount: 8, quantity: 4, time: 33, status: 36, darenId: 40 }
      },
      xiaohongshu: {
        name: "\u5C0F\u7EA2\u4E66",
        sheetId: "v3JEoi",
        cols: { product: 17, amount: 23, quantity: 19, time: 34, status: 1, darenId: 15 }
      },
      shipinhao: {
        name: "\u89C6\u9891\u53F7",
        sheetId: "LoahCg",
        cols: { product: 40, amount: 18, quantity: 49, time: 25, status: 5, darenName: 34 }
      },
      kuaishou: {
        name: "\u5FEB\u624B",
        sheetId: "7uRPyy",
        cols: { product: 25, amount: 7, quantity: 15, time: 4, status: 6, darenId: 31 }
      }
    };
    CHANNEL_MAP_CONFIG = {
      sheetId: "ghju03",
      cols: { channelName: 0, platform: 1, darenName: 3, darenId: 4 }
    };
    __name(parseDateFromPlatform, "parseDateFromPlatform");
    __name(parseExcelSerial, "parseExcelSerial");
    __name(parseStandardDate, "parseStandardDate");
    __name(formatDate, "formatDate");
    __name(parseAmount2, "parseAmount");
    __name(parseDarenId, "parseDarenId");
    __name(parseQuantity, "parseQuantity");
    __name(buildChannelMaps, "buildChannelMaps");
    __name(classifyOrder, "classifyOrder");
    __name(processPlatformOrdersGsv, "processPlatformOrdersGsv");
    __name(processPlatformOrders, "processPlatformOrders");
    __name(aggregateByDayAndCategory, "aggregateByDayAndCategory");
    __name(aggregateFuwuByChannel, "aggregateFuwuByChannel");
    __name(aggregateFuwuByChannelMonthly, "aggregateFuwuByChannelMonthly");
    __name(aggregateFuwuByChannelWeekly, "aggregateFuwuByChannelWeekly");
    __name(aggregateDpByChannel, "aggregateDpByChannel");
    __name(aggregateDpByChannelMonthly, "aggregateDpByChannelMonthly");
    __name(aggregateDpByChannelWeekly, "aggregateDpByChannelWeekly");
    __name(aggregateDpRefundRateByChannel, "aggregateDpRefundRateByChannel");
    __name(calculateDpTotalsByChannel, "calculateDpTotalsByChannel");
    __name(weekStartFromDateStr, "weekStartFromDateStr");
    __name(aggregateByWeek, "aggregateByWeek");
    __name(monthFromDateStr, "monthFromDateStr");
    __name(aggregateByMonth, "aggregateByMonth");
    __name(aggregateDpByDarenMonthly, "aggregateDpByDarenMonthly");
    __name(aggregateModelDistributionByDay, "aggregateModelDistributionByDay");
    __name(aggregateModelDistributionByDayFiltered, "aggregateModelDistributionByDayFiltered");
    __name(aggregateModelDistributionByDaren, "aggregateModelDistributionByDaren");
    __name(aggregateRefundRateByDayAndCategory, "aggregateRefundRateByDayAndCategory");
    __name(aggregateRefundRateByWeek, "aggregateRefundRateByWeek");
    __name(aggregateRefundRateByMonth, "aggregateRefundRateByMonth");
    __name(aggregateFuwuRefundRateByChannel, "aggregateFuwuRefundRateByChannel");
    __name(calculateTotalsByCategory, "calculateTotalsByCategory");
    __name(calculateFuwuTotalsByChannel, "calculateFuwuTotalsByChannel");
  }
});

// api/data/feishu-newretail-daily.js
function numToColLetter(n) {
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + n % 26) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s || "A";
}
async function fetchSingleColumn2(env, spreadsheetToken, sheetId, colLetter, startRow, endRow) {
  var range = sheetId + "!" + colLetter + startRow + ":" + colLetter + endRow;
  var result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "FormattedValue" });
  if (!result || result.code !== 0) {
    return { success: false, error: result?.msg || "\u8BFB\u53D6\u5931\u8D25", code: result?.code };
  }
  var values = result.data && result.data.valueRange && result.data.valueRange.values || [];
  return { success: true, values };
}
function mergeColumnsToRows2(columns, rowCount, colIndexMap) {
  var result = [];
  for (var i = 0; i < rowCount; i++) {
    var row = new Array(41).fill("");
    if (columns.C && columns.C[i]) row[colIndexMap.C] = columns.C[i][0];
    if (columns.E && columns.E[i]) row[colIndexMap.E] = columns.E[i][0];
    if (columns.I && columns.I[i]) row[colIndexMap.I] = columns.I[i][0];
    if (columns.AH && columns.AH[i]) row[colIndexMap.AH] = columns.AH[i][0];
    if (columns.AK && columns.AK[i]) row[colIndexMap.AK] = columns.AK[i][0];
    if (columns.AO && columns.AO[i]) row[colIndexMap.AO] = columns.AO[i][0];
    result.push(row);
  }
  return result;
}
async function sha256Hex4(s) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  var arr = new Uint8Array(buf);
  var hex = "";
  for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}
async function onRequestGet13(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_NEWRETAIL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN7;
  var maxRows = parseInt(env.FEISHU_NEWRETAIL_MAX_ROWS || "20000", 10);
  if (isNaN(maxRows) || maxRows < 1e3) maxRows = 2e4;
  var cacheTtlSec = parseInt(env.FEISHU_NEWRETAIL_CACHE_TTL_SEC || "120", 10);
  if (isNaN(cacheTtlSec) || cacheTtlSec < 0) cacheTtlSec = 120;
  var cacheRequest = null;
  if (cacheTtlSec > 0 && auth.user && auth.user.id != null) {
    var keyPayload = "nrd:" + auth.user.id + ":" + spreadsheetToken + ":" + maxRows;
    var hash = await sha256Hex4(keyPayload);
    cacheRequest = new Request("https://feishu-newretail-daily.cache/" + hash);
    var hit = await caches.default.match(cacheRequest);
    if (hit) {
      var body = await hit.text();
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-QBT-Newretail-Cache": "HIT",
          ...corsHeaders(origin)
        }
      });
    }
  }
  try {
    globalThis.__unmatchedDarenIds = /* @__PURE__ */ new Set();
    globalThis.__unmatchedDarenStats = {};
    var chRange = CHANNEL_MAP_CONFIG.sheetId + "!A1:E2000";
    var chJson = await fetchSheetValuesV2(env, spreadsheetToken, chRange, { valueRenderOption: "FormattedValue" });
    if (!chJson || chJson.code !== 0) {
      return jsonResponse({ error: chJson?.msg || "\u6E20\u9053\u6620\u5C04\u8868\u8BFB\u53D6\u5931\u8D25", feishuCode: chJson?.code }, 502, origin);
    }
    var chValues = chJson.data?.valueRange?.values || [];
    var channelMaps = buildChannelMaps(chValues);
    var darenNicknamesFromChannelMap = [];
    var darenIdToDarenNameMap = {};
    var shipinhaoNameToDarenNameMap = {};
    for (var r = 1; r < chValues.length; r++) {
      var row = chValues[r] || [];
      var channelName = String(row[0] || "").trim();
      var platform = String(row[1] || "").trim();
      var darenName = String(row[3] || "").trim();
      var darenId = String(row[4] || "").trim();
      if (channelName && channelName.indexOf("\u76F4\u8425") !== 0 && channelName.indexOf("\u81EA\u8425") !== 0) {
        if (darenName) {
          darenNicknamesFromChannelMap.push(darenName);
          if (platform === "\u89C6\u9891\u53F7" && darenId) {
            shipinhaoNameToDarenNameMap[darenId] = darenName;
          } else if (darenId) {
            darenIdToDarenNameMap[darenId] = darenName;
          }
        }
      }
    }
    darenNicknamesFromChannelMap = darenNicknamesFromChannelMap.filter(function(item, idx, arr) {
      return arr.indexOf(item) === idx;
    }).sort(function(a, b) {
      return a.localeCompare(b, "zh-CN");
    });
    var platformKeys = ["douyin", "xiaohongshu", "shipinhao", "kuaishou"];
    var platformPromises = platformKeys.map(function(platform2) {
      var cfg = PLATFORM_CONFIG[platform2];
      if (!cfg) return Promise.resolve({ platform: platform2, values: [] });
      if (platform2 === "douyin") {
        return (async function() {
          var sheetId = cfg.sheetId;
          var colResults = await Promise.all([
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "A", 1, maxRows),
            // 表头行
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "C", 1, maxRows),
            // product
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "E", 1, maxRows),
            // quantity
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "I", 1, maxRows),
            // amount
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "AH", 1, maxRows),
            // time
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "AK", 1, maxRows),
            // status
            fetchSingleColumn2(env, spreadsheetToken, sheetId, "AO", 1, maxRows)
            // darenId
          ]);
          var errors = [];
          colResults.forEach(function(r2, idx) {
            if (!r2.success) errors.push(["A", "C", "E", "I", "AH", "AK", "AO"][idx] + ":" + r2.error);
          });
          if (errors.length > 0) {
            console.error("[douyin] \u8BFB\u53D6\u5217\u5931\u8D25:", errors.join(", "));
            return { platform: platform2, values: [] };
          }
          var actualRowCount = Math.max(
            colResults[0].values.length,
            colResults[1].values.length,
            colResults[2].values.length,
            colResults[3].values.length,
            colResults[4].values.length,
            colResults[5].values.length,
            colResults[6].values.length
          );
          var mergedValues = mergeColumnsToRows2({
            C: colResults[1].values,
            E: colResults[2].values,
            I: colResults[3].values,
            AH: colResults[4].values,
            AK: colResults[5].values,
            AO: colResults[6].values
          }, actualRowCount, { C: 2, E: 4, I: 8, AH: 33, AK: 36, AO: 40 });
          if (colResults[0].values.length > 0) {
            var headerRow = new Array(41).fill("");
            headerRow[0] = colResults[0].values[0][0];
            mergedValues.unshift(headerRow);
          }
          console.log("[douyin] \u5206\u5217\u8BFB\u53D6\u6210\u529F, rows=" + mergedValues.length);
          return { platform: platform2, values: mergedValues };
        })();
      }
      var maxCol = Math.max(...Object.values(cfg.cols));
      var colLetter = numToColLetter(maxCol);
      var range = cfg.sheetId + "!A1:" + colLetter + maxRows;
      return fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: "FormattedValue" }).then(function(result) {
        console.log("[" + platform2 + "] \u98DE\u4E66\u8FD4\u56DE: code=" + result?.code + ", rows=" + (result?.data?.valueRange?.values?.length || 0));
        if (result && result.code === 0) {
          return { platform: platform2, values: result.data?.valueRange?.values || [] };
        }
        console.error("[" + platform2 + "] \u98DE\u4E66\u8BFB\u53D6\u5931\u8D25:", result?.code, result?.msg);
        return { platform: platform2, values: [] };
      }).catch(function(e) {
        console.error("\u8BFB\u53D6 " + platform2 + " \u5931\u8D25:", e.message);
        return { platform: platform2, values: [] };
      });
    });
    var platformResults = await Promise.all(platformPromises);
    var allOrdersGmv = [];
    var platformStatsGmv = {};
    var gmvDebugStats = {};
    platformResults.forEach(function(result) {
      if (result.values && result.values.length > 0) {
        var gmvResult = processPlatformOrders(result.values, result.platform, channelMaps);
        allOrdersGmv = allOrdersGmv.concat(gmvResult.orders);
        platformStatsGmv[result.platform] = {
          totalRows: result.values.length - 1,
          validOrders: gmvResult.orders.length
        };
        if (result.platform === "xiaohongshu" || result.platform === "douyin") {
          gmvDebugStats[result.platform] = gmvResult.stats;
        }
      }
    });
    var allOrdersGsv = [];
    var platformStatsGsv = {};
    var gsvDebugInfo = {};
    platformResults.forEach(function(result) {
      if (result.values && result.values.length > 0) {
        var gsvResult = processPlatformOrdersGsv(result.values, result.platform, channelMaps);
        allOrdersGsv = allOrdersGsv.concat(gsvResult.orders);
        platformStatsGsv[result.platform] = {
          totalRows: result.values.length - 1,
          validOrders: gsvResult.orders.length,
          skippedCount: gsvResult.skipCount
        };
        gsvDebugInfo[result.platform] = gsvResult.debugSkipped;
      }
    });
    var dailyPointsGmv = aggregateByDayAndCategory(allOrdersGmv);
    var weeklyPointsGmv = aggregateByWeek(dailyPointsGmv);
    var monthlyPointsGmv = aggregateByMonth(dailyPointsGmv);
    var dailyPointsGsv = aggregateByDayAndCategory(allOrdersGsv);
    var weeklyPointsGsv = aggregateByWeek(dailyPointsGsv);
    var monthlyPointsGsv = aggregateByMonth(dailyPointsGsv);
    var dailyRefundRate = aggregateRefundRateByDayAndCategory(dailyPointsGmv, dailyPointsGsv);
    var weeklyRefundRate = aggregateRefundRateByWeek(dailyPointsGmv, dailyPointsGsv);
    var monthlyRefundRate = aggregateRefundRateByMonth(dailyPointsGmv, dailyPointsGsv);
    var fuwuByChannel = aggregateFuwuByChannel(allOrdersGmv);
    var fuwuByChannelWeekly = aggregateFuwuByChannelWeekly(fuwuByChannel.data);
    var fuwuByChannelMonthly = aggregateFuwuByChannelMonthly(fuwuByChannel.data);
    var fuwuByChannelGsv = aggregateFuwuByChannel(allOrdersGsv);
    var fuwuByChannelGsvWeekly = aggregateFuwuByChannelWeekly(fuwuByChannelGsv.data);
    var fuwuByChannelGsvMonthly = aggregateFuwuByChannelMonthly(fuwuByChannelGsv.data);
    var fuwuRefundRateDaily = aggregateFuwuRefundRateByChannel(fuwuByChannel, fuwuByChannelGsv);
    var fuwuRefundRateWeekly = aggregateFuwuRefundRateByChannel(fuwuByChannelWeekly, fuwuByChannelGsvWeekly);
    var fuwuRefundRateMonthly = aggregateFuwuRefundRateByChannel(fuwuByChannelMonthly, fuwuByChannelGsvMonthly);
    var fourPlatformTotals = calculateTotalsByCategory(dailyPointsGmv, dailyPointsGsv);
    var fuwuTotalsDaily = calculateFuwuTotalsByChannel(fuwuByChannel, fuwuByChannelGsv);
    var fuwuTotalsWeekly = calculateFuwuTotalsByChannel(fuwuByChannelWeekly, fuwuByChannelGsvWeekly);
    var fuwuTotalsMonthly = calculateFuwuTotalsByChannel(fuwuByChannelMonthly, fuwuByChannelGsvMonthly);
    var dpByChannel = aggregateDpByChannel(allOrdersGmv);
    var dpByChannelWeekly = aggregateDpByChannelWeekly(dpByChannel.data);
    var dpByChannelMonthly = aggregateDpByChannelMonthly(dpByChannel.data);
    var dpByChannelGsv = aggregateDpByChannel(allOrdersGsv);
    var dpByChannelGsvWeekly = aggregateDpByChannelWeekly(dpByChannelGsv.data);
    var dpByChannelGsvMonthly = aggregateDpByChannelMonthly(dpByChannelGsv.data);
    var dpRefundRateDaily = aggregateDpRefundRateByChannel(dpByChannel, dpByChannelGsv);
    var dpRefundRateWeekly = aggregateDpRefundRateByChannel(dpByChannelWeekly, dpByChannelGsvWeekly);
    var dpRefundRateMonthly = aggregateDpRefundRateByChannel(dpByChannelMonthly, dpByChannelGsvMonthly);
    var dpTotalsDaily = calculateDpTotalsByChannel(dpByChannel, dpByChannelGsv);
    var dpTotalsWeekly = calculateDpTotalsByChannel(dpByChannelWeekly, dpByChannelGsvWeekly);
    var dpTotalsMonthly = calculateDpTotalsByChannel(dpByChannelMonthly, dpByChannelGsvMonthly);
    var dpByDarenMonthly = aggregateDpByDarenMonthly(allOrdersGmv, allOrdersGsv);
    var modelMappingRange = "NYYiAs!A1:B1000";
    var modelMappingJson = await fetchSheetValuesV2(env, spreadsheetToken, modelMappingRange, { valueRenderOption: "FormattedValue" });
    var modelMapping = [];
    if (modelMappingJson && modelMappingJson.code === 0) {
      var modelValues = modelMappingJson.data?.valueRange?.values || [];
      for (var i = 1; i < modelValues.length; i++) {
        var row = modelValues[i] || [];
        var keyword = String(row[0] || "").trim();
        var model = String(row[1] || "").trim();
        if (keyword && model) {
          modelMapping.push({ keyword, model });
        }
      }
    }
    var modelDistributionResult = aggregateModelDistributionByDay(allOrdersGmv, modelMapping);
    var modelDistributionGsvResult = aggregateModelDistributionByDay(allOrdersGsv, modelMapping);
    var modelDistDpMuchengResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, function(order) {
      return order.category === "dp" && order.channel && order.channel.includes("\u6C90\u6210");
    });
    var modelDistDpZhumengResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, function(order) {
      return order.category === "dp" && order.channel && order.channel.includes("\u9010\u68A6");
    });
    var modelDistDarenResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, function(order) {
      return order.category === "zhidui" || order.category === "fuwu";
    });
    var modelDistDarenByDaren = aggregateModelDistributionByDaren(allOrdersGsv, modelMapping, function(order) {
      return order.category === "zhidui" || order.category === "fuwu" || order.category === "dp";
    }, darenNicknamesFromChannelMap, darenIdToDarenNameMap, shipinhaoNameToDarenNameMap);
    if (globalThis.__unmatchedDarenStats && Object.keys(globalThis.__unmatchedDarenStats).length > 0) {
      console.log("\n=== \u672A\u5339\u914D\u5230\u6E20\u9053\u7684\u8FBE\u4EBAID\u7EDF\u8BA1 ===");
      console.log("\u672A\u5339\u914D\u8FBE\u4EBA\u6570\u91CF:", Object.keys(globalThis.__unmatchedDarenStats).length);
      const sortedStats = Object.values(globalThis.__unmatchedDarenStats).sort((a, b) => b.gmv + b.gsv - (a.gmv + a.gsv));
      console.log("\n\u8FBE\u4EBAID | \u5E73\u53F0 | \u8BA2\u5355\u6570 | GMV\u91D1\u989D(\u5143) | GSV\u91D1\u989D(\u5143) | \u603B\u989D(\u5143)");
      console.log("-".repeat(90));
      let totalGmv = 0;
      let totalGsv = 0;
      let totalCount = 0;
      sortedStats.forEach((stat) => {
        const rowTotal = stat.gmv + stat.gsv;
        totalGmv += stat.gmv;
        totalGsv += stat.gsv;
        totalCount += stat.count;
        console.log(
          `${stat.darenId.padEnd(20)} | ${stat.platform.padEnd(8)} | ${String(stat.count).padStart(6)} | ${String(stat.gmv.toFixed(2)).padStart(12)} | ${String(stat.gsv.toFixed(2)).padStart(12)} | ${rowTotal.toFixed(2)}`
        );
      });
      console.log("-".repeat(90));
      console.log(`\u5408\u8BA1 | - | ${totalCount} | ${totalGmv.toFixed(2)} | ${totalGsv.toFixed(2)} | ${(totalGmv + totalGsv).toFixed(2)}`);
      console.log('\n\u6CE8\uFF1A\u4EE5\u4E0A\u8FBE\u4EBAID\u5728\u6E20\u9053\u6620\u5C04\u8868\u4E2D\u672A\u627E\u5230\u5BF9\u5E94\u5173\u7CFB\uFF0C\u88AB\u5F52\u7C7B\u5230"\u670D\u52A1\u5546"\u7C7B\u522B');
    }
    var payload = {
      mode: "daily",
      // 顶层 daily/weekly/monthly 用于兼容前端旧版渲染
      daily: dailyPointsGsv,
      weekly: weeklyPointsGsv,
      monthly: monthlyPointsGsv,
      gmv: {
        daily: dailyPointsGmv,
        weekly: weeklyPointsGmv,
        monthly: monthlyPointsGmv
      },
      gsv: {
        daily: dailyPointsGsv,
        weekly: weeklyPointsGsv,
        monthly: monthlyPointsGsv
      },
      refundRate: {
        daily: dailyRefundRate,
        weekly: weeklyRefundRate,
        monthly: monthlyRefundRate
      },
      fuwuGmv: {
        daily: fuwuByChannel,
        weekly: fuwuByChannelWeekly,
        monthly: fuwuByChannelMonthly
      },
      fuwuGsv: {
        daily: fuwuByChannelGsv,
        weekly: fuwuByChannelGsvWeekly,
        monthly: fuwuByChannelGsvMonthly
      },
      fuwuRefundRate: {
        daily: fuwuRefundRateDaily,
        weekly: fuwuRefundRateWeekly,
        monthly: fuwuRefundRateMonthly
      },
      dpGmv: {
        daily: dpByChannel,
        weekly: dpByChannelWeekly,
        monthly: dpByChannelMonthly
      },
      dpGsv: {
        daily: dpByChannelGsv,
        weekly: dpByChannelGsvWeekly,
        monthly: dpByChannelGsvMonthly
      },
      dpRefundRate: {
        daily: dpRefundRateDaily,
        weekly: dpRefundRateWeekly,
        monthly: dpRefundRateMonthly
      },
      totals: {
        fourPlatform: fourPlatformTotals,
        fuwuDaily: fuwuTotalsDaily,
        fuwuWeekly: fuwuTotalsWeekly,
        fuwuMonthly: fuwuTotalsMonthly,
        dpDaily: dpTotalsDaily,
        dpWeekly: dpTotalsWeekly,
        dpMonthly: dpTotalsMonthly
      },
      dpGmvGsv: {
        monthly: dpByDarenMonthly
      },
      modelDistribution: modelDistributionResult,
      modelDistributionGsv: modelDistributionGsvResult,
      modelDistDpMucheng: modelDistDpMuchengResult,
      modelDistDpZhumeng: modelDistDpZhumengResult,
      modelDistDaren: modelDistDarenResult,
      modelDistDarenByDaren,
      meta: {
        spreadsheetToken,
        totalOrdersGmv: allOrdersGmv.length,
        totalOrdersGsv: allOrdersGsv.length,
        platformStatsGmv,
        platformStatsGsv,
        platforms: platformKeys,
        cached: false,
        debugUnmatchedDarenIds: globalThis.__unmatchedDarenIds ? Array.from(globalThis.__unmatchedDarenIds) : [],
        debugUnmatchedDarenStats: globalThis.__unmatchedDarenStats || {}
      }
    };
    var jsonBody = JSON.stringify(payload);
    var res = new Response(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-QBT-Newretail-Cache": "MISS",
        ...corsHeaders(origin)
      }
    });
    if (cacheRequest && cacheTtlSec > 0) {
      try {
        await caches.default.put(
          cacheRequest,
          new Response(jsonBody, {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "max-age=" + cacheTtlSec
            }
          })
        );
      } catch (ePut) {
      }
    }
    return res;
  } catch (e) {
    return jsonResponse(
      { error: "\u65B0\u96F6\u552E\u6570\u636E\u805A\u5408\u5931\u8D25", detail: e?.message || String(e) },
      502,
      origin
    );
  }
}
async function onRequestOptions16(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN7;
var init_feishu_newretail_daily = __esm({
  "api/data/feishu-newretail-daily.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    init_newretail_gmv_logic();
    DEFAULT_SPREADSHEET_TOKEN7 = "WNp4wbOI3ib7J7kiX2fcZf6Fn8b";
    __name(numToColLetter, "numToColLetter");
    __name(fetchSingleColumn2, "fetchSingleColumn");
    __name(mergeColumnsToRows2, "mergeColumnsToRows");
    __name(sha256Hex4, "sha256Hex");
    __name(onRequestGet13, "onRequestGet");
    __name(onRequestOptions16, "onRequestOptions");
  }
});

// api/data/feishu-tmall-sales.js
function splitRange3(range) {
  var i = String(range || "").indexOf("!");
  if (i < 0) return { sheetPart: String(range || ""), addrPart: "A1:ZZ20000" };
  return { sheetPart: String(range || "").slice(0, i), addrPart: String(range || "").slice(i + 1) || "A1:ZZ20000" };
}
function isSheetNotFound3(feishuJson) {
  var msg = String(feishuJson && feishuJson.msg || "");
  return msg.indexOf("not found sheetId") >= 0 || msg.indexOf("sheetId not found") >= 0;
}
function isDataExceeded3(feishuJson) {
  var msg = String(feishuJson && feishuJson.msg || "");
  return msg.indexOf("data exceeded") >= 0 && msg.indexOf("10485760") >= 0;
}
function shrinkRangeMaxRows3(range, maxRows) {
  var parsed = splitRange3(range);
  var addr = String(parsed.addrPart || "");
  var m = addr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return null;
  var c1 = m[1];
  var r1 = parseInt(m[2], 10);
  var c2 = m[3];
  var r2 = parseInt(m[4], 10);
  if (!isFinite(r1) || !isFinite(r2) || r2 <= 0 || maxRows <= 0) return null;
  var target = Math.min(r2, maxRows);
  if (target >= r2) return null;
  if (target <= r1) target = r1 + 1;
  return String(parsed.sheetPart || "") + "!" + c1 + String(r1) + ":" + c2 + String(target);
}
async function resolveRangeBySheetTitle3(env, spreadsheetToken, rangeMaybeTitle) {
  var parsed = splitRange3(rangeMaybeTitle);
  if (!parsed.sheetPart) return null;
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) return null;
  var sheets = sheetsJson.data && sheetsJson.data.sheets || [];
  var exact = sheets.find(function(s) {
    return String(s.title || "").trim() === parsed.sheetPart.trim();
  });
  var fuzzy = exact ? null : sheets.find(function(s) {
    return String(s.title || "").indexOf(parsed.sheetPart) >= 0 || parsed.sheetPart.indexOf(String(s.title || "")) >= 0;
  });
  var hit = exact || fuzzy;
  if (!hit || !hit.sheet_id) return null;
  return String(hit.sheet_id) + "!" + parsed.addrPart;
}
async function fetchRangeWithAutoResolve3(env, spreadsheetToken, rawRange) {
  var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, rawRange);
  var finalRange = rawRange;
  if (feishuJson.code !== 0 && isSheetNotFound3(feishuJson)) {
    var resolved = await resolveRangeBySheetTitle3(env, spreadsheetToken, rawRange);
    if (resolved) {
      var retry = await fetchSheetValuesV2(env, spreadsheetToken, resolved);
      if (retry.code === 0) {
        feishuJson = retry;
        finalRange = resolved;
      }
    }
  }
  if (feishuJson.code !== 0 && isDataExceeded3(feishuJson)) {
    var caps = [12e3, 8e3, 6e3, 4e3, 3e3, 2e3];
    for (var i = 0; i < caps.length; i++) {
      var smaller = shrinkRangeMaxRows3(finalRange, caps[i]);
      if (!smaller) continue;
      var retry2 = await fetchSheetValuesV2(env, spreadsheetToken, smaller);
      if (retry2 && retry2.code === 0) {
        feishuJson = retry2;
        finalRange = smaller;
        break;
      }
      if (retry2 && retry2.code !== 0) {
        feishuJson = retry2;
        finalRange = smaller;
        if (!isDataExceeded3(retry2)) break;
      }
    }
  }
  return { feishuJson, finalRange };
}
function mergeMainAndModelValues(mainValues, modelValues, modelStartIndex) {
  if (!mainValues || !mainValues.length) return mainValues || [];
  if (!modelValues || !modelValues.length) return mainValues;
  var result = [];
  var maxRows = Math.max(mainValues.length, modelValues.length);
  var startIdx = typeof modelStartIndex === "number" ? modelStartIndex : 50;
  for (var i = 0; i < maxRows; i++) {
    var mainRow = mainValues[i] || [];
    var modelRow = modelValues[i] || [];
    var mergedRow = new Array(Math.max(mainRow.length, startIdx + modelRow.length)).fill("");
    for (var j = 0; j < mainRow.length; j++) {
      mergedRow[j] = mainRow[j];
    }
    for (var k = 0; k < modelRow.length; k++) {
      mergedRow[startIdx + k] = modelRow[k];
    }
    result.push(mergedRow);
  }
  return result;
}
async function onRequestGet14(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E\u98DE\u4E66\u5E94\u7528\uFF0C\u8BF7\u5728 Pages \u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E FEISHU_APP_ID\u3001FEISHU_APP_SECRET" },
      503,
      origin
    );
  }
  var spreadsheetToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN8;
  var range = env.FEISHU_TMALL_SHEET_RANGE || DEFAULT_RANGE4;
  var rangeModel = env.FEISHU_TMALL_SHEET_RANGE_MODEL || DEFAULT_RANGE_MODEL2;
  try {
    var rMain = await fetchRangeWithAutoResolve3(env, spreadsheetToken, range);
    if (!rMain.feishuJson || rMain.feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (rMain.feishuJson && rMain.feishuJson.msg ? rMain.feishuJson.msg : "\u98DE\u4E66\u8868\u683C\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF") + "\uFF08\u5929\u732B\u4E3B\u6570\u636E range=" + String(rMain.finalRange || range) + "\uFF09",
          feishuCode: rMain.feishuJson && rMain.feishuJson.code
        },
        502,
        origin
      );
    }
    var rModel = await fetchRangeWithAutoResolve3(env, spreadsheetToken, rangeModel);
    var modelValues = [];
    if (rModel.feishuJson && rModel.feishuJson.code === 0) {
      modelValues = rModel.feishuJson.data?.valueRange?.values || [];
    }
    var mainValues = rMain.feishuJson.data?.valueRange?.values || [];
    var mergedValues = mergeMainAndModelValues(mainValues, modelValues, 50);
    var payload = {
      spreadsheetToken,
      range: String(rMain.finalRange || range) + " + " + String(rModel.finalRange || rangeModel),
      revision: rMain.feishuJson.data?.revision,
      valueRange: {
        range: String(rMain.finalRange || range) + " + " + String(rModel.finalRange || rangeModel),
        majorDimension: "ROWS",
        values: mergedValues
      }
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    var msg = e && e.message === "FEISHU_NOT_CONFIGURED" ? "\u98DE\u4E66\u5E94\u7528\u672A\u914D\u7F6E" : String(e && e.message || e);
    return jsonResponse({ error: "\u62C9\u53D6\u98DE\u4E66\u8868\u683C\u5931\u8D25", detail: msg }, 502, origin);
  }
}
async function onRequestOptions17(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var DEFAULT_SPREADSHEET_TOKEN8, DEFAULT_RANGE4, DEFAULT_RANGE_MODEL2;
var init_feishu_tmall_sales = __esm({
  "api/data/feishu-tmall-sales.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    init_session();
    init_feishu();
    DEFAULT_SPREADSHEET_TOKEN8 = "WkFuwdxnhio6AckVEeQcohMAnpc";
    DEFAULT_RANGE4 = "2joAvv!A1:H20000";
    DEFAULT_RANGE_MODEL2 = "2joAvv!AY1:CZ20000";
    __name(splitRange3, "splitRange");
    __name(isSheetNotFound3, "isSheetNotFound");
    __name(isDataExceeded3, "isDataExceeded");
    __name(shrinkRangeMaxRows3, "shrinkRangeMaxRows");
    __name(resolveRangeBySheetTitle3, "resolveRangeBySheetTitle");
    __name(fetchRangeWithAutoResolve3, "fetchRangeWithAutoResolve");
    __name(mergeMainAndModelValues, "mergeMainAndModelValues");
    __name(onRequestGet14, "onRequestGet");
    __name(onRequestOptions17, "onRequestOptions");
  }
});

// _lib/openclaw-auth.js
function bytesToHex2(u8) {
  var s = "";
  for (var i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0");
  return s;
}
async function hmacHex(secret, message) {
  var key = await crypto.subtle.importKey(
    "raw",
    enc2.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  var sig = await crypto.subtle.sign("HMAC", key, enc2.encode(String(message || "")));
  return bytesToHex2(new Uint8Array(sig));
}
function buildOpenClawSignatureMessage(method, pathname, yearMonth, timestamp, nonce, apiKey) {
  return [
    String(method || "GET").toUpperCase(),
    String(pathname || ""),
    String(yearMonth || ""),
    String(timestamp || ""),
    String(nonce || ""),
    String(apiKey || "")
  ].join("\n");
}
async function authenticateOpenClawRequest(request, env) {
  var origin = request.headers.get("Origin") || void 0;
  if (!env.OPENCLAW_MONTHLY_API_KEY || !env.OPENCLAW_MONTHLY_API_SECRET) {
    return { error: jsonResponse({ error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E OPENCLAW_MONTHLY_API_KEY / OPENCLAW_MONTHLY_API_SECRET" }, 503, origin) };
  }
  var url = new URL(request.url);
  var apiKey = String(url.searchParams.get("key") || "");
  var timestamp = String(url.searchParams.get("ts") || "");
  var nonce = String(url.searchParams.get("nonce") || "");
  var signature = String(url.searchParams.get("sig") || "").toLowerCase();
  var yearMonth = String(url.searchParams.get("yearMonth") || "");
  if (!apiKey || !timestamp || !nonce || !signature) {
    return { error: jsonResponse({ error: "\u7F3A\u5C11\u7B7E\u540D\u53C2\u6570" }, 401, origin) };
  }
  if (apiKey !== String(env.OPENCLAW_MONTHLY_API_KEY)) {
    return { error: jsonResponse({ error: "\u7B7E\u540D\u65E0\u6548" }, 401, origin) };
  }
  var tsNum = parseInt(timestamp, 10);
  if (!isFinite(tsNum)) {
    return { error: jsonResponse({ error: "\u7B7E\u540D\u65F6\u95F4\u6233\u65E0\u6548" }, 401, origin) };
  }
  if (Math.abs(Date.now() - tsNum) > CLOCK_SKEW_MS) {
    return { error: jsonResponse({ error: "\u7B7E\u540D\u5DF2\u8FC7\u671F" }, 401, origin) };
  }
  var expected = await hmacHex(
    env.OPENCLAW_MONTHLY_API_SECRET,
    buildOpenClawSignatureMessage(request.method, url.pathname, yearMonth, timestamp, nonce, apiKey)
  );
  if (expected !== signature) {
    return { error: jsonResponse({ error: "\u7B7E\u540D\u65E0\u6548" }, 401, origin) };
  }
  return {
    ok: true,
    apiKey,
    timestamp: tsNum,
    nonce,
    yearMonth
  };
}
var enc2, CLOCK_SKEW_MS;
var init_openclaw_auth = __esm({
  "_lib/openclaw-auth.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_http();
    enc2 = new TextEncoder();
    CLOCK_SKEW_MS = 5 * 60 * 1e3;
    __name(bytesToHex2, "bytesToHex");
    __name(hmacHex, "hmacHex");
    __name(buildOpenClawSignatureMessage, "buildOpenClawSignatureMessage");
    __name(authenticateOpenClawRequest, "authenticateOpenClawRequest");
  }
});

// _lib/monthly-cumulative.js
function pad23(n) {
  return String(n).padStart(2, "0");
}
function currentDateYmd() {
  var d = /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + pad23(d.getMonth() + 1) + "-" + pad23(d.getDate());
}
function lastDateOfYearMonth(yearMonth) {
  var p = String(yearMonth || "").split("-");
  if (p.length !== 2) return "";
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  if (!isFinite(y) || !isFinite(m) || m < 1 || m > 12) return "";
  return String(yearMonth) + "-" + pad23(new Date(y, m, 0).getDate());
}
function resolveMonthlyStatDate(yearMonth, nowYmd) {
  var ym = String(yearMonth || "");
  var today = String(nowYmd || currentDateYmd());
  if (today.slice(0, 7) === ym) return today;
  return lastDateOfYearMonth(ym);
}
function unwrapFeishuCell(v) {
  if (v == null) return v;
  if (typeof v === "object" && !Array.isArray(v)) {
    if (v.text != null && v.text !== "") return v.text;
    if (v.value !== void 0 && v.value !== null && v.value !== "") return v.value;
    if (typeof v.stringValue === "string") return v.stringValue;
  }
  return v;
}
function parseNum(v) {
  var raw = unwrapFeishuCell(v);
  if (typeof raw === "string" && /^[\s\u00a0]*[=＝]/.test(raw)) return 0;
  var s = String(raw == null ? "" : raw).replace(/[,，\s\u00a0]/g, "");
  var wan = s.match(/^([\d.]+)\s*万/);
  if (wan) {
    var w = parseFloat(wan[1]);
    return isFinite(w) ? w * 1e4 : 0;
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function parseFeishuCellDate(cell) {
  cell = unwrapFeishuCell(cell);
  if (cell == null || cell === "") return "";
  if (typeof cell === "number" && isFinite(cell) && cell > 2e4 && cell < 6e4) {
    var utcDays = Math.floor(cell - 25569);
    var d0 = new Date(utcDays * 86400 * 1e3);
    return d0.getFullYear() + "-" + pad23(d0.getMonth() + 1) + "-" + pad23(d0.getDate());
  }
  var s = String(cell).trim();
  var ymd8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd8) return ymd8[1] + "-" + ymd8[2] + "-" + ymd8[3];
  s = s.replace(/年|月/g, "-").replace(/日/g, "").replace(/\./g, "-").replace(/\//g, "-");
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + pad23(parseInt(m[2], 10)) + "-" + pad23(parseInt(m[3], 10));
  var tryD = new Date(s);
  if (!isNaN(tryD.getTime())) {
    return tryD.getFullYear() + "-" + pad23(tryD.getMonth() + 1) + "-" + pad23(tryD.getDate());
  }
  return "";
}
function parseMapByDate(values, colIndex) {
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      if (!ds) continue;
      bucket[ds] = (bucket[ds] || 0) + parseNum(row[colIndex]);
    }
  }
  __name(scan, "scan");
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return bucket;
}
function parseDailySalesLearnMap(values) {
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[1]);
      if (!ds) continue;
      bucket[ds] = (bucket[ds] || 0) + parseNum(row[6]);
    }
  }
  __name(scan, "scan");
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return bucket;
}
function parseDailySalesQinziMap(values) {
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      if (!ds) continue;
      bucket[ds] = (bucket[ds] || 0) + parseNum(row[6]);
    }
  }
  __name(scan, "scan");
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return bucket;
}
function buildGmvCombinedPoints(gmvCombined, dailySales, douyinSales) {
  var jdV = ((gmvCombined || {}).jdValueRange || {}).values || [];
  var tmV = ((gmvCombined || {}).tmallValueRange || {}).values || [];
  var vr1 = ((dailySales || {}).valueRange || {}).values || [];
  var vr2 = ((dailySales || {}).valueRange2 || {}).values || [];
  var dy1 = ((douyinSales || {}).valueRange || {}).values || [];
  var dy2 = ((douyinSales || {}).valueRange2 || {}).values || [];
  var dy3 = ((douyinSales || {}).valueRange3 || {}).values || [];
  var jdThirdMap = parseMapByDate(jdV, 5);
  var mapLearn = parseDailySalesLearnMap(vr1);
  var mapQinzi = parseDailySalesQinziMap(vr2);
  var mapTmShop = parseMapByDate(tmV, 6);
  var mapTmLearn = parseMapByDate(tmV, 10);
  var mapTmQinzi = parseMapByDate(tmV, 12);
  var mapDyShop = parseMapByDate(dy1, 3);
  var mapDyDarenShop = parseMapByDate(dy1, 5);
  var mapDyLearn = parseMapByDate(dy2, 6);
  var mapDyQinzi = parseMapByDate(dy3, 6);
  var all = {};
  [jdThirdMap, mapLearn, mapQinzi, mapTmShop, mapTmLearn, mapTmQinzi, mapDyShop, mapDyDarenShop, mapDyLearn, mapDyQinzi].forEach(function(mp) {
    Object.keys(mp).forEach(function(d) {
      all[d] = true;
    });
  });
  return Object.keys(all).sort().map(function(d) {
    return {
      date: d,
      jdGmv: Number(jdThirdMap[d]) || 0,
      tmallGmv: Number(mapTmShop[d]) || 0,
      dySelfGmv: Number(mapDyShop[d]) || 0,
      dp: 0,
      daren: 0
    };
  });
}
function buildGsvCombinedPoints(gmvCombined, douyinSales) {
  var jdV = ((gmvCombined || {}).jdValueRange || {}).values || [];
  var jd1 = ((gmvCombined || {}).jdSheet1ValueRange || {}).values || [];
  var jd2 = ((gmvCombined || {}).jdSheet2ValueRange || {}).values || [];
  var tmV = ((gmvCombined || {}).tmallValueRange || {}).values || [];
  var dy1 = ((douyinSales || {}).valueRange || {}).values || [];
  var dy2 = ((douyinSales || {}).valueRange2 || {}).values || [];
  var dy3 = ((douyinSales || {}).valueRange3 || {}).values || [];
  var GSV_JD_FACTOR = 0.75;
  var jdShopRaw = parseMapByDate(jdV, 5);
  var jdLearnRaw = parseMapByDate(jd1, 6);
  var jdQinziRaw = parseMapByDate(jd2, 6);
  var jdGsvShop = {};
  var jdGsvLearn = {};
  var jdGsvQinzi = {};
  Object.keys(jdShopRaw).forEach(function(d) {
    jdGsvShop[d] = (Number(jdShopRaw[d]) || 0) * GSV_JD_FACTOR;
  });
  Object.keys(jdLearnRaw).forEach(function(d) {
    jdGsvLearn[d] = (Number(jdLearnRaw[d]) || 0) * GSV_JD_FACTOR;
  });
  Object.keys(jdQinziRaw).forEach(function(d) {
    jdGsvQinzi[d] = (Number(jdQinziRaw[d]) || 0) * GSV_JD_FACTOR;
  });
  var mapGmv = parseMapByDate(tmV, 6);
  var mapTmH = parseMapByDate(tmV, 7);
  var sumH = 0;
  var sumG = 0;
  Object.keys(mapTmH).forEach(function(d) {
    sumH += Math.abs(Number(mapTmH[d]) || 0);
  });
  Object.keys(mapGmv).forEach(function(d) {
    sumG += Math.abs(Number(mapGmv[d]) || 0);
  });
  var useFallback = sumH < 1e-6 && sumG > 1e-6;
  var mapDyH = parseMapByDate(dy1, 6);
  var mapDyKLearn = parseMapByDate(dy2, 10);
  var mapDyKQinzi = parseMapByDate(dy3, 10);
  var mapDyJ = parseMapByDate(dy1, 9);
  var all = {};
  [jdGsvShop, jdGsvLearn, jdGsvQinzi, mapTmH, mapGmv, mapDyH, mapDyKLearn, mapDyKQinzi, mapDyJ].forEach(function(mp) {
    Object.keys(mp).forEach(function(d) {
      all[d] = true;
    });
  });
  return Object.keys(all).sort().map(function(d) {
    var tmallGsvShop = mapTmH[d] != null ? Number(mapTmH[d]) : 0;
    if (useFallback) tmallGsvShop = (Number(mapGmv[d]) || 0) * 0.75;
    return {
      date: d,
      jdGsv: Number(jdGsvShop[d]) || 0,
      tmallGsv: tmallGsvShop,
      dySelfGsv: Number(mapDyH[d]) || 0,
      dpGsv: 0,
      darenGsv: 0
    };
  });
}
function buildDouyinTrendPointsDaily(douyinTrend) {
  var values = ((douyinTrend || {}).valueRange || {}).values || [];
  if (!values || !values.length) return [];
  var DP_ALWAYS = { "\u5E0C\u6C83\u5B98\u65B9\u5E10\u53F7": true, "\u5E0C\u6C83\u5B98\u65B9\u8D26\u53F7": true, "\u5E0C\u6C83\u5B98\u65B9\u76F4\u64AD\u95F4": true };
  var DP_FROM_20260401 = { "\u5E0C\u6C83\u4EB2\u5B50\u5C4F\u5B98\u65B9\u76F4\u64AD\u95F4": true, "\u5E0C\u6C83\u5B98\u65B9\u65D7\u8230\u5E97": true };
  var CUTOVER = "2026-04-01";
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      var acc = String(unwrapFeishuCell(row[1]) == null ? "" : unwrapFeishuCell(row[1])).trim();
      if (!ds || !acc) continue;
      var gmv = parseNum(row[5]);
      var refund = parseNum(row[13]);
      var gsv = gmv - refund;
      if (!bucket[ds]) bucket[ds] = { dp: 0, daren: 0, dpGsv: 0, darenGsv: 0 };
      if (DP_ALWAYS[acc] || DP_FROM_20260401[acc] && ds >= CUTOVER) {
        bucket[ds].dp += gmv;
        bucket[ds].dpGsv += gsv;
      } else if (!DP_FROM_20260401[acc]) {
        bucket[ds].daren += gmv;
        bucket[ds].darenGsv += gsv;
      }
    }
  }
  __name(scan, "scan");
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return Object.keys(bucket).sort().map(function(d) {
    var b = bucket[d] || {};
    return {
      date: d,
      dp: Number(b.dp) || 0,
      daren: Number(b.daren) || 0,
      dpGsv: Number(b.dpGsv) || 0,
      darenGsv: Number(b.darenGsv) || 0
    };
  });
}
function sumMonthlyAllChannelGmvGsv(yearMonth, gmvDaily, gsvDaily, dyDaily) {
  var ym = String(yearMonth || "");
  var startD = ym + "-01";
  var p = ym.split("-");
  var endD = ym + "-" + pad23(new Date(parseInt(p[0], 10), parseInt(p[1], 10), 0).getDate());
  var sumGmv = { jd: 0, tm: 0, dy: 0, dp: 0, daren: 0 };
  var sumGsv = { jd: 0, tm: 0, dy: 0, dp: 0, daren: 0 };
  (gmvDaily || []).forEach(function(pt) {
    if (!pt || !pt.date || pt.date < startD || pt.date > endD) return;
    sumGmv.jd += Number(pt.jdGmv) || 0;
    sumGmv.tm += Number(pt.tmallGmv) || 0;
    sumGmv.dy += Number(pt.dySelfGmv) || 0;
  });
  (gsvDaily || []).forEach(function(pt) {
    if (!pt || !pt.date || pt.date < startD || pt.date > endD) return;
    sumGsv.jd += Number(pt.jdGsv) || 0;
    sumGsv.tm += Number(pt.tmallGsv) || 0;
    sumGsv.dy += Number(pt.dySelfGsv) || 0;
  });
  (dyDaily || []).forEach(function(pt) {
    if (!pt || !pt.date || pt.date < startD || pt.date > endD) return;
    sumGmv.dp += Number(pt.dp) || 0;
    sumGmv.daren += Number(pt.daren) || 0;
    sumGsv.dp += Number(pt.dpGsv) || 0;
    sumGsv.daren += Number(pt.darenGsv) || 0;
  });
  return { yearMonth: ym, sumGmv, sumGsv };
}
function rate(gmv, gsv) {
  var a = Number(gmv) || 0;
  var b = Number(gsv) || 0;
  if (!(a > 0)) return 0;
  return (1 - b / a) * 100;
}
function toWan(n) {
  return (Number(n || 0) / 1e4).toFixed(2);
}
function buildMonthlyCumulativeSummary(yearMonth, gmvCombined, douyinSales, douyinTrend) {
  var gmvDaily = buildGmvCombinedPoints(gmvCombined, {}, douyinSales);
  var gsvDaily = buildGsvCombinedPoints(gmvCombined, douyinSales);
  var dyDaily = buildDouyinTrendPointsDaily(douyinTrend);
  var pack = sumMonthlyAllChannelGmvGsv(yearMonth, gmvDaily, gsvDaily, dyDaily);
  var sg = pack.sumGmv;
  var ss = pack.sumGsv;
  var totalGmv = (sg.jd || 0) + (sg.tm || 0) + (sg.dy || 0) + (sg.dp || 0) + (sg.daren || 0);
  var totalGsv = (ss.jd || 0) + (ss.tm || 0) + (ss.dy || 0) + (ss.dp || 0) + (ss.daren || 0);
  var hasAnyData = !!(totalGmv > 0 || totalGsv > 0 || gmvDaily.some(function(pt) {
    return pt && pt.date && pt.date.slice(0, 7) === yearMonth;
  }) || gsvDaily.some(function(pt) {
    return pt && pt.date && pt.date.slice(0, 7) === yearMonth;
  }) || dyDaily.some(function(pt) {
    return pt && pt.date && pt.date.slice(0, 7) === yearMonth;
  }));
  return {
    yearMonth,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    hasAnyData,
    summary: {
      totalGmv,
      totalGsv,
      refundRatePct: Number(rate(totalGmv, totalGsv).toFixed(2)),
      totalGmvWan: toWan(totalGmv),
      totalGsvWan: toWan(totalGsv)
    },
    channels: [
      { key: "jd", label: "\u4EAC\u4E1C", gmv: sg.jd, gsv: ss.jd },
      { key: "tmall", label: "\u5929\u732B", gmv: sg.tm, gsv: ss.tm },
      { key: "dySelf", label: "\u6296\u97F3\u81EA\u64AD", gmv: sg.dy, gsv: ss.dy },
      { key: "dp", label: "\u6296\u97F3DP", gmv: sg.dp, gsv: ss.dp },
      { key: "daren", label: "\u6296\u97F3\u8FBE\u4EBA", gmv: sg.daren, gsv: ss.daren }
    ].map(function(item) {
      return {
        key: item.key,
        label: item.label,
        gmv: item.gmv,
        gsv: item.gsv,
        gmvWan: toWan(item.gmv),
        gsvWan: toWan(item.gsv),
        refundRatePct: Number(rate(item.gmv, item.gsv).toFixed(2))
      };
    })
  };
}
function formatMonthlyCumulativeMessage(summaryPayload, statDate) {
  var ch = {};
  (summaryPayload.channels || []).forEach(function(item) {
    ch[item.key] = item;
  });
  function line(key) {
    var x = ch[key] || { gmvWan: "0.00", gsvWan: "0.00", refundRatePct: 0 };
    var label = x.label || "";
    return label + "\uFF1AGMV " + x.gmvWan + "\u4E07\uFF5CGSV " + x.gsvWan + "\u4E07\uFF5C\u9000\u6B3E\u7387 " + Number(x.refundRatePct || 0).toFixed(2) + "%";
  }
  __name(line, "line");
  function formatGeneratedAt(isoString) {
    var d = new Date(isoString || (/* @__PURE__ */ new Date()).toISOString());
    return d.getFullYear() + "-" + pad23(d.getMonth() + 1) + "-" + pad23(d.getDate()) + " " + pad23(d.getHours()) + ":" + pad23(d.getMinutes());
  }
  __name(formatGeneratedAt, "formatGeneratedAt");
  return [
    "\u6708\u5EA6\u7D2F\u8BA1\u8FBE\u6210\u64AD\u62A5\uFF5C" + String(summaryPayload.yearMonth || "").replace(/^(\d{4})-(\d{2})$/, "$1\u5E74$2\u6708"),
    "\u7EDF\u8BA1\u65E5\u671F\uFF1A" + String(statDate || ""),
    "\u7EDF\u8BA1\u53E3\u5F84\uFF1A\u5F53\u67081\u65E5\u81F3\u7EDF\u8BA1\u65E5\u671F\u7D2F\u8BA1",
    "--------------",
    "\u603BGMV\uFF1A" + ((summaryPayload.summary || {}).totalGmvWan || "0.00") + "\u4E07",
    "\u603BGSV\uFF1A" + ((summaryPayload.summary || {}).totalGsvWan || "0.00") + "\u4E07",
    "\u9000\u6B3E\u7387\uFF1A" + Number((summaryPayload.summary || {}).refundRatePct || 0).toFixed(2) + "%",
    "--------------",
    line("jd"),
    line("tmall"),
    line("dySelf"),
    line("dp"),
    line("daren"),
    "\u751F\u6210\u65F6\u95F4\uFF1A" + formatGeneratedAt(summaryPayload.generatedAt)
  ].join("\n");
}
var init_monthly_cumulative = __esm({
  "_lib/monthly-cumulative.js"() {
    init_functionsRoutes_0_43621812355026957();
    __name(pad23, "pad2");
    __name(currentDateYmd, "currentDateYmd");
    __name(lastDateOfYearMonth, "lastDateOfYearMonth");
    __name(resolveMonthlyStatDate, "resolveMonthlyStatDate");
    __name(unwrapFeishuCell, "unwrapFeishuCell");
    __name(parseNum, "parseNum");
    __name(parseFeishuCellDate, "parseFeishuCellDate");
    __name(parseMapByDate, "parseMapByDate");
    __name(parseDailySalesLearnMap, "parseDailySalesLearnMap");
    __name(parseDailySalesQinziMap, "parseDailySalesQinziMap");
    __name(buildGmvCombinedPoints, "buildGmvCombinedPoints");
    __name(buildGsvCombinedPoints, "buildGsvCombinedPoints");
    __name(buildDouyinTrendPointsDaily, "buildDouyinTrendPointsDaily");
    __name(sumMonthlyAllChannelGmvGsv, "sumMonthlyAllChannelGmvGsv");
    __name(rate, "rate");
    __name(toWan, "toWan");
    __name(buildMonthlyCumulativeSummary, "buildMonthlyCumulativeSummary");
    __name(formatMonthlyCumulativeMessage, "formatMonthlyCumulativeMessage");
  }
});

// api/data/monthly-cumulative-summary.js
function currentYearMonth() {
  var d = /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function todayStr() {
  var d = /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
async function buildInternalAuthToken(env) {
  if (!env.JWT_SECRET) throw new Error("\u670D\u52A1\u5668\u672A\u914D\u7F6E JWT_SECRET");
  var uid = parseInt(String(env.OPENCLAW_INTERNAL_USER_ID || ""), 10);
  var row;
  if (isFinite(uid)) {
    row = await env.DB.prepare(
      "SELECT id, phone, name, is_admin, token_version FROM users WHERE id = ?"
    ).bind(uid).first();
    if (!row) throw new Error("OPENCLAW_INTERNAL_USER_ID \u5BF9\u5E94\u7528\u6237\u4E0D\u5B58\u5728");
  } else {
    row = await env.DB.prepare(
      "SELECT id, phone, name, is_admin, token_version FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1"
    ).first();
    if (!row) throw new Error("\u672A\u627E\u5230\u53EF\u7528\u4E8E OpenClaw \u7684\u7BA1\u7406\u5458\u8D26\u53F7");
  }
  var now = Math.floor(Date.now() / 1e3);
  return signJwt(
    {
      sub: row.id,
      phone: row.phone,
      name: row.name,
      adm: row.is_admin ? 1 : 0,
      tv: row.token_version,
      iat: now,
      exp: now + 5 * 60
    },
    env.JWT_SECRET
  );
}
async function fetchInternalJson(originBase, path, token) {
  var res = await fetch(originBase + path, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    }
  });
  var data = await res.json();
  if (!res.ok) {
    throw new Error(data && data.error || "\u5185\u90E8\u63A5\u53E3\u5931\u8D25: " + path);
  }
  return data;
}
async function onRequestGet15(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get("Origin") || void 0;
  var openclawAuth = await authenticateOpenClawRequest(request, env);
  if (openclawAuth.error) return openclawAuth.error;
  try {
    var url = new URL(request.url);
    var yearMonth = String(url.searchParams.get("yearMonth") || openclawAuth.yearMonth || currentYearMonth());
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return jsonResponse({ error: "yearMonth \u53C2\u6570\u683C\u5F0F\u5E94\u4E3A YYYY-MM" }, 400, origin);
    }
    var token = await buildInternalAuthToken(env);
    var originBase = url.origin;
    var gmvCombined = await fetchInternalJson(originBase, "/api/data/feishu-gmv-combined", token);
    var douyinSales = await fetchInternalJson(originBase, "/api/data/feishu-douyin-sales", token);
    var douyinTrend = await fetchInternalJson(originBase, "/api/data/feishu-douyin-daily-trend", token);
    var summary = buildMonthlyCumulativeSummary(yearMonth, gmvCombined, douyinSales, douyinTrend);
    if (!summary.hasAnyData) {
      return jsonResponse({ error: "\u6307\u5B9A\u6708\u4EFD\u6682\u65E0\u6570\u636E" }, 404, origin);
    }
    var statDate = resolveMonthlyStatDate(yearMonth, todayStr());
    var payload = {
      yearMonth,
      statDate,
      summary: summary.summary,
      channels: summary.channels,
      generatedAt: summary.generatedAt,
      message: formatMonthlyCumulativeMessage(summary, statDate)
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse({ error: "\u751F\u6210\u6708\u5EA6\u7D2F\u8BA1\u8FBE\u6210\u6458\u8981\u5931\u8D25", detail: e && e.message ? e.message : String(e) }, 502, origin);
  }
}
async function onRequestOptions18(context) {
  var origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
var init_monthly_cumulative_summary = __esm({
  "api/data/monthly-cumulative-summary.js"() {
    init_functionsRoutes_0_43621812355026957();
    init_crypto();
    init_http();
    init_openclaw_auth();
    init_monthly_cumulative();
    __name(currentYearMonth, "currentYearMonth");
    __name(todayStr, "todayStr");
    __name(buildInternalAuthToken, "buildInternalAuthToken");
    __name(fetchInternalJson, "fetchInternalJson");
    __name(onRequestGet15, "onRequestGet");
    __name(onRequestOptions18, "onRequestOptions");
  }
});

// ../.wrangler/tmp/pages-slKrqV/functionsRoutes-0.43621812355026957.mjs
var routes;
var init_functionsRoutes_0_43621812355026957 = __esm({
  "../.wrangler/tmp/pages-slKrqV/functionsRoutes-0.43621812355026957.mjs"() {
    init_access_logs();
    init_access_logs();
    init_login_security_events();
    init_login_security_events();
    init_users();
    init_users();
    init_users();
    init_change_password();
    init_change_password();
    init_login();
    init_login();
    init_ping();
    init_ping();
    init_features_brand_top10();
    init_features_brand_top10();
    init_features_output();
    init_features_output();
    init_feishu_channel_order_trend();
    init_feishu_channel_order_trend();
    init_feishu_daily_sales();
    init_feishu_daily_sales();
    init_feishu_douyin_daily_trend();
    init_feishu_douyin_daily_trend();
    init_feishu_douyin_model_distribution();
    init_feishu_douyin_model_distribution();
    init_feishu_douyin_sales();
    init_feishu_douyin_sales();
    init_feishu_gmv_combined();
    init_feishu_gmv_combined();
    init_feishu_livestream_funnel();
    init_feishu_livestream_funnel();
    init_feishu_newretail_daily();
    init_feishu_newretail_daily();
    init_feishu_tmall_sales();
    init_feishu_tmall_sales();
    init_monthly_cumulative_summary();
    init_monthly_cumulative_summary();
    routes = [
      {
        routePath: "/api/admin/access-logs",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet]
      },
      {
        routePath: "/api/admin/access-logs",
        mountPath: "/api/admin",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions]
      },
      {
        routePath: "/api/admin/login-security-events",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet2]
      },
      {
        routePath: "/api/admin/login-security-events",
        mountPath: "/api/admin",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions2]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet3]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions3]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost]
      },
      {
        routePath: "/api/auth/change-password",
        mountPath: "/api/auth",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions4]
      },
      {
        routePath: "/api/auth/change-password",
        mountPath: "/api/auth",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost2]
      },
      {
        routePath: "/api/auth/login",
        mountPath: "/api/auth",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions5]
      },
      {
        routePath: "/api/auth/login",
        mountPath: "/api/auth",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost3]
      },
      {
        routePath: "/api/auth/ping",
        mountPath: "/api/auth",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions6]
      },
      {
        routePath: "/api/auth/ping",
        mountPath: "/api/auth",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost4]
      },
      {
        routePath: "/api/data/features-brand-top10",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet4]
      },
      {
        routePath: "/api/data/features-brand-top10",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions7]
      },
      {
        routePath: "/api/data/features-output",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet5]
      },
      {
        routePath: "/api/data/features-output",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions8]
      },
      {
        routePath: "/api/data/feishu-channel-order-trend",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet6]
      },
      {
        routePath: "/api/data/feishu-channel-order-trend",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions9]
      },
      {
        routePath: "/api/data/feishu-daily-sales",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet7]
      },
      {
        routePath: "/api/data/feishu-daily-sales",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions10]
      },
      {
        routePath: "/api/data/feishu-douyin-daily-trend",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet8]
      },
      {
        routePath: "/api/data/feishu-douyin-daily-trend",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions11]
      },
      {
        routePath: "/api/data/feishu-douyin-model-distribution",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet9]
      },
      {
        routePath: "/api/data/feishu-douyin-model-distribution",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions12]
      },
      {
        routePath: "/api/data/feishu-douyin-sales",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet10]
      },
      {
        routePath: "/api/data/feishu-douyin-sales",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions13]
      },
      {
        routePath: "/api/data/feishu-gmv-combined",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet11]
      },
      {
        routePath: "/api/data/feishu-gmv-combined",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions14]
      },
      {
        routePath: "/api/data/feishu-livestream-funnel",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet12]
      },
      {
        routePath: "/api/data/feishu-livestream-funnel",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions15]
      },
      {
        routePath: "/api/data/feishu-newretail-daily",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet13]
      },
      {
        routePath: "/api/data/feishu-newretail-daily",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions16]
      },
      {
        routePath: "/api/data/feishu-tmall-sales",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet14]
      },
      {
        routePath: "/api/data/feishu-tmall-sales",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions17]
      },
      {
        routePath: "/api/data/monthly-cumulative-summary",
        mountPath: "/api/data",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet15]
      },
      {
        routePath: "/api/data/monthly-cumulative-summary",
        mountPath: "/api/data",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions18]
      }
    ];
  }
});

// ../node_modules/wrangler/templates/pages-template-worker.ts
init_functionsRoutes_0_43621812355026957();

// ../node_modules/path-to-regexp/dist.es2015/index.js
init_functionsRoutes_0_43621812355026957();
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
