/**
 * 缓存刷新管理接口
 * 提供手动/自动刷新全站缓存功能
 */

import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest, isAdmin } from '../../_lib/session.js';
import { getCache, setCache, getAllCacheStatus, logCacheUpdate } from '../../_lib/cache.js';

// 所有缓存键列表
const CACHE_KEYS = [
  'features-output',
  'features-brand-top10',
  'feishu-daily-sales',
  'feishu-tmall-sales',
  'feishu-douyin-sales',
  'feishu-douyin-daily-trend',
  'feishu-douyin-model-distribution',
  'feishu-gmv-combined',
  'feishu-channel-order-trend',
  'feishu-livestream-funnel',
  'feishu-newretail-daily',
];

/**
 * 获取所有缓存状态
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = resolveCorsOrigin(request, env);

  const auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  // 只有管理员可以查看缓存状态
  if (!isAdmin(auth.user)) {
    return jsonResponse({ error: '无权限访问' }, 403, origin);
  }

  try {
    const status = await getAllCacheStatus(env, CACHE_KEYS);
    const result = {};

    for (const key of CACHE_KEYS) {
      const s = status[key];
      result[key] = {
        hasCache: !!s,
        updatedAt: s ? s.updatedAt : null,
        isValid: s ? s.isValid : false,
        updatedAtFormatted: s ? formatDateTime(s.updatedAt) : null,
      };
    }

    return jsonResponse({
      caches: result,
      totalKeys: CACHE_KEYS.length,
      cachedKeys: Object.values(result).filter(s => s.hasCache).length,
    }, 200, origin);
  } catch (e) {
    return jsonResponse(
      { error: '获取缓存状态失败', detail: e && e.message ? e.message : String(e) },
      500,
      origin
    );
  }
}

/**
 * 刷新全部缓存
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = resolveCorsOrigin(request, env);

  const auth = await authenticateRequest(request, env);
  if (auth.error) return auth.error;

  // 只有管理员可以刷新缓存
  if (!isAdmin(auth.user)) {
    return jsonResponse({ error: '无权限访问' }, 403, origin);
  }

  const results = [];
  const startTime = Date.now();

  // 逐个刷新缓存
  for (const key of CACHE_KEYS) {
    const keyStartTime = Date.now();
    try {
      // 通过内部调用获取数据
      const data = await fetchDataForKey(env, key);
      await setCache(env, key, data, 48);
      const duration = Date.now() - keyStartTime;
      await logCacheUpdate(env, key, 'success', duration);
      results.push({ key, success: true, duration });
    } catch (e) {
      const duration = Date.now() - keyStartTime;
      const errorMsg = e && e.message ? e.message : String(e);
      await logCacheUpdate(env, key, 'failed', duration, errorMsg);
      results.push({ key, success: false, duration, error: errorMsg });
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.length - successCount;

  return jsonResponse({
    success: failedCount === 0,
    totalDuration,
    successCount,
    failedCount,
    results,
    timestamp: Date.now(),
    timestampFormatted: formatDateTime(Date.now()),
  }, failedCount === 0 ? 200 : 207, origin);
}

export async function onRequestOptions(context) {
  const origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * 为指定键获取数据
 * 通过内部调用对应的API函数
 */
async function fetchDataForKey(env, key) {
  // 模拟请求上下文
  const mockContext = {
    request: new Request('http://localhost/api/data/' + key),
    env: env,
  };

  // 根据键名导入对应的模块并调用
  switch (key) {
    case 'features-output': {
      const mod = await import('../data/features-output.js');
      // 绕过缓存直接获取
      return await fetchRawFeaturesOutput(env);
    }
    case 'features-brand-top10': {
      return await fetchRawFeaturesBrandTop10(env);
    }
    case 'feishu-daily-sales': {
      return await fetchRawFeishuDailySales(env);
    }
    case 'feishu-tmall-sales': {
      return await fetchRawFeishuTmallSales(env);
    }
    case 'feishu-douyin-sales': {
      return await fetchRawFeishuDouyinSales(env);
    }
    case 'feishu-douyin-daily-trend': {
      return await fetchRawFeishuDouyinDailyTrend(env);
    }
    case 'feishu-douyin-model-distribution': {
      return await fetchRawFeishuDouyinModelDistribution(env);
    }
    case 'feishu-gmv-combined': {
      return await fetchRawFeishuGmvCombined(env);
    }
    case 'feishu-channel-order-trend': {
      return await fetchRawFeishuChannelOrderTrend(env);
    }
    case 'feishu-livestream-funnel': {
      return await fetchRawFeishuLivestreamFunnel(env);
    }
    case 'feishu-newretail-daily': {
      return await fetchRawFeishuNewretailDaily(env);
    }
    default:
      throw new Error('Unknown cache key: ' + key);
  }
}

