import { verifyPassword, signJwt, JWT_EXP_SECONDS } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { publicUser } from '../../_lib/session.js';
import {
  getCurrentLoginRestrictions,
  registerFailedLogin,
  registerSuccessfulLogin,
  failedLoginDelayMs,
  sleepMs,
  recordSecurityEvent,
} from '../../_lib/login-security.js';

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

  var restrictions = await getCurrentLoginRestrictions(env, request, phone);
  if (restrictions.ipBlock) {
    await recordSecurityEvent(env, {
      scopeType: 'ip',
      scopeKey: restrictions.ip,
      eventType: 'login_rejected',
      phone: phone,
      clientIp: restrictions.ip,
      createdAt: restrictions.now,
      meta: { reason: 'ip_blocked' },
    });
    return jsonResponse({ error: '尝试次数过多，请稍后再试' }, 429, origin);
  }
  if (restrictions.accountBlock) {
    await recordSecurityEvent(env, {
      scopeType: 'account',
      scopeKey: phone,
      eventType: 'login_rejected',
      phone: phone,
      clientIp: restrictions.ip,
      createdAt: restrictions.now,
      meta: { reason: 'account_locked' },
    });
    return jsonResponse({ error: '尝试次数过多，请稍后再试' }, 429, origin);
  }

  var row = await env.DB.prepare(
    'SELECT id, name, phone, password_hash, token_version, is_admin FROM users WHERE phone = ?'
  )
    .bind(phone)
    .first();

  if (!row) {
    var missingResult = await registerFailedLogin(env, request, phone, null);
    await sleepMs(failedLoginDelayMs(missingResult.accountShortCount, missingResult.ipCount));
    return jsonResponse({ error: '账号或密码错误' }, 401, origin);
  }

  var ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    var failedResult = await registerFailedLogin(env, request, row.phone, row.id);
    await sleepMs(failedLoginDelayMs(failedResult.accountShortCount, failedResult.ipCount));
    if (failedResult.accountLockedUntil || failedResult.ipBlockedUntil) {
      return jsonResponse({ error: '尝试次数过多，请稍后再试' }, 429, origin);
    }
    return jsonResponse({ error: '账号或密码错误' }, 401, origin);
  }

  await registerSuccessfulLogin(env, request, row);

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
