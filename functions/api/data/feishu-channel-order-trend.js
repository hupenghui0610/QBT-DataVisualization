import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

var CACHE_KEY = 'feishu-channel-order-trend';
var CACHE_TTL_HOURS = 48;

var DEFAULT_SPREADSHEET_TOKEN = 'P1zusUMg2haMGctskH6cydLqn5e';
var DEFAULT_CHANNEL_RANGE = 'ghju03!A1:E2000';
/** 默认 I～AO（达人 ID 在 AO）；行数过小会漏单，可用 FEISHU_ORDER_DETAIL_RANGE 再加大 */
var DEFAULT_ORDER_RANGE = 'tuec5U!I1:AO20000';

/** 订单表为 A1:AO… 时 0-based 列（飞书行数组下标）；达人 ID 在 AO 列 */
var COL_I_FULL = 8;
var COL_AO_FULL = 40;
var COL_AH_FULL = 33;
var COL_AK_FULL = 36;

/** 订单表为 I1:AO… 时相对 I 列的 0-based 下标（I=0，AO/AH/AK 为列号减 9） */
var COL_I_NARROW = 0;
var COL_AO_NARROW = 32;
var COL_AH_NARROW = 25;
var COL_AK_NARROW = 28;

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** range 片段在 I 列起始（如 I1:AO3000）时用窄列下标，否则用 A 列起始全宽下标 */
function orderRangeUsesIColumnOrigin(orderRange) {
  var bang = orderRange.indexOf('!');
  if (bang < 0) return false;
  return /I[0-9]*:/i.test(orderRange.slice(bang + 1));
}

/**
 * AH 业务日：UnformattedValue 常为 Excel 序列日（数字）；字符串可为「2026/1/1 22:18:14」。
 */
function ymdFromExcelSerial(serial) {
  var whole = Math.floor(Number(serial));
  if (whole < 1 || whole > 6000000) return null;
  var utc_days = whole - 25569;
  var ms = utc_days * 86400 * 1000;
  var dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}