// 以下函数直接调用飞书API获取原始数据，不经过缓存
// 这些函数复制自对应的API文件，但移除了缓存读取逻辑

async function fetchRawFeaturesOutput(env) {
  const { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } = await import('../../_lib/feishu.js');
  const industryBuilder = (await import('../../../shared/industry-data-builder.cjs')).default;

  const spreadsheetToken = env.FEISHU_INDUSTRY_SPREADSHEET_TOKEN;
  if (!spreadsheetToken) throw new Error('未配置 FEISHU_INDUSTRY_SPREADSHEET_TOKEN');

  const sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  const sheets = ((sheetsJson.data && sheetsJson.data.sheets) || []).slice().sort((a, b) => (a.index || 1e9) - (b.index || 1e9));
  const sheet = sheets[0];
  if (!sheet || !sheet.sheet_id) throw new Error('行业数据缺少 sheet1');

  const rowCount = sheet.grid_properties?.row_count || 20000;
  const range = String(sheet.sheet_id) + '!A1:E' + String(Math.max(20000, rowCount));

  const feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'UnformattedValue' });
  if (!feishuJson || feishuJson.code !== 0) {
    throw new Error((feishuJson && feishuJson.msg) || '行业大盘 sheet1 读取失败');
  }

  const values = (feishuJson.data && feishuJson.data.valueRange && feishuJson.data.valueRange.values) || [];
  return industryBuilder.buildDaPanPayloadFromValues(values, 'feishu:' + range);
}

async function fetchRawFeaturesBrandTop10(env) {
  const { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } = await import('../../_lib/feishu.js');
  const industryBuilder = (await import('../../../shared/industry-data-builder.cjs')).default;

  const spreadsheetToken = env.FEISHU_INDUSTRY_SPREADSHEET_TOKEN;
  if (!spreadsheetToken) throw new Error('未配置 FEISHU_INDUSTRY_SPREADSHEET_TOKEN');

  const sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  const sheets = ((sheetsJson.data && sheetsJson.data.sheets) || []).slice().sort((a, b) => (a.index || 1e9) - (b.index || 1e9));
  const sheet = sheets[1];
  if (!sheet || !sheet.sheet_id) throw new Error('行业品牌缺少 sheet2');

  const rowCount = sheet.grid_properties?.row_count || 20000;
  const range = String(sheet.sheet_id) + '!A1:G' + String(Math.max(20000, rowCount));

  const feishuJson = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'UnformattedValue' });
  if (!feishuJson || feishuJson.code !== 0) {
    throw new Error((feishuJson && feishuJson.msg) || '行业品牌 sheet2 读取失败');
  }

  const values = (feishuJson.data && feishuJson.data.valueRange && feishuJson.data.valueRange.values) || [];
  return industryBuilder.buildBrandPayloadFromValues(values, 'feishu:' + range);
}

// 辅助函数：判断是否为数据超限错误
function isDataExceeded(feishuJson) {
  const msg = String((feishuJson && feishuJson.msg) || '');
  return msg.indexOf('data exceeded') >= 0 && msg.indexOf('10485760') >= 0;
}

// 辅助函数：缩小范围行数
function shrinkRangeMaxRows(range, maxRows) {
  const i = String(range || '').indexOf('!');
  if (i < 0) return null;
  const sheetPart = String(range || '').slice(0, i);
  const addrPart = String(range || '').slice(i + 1) || 'A1:ZZ20000';
  const m = addrPart.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return null;
  const c1 = m[1];
  const r1 = parseInt(m[2], 10);
  const c2 = m[3];
  const r2 = parseInt(m[4], 10);
  if (!isFinite(r1) || !isFinite(r2) || r2 <= 0 || maxRows <= 0) return null;
  let target = Math.min(r2, maxRows);
  if (target >= r2) return null;
  if (target <= r1) target = r1 + 1;
  return sheetPart + '!' + c1 + String(r1) + ':' + c2 + String(target);
}

// 简化版的原始数据获取函数（先用UnformattedValue减少数据量，避免超限）
async function fetchRawFeishuDailySales(env) {
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const token = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
  const range = env.FEISHU_SHEET_RANGE || '0VWscb!A1:ZZ20000';

  // 先用 UnformattedValue 获取（数据量更小），避免10MB限制
  let result = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'UnformattedValue' });

  // 如果还是超限，再缩小行数
  if (result.code !== 0 && isDataExceeded(result)) {
    const caps = [12000, 8000, 6000, 4000, 3000, 2000];
    for (const cap of caps) {
      const smaller = shrinkRangeMaxRows(range, cap);
      if (!smaller) continue;
      const retry = await fetchSheetValuesV2(env, token, smaller, { valueRenderOption: 'UnformattedValue' });
      if (retry && retry.code === 0) {
        result = retry;
        break;
      }
      if (retry && !isDataExceeded(retry)) break;
    }
  }

  if (result.code !== 0) throw new Error(result.msg || '飞书接口返回错误');
  return {
    spreadsheetToken: token,
    range: range,
    revision: result.data?.revision,
    valueRange: result.data?.valueRange,
  };
}

