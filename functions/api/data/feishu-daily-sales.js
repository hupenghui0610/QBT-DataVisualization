import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

/** 默认与方案文档中示例 URL 一致，可用环境变量覆盖（勿写死过小行号，否则 501 行之后不会返回） */
var DEFAULT_SPREADSHEET_TOKEN = 'EBwmsjjArhutvWtM2E9cLUMGnYd';
/** 主sheet：A-H列（日期、GMV、GSV），AO-BZ列（型号销量） */
var DEFAULT_RANGE = '0VWscb!A1:H20000';
var DEFAULT_RANGE_MODEL = '0VWscb!AO1:BZ20000';
var DEFAULT_RANGE_2 = '亲子屏日报数!A1:Z20000';
var CACHE_KEY = 'feishu-daily-sales';
var CACHE_TTL_HOURS = 48;

function splitRange(range) {
  var i = String(range || '').indexOf('!');
  if (i < 0) return { sheetPart: String(range || ''), addrPart: 'A1:ZZ20000' };
  return { sheetPart: String(range || '').slice(0, i), addrPart: String(range || '').slice(i + 1) || 'A1:ZZ20000' };
}

function hasBrokenSheetName(range) {
  var parsed = splitRange(range);
  var s = String(parsed.sheetPart || '');
  return !s || s.indexOf('?') >= 0 || s === 'undefined' || s === 'null';
}

function isSheetNotFound(feishuJson) {
  var msg = String((feishuJson && feishuJson.msg) || '');
  return msg.indexOf('not found sheetId') >= 0 || msg.indexOf('sheetId not found') >= 0;
}
function isDataExceeded(feishuJson) {
  var msg = String((feishuJson && feishuJson.msg) || '');
  return msg.indexOf('data exceeded') >= 0 && msg.indexOf('10485760') >= 0;
}
function shrinkRangeMaxRows(range, maxRows) {
  var parsed = splitRange(range);
  var addr = String(parsed.addrPart || '');
  var m = addr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return null;
  var c1 = m[1];
  var r1 = parseInt(m[2], 10);
  var c2 = m[3];
  var r2 = parseInt(m[4], 10);
  if (!isFinite(r1) || !isFinite(r2) || r2 <= 0 || maxRows <= 0) return null;
  var target = Math.min(r2, maxRows);
  if (target >= r2) return null;
  if (target <= r1) target = r1 + 1;
  return String(parsed.sheetPart || '') + '!' + c1 + String(r1) + ':' + c2 + String(target);
}

/**
 * 合并主数据（A-H列）和型号数据（AO-BZ列）
 * 保持原始列位置：A-H放在0-7索引，AO-BZ放在40-91索引
 */
function mergeMainAndModelData(mainValues, modelValues) {
  if (!mainValues || !mainValues.length) return mainValues || [];
  if (!modelValues || !modelValues.length) return mainValues;

  var result = [];
  var maxRows = Math.max(mainValues.length, modelValues.length);
  var AO_COLUMN_INDEX = 40; // AO列对应的0-based索引

  for (var i = 0; i < maxRows; i++) {
    var mainRow = mainValues[i] || [];
    var modelRow = modelValues[i] || [];

    // 创建足够大的数组，保持原始列位置
    var mergedRow = new Array(Math.max(mainRow.length, AO_COLUMN_INDEX + modelRow.length)).fill('');

    // 复制主数据（A-H列，索引0-7）
    for (var j = 0; j < mainRow.length; j++) {
      mergedRow[j] = mainRow[j];
    }

    // 复制型号数据（AO-BZ列，从索引40开始）
    for (var k = 0; k < modelRow.length; k++) {
      mergedRow[AO_COLUMN_INDEX + k] = modelRow[k];
    }

    result.push(mergedRow);
  }

  return result;
}

async function resolveRangeBySheetTitle(env, spreadsheetToken, rangeMaybeTitle) {
  var parsed = splitRange(rangeMaybeTitle);
  if (!parsed.sheetPart) return null;
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) return null;
  var sheets = (sheetsJson.data && sheetsJson.data.sheets) || [];
  var exact = sheets.find(function (s) {
    return String(s.title || '').trim() === parsed.sheetPart.trim();
  });
  var fuzzy = exact
    ? null
    : sheets.find(function (s) {
        return String(s.title || '').indexOf(parsed.sheetPart) >= 0 || parsed.sheetPart.indexOf(String(s.title || '')) >= 0;
      });
  var hit = exact || fuzzy;
  if (!hit || !hit.sheet_id) return null;
  return String(hit.sheet_id) + '!' + parsed.addrPart;
}

