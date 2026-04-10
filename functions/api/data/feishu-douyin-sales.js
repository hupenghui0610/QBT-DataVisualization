import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

var CACHE_KEY = 'feishu-douyin-sales';
var CACHE_TTL_HOURS = 48;

/** 抖音 wiki 对应的底层 spreadsheet token，可被环境变量覆盖 */
var DEFAULT_SPREADSHEET_TOKEN = 'X2jWseyDuh5invtFhgGcfgnCnWf';

function numFromCell(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^[\s\u00a0]*[=＝]/.test(v)) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).replace(/[,，\s\u00a0]/g, '');
  var wan = s.match(/^([\d.]+)\s*万/);
  if (wan) {
    var w = parseFloat(wan[1]);
    return isFinite(w) ? w * 10000 : null;
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function isFormulaText(v) {
  return typeof v === 'string' && /^[\s\u00a0]*[=＝]/.test(v);
}

/** 与 feishu-gmv-combined 一致：合并展示值与原始值，避免公式列只返回公式文本 */
function mergeFmtUnfValueRanges(fmtValues, unfValues) {
  if (!fmtValues && !unfValues) return [];
  if (!fmtValues) return unfValues;
  if (!unfValues) return fmtValues;
  var rows = Math.max(fmtValues.length, unfValues.length);
  var out = [];
  for (var r = 0; r < rows; r++) {
    var fr = fmtValues[r] || [];
    var ur = unfValues[r] || [];
    var cols = Math.max(fr.length, ur.length);
    var row = [];
    for (var c = 0; c < cols; c++) {
      var f = fr[c];
      var u = ur[c];
      if (c === 0) {
        row[c] = f != null && f !== '' ? f : u;
        continue;
      }
      var fn = isFormulaText(f) ? null : numFromCell(f);
      var un = isFormulaText(u) ? null : numFromCell(u);
      if (fn != null && un != null) {
        row[c] = Math.abs(fn) >= Math.abs(un) ? f : u;
      } else if (fn != null) {
        row[c] = f;
      } else if (un != null) {
        row[c] = u;
      } else if (!isFormulaText(f) && f != null && f !== '') {
        row[c] = f;
      } else if (!isFormulaText(u) && u != null && u !== '') {
        row[c] = u;
      } else {
        row[c] = f != null && f !== '' ? f : u;
      }
    }
    out.push(row);
  }
  return out;
}

async function fetchSheetRangeMerged(env, spreadsheetToken, range) {
  var fmt = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
  var unf = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'UnformattedValue' });
  if (fmt.code !== 0) return { feishuJson: fmt, values: null };
  var vf = (fmt.data && fmt.data.valueRange && fmt.data.valueRange.values) || [];
  if (unf.code !== 0) {
    return { feishuJson: fmt, values: vf };
  }
  var vu = (unf.data && unf.data.valueRange && unf.data.valueRange.values) || [];
  return { feishuJson: fmt, values: mergeFmtUnfValueRanges(vf, vu) };
}

function sortSheetsByUiIndex(sheets) {
  var arr = (sheets || []).slice();
  var hasAny = arr.some(function (s) {
    return s && typeof s.index === 'number' && isFinite(s.index);
  });
  if (!hasAny) return arr;
  arr.sort(function (a, b) {
    var ia = a && typeof a.index === 'number' ? a.index : 1e9;
    var ib = b && typeof b.index === 'number' ? b.index : 1e9;
    return ia - ib;
  });
  return arr;
}

