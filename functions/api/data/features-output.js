import { corsHeaders } from '../../_lib/http.js';
import { jsonResponse } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';
import industryBuilder from '../../../shared/industry-data-builder.cjs';

var DEFAULT_LAST_ROW = 20000;
var CACHE_KEY = 'features-output';
var CACHE_TTL_HOURS = 48;

function sortSheetsByUiIndex(sheets) {
  var arr = (sheets || []).slice();
  arr.sort(function (a, b) {
    var ia = a && typeof a.index === 'number' ? a.index : 1e9;
    var ib = b && typeof b.index === 'number' ? b.index : 1e9;
    return ia - ib;
  });
  return arr;
}

async function resolveSheetRange(env, spreadsheetToken, sortedIndex, explicitRange) {
  if (explicitRange && String(explicitRange).trim()) return String(explicitRange).trim();
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    throw new Error((sheetsJson && sheetsJson.msg) || '行业数据工作表解析失败');
  }
  var sheets = sortSheetsByUiIndex((sheetsJson.data && sheetsJson.data.sheets) || []);
  var sheet = sheets[sortedIndex];
  if (!sheet || !sheet.sheet_id) {
    throw new Error('行业数据缺少 sheet' + String(sortedIndex + 1));
  }
  var rowCount =
    sheet &&
    sheet.grid_properties &&
    typeof sheet.grid_properties.row_count === 'number' &&
    sheet.grid_properties.row_count > 0
      ? sheet.grid_properties.row_count
      : DEFAULT_LAST_ROW;
  return String(sheet.sheet_id) + '!A1:E' + String(Math.max(DEFAULT_LAST_ROW, rowCount));
}

async function fetchDataFromFeishu(env) {
  var spreadsheetToken = env.FEISHU_INDUSTRY_SPREADSHEET_TOKEN;
  if (!spreadsheetToken) {
    throw new Error('未配置 FEISHU_INDUSTRY_SPREADSHEET_TOKEN');
  }

  var range = await resolveSheetRange(env, spreadsheetToken, 0, env.FEISHU_INDUSTRY_DAPAN_RANGE);
  var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'UnformattedValue' });
  if (!feishuJson || feishuJson.code !== 0) {
    throw new Error((feishuJson && feishuJson.msg) || '行业大盘 sheet1 读取失败');
  }
  var values = (feishuJson.data && feishuJson.data.valueRange && feishuJson.data.valueRange.values) || [];
  return industryBuilder.buildDaPanPayloadFromValues(values, 'feishu:' + range);
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用，请在 Pages 环境变量中设置 FEISHU_APP_ID、FEISHU_APP_SECRET' },
      503,
      origin
    );
  }

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

  try {
    var payload = await fetchDataFromFeishu(env);
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
      { error: '拉取行业大盘数据失败', detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
