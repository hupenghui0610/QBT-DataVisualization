// ==================== 新零售GMV图表 - 完整计算逻辑 ====================
// 基于实际飞书表格数据格式

/** 四平台配置 */
const PLATFORM_CONFIG = {
  douyin: {
    name: '抖音',
    sheetId: 'tuec5U',
    cols: { product: 2, amount: 8, time: 33, status: 36, darenId: 40 }
  },
  xiaohongshu: {
    name: '小红书',
    sheetId: 'v3JEoi',
    cols: { product: 17, amount: 23, time: 34, status: 1, darenId: 15 }
  },
  shipinhao: {
    name: '视频号',
    sheetId: 'LoahCg',
    cols: { product: 40, amount: 18, time: 25, status: 5, darenName: 34 }
  },
  kuaishou: {
    name: '快手',
    sheetId: '7uRPyy',
    cols: { product: 25, amount: 7, time: 4, status: 6, darenId: 31 }
  }
};

/** 渠道映射表配置 */
const CHANNEL_MAP_CONFIG = {
  sheetId: 'ghju03',
  cols: { channelName: 0, platform: 1, darenName: 3, darenId: 4 }
};

/** ==================== 日期解析规则 ====================
 * 处理多种格式:
 * - Excel序列号: 46099.4708912037 (小红书/视频号/快手)
 * - 空字符串/对象: "" (抖音某些行)
 * - 标准日期字符串: "2026/3/18 11:18:05"
 */
function parseDateFromPlatform(value, platform) {
  if (value == null || value === '') return null;

  // 如果是数字，尝试Excel序列号
  if (typeof value === 'number') {
    return parseExcelSerial(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  // 尝试作为数字字符串解析 (Excel序列号)
  const numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str) && numOnly >= 40000 && numOnly < 60000) {
    return parseExcelSerial(numOnly);
  }

  // 标准日期解析
  return parseStandardDate(str);
}

/** 解析Excel序列号 (如 46099.4708912037 → 2026-03-18) */
function parseExcelSerial(serial) {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  if (isNaN(d.getTime())) return null;
  return formatDate(d);
}

/** 标准日期解析 */
function parseStandardDate(str) {
  // ISO 格式: 2026-01-01T22:18:14
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return formatDate(d);
  }

  // 统一替换分隔符为 -，然后解析
  const normalized = str.replace(/\//g, '-');
  const datePart = normalized.split(/[\sT]/)[0];

  const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return formatDate(d);
    }
  }

  // Date.parse兜底
  const timestamp = Date.parse(normalized);
  if (!isNaN(timestamp)) {
    return formatDate(new Date(timestamp));
  }

  return null;
}

