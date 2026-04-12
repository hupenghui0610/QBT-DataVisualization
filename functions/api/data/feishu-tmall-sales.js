import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';

/** 天猫在线表格：可被 FEISHU_TMALL_SPREADSHEET_TOKEN 覆盖 */
var DEFAULT_SPREADSHEET_TOKEN = 'WkFuwdxnhio6AckVEeQcohMAnpc';
/** 主数据：A-H列（日期、GMV、GSV）；型号数据：AY-CZ列 */
var DEFAULT_RANGE = '2joAvv!A1:H20000';
var DEFAULT_RANGE_MODEL = '2joAvv!AY1:CZ20000';

function splitRange(range) {
  var i = String(range || '').indexOf('!');
  if (i < 0) return { sheetPart: String(range || ''), addrPart: 'A1:ZZ20000' };
  return { sheetPart: String(range || '').slice(0, i), addrPart: String(range || '').slice(i + 1) || 'A1:ZZ20000' };
}
function isSheetNotFound(feishuJson) {
  var msg = String((feishuJson && feishuJson.msg) || '');
  return msg.indexOf('not found sheetId') >= 0 || msg.indexOf('sheetId not found') >= 0;
}
function isDataExceeded(feishuJson) {
  var msg = String((feishuJson && feishuJson.msg) || '');
  return msg.indexOf('data exceeded') >= 0 && msg.indexOf('10485760') >= 0;
}
function parseRangeRows(range) {
  var parsed = splitRange(range);
  var addr = String(parsed.addrPart || '');
  var m = addr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return { startRow: 1, endRow: 20000 };
  var r1 = parseInt(m[2], 10);
  var r2 = parseInt(m[4], 10);
  if (!isFinite(r1) || r1 <= 0) r1 = 1;
  if (!isFinite(r2) || r2 < r1) r2 = Math.max(r1, 20000);
  return { startRow: r1, endRow: r2 };
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
function buildRangeByCols(baseRange, startCol, endCol, endRow) {
  var parsed = splitRange(baseRange);
  var rows = parseRangeRows(baseRange);
  var r1 = rows.startRow;
  var r2 = Math.max(r1, Math.min(rows.endRow, endRow));
  return String(parsed.sheetPart || '') + '!' + startCol + String(r1) + ':' + endCol + String(r2);
}
function mergeDateAndModelValues(dateValues, modelValues, modelStartCol) {
  var a = Array.isArray(dateValues) ? dateValues : [];
  var b = Array.isArray(modelValues) ? modelValues : [];
  var n = Math.max(a.length, b.length);
  var out = [];
  var start = typeof modelStartCol === 'number' ? modelStartCol : 50; // AY列对应索引50
  for (var r = 0; r < n; r++) {
    var row = [];
    var ra = a[r] || [];
    var rb = b[r] || [];
    // 复制主数据
    for (var i = 0; i < ra.length; i++) {
      row[i] = ra[i];
    }
    // 复制型号数据到指定位置
    for (var c = 0; c < rb.length; c++) {
      row[start + c] = rb[c];
    }
    out.push(row);
  }
  return out;
}

/** 合并主数据和型号数据，保持列位置 */
function mergeMainAndModelValues(mainValues, modelValues, modelStartIndex) {
  if (!mainValues || !mainValues.length) return mainValues || [];
  if (!modelValues || !modelValues.length) return mainValues;

  var result = [];
  var maxRows = Math.max(mainValues.length, modelValues.length);
  var startIdx = typeof modelStartIndex === 'number' ? modelStartIndex : 50;

  for (var i = 0; i < maxRows; i++) {
    var mainRow = mainValues[i] || [];
    var modelRow = modelValues[i] || [];

    // 创建足够大的数组
    var mergedRow = new Array(Math.max(mainRow.length, startIdx + modelRow.length)).fill('');

    // 复制主数据
    for (var j = 0; j < mainRow.length; j++) {
      mergedRow[j] = mainRow[j];
    }

    // 复制型号数据到指定位置
    for (var k = 0; k < modelRow.length; k++) {
      mergedRow[startIdx + k] = modelRow[k];
    }

    result.push(mergedRow);
  }

  return result;
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

  var spreadsheetToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var range = env.FEISHU_TMALL_SHEET_RANGE || DEFAULT_RANGE;
  var rangeModel = env.FEISHU_TMALL_SHEET_RANGE_MODEL || DEFAULT_RANGE_MODEL;

  try {
    // 1. 读取主数据（A-H列：日期、GMV、GSV等）
    var rMain = await fetchRangeWithAutoResolve(env, spreadsheetToken, range);
    if (!rMain.feishuJson || rMain.feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (rMain.feishuJson && rMain.feishuJson.msg ? rMain.feishuJson.msg : '飞书表格接口返回错误') + '（天猫主数据 range=' + String(rMain.finalRange || range) + '）',
          feishuCode: rMain.feishuJson && rMain.feishuJson.code,
        },
        502,
        origin
      );
    }

    // 2. 读取型号数据（AY-CZ列）
    var rModel = await fetchRangeWithAutoResolve(env, spreadsheetToken, rangeModel);
    // 型号列可选，失败不影响主数据
    var modelValues = [];
    if (rModel.feishuJson && rModel.feishuJson.code === 0) {
      modelValues = (rModel.feishuJson.data?.valueRange?.values) || [];
    }

    // 3. 合并数据，AY列对应索引50（0-based）
    var mainValues = (rMain.feishuJson.data?.valueRange?.values) || [];
    var mergedValues = mergeMainAndModelValues(mainValues, modelValues, 50);

    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: String(rMain.finalRange || range) + ' + ' + String(rModel.finalRange || rangeModel),
      revision: rMain.feishuJson.data?.revision,
      valueRange: {
        range: String(rMain.finalRange || range) + ' + ' + String(rModel.finalRange || rangeModel),
        majorDimension: 'ROWS',
        values: mergedValues,
      },
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
    var msg = e && e.message === 'FEISHU_NOT_CONFIGURED' ? '飞书应用未配置' : String((e && e.message) || e);
    return jsonResponse({ error: '拉取飞书表格失败', detail: msg }, 502, origin);
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

