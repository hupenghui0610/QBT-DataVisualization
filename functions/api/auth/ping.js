import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest, utcIsoMinute, clientIp } from '../../_lib/session.js';

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  var cf = request.cf || {};
  var city = cf.city || '';
  var country = cf.country || '';
  var ip = clientIp(request);

  var accessedAt = utcIsoMinute();
  await env.DB.prepare(
    'INSERT INTO access_logs (user_id, accessed_at, city, country, client_ip) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(auth.row.id, accessedAt, city || null, country || null, ip || null)
    .run();

  return jsonResponse({ ok: true, user: auth.user }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
