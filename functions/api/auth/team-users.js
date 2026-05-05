import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';

/**
 * 任意已登录用户可拉取全站用户 name + phone（供测算等场景选择转发对象）。
 * GET /api/auth/team-users
 */
export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  var res = await env.DB.prepare('SELECT name, phone FROM users ORDER BY id ASC').all();
  var users = (res.results || [])
    .map(function (r) {
      return {
        name: r.name != null ? String(r.name) : '',
        phone: r.phone != null ? String(r.phone).trim() : '',
      };
    })
    .filter(function (u) {
      return u.phone && /^1\d{10}$/.test(u.phone);
    });

  return jsonResponse({ users: users }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
