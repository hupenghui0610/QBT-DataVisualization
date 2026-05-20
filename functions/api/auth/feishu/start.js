import { corsHeaders, jsonResponse, resolveCorsOrigin } from '../../../_lib/http.js';
import { feishuAuthorizeUrl, hasFeishuAuthConfig, signFeishuState } from '../../../_lib/feishu-auth.js';

function fallbackReturnTo(request) {
  var u = new URL(request.url);
  return u.origin + '/';
}

function allowedReturnOrigin(request, env, target) {
  var reqOrigin = new URL(request.url).origin;
  if (target.origin === reqOrigin) return true;
  if (target.hostname === 'localhost' || target.hostname === '127.0.0.1') return true;
  var raw = env && env.ALLOWED_ORIGINS;
  if (!raw || typeof raw !== 'string') return false;
  var allowed = raw
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
  return allowed.indexOf(target.origin) >= 0;
}

function safeReturnTo(request, env) {
  var u = new URL(request.url);
  var raw = u.searchParams.get('return_to') || '';
  if (!raw) return fallbackReturnTo(request);
  try {
    var target = new URL(raw);
    if (target.protocol !== 'https:' && target.hostname !== 'localhost' && target.hostname !== '127.0.0.1') {
      return fallbackReturnTo(request);
    }
    if (!allowedReturnOrigin(request, env, target)) return fallbackReturnTo(request);
    return target.toString();
  } catch (e) {
    return fallbackReturnTo(request);
  }
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  if (!env.JWT_SECRET) {
    return jsonResponse({ error: 'server_missing_jwt_secret' }, 500, origin);
  }
  if (!hasFeishuAuthConfig(env)) {
    return jsonResponse({ error: 'feishu_auth_not_configured' }, 503, origin);
  }

  var u = new URL(request.url);
  var callbackUrl = u.origin + '/api/auth/feishu/callback';
  var returnTo = safeReturnTo(request, env);
  var state = await signFeishuState(env, { returnTo: returnTo });
  return Response.redirect(feishuAuthorizeUrl(env, callbackUrl, state), 302);
}

export async function onRequestOptions(context) {
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