async function fetchRawFeishuTmallSales(env) {
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const token = env.FEISHU_TMALL_SPREADSHEET_TOKEN || 'WkFuwdxnhio6AckVEeQcohMAnpc';

  // 基础范围
  const baseDateRange = '2joAvv!A1:A20000';
  const baseModelRange = '2joAvv!AU1:ZZ20000';

  // 带重试的获取函数
  async function fetchWithRetry(env, token, range) {
    let result = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'UnformattedValue' });
    let finalRange = range;

    // 超限后自动缩小行数
    if (result.code !== 0 && isDataExceeded(result)) {
      const caps = [12000, 8000, 6000, 4000, 3000, 2000];
      for (const cap of caps) {
        const smaller = shrinkRangeMaxRows(finalRange, cap);
        if (!smaller) continue;
        const retry = await fetchSheetValuesV2(env, token, smaller, { valueRenderOption: 'UnformattedValue' });
        if (retry && retry.code === 0) {
          return { result: retry, finalRange: smaller };
        }
        finalRange = smaller;
        if (retry && !isDataExceeded(retry)) break;
      }
    }
    return { result, finalRange };
  }

  const rDate = await fetchWithRetry(env, token, baseDateRange);
  if (rDate.result.code !== 0) throw new Error(rDate.result.msg || '天猫日期列读取失败');

  const rModel = await fetchWithRetry(env, token, baseModelRange);
  if (rModel.result.code !== 0) throw new Error(rModel.result.msg || '天猫型号列读取失败');

  const dateValues = rDate.result.data?.valueRange?.values || [];
  const modelValues = rModel.result.data?.valueRange?.values || [];
  const merged = [];
  for (let r = 0; r < Math.max(dateValues.length, modelValues.length); r++) {
    const row = [];
    row[0] = (dateValues[r] || [])[0] || '';
    for (let c = 0; c < (modelValues[r] || []).length; c++) {
      row[46 + c] = modelValues[r][c];
    }
    merged.push(row);
  }

  return {
    spreadsheetToken: token,
    range: rDate.finalRange + ' + ' + rModel.finalRange,
    revision: rDate.result.data?.revision || rModel.result.data?.revision,
    valueRange: {
      range: rDate.finalRange + ' + ' + rModel.finalRange,
      majorDimension: 'ROWS',
      values: merged,
    },
  };
}

