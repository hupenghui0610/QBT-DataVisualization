import { verifyJwt } from './crypto.js';
import { getBearer, jsonResponse, resolveCorsOrigin } from './http.js';

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    is_admin: !!row.is_admin,
    auth_provider: row.auth_provider || 'password',
    password_login_enabled: row.password_login_enabled == null ? true : !!row.password_login_enabled,
  };
}

/**
 * 检查用户是否是管理员
 * @param {Object} user - publicUser返回的用户对象
 * @returns {boolean}
 */
export function isAdmin(user) {
  return !!(user && user.is_admin);
}

/**
 * @returns {{ user: object, row: object } | { error: Response }}
 */
export async function authenticateRequest(request, env) {
  var origin = resolveCorsOrigin(request, env);
  var secret = env.JWT_SECRET;
  if (!secret) {
    return { error: jsonResponse({ error: '服务器未配置 JWT_SECRET' }, 500, origin) };
  }
  var token = getBearer(request);
  if (!token) {
    return { error: jsonResponse({ error: '未登录' }, 401, origin) };
  }
  var payload;
  try {
    payload = await verifyJwt(token, secret);
  } catch (e) {
    return { error: jsonResponse({ error: '登录已失效，请重新登录' }, 401, origin) };
  }
  var uid = payload.sub;
  if (uid == null) {
    return { error: jsonResponse({ error: '无效令牌' }, 401, origin) };
  }
  var row = await env.DB.prepare(
    'SELECT id, name, phone, password_hash, token_version, is_admin, auth_provider, password_login_enabled, created_at FROM users WHERE id = ?'
  )
    .bind(uid)
    .first();
  if (!row) {
    return { error: jsonResponse({ error: '用户不存在' }, 401, origin) };
  }
  var tv = payload.tv;
  if (tv !== row.token_version) {
    return { error: jsonResponse({ error: '登录已失效，请重新登录' }, 401, origin) };
  }
  return { user: publicUser(row), row: row };
}

export function utcIsoMinute() {
  var d = new Date();
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
}
