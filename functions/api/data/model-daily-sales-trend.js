import { jsonResponse, corsHeaders } from '../../_lib/http.js';
import { authenticateRequest } from '../../_lib/session.js';
import { fetchSheetValuesV2, fetchSpreadsheetSheetsV3 } from '../../_lib/feishu.js';
import { getCache, setCache } from '../../_lib/cache.js';

var CACHE_KEY = 'model-daily-sales-trend';
var CACHE_TTL_HOURS = 48;

// ============ 四平台配置（从 newretail-gmv-logic.js 复用）============
const PLATFORM_CONFIG = {
  douyin: {
    name: '抖音',
    sheetId: 'tuec5U',
    cols: { product: 2, amount: 8, quantity: 4, time: 33, status: 36, darenId: 40 }
  },
  xiaohongshu: {
    name: '小红书',
    sheetId: 'v3JEoi',
    cols: { product: 17, amount: 23, quantity: 19, time: 34, status: 1, darenId: 15 }
  },
  shipinhao: {
    name: '视频号',
    sheetId: 'LoahCg',
    cols: { product: 40, amount: 18, quantity: 49, time: 25, status: 5, darenName: 34 }
  },
  kuaishou: {
    name: '快手',
    sheetId: '7uRPyy',
    cols: { product: 25, amount: 7, quantity: 15, time: 4, status: 6, darenId: 31 }
  }
};

const CHANNEL_MAP_CONFIG = {
  sheetId: 'ghju03',
  cols: { channelName: 0, platform: 1, darenName: 3, darenId: 4 }
};

// ============ 工具函数 ============
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

function parseDateFromPlatform(value, platform) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return ymdFromExcelSerial(value);
  }
  var str = String(value).trim();
  if (!str) return null;
  var numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str) && numOnly >= 40000 && numOnly < 60000) {
    return ymdFromExcelSerial(numOnly);
  }
  // 标准日期解析
  var isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    var y = parseInt(isoMatch[1], 10);
    var m = parseInt(isoMatch[2], 10);
    var d = parseInt(isoMatch[3], 10);
    if (y && m && d) return y + '-' + pad2(m) + '-' + pad2(d);
  }
  var normalized = str.replace(/\//g, '-');
  var t = Date.parse(normalized);
  if (!isNaN(t)) {
    var dt = new Date(t);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }
  return null;
}

