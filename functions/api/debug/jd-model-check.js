import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';

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
  if (!hit) return null;
  var rowCount =
    hit &&
    hit.grid_properties &&
    typeof hit.grid_properties.row_count === 'number' &&
    hit.grid_properties.row_count > 0
      ? hit.grid_properties.row_count
      : 20000;
  return String(hit.sheet_id) + '!A1:ZZ' + String(Math.max(20000, rowCount));
}

async function resolveRange2Fallback(env, spreadsheetToken, rawRange2) {
  if (hasBrokenSheetName(rawRange2)) return '亲子屏日报数!A1:Z20000';
  var parsed = splitRange(rawRange2);
  if (!parsed.sheetPart) return '亲子屏日报数!A1:Z20000';
  try {
    var resolved = await resolveRangeBySheetTitle(env, spreadsheetToken, rawRange2);
    return resolved;
  } catch (e) {
    return '亲子屏日报数!A1:Z20000';
  }
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

function mergeMainAndModelData(mainValues, modelValues) {
  if (!mainValues || !mainValues.length) return mainValues || [];
  if (!modelValues || !modelValues.length) return mainValues;

  var result = [];
  var maxRows = Math.max(mainValues.length, modelValues.length);
  var AO_COLUMN_INDEX = 40;

  for (var i = 0; i < maxRows; i++) {
    var mainRow = mainValues[i] || [];
    var modelRow = modelValues[i] || [];
    var mergedRow = new Array(Math.max(mainRow.length, AO_COLUMN_INDEX + modelRow.length)).fill('');
    for (var j = 0; j < mainRow.length; j++) {
      mergedRow[j] = mainRow[j];
    }
    for (var k = 0; k < modelRow.length; k++) {
      mergedRow[AO_COLUMN_INDEX + k] = modelRow[k];
    }
    result.push(mergedRow);
  }
  return result;
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  try {
    var spreadsheetToken = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
    var range = env.FEISHU_SHEET_RANGE || '0VWscb!A1:H20000';
    var rangeModel = env.FEISHU_SHEET_RANGE_MODEL || '0VWscb!AO1:BZ20000';
    var range2 = env.FEISHU_SHEET_RANGE_2 || '亲子屏日报数!A1:Z20000';

    // 1. 读取主数据（A-H列）
    var r1 = await fetchRangeWithAutoResolve(env, spreadsheetToken, range);

    // 2. 读取型号数据（AO-BZ列）
    var rModel = await fetchRangeWithAutoResolve(env, spreadsheetToken, rangeModel);
    var modelValues = [];
    if (rModel.feishuJson.code === 0) {
      modelValues = (rModel.feishuJson.data && rModel.feishuJson.data.valueRange && rModel.feishuJson.data.valueRange.values) || [];
    }

    // 3. 读取亲子屏数据
    var safeRange2 = hasBrokenSheetName(range2) ? '亲子屏日报数!A1:Z20000' : range2;
    var r2 = await fetchRangeWithAutoResolve(env, spreadsheetToken, safeRange2);

    // 4. 合并主数据和型号数据
    var mainValues = (r1.feishuJson.data && r1.feishuJson.data.valueRange && r1.feishuJson.data.valueRange.values) || [];
    var mergedValues = mergeMainAndModelData(mainValues, modelValues);

    // 分析合并后的数据
    var analysis = {
      mainResult: {
        code: r1.feishuJson.code,
        rowCount: mainValues.length,
        colCount: mainValues[0] && mainValues[0].length,
      },
      modelResult: {
        code: rModel.feishuJson.code,
        rowCount: modelValues.length,
        colCount: modelValues[0] && modelValues[0].length,
        error: rModel.feishuJson.code !== 0 ? rModel.feishuJson.msg : null,
      },
      mergedResult: {
        rowCount: mergedValues.length,
        colCount: mergedValues[0] && mergedValues[0].length,
        hasAOColumn: mergedValues[0] && mergedValues[0].length > 40,
        headerRow0_AO: mergedValues[0] ? mergedValues[0].slice(40, 45) : [],
        headerRow1_AO: mergedValues[1] ? mergedValues[1].slice(40, 45) : [],
      }
    };

    return jsonResponse({
      success: true,
      analysis: analysis,
    }, 200, origin);
  } catch (e) {
    return jsonResponse({
      success: false,
      error: e && e.message ? e.message : String(e),
      stack: e && e.stack ? e.stack : null,
    }, 500, origin);
  }
}
