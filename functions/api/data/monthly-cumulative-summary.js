import { signJwt } from '../../_lib/crypto.js';
import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateOpenClawRequest } from '../../_lib/openclaw-auth.js';
import { buildMonthlyCumulativeSummary, formatMonthlyCumulativeMessage, resolveMonthlyStatDate } from '../../_lib/monthly-cumulative.js';

function currentYearMonth() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function buildInternalAuthToken(env) {
  if (!env.JWT_SECRET) throw new Error('服务器未配置 JWT_SECRET');
  var uid = parseInt(String(env.OPENCLAW_INTERNAL_USER_ID || ''), 10);
  var row;
  if (isFinite(uid)) {
    row = await env.DB.prepare(
      'SELECT id, phone, name, is_admin, token_version FROM users WHERE id = ?'
    )
      .bind(uid)
      .first();
    if (!row) throw new Error('OPENCLAW_INTERNAL_USER_ID 对应用户不存在');
  } else {
    row = await env.DB.prepare(
      'SELECT id, phone, name, is_admin, token_version FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1'
    ).first();
    if (!row) throw new Error('未找到可用于 OpenClaw 的管理员账号');
  }
  var now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: row.id,
      phone: row.phone,
      name: row.name,
      adm: row.is_admin ? 1 : 0,
      tv: row.token_version,
      iat: now,
      exp: now + 5 * 60,
    },
    env.JWT_SECRET
  );
}

async function fetchInternalJson(originBase, path, token) {
  var res = await fetch(originBase + path, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  });
  var data = await res.json();
  if (!res.ok) {
    throw new Error((data && data.error) || ('内部接口失败: ' + path));
  }
  return data;
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var openclawAuth = await authenticateOpenClawRequest(request, env);
  if (openclawAuth.error) return openclawAuth.error;

  try {
    var url = new URL(request.url);
    var yearMonth = String(url.searchParams.get('yearMonth') || openclawAuth.yearMonth || currentYearMonth());
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return jsonResponse({ error: 'yearMonth 参数格式应为 YYYY-MM' }, 400, origin);
    }
    var token = await buildInternalAuthToken(env);
    var originBase = url.origin;
    var gmvCombined = await fetchInternalJson(originBase, '/api/data/feishu-gmv-combined', token);
    var douyinSales = await fetchInternalJson(originBase, '/api/data/feishu-douyin-sales', token);
    var douyinTrend = await fetchInternalJson(originBase, '/api/data/feishu-douyin-daily-trend', token);
    var summary = buildMonthlyCumulativeSummary(yearMonth, gmvCombined, douyinSales, douyinTrend);
    if (!summary.hasAnyData) {
      return jsonResponse({ error: '指定月份暂无数据' }, 404, origin);
    }
    var statDate = resolveMonthlyStatDate(yearMonth, todayStr());
    var payload = {
      yearMonth: yearMonth,
      statDate: statDate,
      summary: summary.summary,
      channels: summary.channels,
      generatedAt: summary.generatedAt,
      message: formatMonthlyCumulativeMessage(summary, statDate),
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    return jsonResponse({ error: '生成月度累计达成摘要失败', detail: e && e.message ? e.message : String(e) }, 502, origin);
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