async function fetchRawFeishuDouyinSales(env) {
  // 直接复制 feishu-douyin-sales.js 的核心逻辑，避免认证层
  const { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } = await import('../../_lib/feishu.js');
  const DEFAULT_SPREADSHEET_TOKEN = 'X2jWseyDuh5invtFhgGcfgnCnWf';
  const spreadsheetToken = env.FEISHU_DOUYIN_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;

  // 辅助函数：合并 FormattedValue 和 UnformattedValue
  function isFormulaText(v) {
    return typeof v === 'string' && /^[\s\u00a0]*[=＝]/.test(v);
  }

  function mergeFmtUnfValueRanges(vf, vu) {
    const rows = Math.max(vf.length, vu.length);
    const out = [];
    for (let r = 0; r < rows; r++) {
      const fr = vf[r] || [];
      const ur = vu[r] || [];
      const cols = Math.max(fr.length, ur.length);
      const row = [];
      for (let c = 0; c < cols; c++) {
        const f = fr[c];
        const u = ur[c];
        if (c === 0) {
          row[c] = f != null && f !== '' ? f : u;
          continue;
        }
        if (!isFormulaText(f) && f != null && f !== '') {
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

  async function fetchSheetRangeMerged(token, range) {
    const fmt = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'FormattedValue' });
    const unf = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'UnformattedValue' });
    if (fmt.code !== 0) return { feishuJson: fmt, values: null };
    const vf = (fmt.data && fmt.data.valueRange && fmt.data.valueRange.values) || [];
    if (unf.code !== 0) return { feishuJson: fmt, values: vf };
    const vu = (unf.data && unf.data.valueRange && unf.data.valueRange.values) || [];
    return { feishuJson: fmt, values: mergeFmtUnfValueRanges(vf, vu) };
  }

  function sortSheetsByUiIndex(sheets) {
    const arr = (sheets || []).slice();
    const hasAny = arr.some(s => s && typeof s.index === 'number' && isFinite(s.index));
    if (!hasAny) return arr;
    arr.sort((a, b) => (a && typeof a.index === 'number' ? a.index : 1e9) - (b && typeof b.index === 'number' ? b.index : 1e9));
    return arr;
  }

  // 获取 sheet 列表
  const sheetsJson = await fetchSpreadsheetSheetsV3(env, spreadsheetToken);
  if (!sheetsJson || sheetsJson.code !== 0) {
    throw new Error(sheetsJson?.msg || '抖音表工作表解析失败');
  }

  const sheets = sortSheetsByUiIndex((sheetsJson.data && sheetsJson.data.sheets) || []);
  if (sheets.length < 3) {
    throw new Error('抖音表 sheet 数量不足 3 个');
  }

  const s1 = sheets[0] && sheets[0].sheet_id ? String(sheets[0].sheet_id) : '';
  const s2 = sheets[1] && sheets[1].sheet_id ? String(sheets[1].sheet_id) : '';
  const s3 = sheets[2] && sheets[2].sheet_id ? String(sheets[2].sheet_id) : '';

  if (!s1 || !s2 || !s3) {
    throw new Error('抖音表缺少 sheet_id');
  }

  const range1 = s1 + '!A1:J20000';
  const range2 = s2 + '!A1:K20000';
  const range3 = s3 + '!A1:K20000';

  // 获取三个 sheet 数据
  const [m1, m2, m3] = await Promise.all([
    fetchSheetRangeMerged(spreadsheetToken, range1),
    fetchSheetRangeMerged(spreadsheetToken, range2),
    fetchSheetRangeMerged(spreadsheetToken, range3),
  ]);

  if (!m1.feishuJson || m1.feishuJson.code !== 0) {
    throw new Error(m1.feishuJson?.msg || '抖音sheet1读取失败');
  }
  if (!m2.feishuJson || m2.feishuJson.code !== 0) {
    throw new Error(m2.feishuJson?.msg || '抖音sheet2读取失败');
  }
  if (!m3.feishuJson || m3.feishuJson.code !== 0) {
    throw new Error(m3.feishuJson?.msg || '抖音sheet3读取失败');
  }

  const d1 = m1.feishuJson.data || {};
  const d2 = m2.feishuJson.data || {};
  const d3 = m3.feishuJson.data || {};
  const vr1 = d1.valueRange || {};
  const vr2 = d2.valueRange || {};
  const vr3 = d3.valueRange || {};

  return {
    spreadsheetToken: spreadsheetToken,
    range: range1,
    range2: range2,
    range3: range3,
    sheetMeta: [
      { title: sheets[0].title || '', sheet_id: s1, index: sheets[0].index },
      { title: sheets[1].title || '', sheet_id: s2, index: sheets[1].index },
      { title: sheets[2].title || '', sheet_id: s3, index: sheets[2].index },
    ],
    revision: d1.revision,
    revision2: d2.revision,
    revision3: d3.revision,
    valueRange: {
      range: vr1.range || range1,
      majorDimension: 'ROWS',
      values: m1.values || [],
    },
    valueRange2: {
      range: vr2.range || range2,
      majorDimension: 'ROWS',
      values: m2.values || [],
    },
    valueRange3: {
      range: vr3.range || range3,
      majorDimension: 'ROWS',
      values: m3.values || [],
    },
  };
}

async function fetchRawFeishuDouyinDailyTrend(env) {
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const token = env.FEISHU_DOUYIN_MODEL_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';

  const range = env.FEISHU_DOUYIN_MODEL_ORDER_RANGE || 'tuec5U!A2:AO20000';
  const result = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'UnformattedValue' });

  if (result.code !== 0) throw new Error(result.msg || '飞书接口返回错误');
  return {
    spreadsheetToken: token,
    range: range,
    data: result.data,
  };
}

async function fetchRawFeishuDouyinModelDistribution(env) {
  return fetchRawFeishuDouyinDailyTrend(env);
}

