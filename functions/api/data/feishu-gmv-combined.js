import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

var CACHE_KEY = 'feishu-gmv-combined';
var CACHE_TTL_HOURS = 48;

/** 天猫表 token */
var DEFAULT_TMALL_TOKEN = 'WkFuwdxnhio6AckVEeQcohMAnpc';
/** 第一个 sheet：2joAvv，A 日期、G GMV、H GSV、K/M 学习机与亲子屏 GMV；可用 FEISHU_TMALL_GMV_RANGE 覆盖 */
var DEFAULT_TMALL_RANGE = '2joAvv!A1:M20000';

/** 京东日销同一本表 token（与 feishu-daily-sales 一致）；京东 GMV 读第三张 sheet A:F（F 列=GMV，多为公式） */
var DEFAULT_JD_SPREADSHEET_TOKEN = 'EBwmsjjArhutvWtM2E9cLUMGnYd';

/** 本接口：天猫首 sheet（至少到 M 列）+ 京东第三 sheet A:F（Formatted+Unformatted 合并公式结果） */

/**
 * 若环境变量仍写死 A1:G…，则自动扩展到 A1:H…，否则 H 列（天猫 GSV）在响应中不存在，前端恒为 0。
 */
function expandRangeEndColumnToH(range) {
  var s = String(range || '');
  var i = s.indexOf('!');
  if (i < 0) return range;
  var addr = s.slice(i + 1);
  var m = addr.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!m) return range;
  var c2 = m[3].toUpperCase();
  if (c2 === 'G') {
    return s.slice(0, i + 1) + m[1] + m[2] + ':H' + m[4];
  }
  return range;
}

/** Excel 列字母 → 1-based 列号（A=1 … Z=26 …） */
function excelColLettersToNum1Based(letters) {
  var s = String(letters || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!s) return 0;
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n;
}

/** 1-based 列号 → Excel 列字母 */
function excelNum1BasedToColLetters(n) {
  if (n < 1) n = 1;
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 若 range 右边界列小于 minEndCol（如 Z），则扩展到该列，避免 Cloudflare 里写了 A1:F… 时读不到 H 列。
 */
function expandRangeEndColumnToAtLeast(range, minEndColLetters) {
  var minN = excelColLettersToNum1Based(minEndColLetters);
  if (minN < 1) return range;
  var s = String(range || '');
  var i = s.indexOf('!');
  if (i < 0) return range;
  var m = s.slice(i + 1).match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!m) return range;
  var endN = excelColLettersToNum1Based(m[3]);
  if (endN >= minN) return range;
  return s.slice(0, i + 1) + m[1] + m[2] + ':' + excelNum1BasedToColLetters(minN) + m[4];
}

function maxRowLength(values) {
  var mx = 0;
  if (!values || !values.length) return 0;
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (row && row.length > mx) mx = row.length;
  }
  return mx;
}

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

async function resolveJdGmvRange(env, spreadsheetToken, explicitRange) {
  var ex = explicitRange && String(explicitRange).trim();
  if (ex) return { range: ex, source: 'FEISHU_JD_GMV_RANGE' };
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    return { range: null, source: 'auto', reason: 'sheets_query_failed' };
  }
  var sheets = (sheetsJson.data && sheetsJson.data.sheets) || [];
  if (sheets.length < 3) {
    return { range: null, source: 'auto', reason: 'less_than_3_sheets', sheetCount: sheets.length };
  }
  var t = sheets[2];
  if (!t || !t.sheet_id) {
    return { range: null, source: 'auto', reason: 'no_third_sheet_id' };
  }
  return {
    range: String(t.sheet_id) + '!A1:F20000',
    source: 'auto',
    sheetTitle: t.title || '',
    sheetIndex: 2,
  };
}

/** 与界面标签顺序一致，用于「第 1/2 个 sheet」 */
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

