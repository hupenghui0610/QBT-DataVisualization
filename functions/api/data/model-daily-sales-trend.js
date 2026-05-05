/**
 * 全渠道型号销量趋势 API（仅返回销量 quantity）
 *
 * - 四平台：与新零售 GSV 路径一致，使用 processPlatformOrdersGsv 产出订单后汇总 **order.quantity**（件数），
 *   经 NYYiAs 映射到型号；订单需过渠道映射与 classifyOrder（与 newretail-gmv-logic 一致）。
 * - 京东/天猫：表内「数量」列与四平台按同一型号键合并；表头型号经 normalizeShelfModelName 与映射表对齐。
 *
 * 排查：Worker 在聚合后会 console 打印京东/天猫/四平台 GSV 各自型号清单（前缀 [model-daily-sales-trend]）。
 * 命中缓存时不会执行聚合与打印，请使用 `?nocache=1` 后查看 Cloudflare 实时日志或 wrangler tail。
 * 浏览器 F12：`?debugModels=1` 时响应含 `debug.jdModels/tmallModels/gsvModels`（不入 D1 缓存），前端会 console 输出。
 */
import { jsonResponse, corsHeaders, resolveCorsOrigin } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';
import {
  PLATFORM_CONFIG,
  CHANNEL_MAP_CONFIG,
  buildChannelMaps,
  processPlatformOrdersGsv,
} from './newretail-gmv-logic.js';

var CACHE_KEY = 'model-daily-sales-trend-v5';
var CACHE_TTL_HOURS = 48;

var TMALL_MODEL_START_COL = 46; // AU，与 feishu-tmall-sales mergeDateAndModelValues 一致

// ============ 工具函数 ============
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 飞书 FormattedValue 可能返回 {text}、嵌套或数组，直接 String 会得到 [object Object] */
function unwrapFeishuCell(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object') {
    if (Array.isArray(cell)) {
      return cell
        .map(function (x) {
          return unwrapFeishuCell(x);
        })
        .filter(Boolean)
        .join('');
    }
    if (cell.text != null) return unwrapFeishuCell(cell.text);
    if (cell.value != null) return unwrapFeishuCell(cell.value);
    return '';
  }
  return cell;
}

function feishuCellToPlainString(cell) {
  var u = unwrapFeishuCell(cell);
  if (u == null) return '';
  return String(u).replace(/\r\n/g, '\n').trim();
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

/** 货架表第一列日期：数字序列 / 2026-1-1 / 2026年1月1日 等 */
function parseShelfDateCell(dateVal) {
  var v = unwrapFeishuCell(dateVal);
  if (v === '' || v == null) return '';
  if (typeof v === 'number' && isFinite(v)) {
    var ymd = ymdFromExcelSerial(v);
    return ymd || '';
  }
  var str = String(v).trim();
  var m = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (m) {
    return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
  }
  m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
  }
  return '';
}

/** 与 feishu-tmall-sales：A 列日期 + AU:ZZ 型号块合并到同一行 */
function mergeDateAndModelValues(dateValues, modelValues, modelStartCol) {
  var a = Array.isArray(dateValues) ? dateValues : [];
  var b = Array.isArray(modelValues) ? modelValues : [];
  var n = Math.max(a.length, b.length);
  var start = typeof modelStartCol === 'number' ? modelStartCol : TMALL_MODEL_START_COL;
  var out = [];
  for (var r = 0; r < n; r++) {
    var row = [];
    var ra = a[r] || [];
    var rb = b[r] || [];
    row[0] = ra[0] == null ? '' : ra[0];
    for (var c = 0; c < rb.length; c++) {
      row[start + c] = rb[c];
    }
    out.push(row);
  }
  return out;
}

function sheetNameFromRange(fullRange) {
  var s = String(fullRange || '').split('!')[0];
  return s || '2joAvv';
}

// ============ 四平台数据读取与聚合 ============
async function fetchNewretailModelData(env, spreadsheetToken) {
  const maxRows = 30000;
  const platformKeys = ['douyin', 'xiaohongshu', 'shipinhao', 'kuaishou'];

  // 读取四平台数据（简化版，直接读取原始数据）
  const platformPromises = platformKeys.map(async function(platform) {
    const cfg = PLATFORM_CONFIG[platform];
    if (!cfg) return { platform: platform, values: [] };

    const maxCol = Math.max(...Object.values(cfg.cols));
    const colLetter = numToColLetter(maxCol);
    const range = cfg.sheetId + '!A1:' + colLetter + maxRows;

    try {
      const result = await fetchSheetValuesV2(env, spreadsheetToken, range, { valueRenderOption: 'FormattedValue' });
      if (result && result.code === 0) {
        return { platform: platform, values: result.data?.valueRange?.values || [] };
      }
      return { platform: platform, values: [] };
    } catch (e) {
      return { platform: platform, values: [] };
    }
  });

  return await Promise.all(platformPromises);
}

