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

  var url = new URL(request.url);
  var limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
  var offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  var rows = await env.DB.prepare(
    `SELECT a.id, a.user_id, a.accessed_at, a.city, a.country, a.client_ip,
            u.name AS user_name, u.phone AS user_phone
     FROM access_logs a
     JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all();

  return jsonResponse({ rows: rows.results || [] }, 200, origin);
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
