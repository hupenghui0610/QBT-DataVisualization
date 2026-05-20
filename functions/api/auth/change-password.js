import { verifyPassword, hashPassword } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;
  if (auth.row.password_login_enabled === 0) {
    return jsonResponse({ error: '椋炰功蹇嵎鐧诲綍璐﹀彿鏃犻渶淇敼瀵嗙爜' }, 403, origin);
  }

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
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
