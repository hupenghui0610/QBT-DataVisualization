import { verifyPassword, signJwt, JWT_EXP_SECONDS } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { publicUser } from '../../_lib/session.js';

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  if (!env.JWT_SECRET) {
    return jsonResponse({ error: '服务器未配置 JWT_SECRET' }, 500, origin);
  }

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: '请求格式错误' }, 400, origin);
  }

  var phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  var password = typeof body.password === 'string' ? body.password : '';
  if (!phone || !password) {
    return jsonResponse({ error: '请输入手机号和密码' }, 400, origin);
  }

  var row = await env.DB.prepare(
    'SELECT id, name, phone, password_hash, token_version, is_admin FROM users WHERE phone = ?'
  )
    .bind(phone)
    .first();

  if (!row) {
    return jsonResponse({ error: '账号或密码错误' }, 401, origin);
  }

  var ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    return jsonResponse({ error: '账号或密码错误' }, 401, origin);
  }

  var now = Math.floor(Date.now() / 1000);
  var token = await signJwt(
    {
      sub: row.id,
      phone: row.phone,
      name: row.name,
      adm: row.is_admin ? 1 : 0,
      tv: row.token_version,
      iat: now,
      exp: now + JWT_EXP_SECONDS,
    },
    env.JWT_SECRET
  );

  return jsonResponse({ token: token, user: publicUser(row) }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