function parseDayFromAH(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !isNaN(v)) {
    return ymdFromExcelSerial(v);
  }
  var str = String(v).trim();
  if (!str) return null;
  var numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6000000) {
    var fromSerial = ymdFromExcelSerial(numOnly);
    if (fromSerial) return fromSerial;
  }
  var part = str.split(/\s+/)[0];
  var parts = part.split(/[\/\-]/);
  if (parts.length >= 3) {
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (y && m && d) return y + '-' + pad2(m) + '-' + pad2(d);
  }
  var t = Date.parse(str.replace(/\//g, '-'));
  if (!isNaN(t)) {
    var dt2 = new Date(t);
    return dt2.getFullYear() + '-' + pad2(dt2.getMonth() + 1) + '-' + pad2(dt2.getDate());
  }
  return null;
}

function parseAmount(v) {
  if (v == null || v === '') return 0;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

async function sha256Hex(s) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  var arr = new Uint8Array(buf);
  var hex = '';
  for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  // 禁用缓存，实时读取数据
  /*
  var cached = await getCache(env, CACHE_KEY);
  if (cached) {
    return new Response(JSON.stringify({ ...cached.data, _cached: true, _updatedAt: cached.updatedAt }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  }
  */

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用，请在 Pages 环境变量中设置 FEISHU_APP_ID、FEISHU_APP_SECRET' },
      503,
      origin
    );
  }

  var spreadsheetToken = env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var channelRange = env.FEISHU_CHANNEL_MAP_RANGE || DEFAULT_CHANNEL_RANGE;
  var orderRange = env.FEISHU_ORDER_DETAIL_RANGE || DEFAULT_ORDER_RANGE;
  var skipRows = parseInt(env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || '1', 10);
  if (isNaN(skipRows) || skipRows < 0) skipRows = 1;

  var narrowOrderCols = orderRangeUsesIColumnOrigin(orderRange);
  var colI = narrowOrderCols ? COL_I_NARROW : COL_I_FULL;
  var colAO = narrowOrderCols ? COL_AO_NARROW : COL_AO_FULL;
  var colAH = narrowOrderCols ? COL_AH_NARROW : COL_AH_FULL;
  var colAK = narrowOrderCols ? COL_AK_NARROW : COL_AK_FULL;

  /** 默认 UnformattedValue 减轻飞书公式计算；金额异常时在控制台设 FEISHU_CHANNEL_ORDER_VALUE_RENDER=FormattedValue */
  var orderVro = env.FEISHU_CHANNEL_ORDER_VALUE_RENDER || 'UnformattedValue';
  if (orderVro !== 'FormattedValue' && orderVro !== 'UnformattedValue' && orderVro !== 'ToString') {
    orderVro = 'UnformattedValue';
  }

  var cacheTtlSec = parseInt(env.FEISHU_CHANNEL_ORDER_CACHE_TTL_SEC != null ? env.FEISHU_CHANNEL_ORDER_CACHE_TTL_SEC : '120', 10);
  if (isNaN(cacheTtlSec) || cacheTtlSec < 0) cacheTtlSec = 120;

  var cacheRequest = null;
  if (cacheTtlSec > 0 && auth.user && auth.user.id != null) {
    var keyPayload =
      'cot:' +
      auth.user.id +
      ':' +
      spreadsheetToken +
      ':' +
      channelRange +
      ':' +
      orderRange +
      ':' +
      skipRows +
      ':' +
      orderVro +
      ':' +
      (narrowOrderCols ? 'n' : 'w') +
      ':v2-daren-count';
    var hash = await sha256Hex(keyPayload);
    cacheRequest = new Request('https://feishu-channel-order-trend.cache/' + hash);
    var hit = await caches.default.match(cacheRequest);
    if (hit) {
      var body = await hit.text();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-QBT-Channel-Order-Trend-Cache': 'HIT',
          ...corsHeaders(origin),
        },
      });
    }
  }

  try {
    var chJson;
    var ordJson;
    try {
      var pair = await Promise.all([
        fetchSheetValuesV2(env, spreadsheetToken, channelRange, { valueRenderOption: 'FormattedValue' }),
        fetchSheetValuesV2(env, spreadsheetToken, orderRange, { valueRenderOption: orderVro }),
      ]);
      chJson = pair[0];
      ordJson = pair[1];
    } catch (e) {
      return jsonResponse(
        { error: '飞书表格读取异常', detail: e && e.message ? e.message : String(e) },
        502,
        origin
      );
    }

    if (!chJson || chJson.code !== 0) {
      return jsonResponse(
        {
          error: (chJson && chJson.msg) || '飞书渠道表读取失败',
          feishuCode: chJson && chJson.code,
        },
        502,
        origin
      );
    }
    if (!ordJson || ordJson.code !== 0) {
      return jsonResponse(
        {
          error: (ordJson && ordJson.msg) || '飞书订单表读取失败',
          feishuCode: ordJson && ordJson.code,
        },
        502,
        origin
      );
    }

    var chValues = (chJson.data && chJson.data.valueRange && chJson.data.valueRange.values) || [];
    var ordValues = (ordJson.data && ordJson.data.valueRange && ordJson.data.valueRange.values) || [];

    var darenToChannel = {};
    for (var r = skipRows; r < chValues.length; r++) {
      var crow = chValues[r] || [];
      var chName = String(crow[0] || '').trim();
      var darenId = String(crow[4] || '').trim();
      if (!chName || !darenId) continue;
      if (darenToChannel[darenId] === undefined) darenToChannel[darenId] = chName;
    }

    var channelSet = {};
    for (var d0 in darenToChannel) {
      channelSet[darenToChannel[d0]] = true;
    }
    var channels = Object.keys(channelSet).sort();

    var totals = {};
    /** day -> channel -> darenId -> 当日累计 GMV（用于统计当日 GMV>0 的达人数） */
    var darenSumByDayChannel = {};

    for (var ri = skipRows; ri < ordValues.length; ri++) {
      var row = ordValues[ri] || [];
      var needLen = colAO > colAK ? colAO : colAK;
      if (row.length <= needLen) continue;
      /** 订单状态（AK）：仅剔除「已关闭」，其余任意状态（含空）均参与 GSV/金额汇总 */
      var status = String(row[colAK] || '').trim();
      if (status === '已关闭') continue;

      var daren = String(row[colAO] || '').trim();
      if (!daren) continue;
      var channel = darenToChannel[daren];
      if (!channel) continue;

      var day = parseDayFromAH(row[colAH]);
      if (!day) continue;

      var amt = parseAmount(row[colI]);
      if (!totals[day]) totals[day] = {};
      totals[day][channel] = (totals[day][channel] || 0) + amt;
      if (!darenSumByDayChannel[day]) darenSumByDayChannel[day] = {};
      if (!darenSumByDayChannel[day][channel]) darenSumByDayChannel[day][channel] = {};
      var dmap = darenSumByDayChannel[day][channel];
      dmap[daren] = (dmap[daren] || 0) + amt;
    }

    var dates = Object.keys(totals)
      .filter(Boolean)
      .sort();

    var amountByChannel = {};
    for (var ci = 0; ci < channels.length; ci++) {
      var cname = channels[ci];
      amountByChannel[cname] = dates.map(function (dt) {
        return totals[dt] && totals[dt][cname] != null ? totals[dt][cname] : 0;
      });
    }

    var darenCountByChannel = {};
    for (var ci2 = 0; ci2 < channels.length; ci2++) {
      var cname2 = channels[ci2];
      darenCountByChannel[cname2] = dates.map(function (dt) {
        var dm = darenSumByDayChannel[dt] && darenSumByDayChannel[dt][cname2];
        if (!dm) return 0;
        var n = 0;
        for (var did in dm) {
          if (dm[did] > 0) n++;
        }
        return n;
      });
    }

    var payload = {
      spreadsheetToken: spreadsheetToken,
      channelRange: channelRange,
      orderRange: orderRange,
      dates: dates,
      channels: channels,
      amountByChannel: amountByChannel,
      darenCountByChannel: darenCountByChannel,
    };

    var jsonBody = JSON.stringify(payload);

    // 写入缓存
    await setCache(env, CACHE_KEY, payload, CACHE_TTL_HOURS);

    var res = new Response(jsonBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-QBT-Channel-Order-Trend-Cache': 'MISS',
        ...corsHeaders(origin),
      },
    });

    if (cacheRequest && cacheTtlSec > 0) {
      try {
        await caches.default.put(
          cacheRequest,
          new Response(jsonBody, {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'max-age=' + cacheTtlSec,
            },
          })
        );
      } catch (ePut) {}
    }

    return res;
  } catch (e) {
    return jsonResponse(
      { error: '渠道订单趋势聚合失败', detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