/** GSV：京东第 1/2 个 sheet 的 G 列（与 resolveJdGmvRange 的第三张表分离，按 index 排序取 tab） */
async function resolveJdSheetRangeBySortedIndex(env, spreadsheetToken, sortedIndex, endColLetter) {
  var sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    return { range: null, source: 'auto', reason: 'sheets_query_failed' };
  }
  var sheetsRaw = (sheetsJson.data && sheetsJson.data.sheets) || [];
  var sheets = sortSheetsByUiIndex(sheetsRaw);
  if (sheets.length <= sortedIndex) {
    return { range: null, source: 'auto', reason: 'less_than_n_sheets', sheetCount: sheets.length, sortedIndex: sortedIndex };
  }
  var t = sheets[sortedIndex];
  if (!t || !t.sheet_id) {
    return { range: null, source: 'auto', reason: 'no_sheet_id' };
  }
  var c = String(endColLetter || 'G').toUpperCase();
  return {
    range: String(t.sheet_id) + '!A1:' + c + '20000',
    source: 'auto',
    sheetTitle: t.title || '',
    sortedIndex: sortedIndex,
  };
}

/** 扫描指定列用于排查公式是否仍以 = 文本返回 */
function statsGridColumn(values, colIndex) {
  var nonEmpty = 0;
  var numericParseable = 0;
  var formulaString = 0;
  var rowsMissingH = 0;
  if (!values || !values.length) {
    return { rowsIterated: 0, nonEmpty: 0, numericParseable: 0, formulaString: 0, rowsMissingH: 0 };
  }
  var limit = Math.min(values.length, 12000);
  for (var r = 0; r < limit; r++) {
    var row = values[r];
    if (!row) continue;
    if (row.length <= colIndex) {
      rowsMissingH++;
      continue;
    }
    var v = row[colIndex];
    if (v == null || v === '') continue;
    nonEmpty++;
    if (isFormulaText(v)) formulaString++;
    else if (numFromCell(v) != null) numericParseable++;
  }
  return {
    rowsIterated: limit,
    nonEmpty: nonEmpty,
    numericParseable: numericParseable,
    formulaString: formulaString,
    rowsMissingH: rowsMissingH,
  };
}

function statsHColumn(values, colIndex) {
  return statsGridColumn(values, colIndex);
}

/**
 * 合并 FormattedValue 与 UnformattedValue：优先保留能解析为数字的「计算结果」；
 * Unformatted 常为数字或可解析字符串，Formatted 常为展示字符串；二者任一为公式文本 (=开头) 则弃用该源。
 */