async function fetchRawFeishuGmvCombined(env) {
  // 简化版：只获取必要数据，避免过多子请求
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');

  // 天猫数据 - 只获取一次 UnformattedValue（数据量小）
  const tmallToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || 'WkFuwdxnhio6AckVEeQcohMAnpc';
  const tmallRange = '2joAvv!A1:N20000'; // 直接扩展到 N 列包含所有需要的数据
  const tmallResult = await fetchSheetValuesV2(env, tmallToken, tmallRange, { valueRenderOption: 'UnformattedValue' });

  // 京东数据 - 简化，只获取必要范围
  const jdToken = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
  const jdRange = '0VWscb!A1:F20000';
  const jdResult = await fetchSheetValuesV2(env, jdToken, jdRange, { valueRenderOption: 'UnformattedValue' });

  // 京东第一张表 (学习机 GSV - G列)
  const jdSheet1Range = '0VWscb!A1:G20000';
  const jd1Result = await fetchSheetValuesV2(env, jdToken, jdSheet1Range, { valueRenderOption: 'UnformattedValue' });

  // 京东第二张表 (亲子屏 GSV - G列)
  const jdSheet2Range = '0VWscb!A1:G20000';
  const jd2Result = await fetchSheetValuesV2(env, jdToken, jdSheet2Range, { valueRenderOption: 'UnformattedValue' });

  // 构建与 feishu-gmv-combined.js 一致的数据结构
  const tmallValues = tmallResult.code === 0 && tmallResult.data?.valueRange?.values ? tmallResult.data.valueRange.values : [];
  const jdValues = jdResult.code === 0 && jdResult.data?.valueRange?.values ? jdResult.data.valueRange.values : [];
  const jd1Values = jd1Result.code === 0 && jd1Result.data?.valueRange?.values ? jd1Result.data.valueRange.values : [];
  const jd2Values = jd2Result.code === 0 && jd2Result.data?.valueRange?.values ? jd2Result.data.valueRange.values : [];

  return {
    tmallSpreadsheetToken: tmallToken,
    tmallRange: tmallRange,
    tmallValueRange: {
      range: tmallRange,
      majorDimension: 'ROWS',
      values: tmallValues,
    },
    tmallValuesMeta: {
      rowCount: tmallValues.length,
    },
    jdSpreadsheetToken: jdToken,
    jdRange: jdRange,
    jdValueRange: {
      range: jdRange,
      majorDimension: 'ROWS',
      values: jdValues,
    },
    jdValuesMeta: {
      rowCount: jdValues.length,
    },
    jdSheet1Range: jdSheet1Range,
    jdSheet1ValueRange: {
      range: jdSheet1Range,
      majorDimension: 'ROWS',
      values: jd1Values,
    },
    jdSheet1ValuesMeta: {
      rowCount: jd1Values.length,
    },
    jdSheet2Range: jdSheet2Range,
    jdSheet2ValueRange: {
      range: jdSheet2Range,
      majorDimension: 'ROWS',
      values: jd2Values,
    },
    jdSheet2ValuesMeta: {
      rowCount: jd2Values.length,
    },
  };
}

async function fetchRawFeishuChannelOrderTrend(env) {
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const token = env.FEISHU_DOUYIN_MODEL_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';

  const range = env.FEISHU_DOUYIN_MODEL_ORDER_RANGE || 'tuec5U!A2:AO20000';
  const result = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'UnformattedValue' });

  if (result.code !== 0) throw new Error(result.msg || '飞书接口返回错误');
  return {
    spreadsheetToken: token,
    range: range,
    data: result.data,
  };
}

async function fetchRawFeishuLivestreamFunnel(env) {
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const token = env.FEISHU_LIVESTREAM_FUNNEL_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';
  const range = env.FEISHU_LIVESTREAM_FUNNEL_RANGE || 'fBPMjm!A1:AD20000';

  const result = await fetchSheetValuesV2(env, token, range, { valueRenderOption: 'FormattedValue' });
  if (result.code !== 0) throw new Error(result.msg || '飞书接口返回错误');

  // 解析数据
  const values = result.data?.valueRange?.values || [];
  return aggregateByAnchor(values);
}

