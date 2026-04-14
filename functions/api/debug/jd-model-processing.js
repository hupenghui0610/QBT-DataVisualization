import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';

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

function colIndexToName(idx) {
  var n = Number(idx);
  if (!isFinite(n) || n < 0) return '';
  n = Math.floor(n);
  var s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function parseModelColumnIndicesFromHeader(row0, startCol) {
  if (!row0 || !row0.length) return [];
  var out = [];
  var emptyRun = 0;
  var start = typeof startCol === 'number' ? startCol : 40;
  var JD_MODEL_EXCLUDED_COLS = { BT: true };
  for (var c = start; c < row0.length; c++) {
    var h = String(row0[c] == null ? '' : row0[c]).trim();
    if (!h) {
      emptyRun++;
      if (emptyRun >= 3) break;
      continue;
    }
    if (start === 40) {
      var colName = colIndexToName(c);
      if (JD_MODEL_EXCLUDED_COLS[colName]) continue;
    }
    emptyRun = 0;
    out.push(c);
  }
  return out;
}

function resolveModelHeaderMeta(values, startCol) {
  var row0 = values && values.length ? values[0] : null;
  var best = { headerRowIndex: 0, headerRow: row0 || [], colIndices: [], dataStartRow: 1 };
  var maxRows = Math.min((values && values.length) || 0, 10);
  for (var r = 0; r < maxRows; r++) {
    var row = values[r];
    var cols = parseModelColumnIndicesFromHeader(row, startCol);
    if (cols.length > best.colIndices.length) {
      best = { headerRowIndex: r, headerRow: row || [], colIndices: cols, dataStartRow: r + 1 };
    }
  }
  return best;
}

function unwrapFeishuCell(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object') {
    if (cell.text != null) return cell.text;
    if (cell.value != null) return cell.value;
    return '';
  }
  return cell;
}

function parseJdDailyNum(row, col) {
  if (!row || col == null || col < 0) return 0;
  var raw = unwrapFeishuCell(row[col]);
  if (typeof raw === 'string' && /^[\s\u00a0]*[=＝]/.test(raw)) return 0;
  var s = String(raw == null ? '' : raw).replace(/[,，\s\u00a0]/g, '');
  var wan = s.match(/^([\d.]+)\s*万/);
  if (wan) {
    var w = parseFloat(wan[1]);
    return isFinite(w) ? w * 10000 : 0;
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseFeishuCellDate(cell) {
  cell = unwrapFeishuCell(cell);
  if (cell == null || cell === '') return '';
  if (typeof cell === 'number' && isFinite(cell)) {
    if (cell > 20000 && cell < 60000) {
      var utc_days = Math.floor(cell - 25569);
      var d = new Date(utc_days * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        var yy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yy + '-' + mm + '-' + dd;
      }
    }
  }
  var str = String(cell).trim();
  var m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var da = parseInt(m[3], 10);
    if (y > 2000 && y < 2100 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(da).padStart(2, '0');
    }
  }
  return '';
}

function aggregateModelSalesByDateRange(values, colIndices, startVal, endVal, startRow) {
  var sums = {};
  colIndices.forEach(function(c) {
    sums[c] = 0;
  });
  var scanStart = typeof startRow === 'number' && startRow >= 0 ? startRow : 1;
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      if (!ds) continue;
      if (startVal && endVal && startVal <= endVal) {
        if (ds < startVal || ds > endVal) continue;
      }
      colIndices.forEach(function(c) {
        sums[c] += parseJdDailyNum(row, c);
      });
    }
  }
  scan(scanStart);
  var any = false;
  colIndices.forEach(function(c) {
    if (sums[c]) any = true;
  });
  if (!any && scanStart !== 0) scan(0);
  return sums;
}

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var origin = request.headers.get('Origin') || undefined;

  try {
    var spreadsheetToken = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
    var mainRange = env.FEISHU_SHEET_RANGE || '0VWscb!A1:H20000';
    var modelRange = env.FEISHU_SHEET_RANGE_MODEL || '0VWscb!AO1:BZ20000';

    var mainResult = await fetchSheetValuesV2(env, spreadsheetToken, mainRange);
    var modelResult = await fetchSheetValuesV2(env, spreadsheetToken, modelRange);

    var mainValues = (mainResult.data && mainResult.data.valueRange && mainResult.data.valueRange.values) || [];
    var modelValues = (modelResult.data && modelResult.data.valueRange && modelResult.data.valueRange.values) || [];

    var mergedValues = mergeMainAndModelData(mainValues, modelValues);

    // 模拟前端处理逻辑
    var JD_MODEL_COL_START = 40;
    var headerMeta = resolveModelHeaderMeta(mergedValues, JD_MODEL_COL_START);
    var row0 = headerMeta.headerRow;
    var colIndices = headerMeta.colIndices;

    // 查找表格中的实际日期
    var dates = [];
    for (var r = 1; r < Math.min(mergedValues.length, 20); r++) {
      var row = mergedValues[r];
      if (row && row[0]) {
        var ds = parseFeishuCellDate(row[0]);
        if (ds) {
          dates.push({ row: r, raw: row[0], parsed: ds });
        }
      }
    }

    return jsonResponse({
      success: true,
      headerMeta: {
        headerRowIndex: headerMeta.headerRowIndex,
        dataStartRow: headerMeta.dataStartRow,
        colIndicesCount: colIndices.length,
        colIndicesFirst5: colIndices.slice(0, 5),
      },
      datesSample: dates.slice(0, 10),
      today: today,
    }, 200, origin);
  } catch (e) {
    return jsonResponse({
      success: false,
      error: e && e.message ? e.message : String(e),
      stack: e && e.stack ? e.stack : null,
    }, 500, origin);
  }
}