function numToColLetter(n) {
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s || 'A';
}

/** 四平台：与新零售 GSV 一致，按订单聚合后再映射型号 */
function aggregateGsvModelsFromPlatforms(platformResults, channelMaps, mappingList) {
  const dailyBucket = {};
  const list = mappingList || [];

  platformResults.forEach(function(result) {
    if (!result.values || result.values.length <= 1) return;
    const gsv = processPlatformOrdersGsv(result.values, result.platform, channelMaps);
    const orders = gsv.orders || [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const matchedModel = matchProductToModel(order.product || '', list);
      if (!matchedModel) continue;
      const day = order.date;
      if (!dailyBucket[day]) dailyBucket[day] = {};
      if (!dailyBucket[day][matchedModel]) {
        dailyBucket[day][matchedModel] = { quantity: 0 };
      }
      dailyBucket[day][matchedModel].quantity += order.quantity || 0;
    }
  });

  return dailyBucket;
}

function matchProductToModel(product, mappingList) {
  if (!product) return null;
  const productLower = String(product).toLowerCase();

  // V2特殊处理
  if (productLower.includes('v2')) {
    let containsOtherKeyword = false;
    for (const mapping of mappingList) {
      const kw = mapping.keyword;
      if (kw !== 'V2' && productLower.includes(kw.toLowerCase())) {
        containsOtherKeyword = true;
        break;
      }
    }
    if (!containsOtherKeyword) {
      for (const mapping of mappingList) {
        if (mapping.keyword === 'V2') return mapping.model;
      }
    }
  }

  // 其他关键词匹配
  for (const mapping of mappingList) {
    const kw = mapping.keyword;
    if (kw !== 'V2' && productLower.includes(kw.toLowerCase())) {
      return mapping.model;
    }
  }

  return null;
}

/** 货架表头型号名与 NYYiAs 映射对齐，便于与四平台 canonical 型号合并 */
function normalizeShelfModelName(raw, mappingList) {
  var s = feishuCellToPlainString(raw);
  if (!s) return null;
  var via = matchProductToModel(s, mappingList || []);
  if (via) return via;
  var lower = s.toLowerCase();
  var list = mappingList || [];
  for (var i = 0; i < list.length; i++) {
    var canon = list[i].model;
    if (canon && String(canon).toLowerCase() === lower) return canon;
  }
  return s;
}

function countDistinctModelsInBucket(bucket) {
  var set = new Set();
  Object.keys(bucket || {}).forEach(function(d) {
    Object.keys(bucket[d] || {}).forEach(function(m) {
      set.add(m);
    });
  });
  return set.size;
}

/** 从按日分桶结构收集全部型号键并排序（用于日志与排查） */
function collectSortedModelKeysFromDailyBucket(bucket) {
  var set = new Set();
  Object.keys(bucket || {}).forEach(function(d) {
    Object.keys(bucket[d] || {}).forEach(function(m) {
      set.add(m);
    });
  });
  return Array.from(set).sort();
}

// ============ 京东/天猫数据读取 ============
async function fetchShelfEcommerceData(env, mappingList) {
  const results = { jd: { data: [], dates: [], models: [] }, tmall: { data: [], dates: [], models: [] } };

  // 京东：必须同一 range 同时含 A 列日期与 AO 起型号列。仅用 A:H 时 row 长度 < 41，型号列永远读不到（与 feishu-daily-sales 合并逻辑一致）。
  try {
    const jdToken = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
    const jdFullRange =
      env.FEISHU_SHEET_RANGE_JD_SHELF || '0VWscb!A1:BZ20000';

    const jdResult = await fetchSheetValuesV2(env, jdToken, jdFullRange, { valueRenderOption: 'FormattedValue' });
    if (jdResult && jdResult.code === 0) {
      const values = jdResult.data?.valueRange?.values || [];
      results.jd = processShelfData(values, 40, mappingList); // AO = 0-based 40
    }
  } catch (e) {
    console.error('京东数据读取失败:', e);
  }

  // 天猫：与 feishu-tmall-sales 相同——A1:A 日期 + AU1:ZZ 型号块合并（单列宽表易稀疏/截断导致读不到型号）
  try {
    const tmallToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || 'WkFuwdxnhio6AckVEeQcohMAnpc';
    const tmallFullRange =
      env.FEISHU_TMALL_SHELF_FULL_RANGE || '2joAvv!A1:ZZ20000';
    const sheetName = sheetNameFromRange(tmallFullRange);
    const maxRow = 20000;

    const dateRange = sheetName + '!A1:A' + maxRow;
    const modelRange = sheetName + '!AU1:ZZ' + maxRow;
    const [rDate, rModel] = await Promise.all([
      fetchSheetValuesV2(env, tmallToken, dateRange, { valueRenderOption: 'FormattedValue' }),
      fetchSheetValuesV2(env, tmallToken, modelRange, { valueRenderOption: 'FormattedValue' }),
    ]);

    if (rDate && rDate.code === 0 && rModel && rModel.code === 0) {
      const dv = rDate.data?.valueRange?.values || [];
      const mv = rModel.data?.valueRange?.values || [];
      const merged = mergeDateAndModelValues(dv, mv, TMALL_MODEL_START_COL);
      results.tmall = processShelfData(merged, TMALL_MODEL_START_COL, mappingList);
    } else {
      const tmallResult = await fetchSheetValuesV2(env, tmallToken, tmallFullRange, {
        valueRenderOption: 'FormattedValue',
      });
      if (tmallResult && tmallResult.code === 0) {
        const values = tmallResult.data?.valueRange?.values || [];
        results.tmall = processShelfData(values, TMALL_MODEL_START_COL, mappingList);
      }
    }
  } catch (e) {
    console.error('天猫数据读取失败:', e);
  }

  return results;
}