async function fetchRawFeishuNewretailDaily(env) {
  // 直接复制 feishu-newretail-daily.js 的核心逻辑
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const {
    PLATFORM_CONFIG, CHANNEL_MAP_CONFIG, buildChannelMaps,
    processPlatformOrders, processPlatformOrdersGsv,
    aggregateByDayAndCategory, aggregateByWeek, aggregateByMonth,
    aggregateFuwuByChannel, aggregateFuwuByChannelWeekly, aggregateFuwuByChannelMonthly,
    aggregateDpByChannel, aggregateDpByChannelWeekly, aggregateDpByChannelMonthly,
    aggregateDpByDarenMonthly, aggregateModelDistributionByDay, aggregateModelDistributionByDayFiltered,
    aggregateModelDistributionByDaren, aggregateRefundRateByDayAndCategory,
    aggregateRefundRateByWeek, aggregateRefundRateByMonth, aggregateFuwuRefundRateByChannel,
    aggregateDpRefundRateByChannel, calculateTotalsByCategory, calculateFuwuTotalsByChannel,
    calculateDpTotalsByChannel
  } = await import('../data/newretail-gmv-logic.js');

  const DEFAULT_SPREADSHEET_TOKEN = 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';
  const spreadsheetToken = env.FEISHU_NEWRETAIL_SPREADSHEET_TOKEN || DEFAULT_SPREADSHEET_TOKEN;
  const maxRows = 20000;

  function numToColLetter(n) {
    let s = '';
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s || 'A';
  }

  globalThis.__unmatchedDarenIds = new Set();
  globalThis.__unmatchedDarenStats = {};

  const chRange = CHANNEL_MAP_CONFIG.sheetId + '!A1:E2000';
  const chJson = await fetchSheetValuesV2(env, spreadsheetToken, chRange, { valueRenderOption: 'FormattedValue' });
  if (!chJson || chJson.code !== 0) throw new Error(chJson?.msg || '渠道映射表读取失败');

  const chValues = chJson.data?.valueRange?.values || [];
  const channelMaps = buildChannelMaps(chValues);

  const darenNicknamesFromChannelMap = [];
  const darenIdToDarenNameMap = {};
  const shipinhaoNameToDarenNameMap = {};
  for (let r = 1; r < chValues.length; r++) {
    const row = chValues[r] || [];
    const channelName = String(row[0] || '').trim();
    const platform = String(row[1] || '').trim();
    const darenName = String(row[3] || '').trim();
    const darenId = String(row[4] || '').trim();
    if (channelName && !channelName.startsWith('直营') && !channelName.startsWith('自营')) {
      if (darenName) {
        darenNicknamesFromChannelMap.push(darenName);
        if (platform === '视频号' && darenId) shipinhaoNameToDarenNameMap[darenId] = darenName;
        else if (darenId) darenIdToDarenNameMap[darenId] = darenName;
      }
    }
  }
  const uniqueDarenNicknames = darenNicknamesFromChannelMap.filter((item, idx, arr) => arr.indexOf(item) === idx).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const platformKeys = ['douyin', 'xiaohongshu', 'shipinhao', 'kuaishou'];
  const platformPromises = platformKeys.map(async (platform) => {
    const cfg = PLATFORM_CONFIG[platform];
    if (!cfg) return { platform, values: [] };
    const maxCol = Math.max(...Object.values(cfg.cols));
    const colLetter = numToColLetter(maxCol);
    const range = cfg.sheetId + '!A1:' + colLetter + maxRows;
    try {
      const result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
      return { platform, values: (result && result.code === 0) ? result.data?.valueRange?.values || [] : [] };
    } catch (e) { return { platform, values: [] }; }
  });

  const platformResults = await Promise.all(platformPromises);

  let allOrdersGmv = [];
  const platformStatsGmv = {};
  platformResults.forEach((result) => {
    if (result.values && result.values.length > 0) {
      const gmvResult = processPlatformOrders(result.values, result.platform, channelMaps);
      allOrdersGmv = allOrdersGmv.concat(gmvResult.orders);
      platformStatsGmv[result.platform] = { totalRows: result.values.length - 1, validOrders: gmvResult.orders.length };
    }
  });

  let allOrdersGsv = [];
  const platformStatsGsv = {};
  platformResults.forEach((result) => {
    if (result.values && result.values.length > 0) {
      const gsvResult = processPlatformOrdersGsv(result.values, result.platform, channelMaps);
      allOrdersGsv = allOrdersGsv.concat(gsvResult.orders);
      platformStatsGsv[result.platform] = { totalRows: result.values.length - 1, validOrders: gsvResult.orders.length, skippedCount: gsvResult.skipCount };
    }
  });

  const dailyPointsGmv = aggregateByDayAndCategory(allOrdersGmv);
  const weeklyPointsGmv = aggregateByWeek(dailyPointsGmv);
  const monthlyPointsGmv = aggregateByMonth(dailyPointsGmv);
  const dailyPointsGsv = aggregateByDayAndCategory(allOrdersGsv);
  const weeklyPointsGsv = aggregateByWeek(dailyPointsGsv);
  const monthlyPointsGsv = aggregateByMonth(dailyPointsGsv);
  const dailyRefundRate = aggregateRefundRateByDayAndCategory(dailyPointsGmv, dailyPointsGsv);
  const weeklyRefundRate = aggregateRefundRateByWeek(dailyPointsGmv, dailyPointsGsv);
  const monthlyRefundRate = aggregateRefundRateByMonth(dailyPointsGmv, dailyPointsGsv);
  const fuwuByChannel = aggregateFuwuByChannel(allOrdersGmv);
  const fuwuByChannelWeekly = aggregateFuwuByChannelWeekly(fuwuByChannel.data);
  const fuwuByChannelMonthly = aggregateFuwuByChannelMonthly(fuwuByChannel.data);
  const fuwuByChannelGsv = aggregateFuwuByChannel(allOrdersGsv);
  const fuwuByChannelGsvWeekly = aggregateFuwuByChannelWeekly(fuwuByChannelGsv.data);
  const fuwuByChannelGsvMonthly = aggregateFuwuByChannelMonthly(fuwuByChannelGsv.data);
  const fuwuRefundRateDaily = aggregateFuwuRefundRateByChannel(fuwuByChannel, fuwuByChannelGsv);
  const fuwuRefundRateWeekly = aggregateFuwuRefundRateByChannel(fuwuByChannelWeekly, fuwuByChannelGsvWeekly);
  const fuwuRefundRateMonthly = aggregateFuwuRefundRateByChannel(fuwuByChannelMonthly, fuwuByChannelGsvMonthly);
  const fourPlatformTotals = calculateTotalsByCategory(dailyPointsGmv, dailyPointsGsv);
  const fuwuTotalsDaily = calculateFuwuTotalsByChannel(fuwuByChannel, fuwuByChannelGsv);
  const fuwuTotalsWeekly = calculateFuwuTotalsByChannel(fuwuByChannelWeekly, fuwuByChannelGsvWeekly);
  const fuwuTotalsMonthly = calculateFuwuTotalsByChannel(fuwuByChannelMonthly, fuwuByChannelGsvMonthly);
  const dpByChannel = aggregateDpByChannel(allOrdersGmv);
  const dpByChannelWeekly = aggregateDpByChannelWeekly(dpByChannel.data);
  const dpByChannelMonthly = aggregateDpByChannelMonthly(dpByChannel.data);
  const dpByChannelGsv = aggregateDpByChannel(allOrdersGsv);
  const dpByChannelGsvWeekly = aggregateDpByChannelWeekly(dpByChannelGsv.data);
  const dpByChannelGsvMonthly = aggregateDpByChannelMonthly(dpByChannelGsv.data);
  const dpRefundRateDaily = aggregateDpRefundRateByChannel(dpByChannel, dpByChannelGsv);
  const dpRefundRateWeekly = aggregateDpRefundRateByChannel(dpByChannelWeekly, dpByChannelGsvWeekly);
  const dpRefundRateMonthly = aggregateDpRefundRateByChannel(dpByChannelMonthly, dpByChannelGsvMonthly);
  const dpTotalsDaily = calculateDpTotalsByChannel(dpByChannel, dpByChannelGsv);
  const dpTotalsWeekly = calculateDpTotalsByChannel(dpByChannelWeekly, dpByChannelGsvWeekly);
  const dpTotalsMonthly = calculateDpTotalsByChannel(dpByChannelMonthly, dpByChannelGsvMonthly);
  const dpByDarenMonthly = aggregateDpByDarenMonthly(allOrdersGmv, allOrdersGsv);

  const modelMappingRange = 'NYYiAs!A1:B1000';
  const modelMappingJson = await fetchSheetValuesV2(env, spreadsheetToken, modelMappingRange, { valueRenderOption: 'FormattedValue' });
  const modelMapping = [];
  if (modelMappingJson && modelMappingJson.code === 0) {
    const modelValues = modelMappingJson.data?.valueRange?.values || [];
    for (let i = 1; i < modelValues.length; i++) {
      const row = modelValues[i] || [];
      const keyword = String(row[0] || '').trim();
      const model = String(row[1] || '').trim();
      if (keyword && model) modelMapping.push({ keyword, model });
    }
  }

  const modelDistributionResult = aggregateModelDistributionByDay(allOrdersGmv, modelMapping);
  const modelDistributionGsvResult = aggregateModelDistributionByDay(allOrdersGsv, modelMapping);
  const modelDistDpMuchengResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, (o) => o.category === 'dp' && o.channel && o.channel.includes('沐成'));
  const modelDistDpZhumengResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, (o) => o.category === 'dp' && o.channel && o.channel.includes('逐梦'));
  const modelDistDarenResult = aggregateModelDistributionByDayFiltered(allOrdersGsv, modelMapping, (o) => o.category === 'zhidui' || o.category === 'fuwu');
  const modelDistDarenByDaren = aggregateModelDistributionByDaren(allOrdersGsv, modelMapping, (o) => o.category === 'zhidui' || o.category === 'fuwu' || o.category === 'dp', uniqueDarenNicknames, darenIdToDarenNameMap, shipinhaoNameToDarenNameMap);

  return {
    mode: 'daily',
    gmv: { daily: dailyPointsGmv, weekly: weeklyPointsGmv, monthly: monthlyPointsGmv },
    gsv: { daily: dailyPointsGsv, weekly: weeklyPointsGsv, monthly: monthlyPointsGsv },
    refundRate: { daily: dailyRefundRate, weekly: weeklyRefundRate, monthly: monthlyRefundRate },
    fuwuGmv: { daily: fuwuByChannel, weekly: fuwuByChannelWeekly, monthly: fuwuByChannelMonthly },
    fuwuGsv: { daily: fuwuByChannelGsv, weekly: fuwuByChannelGsvWeekly, monthly: fuwuByChannelGsvMonthly },
    fuwuRefundRate: { daily: fuwuRefundRateDaily, weekly: fuwuRefundRateWeekly, monthly: fuwuRefundRateMonthly },
    dpGmv: { daily: dpByChannel, weekly: dpByChannelWeekly, monthly: dpByChannelMonthly },
    dpGsv: { daily: dpByChannelGsv, weekly: dpByChannelGsvWeekly, monthly: dpByChannelGsvMonthly },
    dpRefundRate: { daily: dpRefundRateDaily, weekly: dpRefundRateWeekly, monthly: dpRefundRateMonthly },
    totals: { fourPlatform: fourPlatformTotals, fuwuDaily: fuwuTotalsDaily, fuwuWeekly: fuwuTotalsWeekly, fuwuMonthly: fuwuTotalsMonthly, dpDaily: dpTotalsDaily, dpWeekly: dpTotalsWeekly, dpMonthly: dpTotalsMonthly },
    dpGmvGsv: { monthly: dpByDarenMonthly },
    modelDistribution: modelDistributionResult,
    modelDistributionGsv: modelDistributionGsvResult,
    modelDistDpMucheng: modelDistDpMuchengResult,
    modelDistDpZhumeng: modelDistDpZhumengResult,
    modelDistDaren: modelDistDarenResult,
    modelDistDarenByDaren: modelDistDarenByDaren,
    meta: { spreadsheetToken, totalOrdersGmv: allOrdersGmv.length, totalOrdersGsv: allOrdersGsv.length, platformStatsGmv, platformStatsGsv, platforms: platformKeys, cached: false }
  };
}

