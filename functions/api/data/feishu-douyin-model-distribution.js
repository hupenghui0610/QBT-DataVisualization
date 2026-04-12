import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';

var DEFAULT_SPREADSHEET_TOKEN = 'P1zusUMg2haMGctskH6cydLqn5e';
var DEFAULT_ORDER_RANGE = 'tuec5U!A2:AO20000';

/** 优化：只读取必要列 */
var REQUIRED_COLS = ['C', 'E', 'AH', 'AK', 'AO'];
var COL_INDEX_MAP = { 'C': 2, 'E': 4, 'AH': 33, 'AK': 36, 'AO': 40 };

var COL_C = 2;
/** 订单宽表 E 列：商品数量（累加到型号；与 I 列金额无关） */
var COL_E = 4;
var COL_AH = 33;
var COL_AK = 36;
var COL_AO = 40;

var DP_DAREN_IDS = {
  '100740124329': true,
  '2872348280361767': true,
  '58892651868': true,
  '1614499448100063': true,
  '301699496948925': true,
};

var SPECIAL_DP_CUTOVER_DAREN_IDS = {
  '151063260317056': true,
  '284088526715758': true,
};

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

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
  if (typeof v === 'number' && !isNaN(v)) return ymdFromExcelSerial(v);
  var str = String(v).trim();
  if (!str) return null;
  var numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6000000) {
    var fs = ymdFromExcelSerial(numOnly);
    if (fs) return fs;
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

/**
 * E 列可能为「文本格式」存储的数字；飞书 FormattedValue 也可能返回带千分位或全角数字的字符串。
 */
function parseQty(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !isNaN(v)) {
    if (v < 0) return 0;
    return Math.round(v);
  }
  var s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[\uFF10-\uFF19]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30);
  });
  s = s.replace(/,/g, '').replace(/\u00a0/g, '').replace(/\u3000/g, '');
  var n = parseFloat(s);
  if (!isNaN(n) && n >= 0) return Math.round(n);
  var compact = s.replace(/\s+/g, '');
  n = parseFloat(compact);
  if (!isNaN(n) && n >= 0) return Math.round(n);
  var m = compact.match(/-?\d+(?:\.\d+)?/);
  if (m) {
    n = parseFloat(m[0]);
    if (!isNaN(n) && n >= 0) return Math.round(n);
  }
  return 0;
}

function buildRulesSorted(rowsAB) {
  var raw = [];
  (rowsAB || []).forEach(function (row, idx) {
    var kw = row && row[0] != null ? String(row[0]).trim() : '';
    if (!kw) return;
    var model = row && row[1] != null ? String(row[1]).trim() : '';
    raw.push({ keyword: kw, model: model || '未匹配', rowIndex: idx });
  });
  raw.sort(function (a, b) {
    var d = b.keyword.length - a.keyword.length;
    return d !== 0 ? d : a.rowIndex - b.rowIndex;
  });
  return raw;
}

function matchModel(productName, rules) {
  var name = String(productName == null ? '' : productName).trim();
  if (!name) return '未匹配';
  var lower = name.toLowerCase();
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var k = r.keyword.toLowerCase();
    if (k && lower.indexOf(k) !== -1) return r.model;
  }
  return '未匹配';
}

function orderRangeHasColumnC(orderRange) {
  var bang = orderRange.indexOf('!');
  if (bang < 0) return false;
  var frag = orderRange.slice(bang + 1);
  return /^A/i.test(frag) || /^B/i.test(frag) || /^C/i.test(frag);
}

/** 从range提取sheetId */
function extractSheetId(range) {
  var bang = range.indexOf('!');
  if (bang < 0) return null;
  return range.slice(0, bang);
}

/** 读取单列数据 */
async function fetchSingleColumn(env, spreadsheetToken, sheetId, colLetter, startRow, endRow) {
  var range = sheetId + '!' + colLetter + startRow + ':' + colLetter + endRow;
  var result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
  if (!result || result.code !== 0) {
    return { success: false, error: result?.msg || '读取失败', code: result?.code };
  }
  var values = (result.data && result.data.valueRange && result.data.valueRange.values) || [];
  return { success: true, values: values };
}

