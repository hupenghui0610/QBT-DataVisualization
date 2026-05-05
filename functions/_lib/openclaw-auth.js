import { jsonResponse, resolveCorsOrigin } from './http.js';

var enc = new TextEncoder();
var CLOCK_SKEW_MS = 5 * 60 * 1000;

function bytesToHex(u8) {
  var s = '';
  for (var i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}

async function hmacHex(secret, message) {
  var key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message || '')));
  return bytesToHex(new Uint8Array(sig));
}

export function buildOpenClawSignatureMessage(method, pathname, yearMonth, timestamp, nonce, apiKey) {
  return [
    String(method || 'GET').toUpperCase(),
    String(pathname || ''),
    String(yearMonth || ''),
    String(timestamp || ''),
    String(nonce || ''),
    String(apiKey || ''),
  ].join('\n');
}

export async function authenticateOpenClawRequest(request, env) {
  var origin = resolveCorsOrigin(request, env);
  if (!env.OPENCLAW_MONTHLY_API_KEY || !env.OPENCLAW_MONTHLY_API_SECRET) {
    return { error: jsonResponse({ error: '服务器未配置 OPENCLAW_MONTHLY_API_KEY / OPENCLAW_MONTHLY_API_SECRET' }, 503, origin) };
  }

  var url = new URL(request.url);
  var apiKey = String(url.searchParams.get('key') || '');
  var timestamp = String(url.searchParams.get('ts') || '');
  var nonce = String(url.searchParams.get('nonce') || '');
  var signature = String(url.searchParams.get('sig') || '').toLowerCase();
  var yearMonth = String(url.searchParams.get('yearMonth') || '');

  if (!apiKey || !timestamp || !nonce || !signature) {
    return { error: jsonResponse({ error: '缺少签名参数' }, 401, origin) };
  }
  if (apiKey !== String(env.OPENCLAW_MONTHLY_API_KEY)) {
    return { error: jsonResponse({ error: '签名无效' }, 401, origin) };
  }

  var tsNum = parseInt(timestamp, 10);
  if (!isFinite(tsNum)) {
    return { error: jsonResponse({ error: '签名时间戳无效' }, 401, origin) };
  }
  if (Math.abs(Date.now() - tsNum) > CLOCK_SKEW_MS) {
    return { error: jsonResponse({ error: '签名已过期' }, 401, origin) };
  }

  var expected = await hmacHex(
    env.OPENCLAW_MONTHLY_API_SECRET,
    buildOpenClawSignatureMessage(request.method, url.pathname, yearMonth, timestamp, nonce, apiKey)
  );
  if (expected !== signature) {
    return { error: jsonResponse({ error: '签名无效' }, 401, origin) };
  }

  return {
    ok: true,
    apiKey: apiKey,
    timestamp: tsNum,
    nonce: nonce,
    yearMonth: yearMonth,
  };
}
