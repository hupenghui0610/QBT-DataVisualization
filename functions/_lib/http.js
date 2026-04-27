export function jsonResponse(data, status, corsOrigin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(corsOrigin),
    },
  });
}

/**
 * 多独立域名共用同一套 API 时，在 Cloudflare 环境变量中配置 ALLOWED_ORIGINS（逗号分隔的完整 Origin，如 https://a.com,https://b.com）。
 * 未配置时：与旧行为一致，回显请求 Origin，缺省为 *。
 * 已配置时：仅当请求的 Origin 在白名单内才回显该 Origin；否则返回 null（不设置 Access-Control-Allow-Origin，浏览器跨域请求将失败）。
 */
export function resolveCorsOrigin(request, env) {
  var raw = env && env.ALLOWED_ORIGINS;
  var reqOrigin = request.headers.get('Origin') || '';
  if (!raw || typeof raw !== 'string' || !String(raw).trim()) {
    return reqOrigin || undefined;
  }
  var allowed = String(raw)
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });
  if (allowed.length === 0) {
    return reqOrigin || undefined;
  }
  if (!reqOrigin) {
    return null;
  }
  if (allowed.indexOf(reqOrigin) >= 0) {
    return reqOrigin;
  }
  return null;
}

export function corsHeaders(origin) {
  var base = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (origin === null) {
    return base;
  }
  base['Access-Control-Allow-Origin'] = origin || '*';
  return base;
}

export function getBearer(request) {
  var h = request.headers.get('Authorization') || '';
  var m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