function processShelfData(values, modelStartCol, mappingList) {
  const dailyBucket = {};
  const modelSet = new Set();
  const headerRow = values[0] || [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];

    const dateStr = parseShelfDateCell(row[0]);
    if (!dateStr) continue;

    if (!dailyBucket[dateStr]) dailyBucket[dateStr] = {};

    var maxCol = Math.max(headerRow.length, row.length, modelStartCol + 2);

    // 解析型号列（从 modelStartCol 开始，每两列为一组：数量、金额）
    for (let c = modelStartCol; c < maxCol; c += 2) {
      const modelNameRaw = headerRow[c];
      const modelKey = normalizeShelfModelName(modelNameRaw, mappingList);
      if (!modelKey) continue;

      var qtyRaw = unwrapFeishuCell(row[c]);
      var amtRaw = unwrapFeishuCell(row[c + 1]);
      const qty = parseFloat(String(qtyRaw == null ? '' : qtyRaw).replace(/[,，\s]/g, '')) || 0;
      const amt = parseFloat(String(amtRaw == null ? '' : amtRaw).replace(/[,，\s]/g, '')) || 0;

      if (qty > 0 || amt > 0) {
        modelSet.add(modelKey);
        if (!dailyBucket[dateStr][modelKey]) {
          dailyBucket[dateStr][modelKey] = { quantity: 0 };
        }
        dailyBucket[dateStr][modelKey].quantity += qty;
      }
    }
  }

  return { data: dailyBucket, models: Array.from(modelSet) };
}

// ============ 型号映射表读取 ============
async function fetchModelMapping(env, spreadsheetToken) {
  const modelMappingRange = 'NYYiAs!A1:B1000';
  const modelMappingJson = await fetchSheetValuesV2(env, spreadsheetToken, modelMappingRange, { valueRenderOption: 'FormattedValue' });
  const mappingList = [];
  if (modelMappingJson && modelMappingJson.code === 0) {
    const modelValues = modelMappingJson.data?.valueRange?.values || [];
    for (let i = 1; i < modelValues.length; i++) {
      const row = modelValues[i] || [];
      const keyword = feishuCellToPlainString(row[0]);
      const model = feishuCellToPlainString(row[1]);
      if (keyword && model) {
        mappingList.push({ keyword, model });
      }
    }
  }
  return mappingList;
}

