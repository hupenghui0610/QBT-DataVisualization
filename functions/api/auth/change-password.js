import { verifyPassword, hashPassword } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: '请求格式错误' }, 400, origin);
  }

  var oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
  var newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!oldPassword || !newPassword) {
    return jsonResponse({ error: '请填写原密码和新密码' }, 400, origin);
  }
  if (newPassword.length < 6) {
    return jsonResponse({ error: '新密码至少 6 位' }, 400, origin);
  }

  var okOld = await verifyPassword(oldPassword, auth.row.password_hash);
  if (!okOld) {
    return jsonResponse({ error: '原密码错误' }, 401, origin);
  }

  var newHash = await hashPassword(newPassword);
  await env.DB.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .bind(newHash, auth.row.id)
    .run();

  return jsonResponse({ ok: true, message: '密码已更新，请重新登录' }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
