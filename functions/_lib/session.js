import { verifyJwt } from './crypto.js';
import { getBearer } from './http.js';

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    is_admin: !!row.is_admin,
  };
}

/**
 * @returns {{ user: object, row: object } | { error: Response }}
 */
export async function authenticateRequest(request, env) {
  var secret = env.JWT_SECRET;
  if (!secret) {
    return { error: new Response(JSON.stringify({ error: '服务器未配置 JWT_SECRET' }), { status: 500, headers: { 'Content-Type': 'application/json' } }) };
  }
  var token = getBearer(request);
  if (!token) {
    return { error: new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }
  var payload;
  try {
    payload = await verifyJwt(token, secret);
  } catch (e) {
    return { error: new Response(JSON.stringify({ error: '登录已失效，请重新登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }
  var uid = payload.sub;
  if (uid == null) {
    return { error: new Response(JSON.stringify({ error: '无效令牌' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }
  var row = await env.DB.prepare(
    'SELECT id, name, phone, password_hash, token_version, is_admin, created_at FROM users WHERE id = ?'
  )
    .bind(uid)
    .first();
  if (!row) {
    return { error: new Response(JSON.stringify({ error: '用户不存在' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }
  var tv = payload.tv;
  if (tv !== row.token_version) {
    return { error: new Response(JSON.stringify({ error: '登录已失效，请重新登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
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