async function resolveRange2Fallback(env, spreadsheetToken, range2) {
  var parsed = splitRange(range2);
  var addr = parsed.addrPart || 'A1:Z20000';
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) return null;
  var sheets = (sheetsJson.data && sheetsJson.data.sheets) || [];
  if (!sheets.length) return null;
  var byName = sheets.find(function (s) {
    var t = String(s.title || '');
    return t.indexOf('亲子屏') >= 0 || t.indexOf('亲子') >= 0;
  });
  var second = sheets.length >= 2 ? sheets[1] : null;
  var hit = byName || second || sheets[0];
  if (!hit || !hit.sheet_id) return null;
  return String(hit.sheet_id) + '!' + addr;
}

async function fetchRangeWithAutoResolve(env, spreadsheetToken, rawRange) {
  var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, rawRange);
  var finalRange = rawRange;
  if (feishuJson.code !== 0 && isSheetNotFound(feishuJson)) {
    var resolved = await resolveRangeBySheetTitle(env, spreadsheetToken, rawRange);
    if (resolved) {
      var retry = await fetchSheetValuesV2(env, spreadsheetToken, resolved);
      if (retry.code === 0) {
        feishuJson = retry;
        finalRange = resolved;
      }
    }
  }
  if (feishuJson.code !== 0 && isDataExceeded(feishuJson)) {
    // 飞书单次响应体上限 10MB：保持列不变，仅缩小行数重试
    var caps = [12000, 8000, 6000, 4000, 3000, 2000];
    for (var i = 0; i < caps.length; i++) {
      var smaller = shrinkRangeMaxRows(finalRange, caps[i]);
      if (!smaller) continue;
      var retry2 = await fetchSheetValuesV2(env, spreadsheetToken, smaller);
      if (retry2 && retry2.code === 0) {
        feishuJson = retry2;
        finalRange = smaller;
        break;
      }
      if (retry2 && retry2.code !== 0) {
        feishuJson = retry2;
        finalRange = smaller;
        if (!isDataExceeded(retry2)) break;
      }
    }
  }
  return { feishuJson: feishuJson, finalRange: finalRange };
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = resolveCorsOrigin(request, env);

  var auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return jsonResponse(
      { error: '服务器未配置飞书应用，请在 Pages 环境变量中设置 FEISHU_APP_ID、FEISHU_APP_SECRET' },
      503,
      origin
    );
  }

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

  var spreadsheetToken = env.FEISHU_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var range = env.FEISHU_SHEET_RANGE || DEFAULT_RANGE;
  var rangeModel = env.FEISHU_SHEET_RANGE_MODEL || DEFAULT_RANGE_MODEL;
  var range2 = env.FEISHU_SHEET_RANGE_2 || DEFAULT_RANGE_2;

  try {
    // 1. 读取主数据（A-H列）
    var r1 = await fetchRangeWithAutoResolve(env, spreadsheetToken, range);
    if (r1.feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (r1.feishuJson.msg || '飞书表格接口返回错误') + '（主sheet range=' + String(r1.finalRange || range) + '）',
          feishuCode: r1.feishuJson.code,
        },
        502,
        origin
      );
    }

    // 2. 读取型号数据（AO-BZ列）
    var rModel = await fetchRangeWithAutoResolve(env, spreadsheetToken, rangeModel);
    // 型号列可选，失败不影响主数据
    var modelValues = [];
    if (rModel.feishuJson.code === 0) {
      modelValues = (rModel.feishuJson.data?.valueRange?.values) || [];
    }

    // 3. 读取亲子屏数据
    var safeRange2 = hasBrokenSheetName(range2) ? DEFAULT_RANGE_2 : range2;
    var r2 = await fetchRangeWithAutoResolve(env, spreadsheetToken, safeRange2);
    if (r2.feishuJson.code !== 0 && isSheetNotFound(r2.feishuJson)) {
      var fb2 = await resolveRange2Fallback(env, spreadsheetToken, safeRange2);
      if (fb2) {
        var r2b = await fetchRangeWithAutoResolve(env, spreadsheetToken, fb2);
        if (r2b.feishuJson.code === 0) r2 = r2b;
      }
    }

    // 4. 合并主数据和型号数据
    var mainValues = (r1.feishuJson.data?.valueRange?.values) || [];
    var mergedValues = mergeMainAndModelData(mainValues, modelValues);

    var data = r1.feishuJson.data || {};
    var data2 = r2.feishuJson?.data || {};
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: r1.finalRange,
      rangeModel: rModel.finalRange,
      range2: r2.finalRange,
      revision: data.revision,
      valueRange: { range: r1.finalRange, majorDimension: 'ROWS', values: mergedValues },
      revision2: data2.revision,
      valueRange2: data2.valueRange,
    };
    // 写入缓存
    // 写入缓存（已禁用）
    // await setCache(env, CACHE_KEY, payload, CACHE_TTL_HOURS);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    var msg = e && e.message === 'FEISHU_NOT_CONFIGURED' ? '飞书应用未配置' : String((e && e.message) || e);
    return jsonResponse({ error: '拉取飞书表格失败', detail: msg }, 502, origin);
  }
}

export async function onRequestOptions(context) {
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