// ============ 主处理函数 ============
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

  var reqUrl = new URL(request.url);
  var wantsDebugModels = reqUrl.searchParams.get('debugModels') === '1';
  var skipCache =
    reqUrl.searchParams.get('nocache') === '1' || wantsDebugModels;

  // 检查缓存（debugModels=1 须重算，且 debug 不入库）
  var cached = await getCache(env, CACHE_KEY);
  if (cached && !skipCache) {
    return new Response(JSON.stringify({ ...cached.data, _cached: true, _updatedAt: cached.updatedAt }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  }

  try {
    const newretailSpreadsheetToken = env.FEISHU_NEWRETAIL_SPREADSHEET_TOKEN || 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';
    const modelMapping = await fetchModelMapping(env, newretailSpreadsheetToken);

    var chRange = CHANNEL_MAP_CONFIG.sheetId + '!A1:F2000';
    var chJson = await fetchSheetValuesV2(env, newretailSpreadsheetToken, chRange, { valueRenderOption: 'FormattedValue' });
    var chValues = chJson && chJson.code === 0 ? chJson.data?.valueRange?.values || [] : [];
    var channelMaps = buildChannelMaps(chValues);

    const platformResults = await fetchNewretailModelData(env, newretailSpreadsheetToken);
    const newretailBucket = aggregateGsvModelsFromPlatforms(platformResults, channelMaps, modelMapping);

    const shelfResults = await fetchShelfEcommerceData(env, modelMapping);

    console.log(
      '[model-daily-sales-trend] 京东型号清单',
      JSON.stringify([...(shelfResults.jd.models || [])].sort())
    );
    console.log(
      '[model-daily-sales-trend] 天猫型号清单',
      JSON.stringify([...(shelfResults.tmall.models || [])].sort())
    );
    console.log(
      '[model-daily-sales-trend] 四平台GSV型号清单',
      JSON.stringify(collectSortedModelKeysFromDailyBucket(newretailBucket))
    );

    // 合并所有数据源
    const mergedBucket = {};
    const allModels = new Set();

    // 合并四平台数据
    Object.keys(newretailBucket).forEach(date => {
      if (!mergedBucket[date]) mergedBucket[date] = {};
      Object.keys(newretailBucket[date]).forEach(model => {
        allModels.add(model);
        if (!mergedBucket[date][model]) mergedBucket[date][model] = { quantity: 0 };
        mergedBucket[date][model].quantity += newretailBucket[date][model].quantity;
      });
    });

    // 合并京东数据
    Object.keys(shelfResults.jd.data || {}).forEach(date => {
      if (!mergedBucket[date]) mergedBucket[date] = {};
      Object.keys(shelfResults.jd.data[date]).forEach(model => {
        allModels.add(model);
        if (!mergedBucket[date][model]) mergedBucket[date][model] = { quantity: 0 };
        mergedBucket[date][model].quantity += shelfResults.jd.data[date][model].quantity;
      });
    });

    // 合并天猫数据
    Object.keys(shelfResults.tmall.data || {}).forEach(date => {
      if (!mergedBucket[date]) mergedBucket[date] = {};
      Object.keys(shelfResults.tmall.data[date]).forEach(model => {
        allModels.add(model);
        if (!mergedBucket[date][model]) mergedBucket[date][model] = { quantity: 0 };
        mergedBucket[date][model].quantity += shelfResults.tmall.data[date][model].quantity;
      });
    });

    // 转换为折线图格式
    const sortedDates = Object.keys(mergedBucket).sort();
    const sortedModels = Array.from(allModels).sort();

    const series = {};
    sortedModels.forEach(model => {
      series[model] = {
        quantity: sortedDates.map(date => mergedBucket[date]?.[model]?.quantity || 0),
      };
    });

    const sourceSummary = {
      newretail: {
        dateRange: getDateRange(newretailBucket),
        models: countDistinctModelsInBucket(newretailBucket),
        quantityMetric: 'processPlatformOrdersGsv_order_quantity',
      },
      jd: { dateRange: getDateRange(shelfResults.jd.data || {}), models: shelfResults.jd.models?.length || 0 },
      tmall: { dateRange: getDateRange(shelfResults.tmall.data || {}), models: shelfResults.tmall.models?.length || 0 },
    };

    const payload = {
      dates: sortedDates,
      models: sortedModels,
      series: series,
      sourceSummary: sourceSummary,
      totalDays: sortedDates.length,
      totalModels: sortedModels.length,
      meta: {
        fourPlatformQuantity: '四平台（抖音/小红书/视频号/快手）GSV 路径订单件数之和，与 processPlatformOrdersGsv 一致',
        jdTmallQuantity: '京东/天猫货架表内数量列，与四平台按型号键合并为总销量',
      },
    };

    // 写入缓存（不含 debug）
    await setCache(env, CACHE_KEY, payload, CACHE_TTL_HOURS);

    if (wantsDebugModels) {
      payload.debug = {
        jdModels: [...(shelfResults.jd.models || [])].sort(),
        tmallModels: [...(shelfResults.tmall.models || [])].sort(),
        gsvModels: collectSortedModelKeysFromDailyBucket(newretailBucket),
      };
    }

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
      { error: '型号日销量趋势数据聚合失败', detail: e?.message || String(e) },
      502,
      origin
    );
  }
}

function getDateRange(bucket) {
  const dates = Object.keys(bucket);
  if (dates.length === 0) return ['', ''];
  return [dates.sort()[0], dates.sort()[dates.length - 1]];
}

export async function onRequestOptions(context) {
  var origin = resolveCorsOrigin(context.request, context.env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