async function buildSheetRangeList(env, spreadsheetToken) {
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    return { error: sheetsJson, ranges: null };
  }
  var sheets = sortSheetsByUiIndex((sheetsJson.data && sheetsJson.data.sheets) || []);
  if (sheets.length < 3) {
    return { error: { code: 40001, msg: '抖音表 sheet 数量不足 3 个' }, ranges: null };
  }
  var s1 = sheets[0] && sheets[0].sheet_id ? String(sheets[0].sheet_id) : '';
  var s2 = sheets[1] && sheets[1].sheet_id ? String(sheets[1].sheet_id) : '';
  var s3 = sheets[2] && sheets[2].sheet_id ? String(sheets[2].sheet_id) : '';
  if (!s1 || !s2 || !s3) {
    return { error: { code: 40002, msg: '抖音表缺少 sheet_id' }, ranges: null };
  }
  return {
    error: null,
    ranges: {
      /** sheet1 需覆盖 D/F/H/J（自播GMV、达人GMV、自播GSV、达人GSV） */
      range1: s1 + '!A1:J20000',
      /** sheet2 需覆盖 G/K（自播GMV、自播GSV） */
      range2: s2 + '!A1:K20000',
      /** sheet3 亲子屏：G 列 GMV、K 列 GSV（与 sheet2 学习机列位一致） */
      range3: s3 + '!A1:K20000',
      sheetMeta: [
        { title: sheets[0].title || '', sheet_id: s1, index: sheets[0].index },
        { title: sheets[1].title || '', sheet_id: s2, index: sheets[1].index },
        { title: sheets[2].title || '', sheet_id: s3, index: sheets[2].index },
      ],
    },
  };
}

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

  var spreadsheetToken = env.FEISHU_DOUYIN_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;

  try {
    var resolved = await buildSheetRangeList(env, spreadsheetToken);
    if (resolved.error || !resolved.ranges) {
      return jsonResponse(
        {
          error: (resolved.error && resolved.error.msg) || '抖音表工作表解析失败',
          feishuCode: resolved.error && resolved.error.code,
        },
        502,
        origin
      );
    }
    var range1 = resolved.ranges.range1;
    var range2 = resolved.ranges.range2;
    var range3 = resolved.ranges.range3;
    var m1 = await fetchSheetRangeMerged(env, spreadsheetToken, range1);
    var m2 = await fetchSheetRangeMerged(env, spreadsheetToken, range2);
    var m3 = await fetchSheetRangeMerged(env, spreadsheetToken, range3);
    if (!m1.feishuJson || m1.feishuJson.code !== 0) {
      var e1 = m1.feishuJson || {};
      return jsonResponse({ error: e1.msg || '抖音sheet1读取失败', feishuCode: e1.code }, 502, origin);
    }
    if (!m2.feishuJson || m2.feishuJson.code !== 0) {
      var e2 = m2.feishuJson || {};
      return jsonResponse({ error: e2.msg || '抖音sheet2读取失败', feishuCode: e2.code }, 502, origin);
    }
    if (!m3.feishuJson || m3.feishuJson.code !== 0) {
      var e3 = m3.feishuJson || {};
      return jsonResponse({ error: e3.msg || '抖音sheet3读取失败', feishuCode: e3.code }, 502, origin);
    }

    var d1 = m1.feishuJson.data || {};
    var d2 = m2.feishuJson.data || {};
    var d3 = m3.feishuJson.data || {};
    var vr1 = d1.valueRange || {};
    var vr2 = d2.valueRange || {};
    var vr3 = d3.valueRange || {};
    var payload = {
      spreadsheetToken: spreadsheetToken,
      range: range1,
      range2: range2,
      range3: range3,
      sheetMeta: resolved.ranges.sheetMeta,
      revision: d1.revision,
      revision2: d2.revision,
      revision3: d3.revision,
      valueRange: { range: vr1.range || range1, majorDimension: 'ROWS', values: m1.values || [] },
      valueRange2: { range: vr2.range || range2, majorDimension: 'ROWS', values: m2.values || [] },
      valueRange3: { range: vr3.range || range3, majorDimension: 'ROWS', values: m3.values || [] },
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
      { error: '拉取飞书抖音表失败', detail: e && e.message ? e.message : String(e) },
      502,
      origin
    );
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