function mergeTmallValueRanges(fmtValues, unfValues) {
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

function splitRange(range) {
  var i = String(range || '').indexOf('!');
  if (i < 0) return { sheetPart: String(range || ''), addrPart: 'A1:H20000' };
  return { sheetPart: String(range || '').slice(0, i), addrPart: String(range || '').slice(i + 1) || 'A1:H20000' };
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

async function fetchRangeWithAutoResolve(env, spreadsheetToken, rawRange, sheetFetchOpts) {
  var feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, rawRange, sheetFetchOpts);
  var finalRange = rawRange;
  if (feishuJson.code !== 0 && isSheetNotFound(feishuJson)) {
    var resolved = await resolveRangeBySheetTitle(env, spreadsheetToken, rawRange);
    if (resolved) {
      var retry = await fetchSheetValuesV2(env, spreadsheetToken, resolved, sheetFetchOpts);
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
      var retry2 = await fetchSheetValuesV2(env, spreadsheetToken, smaller, sheetFetchOpts);
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

  // 优先读取缓存
  var cached = await getCache(env, CACHE_KEY);
  console.log('[feishu-gmv-combined] 缓存查询结果:', cached ? '命中' : '未命中');
  if (cached) {
    console.log('[feishu-gmv-combined] 缓存数据更新时间:', new Date(cached.updatedAt).toISOString());
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

  var tmallToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || DEFAULT_TMALL_TOKEN;
  var tmallRangeRaw = env.FEISHU_TMALL_GMV_RANGE || DEFAULT_TMALL_RANGE;
  var tmallRangeAfterH = expandRangeEndColumnToH(tmallRangeRaw);
  var tmallRange = expandRangeEndColumnToAtLeast(tmallRangeAfterH, 'N');
  var rangeExpandedFromG = tmallRangeAfterH !== tmallRangeRaw;
  var rangeExpandedPastH = tmallRange !== tmallRangeAfterH;

  try {
    var jdToken = env.FEISHU_SPREADSHEET_TOKEN || DEFAULT_JD_SPREADSHEET_TOKEN;
    var jdRangeInfo = await resolveJdGmvRange(env, jdToken, env.FEISHU_JD_GMV_RANGE);
    var jdRange = jdRangeInfo.range;
    var jdSheet1Info = await resolveJdSheetRangeBySortedIndex(env, jdToken, 0, 'G');
    var jdSheet2Info = await resolveJdSheetRangeBySortedIndex(env, jdToken, 1, 'G');
    var jdSheet1Range = jdSheet1Info && jdSheet1Info.range;
    var jdSheet2Range = jdSheet2Info && jdSheet2Info.range;

    var rTmFmt;
    var rTmUnf;
    var rJdFmt;
    var rJdUnf;
    var rJd1Fmt;
    var rJd1Unf;
    var rJd2Fmt;
    var rJd2Unf;
    var parallel = [
      fetchRangeWithAutoResolve(env, tmallToken, tmallRange, { valueRenderOption: 'FormattedValue' }).then(function (x) {
        rTmFmt = x;
      }),
      fetchRangeWithAutoResolve(env, tmallToken, tmallRange, { valueRenderOption: 'UnformattedValue' }).then(function (x) {
        rTmUnf = x;
      }),
    ];
    if (jdRange) {
      parallel.push(
        fetchRangeWithAutoResolve(env, jdToken, jdRange, { valueRenderOption: 'FormattedValue' }).then(function (x) {
          rJdFmt = x;
        }),
        fetchRangeWithAutoResolve(env, jdToken, jdRange, { valueRenderOption: 'UnformattedValue' }).then(function (x) {
          rJdUnf = x;
        })
      );
    }
    if (jdSheet1Range) {
      parallel.push(
        fetchRangeWithAutoResolve(env, jdToken, jdSheet1Range, { valueRenderOption: 'FormattedValue' }).then(function (x) {
          rJd1Fmt = x;
        }),
        fetchRangeWithAutoResolve(env, jdToken, jdSheet1Range, { valueRenderOption: 'UnformattedValue' }).then(function (x) {
          rJd1Unf = x;
        })
      );
    }
    if (jdSheet2Range) {
      parallel.push(
        fetchRangeWithAutoResolve(env, jdToken, jdSheet2Range, { valueRenderOption: 'FormattedValue' }).then(function (x) {
          rJd2Fmt = x;
        }),
        fetchRangeWithAutoResolve(env, jdToken, jdSheet2Range, { valueRenderOption: 'UnformattedValue' }).then(function (x) {
          rJd2Unf = x;
        })
      );
    }
    await Promise.all(parallel);

    var tmFmtOk = rTmFmt.feishuJson && rTmFmt.feishuJson.code === 0;
    var tmUnfOk = rTmUnf.feishuJson && rTmUnf.feishuJson.code === 0;

    if (!tmFmtOk && !tmUnfOk) {
      var bad = rTmFmt.feishuJson && rTmFmt.feishuJson.code !== 0 ? rTmFmt : rTmUnf;
      return jsonResponse(
        {
          error: (bad.feishuJson && bad.feishuJson.msg ? bad.feishuJson.msg : '飞书表格接口返回错误') + '（天猫GMV range=' + String(rTmFmt.finalRange || tmallRange) + '）',
          feishuCode: bad.feishuJson && bad.feishuJson.code,
        },
        502,
        origin
      );
    }

    var dTmFmt = tmFmtOk ? rTmFmt.feishuJson.data || {} : {};
    var dTmUnf = tmUnfOk ? rTmUnf.feishuJson.data || {} : {};
    var vrTmFmt = tmFmtOk && dTmFmt.valueRange && dTmFmt.valueRange.values ? dTmFmt.valueRange.values : [];
    var vrTmUnf = tmUnfOk && dTmUnf.valueRange && dTmUnf.valueRange.values ? dTmUnf.valueRange.values : [];
    var mergedTmall = mergeTmallValueRanges(vrTmFmt, vrTmUnf);
    var tmallFinalRange = rTmFmt.finalRange || rTmUnf.finalRange || tmallRange;

    var maxLen = maxRowLength(mergedTmall);
    var hCol = 7;
    var hStatsMerged = statsHColumn(mergedTmall, hCol);
    var hStatsFmt = tmFmtOk ? statsHColumn(vrTmFmt, hCol) : null;
    var hStatsUnf = tmUnfOk ? statsHColumn(vrTmUnf, hCol) : null;

    // 调试：输出天猫GSV(H列)统计
    console.log('[feishu-gmv-combined] 天猫数据行数:', mergedTmall.length);
    console.log('[feishu-gmv-combined] 天猫H列(GSV)统计:', JSON.stringify(hStatsMerged));
    console.log('[feishu-gmv-combined] 天猫G列(GMV)统计:', JSON.stringify(statsGridColumn(mergedTmall, 6)));
    console.log('[feishu-gmv-combined] 天猫K列(学习机)统计:', JSON.stringify(statsGridColumn(mergedTmall, 10)));
    console.log('[feishu-gmv-combined] 天猫M列(亲子屏)统计:', JSON.stringify(statsGridColumn(mergedTmall, 12)));

    var mergedJd = [];
    var jdFinalRange = '';
    var jdFmtOk = false;
    var jdUnfOk = false;
    var dJdFmt = {};
    var dJdUnf = {};
    if (jdRange && rJdFmt && rJdUnf) {
      jdFmtOk = rJdFmt.feishuJson && rJdFmt.feishuJson.code === 0;
      jdUnfOk = rJdUnf.feishuJson && rJdUnf.feishuJson.code === 0;
      dJdFmt = jdFmtOk ? rJdFmt.feishuJson.data || {} : {};
      dJdUnf = jdUnfOk ? rJdUnf.feishuJson.data || {} : {};
      var vrJdFmt = jdFmtOk && dJdFmt.valueRange && dJdFmt.valueRange.values ? dJdFmt.valueRange.values : [];
      var vrJdUnf = jdUnfOk && dJdUnf.valueRange && dJdUnf.valueRange.values ? dJdUnf.valueRange.values : [];
      mergedJd = mergeTmallValueRanges(vrJdFmt, vrJdUnf);
      jdFinalRange = rJdFmt.finalRange || rJdUnf.finalRange || jdRange;
    }
    var fCol = 5;
    var jdFStatsMerged = statsGridColumn(mergedJd, fCol);

    var mergedJd1 = [];
    var jd1FinalRange = '';
    if (jdSheet1Range && (rJd1Fmt || rJd1Unf)) {
      var j1FmtOk = rJd1Fmt && rJd1Fmt.feishuJson && rJd1Fmt.feishuJson.code === 0;
      var j1UnfOk = rJd1Unf && rJd1Unf.feishuJson && rJd1Unf.feishuJson.code === 0;
      if (j1FmtOk || j1UnfOk) {
        var dJ1Fmt = j1FmtOk ? rJd1Fmt.feishuJson.data || {} : {};
        var dJ1Unf = j1UnfOk ? rJd1Unf.feishuJson.data || {} : {};
        var vrJ1Fmt = j1FmtOk && dJ1Fmt.valueRange && dJ1Fmt.valueRange.values ? dJ1Fmt.valueRange.values : [];
        var vrJ1Unf = j1UnfOk && dJ1Unf.valueRange && dJ1Unf.valueRange.values ? dJ1Unf.valueRange.values : [];
        mergedJd1 = mergeTmallValueRanges(vrJ1Fmt, vrJ1Unf);
        jd1FinalRange = (rJd1Fmt && rJd1Fmt.finalRange) || (rJd1Unf && rJd1Unf.finalRange) || jdSheet1Range;
      }
    }
    var mergedJd2 = [];
    var jd2FinalRange = '';
    if (jdSheet2Range && (rJd2Fmt || rJd2Unf)) {
      var j2FmtOk = rJd2Fmt && rJd2Fmt.feishuJson && rJd2Fmt.feishuJson.code === 0;
      var j2UnfOk = rJd2Unf && rJd2Unf.feishuJson && rJd2Unf.feishuJson.code === 0;
      if (j2FmtOk || j2UnfOk) {
        var dJ2Fmt = j2FmtOk ? rJd2Fmt.feishuJson.data || {} : {};
        var dJ2Unf = j2UnfOk ? rJd2Unf.feishuJson.data || {} : {};
        var vrJ2Fmt = j2FmtOk && dJ2Fmt.valueRange && dJ2Fmt.valueRange.values ? dJ2Fmt.valueRange.values : [];
        var vrJ2Unf = j2UnfOk && dJ2Unf.valueRange && dJ2Unf.valueRange.values ? dJ2Unf.valueRange.values : [];
        mergedJd2 = mergeTmallValueRanges(vrJ2Fmt, vrJ2Unf);
        jd2FinalRange = (rJd2Fmt && rJd2Fmt.finalRange) || (rJd2Unf && rJd2Unf.finalRange) || jdSheet2Range;
      }
    }
    var gCol = 6;
    var jd1GStats = statsGridColumn(mergedJd1, gCol);
    var jd2GStats = statsGridColumn(mergedJd2, gCol);

    var payload = {
      tmallSpreadsheetToken: tmallToken,
      tmallRange: tmallFinalRange,
      tmallValueRange: {
        range: (tmFmtOk && dTmFmt.valueRange && dTmFmt.valueRange.range) || (tmUnfOk && dTmUnf.valueRange && dTmUnf.valueRange.range) || '',
        majorDimension: 'ROWS',
        values: mergedTmall,
      },
      tmallValuesMeta: {
        rowCount: mergedTmall.length,
        maxRowLength: maxLen,
        rangeExpandedEndColumnGToH: rangeExpandedFromG,
        rangeExpandedEndColumnToN: rangeExpandedPastH,
        mergedFromFormattedAndUnformatted: tmFmtOk && tmUnfOk,
        hColumnIndex: hCol,
        hColumnStatsMerged: hStatsMerged,
        hColumnStatsFormattedOnly: hStatsFmt,
        hColumnStatsUnformattedOnly: hStatsUnf,
        learnGmvColumnIndex: 10,
        qinziGmvColumnIndex: 12,
        kColumnStatsMerged: statsGridColumn(mergedTmall, 10),
        mColumnStatsMerged: statsGridColumn(mergedTmall, 12),
        lColumnStatsMerged: statsGridColumn(mergedTmall, 11),
        nColumnStatsMerged: statsGridColumn(mergedTmall, 13),
      },
      jdSpreadsheetToken: jdToken,
      jdRange: jdFinalRange || jdRange || '',
      jdRangeResolve: jdRangeInfo,
      jdValueRange: {
        range: (jdFmtOk && dJdFmt.valueRange && dJdFmt.valueRange.range) || (jdUnfOk && dJdUnf.valueRange && dJdUnf.valueRange.range) || '',
        majorDimension: 'ROWS',
        values: mergedJd,
      },
      jdValuesMeta: {
        rowCount: mergedJd.length,
        maxRowLength: maxRowLength(mergedJd),
        fColumnIndex: fCol,
        fColumnStatsMerged: jdFStatsMerged,
        mergedFromFormattedAndUnformatted: jdFmtOk && jdUnfOk,
      },
      jdSheet1Range: jd1FinalRange || jdSheet1Range || '',
      jdSheet1RangeResolve: jdSheet1Info || { range: null, source: 'auto' },
      jdSheet1ValueRange: {
        range:
          (rJd1Fmt && rJd1Fmt.feishuJson && rJd1Fmt.feishuJson.data && rJd1Fmt.feishuJson.data.valueRange && rJd1Fmt.feishuJson.data.valueRange.range) ||
          (rJd1Unf && rJd1Unf.feishuJson && rJd1Unf.feishuJson.data && rJd1Unf.feishuJson.data.valueRange && rJd1Unf.feishuJson.data.valueRange.range) ||
          '',
        majorDimension: 'ROWS',
        values: mergedJd1,
      },
      jdSheet1ValuesMeta: {
        rowCount: mergedJd1.length,
        gColumnIndex: gCol,
        gColumnStatsMerged: jd1GStats,
      },
      jdSheet2Range: jd2FinalRange || jdSheet2Range || '',
      jdSheet2RangeResolve: jdSheet2Info || { range: null, source: 'auto' },
      jdSheet2ValueRange: {
        range:
          (rJd2Fmt && rJd2Fmt.feishuJson && rJd2Fmt.feishuJson.data && rJd2Fmt.feishuJson.data.valueRange && rJd2Fmt.feishuJson.data.valueRange.range) ||
          (rJd2Unf && rJd2Unf.feishuJson && rJd2Unf.feishuJson.data && rJd2Unf.feishuJson.data.valueRange && rJd2Unf.feishuJson.data.valueRange.range) ||
          '',
        majorDimension: 'ROWS',
        values: mergedJd2,
      },
      jdSheet2ValuesMeta: {
        rowCount: mergedJd2.length,
        gColumnIndex: gCol,
        gColumnStatsMerged: jd2GStats,
      },
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
    var msg = e && e.message === 'FEISHU_NOT_CONFIGURED' ? '飞书应用未配置' : String((e && e.message) || e);
    return jsonResponse({ error: '拉取飞书 GMV 合并数据失败', detail: msg }, 502, origin);
  }
}

export async function onRequestOptions(context) {
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
