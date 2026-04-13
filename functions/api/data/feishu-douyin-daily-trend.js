import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

var CACHE_KEY = 'feishu-douyin-daily-trend';
var CACHE_TTL_HOURS = 48;

/** 来自 wiki WNp4... / sheet=8f2cd8 的底层 spreadsheet token */
var DEFAULT_SPREADSHEET_TOKEN = 'P1zusUMg2haMGctskH6cydLqn5e';
var DEFAULT_RANGE = '8f2cd8!A1:N20000';

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  // 优先读取缓存
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

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用，请在 Pages 环境变量中设置 FEISHU_APP_ID、FEISHU_APP_SECRET' },
      503,
      origin
    );
  }

  var spreadsheetToken = env.FEISHU_DOUYIN_TREND_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var range = env.FEISHU_DOUYIN_TREND_RANGE || DEFAULT_RANGE;

  try {
    var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
    if (!feishuJson || feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (feishuJson && feishuJson.msg) || '飞书表格接口返回错误',
          feishuCode: feishuJson && feishuJson.code,
        },
        502,
        origin
      );
    }
    var data = feishuJson.data || {};
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: range,
      revision: data.revision,
      valueRange: data.valueRange || { values: [] },
    };

    // 写入缓存
    await setCache(env, CACHE_KEY, payload, CACHE_TTL_HOURS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    return jsonResponse(
      { error: '拉取飞书抖音日度趋势表失败', detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
