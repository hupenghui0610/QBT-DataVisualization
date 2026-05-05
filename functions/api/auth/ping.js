import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest, utcIsoMinute, clientIp } from '../../_lib/session.js';

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  var cf = request.cf || {};
  var city = cf.city || '';
  var country = cf.country || '';
  var ip = clientIp(request);

  var userName = String((auth.row && auth.row.name) || '').trim();
  if (userName !== '胡鹏辉') {
    var normalizedIp = String(ip || '');
    var cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    cutoff.setUTCSeconds(0, 0);
    var cutoffIso = cutoff.toISOString();
    var exists = await env.DB.prepare(
      'SELECT 1 AS ok FROM access_logs WHERE user_id = ? AND IFNULL(client_ip, \'\') = ? AND accessed_at >= ? LIMIT 1'
    )
      .bind(auth.row.id, normalizedIp, cutoffIso)
      .first();
    if (!exists) {
      var accessedAt = utcIsoMinute();
      await env.DB.prepare(
        'INSERT INTO access_logs (user_id, accessed_at, city, country, client_ip) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(auth.row.id, accessedAt, city || null, country || null, normalizedIp || null)
        .run();
    }
  }

  return jsonResponse({ ok: true, user: auth.user }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
