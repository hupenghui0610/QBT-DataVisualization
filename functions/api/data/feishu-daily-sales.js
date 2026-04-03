import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';

/** 默认与方案文档中示例 URL 一致，可用环境变量覆盖（勿写死过小行号，否则 501 行之后不会返回） */
var DEFAULT_SPREADSHEET_TOKEN = 'EBwmsjjArhutvWtM2E9cLUMGnYd';
/** 需覆盖 AO 列起的型号销量等；可用 FEISHU_SHEET_RANGE 覆盖 */
var DEFAULT_RANGE = '0VWscb!A1:ZZ20000';
var DEFAULT_RANGE_2 = '亲子屏日报数!A1:Z20000';

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

  var spreadsheetToken = env.FEISHU_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var range = env.FEISHU_SHEET_RANGE || DEFAULT_RANGE;
  var range2 = env.FEISHU_SHEET_RANGE_2 || DEFAULT_RANGE_2;

  try {
    var r1 = await fetchRangeWithAutoResolve(env, spreadsheetToken, range);
    var feishuJson = r1.feishuJson;
    var finalRange1 = r1.finalRange;
    if (feishuJson.code !== 0) {
      return jsonResponse(
        {
          error: (feishuJson.msg || '飞书表格接口返回错误') + '（主sheet range=' + String(r1.finalRange || range) + '）',
          feishuCode: feishuJson.code,
        },
        502,
        origin
      );
    }
    var safeRange2 = hasBrokenSheetName(range2) ? DEFAULT_RANGE_2 : range2;
    var r2 = await fetchRangeWithAutoResolve(env, spreadsheetToken, safeRange2);
    if (r2.feishuJson.code !== 0 && isSheetNotFound(r2.feishuJson)) {
      var fb2 = await resolveRange2Fallback(env, spreadsheetToken, safeRange2);
      if (fb2) {
        var r2b = await fetchRangeWithAutoResolve(env, spreadsheetToken, fb2);
        if (r2b.feishuJson.code === 0) r2 = r2b;
      }
    }
    var feishuJson2 = r2.feishuJson;
    var finalRange2 = r2.finalRange;
    if (feishuJson2.code !== 0) {
      return jsonResponse(
        {
          error: (feishuJson2.msg || '飞书表格接口返回错误') + '（亲子屏sheet range2=' + String(r2.finalRange || range2) + '）',
          feishuCode: feishuJson2.code,
        },
        502,
        origin
      );
    }
    var data = feishuJson.data || {};
    var data2 = feishuJson2.data || {};
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: finalRange1,
      range2: finalRange2,
      revision: data.revision,
      valueRange: data.valueRange,
      revision2: data2.revision,
      valueRange2: data2.valueRange,
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

