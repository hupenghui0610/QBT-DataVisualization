/**
 * 缓存刷新管理接口
 * 提供手动/自动刷新全站缓存功能
 */

import { jsonResponse, corsHeaders } from '../../_lib/http.js';
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
  const origin = request.headers.get('Origin') || undefined;

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
  const origin = request.headers.get('Origin') || undefined;

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
  const origin = context.request.headers.get('Origin') || '*';
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
  const { fetchSheetValuesV2 } = await import('../../_lib/feishu.js');
  const token = env.FEISHU_DOUYIN_SPREADSHEET_TOKEN || 'X2jWseyDuh5invtFhgGcfgnCnWf';

  // 三个sheet的默认范围
  const range1 = env.FEISHU_DOUYIN_LIVE_RANGE || '直播GMV!A1:ZZ20000';
  const range2 = env.FEISHU_DOUYIN_VIDEO_RANGE || '短视频GMV!A1:ZZ20000';
  const range3 = env.FEISHU_DOUYIN_OTHER_RANGE || '其他GMV!A1:ZZ20000';

  // 并行获取三个sheet
  const [r1, r2, r3] = await Promise.all([
    fetchSheetValuesV2(env, token, range1),
    fetchSheetValuesV2(env, token, range2),
    fetchSheetValuesV2(env, token, range3),
  ]);

  // 构建与 feishu-douyin-sales.js 一致的数据结构
  const d1 = r1.data || {};
  const d2 = r2.data || {};
  const d3 = r3.data || {};
  const vr1 = d1.valueRange || {};
  const vr2 = d2.valueRange || {};
  const vr3 = d3.valueRange || {};

  return {
    spreadsheetToken: token,
    range: range1,
    range2: range2,
    range3: range3,
    revision: d1.revision,
    revision2: d2.revision,
    revision3: d3.revision,
    valueRange: {
      range: vr1.range || range1,
      majorDimension: 'ROWS',
      values: vr1.values || [],
    },
    valueRange2: {
      range: vr2.range || range2,
      majorDimension: 'ROWS',
      values: vr2.values || [],
    },
    valueRange3: {
      range: vr3.range || range3,
      majorDimension: 'ROWS',
      values: vr3.values || [],
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
  // 直接复用 feishu-newretail-daily.js 的完整逻辑，保持数据结构一致
  const mod = await import('../data/feishu-newretail-daily.js');

  // 创建模拟请求上下文
  const mockRequest = new Request('http://localhost/api/data/feishu-newretail-daily');
  const mockContext = {
    request: mockRequest,
    env: env,
  };

  // 调用 onRequestGet 获取完整处理后的数据
  const response = await mod.onRequestGet(mockContext);

  // 解析响应体
  const responseBody = await response.text();
  const data = JSON.parse(responseBody);

  // 移除缓存标记
  delete data._cached;
  delete data._updatedAt;

  return data;
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