/** 合并多列数据为行格式 */
function mergeColumnsToRows(columns, rowCount) {
  var result = [];
  for (var i = 0; i < rowCount; i++) {
    var row = new Array(41).fill(''); // AO列是第40索引
    // C列
    if (columns.C && columns.C[i]) row[COL_C] = columns.C[i][0];
    // E列
    if (columns.E && columns.E[i]) row[COL_E] = columns.E[i][0];
    // AH列
    if (columns.AH && columns.AH[i]) row[COL_AH] = columns.AH[i][0];
    // AK列
    if (columns.AK && columns.AK[i]) row[COL_AK] = columns.AK[i][0];
    // AO列
    if (columns.AO && columns.AO[i]) row[COL_AO] = columns.AO[i][0];
    result.push(row);
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

  var spreadsheetToken = env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  var orderRange = env.FEISHU_DOUYIN_MODEL_ORDER_RANGE || env.FEISHU_ORDER_DETAIL_RANGE || DEFAULT_ORDER_RANGE;
  if (!orderRangeHasColumnC(orderRange)) {
    return jsonResponse(
      {
        error:
          '订单 range 须从 A/B/C 列起以包含商品名(C)。请设置 FEISHU_DOUYIN_MODEL_ORDER_RANGE=tuec5U!A2:AO20000',
      },
      400,
      origin
    );
  }

  var cutover = env.FEISHU_DP_CUTOVER_DATE && String(env.FEISHU_DP_CUTOVER_DATE).trim() ? String(env.FEISHU_DP_CUTOVER_DATE).trim() : '2026-04-01';

  var urlObj = new URL(request.url);
  var qStart = urlObj.searchParams.get('start');
  var qEnd = urlObj.searchParams.get('end');

  try {
    var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
    if (!sheetsJson || sheetsJson.code !== 0) {
      return jsonResponse(
        { error: (sheetsJson && sheetsJson.msg) || '飞书子表列表失败', feishuCode: sheetsJson && sheetsJson.code },
        502,
        origin
      );
    }
    var sheets = sheetsJson.data && sheetsJson.data.sheets ? sheetsJson.data.sheets : [];
    var byTitle = function (n) {
      return sheets.find(function (s) {
        return String(s.title || '').toLowerCase() === n;
      });
    };
    var sMap = byTitle('sheet3') || sheets[2];
    if (!sMap) {
      return jsonResponse({ error: '未找到产品型号映射表（sheet3）' }, 502, origin);
    }
    var mapRow = Math.min(Math.max(typeof (sMap.grid_properties || {}).row_count === 'number' ? sMap.grid_properties.row_count : 2000, 2), 10000);
    var mapRange = sMap.sheet_id + '!A2:B' + mapRow;

    var mapJson = await fetchSheetValuesV2(env, spreadsheetToken, mapRange, { valueRenderOption: 'FormattedValue' });
    if (!mapJson || mapJson.code !== 0) {
      return jsonResponse(
        { error: (mapJson && mapJson.msg) || '读取型号映射表失败', feishuCode: mapJson && mapJson.code },
        502,
        origin
      );
    }
    var rowsAB = (mapJson.data && mapJson.data.valueRange && mapJson.data.valueRange.values) || [];
    var rules = buildRulesSorted(rowsAB);

    // 优化：分批次读取必要列，减少数据传输
    var sheetId = extractSheetId(orderRange);
    if (!sheetId) {
      return jsonResponse({ error: '无法解析sheetId' }, 400, origin);
    }

    // 并行读取5个必要列
    var colResults = await Promise.all([
      fetchSingleColumn(env, spreadsheetToken, sheetId, 'C', 2, 20000),   // 商品名
      fetchSingleColumn(env, spreadsheetToken, sheetId, 'E', 2, 20000),   // 数量
      fetchSingleColumn(env, spreadsheetToken, sheetId, 'AH', 2, 20000),  // 日期
      fetchSingleColumn(env, spreadsheetToken, sheetId, 'AK', 2, 20000),  // 状态
      fetchSingleColumn(env, spreadsheetToken, sheetId, 'AO', 2, 20000),  // 达人ID
    ]);

    // 检查读取结果
    var errors = [];
    colResults.forEach(function(r, idx) {
      if (!r.success) errors.push(REQUIRED_COLS[idx] + ':' + r.error);
    });
    if (errors.length > 0) {
      return jsonResponse({ error: '读取列失败: ' + errors.join(', ') }, 502, origin);
    }

    // 计算实际行数
    var actualRowCount = Math.max(
      colResults[0].values.length,
      colResults[1].values.length,
      colResults[2].values.length,
      colResults[3].values.length,
      colResults[4].values.length
    );

    // 合并列为行格式
    var ordValues = mergeColumnsToRows({
      C: colResults[0].values,
      E: colResults[1].values,
      AH: colResults[2].values,
      AK: colResults[3].values,
      AO: colResults[4].values
    }, actualRowCount);

    var qtyDp = {};
    var qtyDaren = {};
    var meta = {
      skippedClosed: 0,
      skippedSpecialBeforeCutover: 0,
      skippedNoProduct: 0,
      skippedDateRange: 0,
      rowsCountedDp: 0,
      rowsCountedDaren: 0,
    };

    var skipRows = 0;

    for (var ri = skipRows; ri < ordValues.length; ri++) {
      var row = ordValues[ri] || [];
      if (row.length <= COL_AO) continue;

      var status = String(row[COL_AK] || '').trim();
      if (status === '已关闭') {
        meta.skippedClosed++;
        continue;
      }

      var daren = String(row[COL_AO] || '').trim();
      var day = parseDayFromAH(row[COL_AH]);

      if (qStart && qEnd && qStart <= qEnd) {
        if (day == null || day < qStart || day > qEnd) {
          meta.skippedDateRange++;
          continue;
        }
      }

      if (SPECIAL_DP_CUTOVER_DAREN_IDS[daren]) {
        if (day == null || day < cutover) {
          meta.skippedSpecialBeforeCutover++;
          continue;
        }
      }

      var product = row[COL_C] != null ? String(row[COL_C]).trim() : '';
      if (!product) {
        meta.skippedNoProduct++;
        continue;
      }

      var model = matchModel(product, rules);
      var q = parseQty(row[COL_E]);

      var bucketDp = false;
      if (SPECIAL_DP_CUTOVER_DAREN_IDS[daren] && day != null && day >= cutover) {
        bucketDp = true;
      } else if (DP_DAREN_IDS[daren]) {
        bucketDp = true;
      }

      if (bucketDp) {
        qtyDp[model] = (qtyDp[model] || 0) + q;
        meta.rowsCountedDp++;
      } else {
        qtyDaren[model] = (qtyDaren[model] || 0) + q;
        meta.rowsCountedDaren++;
      }
    }

    var modelSet = {};
    Object.keys(qtyDp).forEach(function (k) {
      modelSet[k] = true;
    });
    Object.keys(qtyDaren).forEach(function (k) {
      modelSet[k] = true;
    });
    var models = Object.keys(modelSet).sort(function (a, b) {
      return a.localeCompare(b, 'zh-CN');
    });

    return new Response(
      JSON.stringify({
        spreadsheetToken: spreadsheetToken,
        orderRange: orderRange,
        mapSheetTitle: sMap.title,
        cutover: cutover,
        models: models,
        qtyByModelDp: qtyDp,
        qtyByModelDaren: qtyDaren,
        meta: meta,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, no-store',
          ...corsHeaders(origin),
        },
      }
    );
  } catch (e) {
    return jsonResponse(
      { error: '抖音型号分布聚合失败', detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
