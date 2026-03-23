import { hashPassword } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest, publicUser } from '../../_lib/session.js';

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: '无权访问' }, 403, origin);
  }

  var res = await env.DB.prepare(
    'SELECT id, name, phone, is_admin, created_at FROM users ORDER BY id ASC'
  ).all();

  var rows = (res.results || []).map(function (r) {
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      is_admin: !!r.is_admin,
      created_at: r.created_at,
    };
  });

  return jsonResponse({ users: rows }, 200, origin);
}

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (!auth.user.is_admin) {
    return jsonResponse({ error: '无权操作' }, 403, origin);
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
    return jsonResponse({ error: '请填写姓名、账号与初始密码' }, 400, origin);
  }
  if (password.length < 6) {
    return jsonResponse({ error: '初始密码至少 6 位' }, 400, origin);
  }
  if (!/^1\d{10}$/.test(phone)) {
    return jsonResponse({ error: '账号需为 11 位手机号' }, 400, origin);
  }

  var dup = await env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
  if (dup) {
    return jsonResponse({ error: '该手机号已存在' }, 409, origin);
  }

  var pwdHash = await hashPassword(password);
  await env.DB.prepare('INSERT INTO users (name, phone, password_hash, token_version, is_admin) VALUES (?, ?, ?, 0, 0)')
    .bind(name, phone, pwdHash)
    .run();

  var row = await env.DB.prepare('SELECT id, name, phone, is_admin, created_at FROM users WHERE phone = ?')
    .bind(phone)
    .first();

  return jsonResponse({ ok: true, user: row ? publicUser(row) : null }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
