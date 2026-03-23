import { hashPassword } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: '无权访问' }, 403, origin);
  }

  var rows = await env.DB.prepare(
    'SELECT id, name, phone, is_admin FROM users ORDER BY id ASC'
  ).all();

  return jsonResponse({ users: rows.results || [] }, 200, origin);
}

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: '无权访问' }, 403, origin);
  }

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: '请求格式错误' }, 400, origin);
  }

  var name = typeof body.name === 'string' ? body.name.trim() : '';
  var phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  var password = typeof body.password === 'string' ? body.password : '';

  if (!name || !phone || !password) {
    return jsonResponse({ error: '请填写用户名、账号与初始密码' }, 400, origin);
  }
  if (password.length < 6) {
    return jsonResponse({ error: '初始密码至少 6 位' }, 400, origin);
  }
  if (!/^\d{11}$/.test(phone)) {
    return jsonResponse({ error: '账号须为 11 位数字手机号' }, 400, origin);
  }

  var existing = await env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
  if (existing) {
    return jsonResponse({ error: '该手机号已存在' }, 409, origin);
  }

  var newHash = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (name, phone, password_hash, token_version, is_admin) VALUES (?, ?, ?, 0, 0)'
  )
    .bind(name, phone, newHash)
    .run();

  return jsonResponse({ ok: true }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