function formatDate(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** ==================== 金额解析 ==================== */
function parseAmount(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  // 去掉货币符号(¥,$,€等)、逗号、空格
  const str = String(value).replace(/[¥$€,，\s]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

/** ==================== 达人ID/昵称解析 ==================== */
function parseDarenId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return ''; // 快手可能是空对象
  const str = String(value).trim();
  return str === '-' ? '' : str; // 视频号可能是 "-"
}

/** ==================== 构建渠道映射索引 ====================
 * 渠道映射表: A=渠道名, B=平台, D=视频号昵称, E=达人ID
 */
function buildChannelMaps(chValues) {
  // 达人ID → {渠道名称, 平台}
  const darenIdToChannel = {};
  // 视频号专用: 达人昵称 → 渠道名称
  const shipinhaoNameToChannel = {};
  const channelList = []; // 调试：记录所有渠道名

  for (let r = 1; r < chValues.length; r++) { // skip header
    const row = chValues[r] || [];
    const channelName = String(row[0] || '').trim();
    const platform = String(row[1] || '').trim();
    const darenName = String(row[3] || '').trim();
    const darenId = String(row[4] || '').trim();

    if (!channelName) continue;
    channelList.push(channelName);

    // 视频号: 用昵称索引
    if (platform === '视频号' && darenName) {
      shipinhaoNameToChannel[darenName] = channelName;
    }

    // 其他平台: 用达人ID索引
    if (darenId) {
      darenIdToChannel[darenId] = channelName;
    }
  }

  // 调试：检查上海标竿是否存在
  const hasShanghaiBiaogan = channelList.some(c => c.includes('上海标竿'));
  console.log('[渠道映射] 总渠道数:', channelList.length, '包含上海标竿:', hasShanghaiBiaogan);
  if (hasShanghaiBiaogan) {
    console.log('[渠道映射] 上海标竿相关渠道:', channelList.filter(c => c.includes('上海标竿')));
  }

  return { darenIdToChannel, shipinhaoNameToChannel };
}

/** ==================== 订单分类 ====================
 * 规则:
 * - 直营开头 → 跳过(忽略)
 * - DP开头 → DP类
 * - 直对开头 → 直对类
 * - 其他(包括未匹配到渠道的) → 服务商类
 */
function classifyOrder(darenId, darenName, platform, channelMaps) {
  let channelName = null;

  if (platform === 'shipinhao') {
    // 视频号: 用达人昵称匹配
    if (darenName && channelMaps.shipinhaoNameToChannel[darenName]) {
      channelName = channelMaps.shipinhaoNameToChannel[darenName];
    }
  } else {
    // 其他: 用达人ID匹配
    if (darenId && channelMaps.darenIdToChannel[darenId]) {
      channelName = channelMaps.darenIdToChannel[darenId];
    }
  }

  // 未匹配到渠道 → 算服务商类
  if (!channelName) {
    // 调试：记录未匹配的达人ID（只记录前20个）
    if (darenId) {
      if (typeof globalThis.__unmatchedDarenIds === 'undefined') {
        globalThis.__unmatchedDarenIds = new Set();
      }
      if (globalThis.__unmatchedDarenIds.size < 20) {
        globalThis.__unmatchedDarenIds.add(`${platform}:${darenId}`);
      }
    }
    return { category: 'fuwu', channel: '未知' };
  }

  // 1. 直营开头 → 跳过
  if (channelName.indexOf('直营') === 0) {
    return { category: null, channel: channelName, skip: true };
  }

  // 1b. 自营开头 → 跳过
  if (channelName.indexOf('自营') === 0) {
    return { category: null, channel: channelName, skip: true };
  }

  // 2. DP开头 → DP类
  if (channelName.indexOf('DP') === 0) {
    return { category: 'dp', channel: channelName, skip: false };
  }

  // 3. 直对开头 → 直对类
  if (channelName.indexOf('直对') === 0) {
    return { category: 'zhidui', channel: channelName, skip: false };
  }

  // 4. 其他 → 服务商类
  return { category: 'fuwu', channel: channelName, skip: false };
}

/** ==================== 处理单个平台订单 - GSV版本（剔除关闭/取消订单） ==================== */
function processPlatformOrdersGsv(values, platform, channelMaps) {
  const cfg = PLATFORM_CONFIG[platform];
  const orders = [];
  let skipCount = 0;
  let debugLog = []; // 调试：记录前10个被跳过的订单

  for (let r = 1; r < values.length; r++) { // skip header
    const row = values[r] || [];

    // 检查必要字段存在
    if (row.length <= cfg.cols.amount) continue;

    // 1. 剔除支付完成时间为空的订单
    const timeValue = row[cfg.cols.time];
    if (timeValue == null || timeValue === '' ||
        (typeof timeValue === 'object' && Object.keys(timeValue).length === 0)) {
      continue;
    }

    // 2. 解析日期 (平台特定规则)
    const day = parseDateFromPlatform(timeValue, platform);
    if (!day) continue;

    // 3. 解析金额
    const amount = parseAmount(row[cfg.cols.amount]);
    if (amount <= 0) continue;

    // 4. 检查订单状态 - GSV：各平台剔除不同状态
    const status = String(row[cfg.cols.status] || '').trim();
    let shouldSkip = false;

    // 根据平台剔除特定状态
    if (platform === 'douyin') {
      // 抖音：剔除已关闭
      if (status === '已关闭') shouldSkip = true;
    } else if (platform === 'xiaohongshu') {
      // 小红书：剔除已取消
      if (status === '已取消') shouldSkip = true;
    } else if (platform === 'shipinhao') {
      // 视频号：剔除已取消
      if (status === '已取消') shouldSkip = true;
    } else if (platform === 'kuaishou') {
      // 快手：剔除交易关闭、已关闭
      if (status === '交易关闭' || status === '已关闭') shouldSkip = true;
    }

    if (shouldSkip) {
      skipCount++;
      continue;
    }

    // 5. 解析达人ID/昵称
    let darenId = '';
    let darenName = '';
    if (cfg.cols.darenId != null) {
      darenId = parseDarenId(row[cfg.cols.darenId]);
    }
    if (cfg.cols.darenName != null) {
      darenName = parseDarenId(row[cfg.cols.darenName]);
    }

    // 5b. 剔除达人ID为"0"或空值的订单
    if (darenId === '0' || darenId === '0.0' || (!darenId && !darenName)) {
      skipCount++;
      continue;
    }

    // 6. 分类
    const classification = classifyOrder(darenId, darenName, platform, channelMaps);
    if (classification.skip) continue;

    // 7. 特殊规则：达人ID 284088526715758 只计算4月1日及之后的订单
    if (darenId === '284088526715758' && day < '2026-04-01') {
      continue;
    }

    orders.push({
      date: day,
      platform: platform,
      amount: amount,
      category: classification.category,
      channel: classification.channel,
      darenId: darenName || darenId || '未知',
      product: row[cfg.cols.product] || ''
    });
  }

  // 调试输出
  console.log(`[${platform}] GSV处理: 总${values.length-1}条, 跳过${skipCount}条, 保留${orders.length}条`);

  return { orders, skipCount, debugSkipped: debugLog };
}

/** ==================== 处理单个平台订单 - GMV版本 ==================== */
function processPlatformOrders(values, platform, channelMaps) {
  const cfg = PLATFORM_CONFIG[platform];
  const orders = [];
  let stats = {
    totalRows: values.length - 1,
    hasTime: 0,       // 有支付时间
    hasAmount: 0,     // 有金额
    hasDate: 0,       // 日期解析成功
    closedSkipped: 0, // 已关闭被跳过
    classified: 0,    // 分类完成
    ziyingSkipped: 0, // 直营被跳过
    noChannel: 0,     // 未映射出渠道
    final: 0          // 最终保留
  };

  for (let r = 1; r < values.length; r++) { // skip header
    const row = values[r] || [];

    // 检查必要字段存在
    if (row.length <= cfg.cols.amount) continue;

    // 1. 剔除支付完成时间为空的订单
    const timeValue = row[cfg.cols.time];
    if (timeValue == null || timeValue === '' ||
        (typeof timeValue === 'object' && Object.keys(timeValue).length === 0)) {
      continue;
    }
    stats.hasTime++;

    // 2. 解析日期 (平台特定规则)
    const day = parseDateFromPlatform(timeValue, platform);
    if (!day) continue;
    stats.hasDate++;

    // 3. 解析金额
    const amount = parseAmount(row[cfg.cols.amount]);
    if (amount <= 0) continue;
    stats.hasAmount++;

    // 4. 检查订单状态 - GMV不管状态，只剔除状态为""的
    const status = String(row[cfg.cols.status] || '').trim();
    // GMV计算所有有支付时间的订单，包括"已关闭"
    // 只有状态完全为空才跳过（这行数据可能有问题）
    if (!status) {
      continue;
    }

    // 5. 解析达人ID/昵称
    let darenId = '';
    let darenName = '';
    if (cfg.cols.darenId != null) {
      darenId = parseDarenId(row[cfg.cols.darenId]);
    }
    if (cfg.cols.darenName != null) {
      darenName = parseDarenId(row[cfg.cols.darenName]);
    }

    // 5b. 剔除达人ID为"0"或空值的订单
    if (darenId === '0' || darenId === '0.0' || (!darenId && !darenName)) {
      continue;
    }

    // 6. 分类
    const classification = classifyOrder(darenId, darenName, platform, channelMaps);
    stats.classified++;

    if (classification.skip) {
      stats.ziyingSkipped++;
      continue;
    }

    if (!classification.channel || classification.channel === '未知') {
      stats.noChannel++;
    }

    // 7. 特殊规则：达人ID 284088526715758 只计算4月1日及之后的订单
    if (darenId === '284088526715758' && day < '2026-04-01') {
      continue;
    }

    orders.push({
      date: day,
      platform: platform,
      amount: amount,
      category: classification.category,
      channel: classification.channel,
      darenId: darenName || darenId || '未知',
      product: row[cfg.cols.product] || ''
    });
    stats.final++;
  }

  // 调试输出
  if (platform === 'xiaohongshu' || platform === 'douyin') {
    console.log(`[${platform}] GMV处理: 总${stats.totalRows}行, 有支付时间${stats.hasTime}, 保留${stats.final}`);
  }

  return { orders, stats };
}

/** ==================== 按日期和类别汇总 ====================
 * 输出: 每天一条记录，包含DP、直对、服务商三类GMV
 */
function aggregateByDayAndCategory(allOrders) {
  const bucket = {};

  allOrders.forEach(order => {
    const day = order.date;

    if (!bucket[day]) {
      bucket[day] = { dp: 0, zhidui: 0, fuwu: 0 };
    }

    bucket[day][order.category] += order.amount;
  });

  return Object.keys(bucket).sort().map(day => {
    const b = bucket[day];
    return {
      date: day,
      dp: Number((b.dp / 10000).toFixed(2)),
      zhidui: Number((b.zhidui / 10000).toFixed(2)),
      fuwu: Number((b.fuwu / 10000).toFixed(2)),
      total: Number(((b.dp + b.zhidui + b.fuwu) / 10000).toFixed(2))
    };
  });
}

/** ==================== 按日期和渠道汇总（服务商订单） ====================
 * 输出: 每天每条渠道一条记录，用于服务商GMV图表
 */
function aggregateFuwuByChannel(allOrders) {
  const bucket = {};
  const channels = new Set();

  allOrders.forEach(order => {
    // 只处理服务商订单
    if (order.category !== 'fuwu') return;

    const day = order.date;
    const channel = order.channel || '未知';
    channels.add(channel);

    if (!bucket[day]) {
      bucket[day] = {};
    }
    if (!bucket[day][channel]) {
      bucket[day][channel] = 0;
    }
    bucket[day][channel] += order.amount;
  });

  // 转换为数组格式
  const sortedDays = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();

  return {
    days: sortedDays,
    channels: sortedChannels,
    data: sortedDays.map(day => {
      const dayData = { date: day };
      sortedChannels.forEach(channel => {
        const amount = bucket[day][channel] || 0;
        dayData[channel] = Number((amount / 10000).toFixed(2));
      });
      return dayData;
    })
  };
}

/** ==================== 月度聚合（服务商按渠道） ==================== */
function aggregateFuwuByChannelMonthly(dailyPoints) {
  const bucket = {};
  const channels = new Set();

  dailyPoints.forEach(p => {
    const month = p.date.substring(0, 7); // YYYY-MM
    Object.keys(p).forEach(key => {
      if (key === 'date') return;
      channels.add(key);
      if (!bucket[month]) {
        bucket[month] = {};
      }
      if (!bucket[month][key]) {
        bucket[month][key] = 0;
      }
      bucket[month][key] += p[key];
    });
  });

  const sortedMonths = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();

  return {
    days: sortedMonths,
    channels: sortedChannels,
    data: sortedMonths.map(month => {
      const monthData = { date: month };
      sortedChannels.forEach(channel => {
        monthData[channel] = Number((bucket[month][channel] || 0).toFixed(2));
      });
      return monthData;
    })
  };
}

/** ==================== 周度聚合 ==================== */
function weekStartFromDateStr(ds) {
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const wd = d.getDay();
  const diff = wd === 0 ? 6 : wd - 1;
  d.setDate(d.getDate() - diff);
  return formatDate(d);
}

function aggregateByWeek(dailyPoints) {
  const bucket = {};

  dailyPoints.forEach(p => {
    const ws = weekStartFromDateStr(p.date);
    if (!ws) return;

    if (!bucket[ws]) {
      bucket[ws] = { dp: 0, zhidui: 0, fuwu: 0 };
    }

    bucket[ws].dp += p.dp;
    bucket[ws].zhidui += p.zhidui;
    bucket[ws].fuwu += p.fuwu;
  });

  return Object.keys(bucket).sort().map(ws => {
    const b = bucket[ws];
    return {
      date: ws,
      dp: Number(b.dp.toFixed(2)),
      zhidui: Number(b.zhidui.toFixed(2)),
      fuwu: Number(b.fuwu.toFixed(2)),
      total: Number((b.dp + b.zhidui + b.fuwu).toFixed(2))
    };
  });
}

/** ==================== 月度聚合 ==================== */
function monthFromDateStr(ds) {
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return m[1] + '-' + m[2];
}

function aggregateByMonth(dailyPoints) {
  const bucket = {};

  dailyPoints.forEach(p => {
    const month = monthFromDateStr(p.date);
    if (!month) return;

    if (!bucket[month]) {
      bucket[month] = { dp: 0, zhidui: 0, fuwu: 0 };
    }

    bucket[month].dp += p.dp;
    bucket[month].zhidui += p.zhidui;
    bucket[month].fuwu += p.fuwu;
  });

  return Object.keys(bucket).sort().map(m => {
    const b = bucket[m];
    return {
      date: m,
      dp: Number(b.dp.toFixed(2)),
      zhidui: Number(b.zhidui.toFixed(2)),
      fuwu: Number(b.fuwu.toFixed(2)),
      total: Number((b.dp + b.zhidui + b.fuwu).toFixed(2))
    };
  });
}

/** ==================== 按达人聚合DP类月度数据 ====================
 * 输出: 每个DP达人每个月的GMV和GSV
 */
function aggregateDpByDarenMonthly(allOrdersGmv, allOrdersGsv) {
  const gmvBucket = {};
  const gsvBucket = {};
  const darenInfo = {}; // 存储达人ID -> {渠道, 平台}

  // 处理GMV数据 - 只统计DP类
  allOrdersGmv.forEach(order => {
    if (order.category !== 'dp') return;
    const month = monthFromDateStr(order.date);
    if (!month) return;
    const darenKey = String(order.darenId || '未知');
    const key = darenKey + ':' + month;

    if (!gmvBucket[key]) {
      gmvBucket[key] = 0;
    }
    gmvBucket[key] += order.amount;

    // 记录达人信息（渠道和平台）
    if (!darenInfo[key]) {
      darenInfo[key] = { channel: order.channel || '未知', platform: order.platform };
    }
  });

  // 处理GSV数据 - 只统计DP类
  allOrdersGsv.forEach(order => {
    if (order.category !== 'dp') return;
    const month = monthFromDateStr(order.date);
    if (!month) return;
    const darenKey = String(order.darenId || '未知');
    const key = darenKey + ':' + month;

    if (!gsvBucket[key]) {
      gsvBucket[key] = 0;
    }
    gsvBucket[key] += order.amount;
  });

  // 合并结果
  const result = [];
  Object.keys(gmvBucket).sort().forEach(key => {
    const [darenName, month] = key.split(':');
    const info = darenInfo[key] || { channel: '未知', platform: '未知' };
    result.push({
      darenName: darenName,
      channel: info.channel,
      platform: info.platform,
      month: month,
      gmv: Number((gmvBucket[key] / 10000).toFixed(2)),
      gsv: Number(((gsvBucket[key] || 0) / 10000).toFixed(2))
    });
  });

  return result;
}

/** ==================== 按产品型号聚合分布数据（按日）====================
 * 根据产品型号映射表聚合订单数据，返回按日的型号分布
 * 规则：
 * 1. 忽略大小写匹配
 * 2. V2特殊处理：包含"V2"且不包含其他任何关键词时才匹配V2
 * 3. 其他关键词按顺序匹配第一个包含的
 * 4. 相同型号名称的数据会合并（不同关键词映射到相同型号时）
 */
function aggregateModelDistributionByDay(allOrders, modelMapping) {
  const dailyBucket = {};

  const mappingList = modelMapping || [];

  allOrders.forEach(order => {
    if (!order || !order.product || !order.date) return;
    const productLower = String(order.product).toLowerCase();
    let matchedModelName = null;

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
          if (mapping.keyword === 'V2') {
            matchedModelName = mapping.model;
            break;
          }
        }
      }
    }

    // 其他关键词匹配
    if (!matchedModelName) {
      for (const mapping of mappingList) {
        const kw = mapping.keyword;
        if (kw !== 'V2' && productLower.includes(kw.toLowerCase())) {
          matchedModelName = mapping.model;
          break;
        }
      }
    }

    // 如果匹配到型号，按型号名称累加金额（自动合并相同型号）
    if (matchedModelName) {
      const day = order.date;
      if (!dailyBucket[day]) {
        dailyBucket[day] = {};
      }
      if (!dailyBucket[day][matchedModelName]) {
        dailyBucket[day][matchedModelName] = 0;
      }
      dailyBucket[day][matchedModelName] += order.amount;
    }
  });

  // 转换为数组格式
  const result = [];
  Object.keys(dailyBucket).sort().forEach(day => {
    const dayData = { date: day };
    Object.keys(dailyBucket[day]).forEach(modelName => {
      dayData[modelName] = Number((dailyBucket[day][modelName] / 10000).toFixed(2));
    });
    result.push(dayData);
  });

  return {
    daily: result
  };
}

// ==================== 导出 ====================
export {
  PLATFORM_CONFIG,
  CHANNEL_MAP_CONFIG,
  parseDateFromPlatform,
  parseAmount,
  parseDarenId,
  buildChannelMaps,
  classifyOrder,
  processPlatformOrders,
  processPlatformOrdersGsv,
  aggregateByDayAndCategory,
  aggregateByWeek,
  aggregateByMonth,
  aggregateFuwuByChannel,
  aggregateFuwuByChannelMonthly,
  aggregateDpByDarenMonthly,
  aggregateModelDistributionByDay,
  parseExcelSerial
};