// 复制自 feishu-livestream-funnel.js
function aggregateByAnchor(values) {
  const COL_B = 1;
  const COL_D = 3;
  const COL_G = 6;
  const COL_I = 8;
  const COL_U = 20;
  const COL_V = 21;
  const COL_AD = 29;

  function parseNumberCell(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const s = String(v).replace(/,/g, '').replace(/\s/g, '').trim();
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function parseDateFromCell(v) {
    if (!v) return null;
    const s = String(v).trim();
    const m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) {
      return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    }
    return null;
  }

  function isHeaderRow(row) {
    if (!row || !row.length) return true;
    const b = String(row[COL_B] || '').trim();
    if (!b) return false;
    const low = b.toLowerCase();
    if (low === '主播' || low === '主播昵称' || low.indexOf('昵称') >= 0) return true;
    if (b === 'B' || low === 'name') return true;
    return false;
  }

  const map = Object.create(null);
  const dateMap = Object.create(null);
  let start = 0;
  if (values.length > 0 && isHeaderRow(values[0])) start = 1;

  for (let r = start; r < values.length; r++) {
    const row = values[r];
    if (!row || !row.length) continue;
    const name = String(row[COL_B] != null ? row[COL_B] : '').trim();
    if (!name) continue;

    const dateStr = parseDateFromCell(row[COL_D]);
    const exposure = parseNumberCell(row[COL_G]);
    const view = parseNumberCell(row[COL_I]);
    const productExposure = parseNumberCell(row[COL_U]);
    const productClick = parseNumberCell(row[COL_V]);
    const order = parseNumberCell(row[COL_AD]);

    if (!map[name]) {
      map[name] = { name: name, exposure: 0, view: 0, productExposure: 0, productClick: 0, order: 0 };
    }
    const m = map[name];
    m.exposure += exposure;
    m.view += view;
    m.productExposure += productExposure;
    m.productClick += productClick;
    m.order += order;

    if (dateStr) {
      if (!dateMap[name]) dateMap[name] = {};
      if (!dateMap[name][dateStr]) {
        dateMap[name][dateStr] = { exposure: 0, view: 0, productExposure: 0, productClick: 0, order: 0 };
      }
      const dm = dateMap[name][dateStr];
      dm.exposure += exposure;
      dm.view += view;
      dm.productExposure += productExposure;
      dm.productClick += productClick;
      dm.order += order;
    }
  }

  const list = Object.keys(map).map(k => map[k]);
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'));

  const datesByAnchor = {};
  for (const name in dateMap) {
    datesByAnchor[name] = Object.keys(dateMap[name]).sort();
  }

  return {
    anchors: list,
    datesByAnchor: datesByAnchor,
    dataByAnchorAndDate: dateMap,
  };
}

function formatDateTime(timestamp) {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