function parseAmount(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  var str = String(value).replace(/[¥$€,，\s]/g, '');
  var n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function parseQuantity(value) {
  if (value == null || value === '') return 1;
  if (typeof value === 'number') {
    return isNaN(value) || value <= 0 ? 1 : Math.round(value);
  }
  var str = String(value).trim();
  if (!str) return 1;
  var cleaned = str.replace(/,/g, '').replace(/，/g, '').replace(/[\s\u3000]/g, '');
  var halfWidth = cleaned.replace(/[０-９]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
  var num = parseInt(halfWidth, 10);
  return isNaN(num) || num <= 0 ? 1 : num;
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

// 处理四平台订单数据并提取型号信息
function processPlatformOrdersForModels(platformResults, modelMapping) {
  const dailyBucket = {};
  const mappingList = modelMapping || [];

  platformResults.forEach(function(result) {
    if (!result.values || result.values.length <= 1) return;

    const cfg = PLATFORM_CONFIG[result.platform];
    if (!cfg) return;

    for (let r = 1; r < result.values.length; r++) {
      const row = result.values[r] || [];
      if (row.length <= cfg.cols.amount) continue;

      // 解析日期
      const day = parseDateFromPlatform(row[cfg.cols.time], result.platform);
      if (!day) continue;

      // 解析数量和金额
      const quantity = parseQuantity(row[cfg.cols.quantity]);
      const amount = parseAmount(row[cfg.cols.amount]);

      // 解析产品名称并匹配型号
      const product = row[cfg.cols.product] || '';
      const matchedModel = matchProductToModel(product, mappingList);

      if (matchedModel) {
        if (!dailyBucket[day]) dailyBucket[day] = {};
        if (!dailyBucket[day][matchedModel]) {
          dailyBucket[day][matchedModel] = { quantity: 0, amount: 0 };
        }
        dailyBucket[day][matchedModel].quantity += quantity;
        dailyBucket[day][matchedModel].amount += amount;
      }
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

// ============ 京东/天猫数据读取 ============
async function fetchShelfEcommerceData(env) {
  const results = { jd: { data: [], dates: [], models: [] }, tmall: { data: [], dates: [], models: [] } };

  // 读取京东数据
  try {
    const jdToken = env.FEISHU_SPREADSHEET_TOKEN || 'EBwmsjjArhutvWtM2E9cLUMGnYd';
    const jdRange = env.FEISHU_SHEET_RANGE_MODEL || '0VWscb!AO1:BZ20000';
    const mainRange = env.FEISHU_SHEET_RANGE || '0VWscb!A1:H20000';

    // 读取主表的日期列(A)和型号列(AO-BZ)
    const mainResult = await fetchSheetValuesV2(env, jdToken, mainRange, { valueRenderOption: 'FormattedValue' });
    if (mainResult && mainResult.code === 0) {
      const values = mainResult.data?.valueRange?.values || [];
      results.jd = processShelfData(values, 40); // AO列是40索引
    }
  } catch (e) {
    console.error('京东数据读取失败:', e);
  }

  // 读取天猫数据
  try {
    const tmallToken = env.FEISHU_TMALL_SPREADSHEET_TOKEN || 'WkFuwdxnhio6AckVEeQcohMAnpc';
    const tmallRange = env.FEISHU_TMALL_SHEET_RANGE || '2joAvv!A1:ZZ20000';

    const tmallResult = await fetchSheetValuesV2(env, tmallToken, tmallRange, { valueRenderOption: 'FormattedValue' });
    if (tmallResult && tmallResult.code === 0) {
      const values = tmallResult.data?.valueRange?.values || [];
      results.tmall = processShelfData(values, 50); // AY列是50索引
    }
  } catch (e) {
    console.error('天猫数据读取失败:', e);
  }

  return results;
}

function processShelfData(values, modelStartCol) {
  const dailyBucket = {};
  const modelSet = new Set();

  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    if (row.length === 0) continue;

    // 解析日期（第一列）
    const dateVal = row[0];
    if (!dateVal) continue;

    let dateStr;
    if (typeof dateVal === 'number') {
      dateStr = ymdFromExcelSerial(dateVal);
    } else {
      const str = String(dateVal).trim();
      // 尝试匹配日期格式 2026/1/1 或 2026-01-01
      const m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (m) {
        dateStr = m[1] + '-' + pad2(parseInt(m[2])) + '-' + pad2(parseInt(m[3]));
      }
    }
    if (!dateStr) continue;

    if (!dailyBucket[dateStr]) dailyBucket[dateStr] = {};

    // 解析型号列（从 modelStartCol 开始，每两列为一组：数量、金额）
    for (let c = modelStartCol; c < row.length; c += 2) {
      const modelName = values[0]?.[c]; // 表头中的型号名
      if (!modelName) continue;

      const qty = parseFloat(row[c]) || 0;
      const amt = parseFloat(row[c + 1]) || 0;

      if (qty > 0 || amt > 0) {
        modelSet.add(modelName);
        if (!dailyBucket[dateStr][modelName]) {
          dailyBucket[dateStr][modelName] = { quantity: 0, amount: 0 };
        }
        dailyBucket[dateStr][modelName].quantity += qty;
        dailyBucket[dateStr][modelName].amount += amt;
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
      const keyword = String(row[0] || '').trim();
      const model = String(row[1] || '').trim();
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

  // 检查缓存
  var cached = await getCache(env, CACHE_KEY);
  if (cached && !request.url.includes('nocache=1')) {
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
    // 1. 读取四平台数据
    const newretailSpreadsheetToken = env.FEISHU_NEWRETAIL_SPREADSHEET_TOKEN || 'WNp4wbOI3ib7J7kiX2fcZf6Fn8b';
    const modelMapping = await fetchModelMapping(env, newretailSpreadsheetToken);

    const platformResults = await fetchNewretailModelData(env, newretailSpreadsheetToken);
    const newretailBucket = processPlatformOrdersForModels(platformResults, modelMapping);

    // 2. 读取京东/天猫数据
    const shelfResults = await fetchShelfEcommerceData(env);

    // 合并所有数据源
    const mergedBucket = {};
    const allModels = new Set();

    // 合并四平台数据
    Object.keys(newretailBucket).forEach(date => {
      if (!mergedBucket[date]) mergedBucket[date] = {};
      Object.keys(newretailBucket[date]).forEach(model => {
        allModels.add(model);
        if (!mergedBucket[date][model]) mergedBucket[date][model] = { quantity: 0, amount: 0 };
        mergedBucket[date][model].quantity += newretailBucket[date][model].quantity;
        mergedBucket[date][model].amount += newretailBucket[date][model].amount;
      });
    });

    // 合并京东数据
    Object.keys(shelfResults.jd.data || {}).forEach(date => {
      if (!mergedBucket[date]) mergedBucket[date] = {};
      Object.keys(shelfResults.jd.data[date]).forEach(model => {
        allModels.add(model);
        if (!mergedBucket[date][model]) mergedBucket[date][model] = { quantity: 0, amount: 0 };
        mergedBucket[date][model].quantity += shelfResults.jd.data[date][model].quantity;
        mergedBucket[date][model].amount += shelfResults.jd.data[date][model].amount;
      });
    });

    // 合并天猫数据
    Object.keys(shelfResults.tmall.data || {}).forEach(date => {
      if (!mergedBucket[date]) mergedBucket[date] = {};
      Object.keys(shelfResults.tmall.data[date]).forEach(model => {
        allModels.add(model);
        if (!mergedBucket[date][model]) mergedBucket[date][model] = { quantity: 0, amount: 0 };
        mergedBucket[date][model].quantity += shelfResults.tmall.data[date][model].quantity;
        mergedBucket[date][model].amount += shelfResults.tmall.data[date][model].amount;
      });
    });

    // 转换为折线图格式
    const sortedDates = Object.keys(mergedBucket).sort();
    const sortedModels = Array.from(allModels).sort();

    const series = {};
    sortedModels.forEach(model => {
      series[model] = {
        quantity: sortedDates.map(date => mergedBucket[date]?.[model]?.quantity || 0),
        amount: sortedDates.map(date => mergedBucket[date]?.[model]?.amount || 0)
      };
    });

    // 统计信息
    const sourceSummary = {
      newretail: { dateRange: getDateRange(newretailBucket), models: Object.keys(newretailBucket).length > 0 ? Object.keys(Object.values(newretailBucket)[0] || {}).length : 0 },
      jd: { dateRange: getDateRange(shelfResults.jd.data || {}), models: shelfResults.jd.models?.length || 0 },
      tmall: { dateRange: getDateRange(shelfResults.tmall.data || {}), models: shelfResults.tmall.models?.length || 0 }
    };

    const payload = {
      dates: sortedDates,
      models: sortedModels,
      series: series,
      sourceSummary: sourceSummary,
      totalDays: sortedDates.length,
      totalModels: sortedModels.length
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
  var origin = context.request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
