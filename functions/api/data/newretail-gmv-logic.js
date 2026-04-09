// ==================== 新零售GMV图表 - 完整计算逻辑 ====================
// 基于实际飞书表格数据格式

/** 四平台配置 */
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

/** ==================== 商品数量解析 ==================== */
function parseQuantity(value) {
  if (value == null || value === '') return 1; // 默认为1
  if (typeof value === 'number') {
    return isNaN(value) || value <= 0 ? 1 : Math.round(value);
  }
  // 处理字符串格式（包括带千分位、全角数字等）
  const str = String(value).trim();
  if (!str) return 1;
  // 移除千分位逗号、全角空格、首尾空格
  const cleaned = str.replace(/,/g, '').replace(/，/g, '').replace(/[\s\u3000]/g, '');
  // 转换全角数字为半角
  const halfWidth = cleaned.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const num = parseInt(halfWidth, 10);
  return isNaN(num) || num <= 0 ? 1 : num;
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
function classifyOrder(darenId, darenName, platform, channelMaps, amount, isGsv = false) {
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
    // 调试：记录未匹配的达人ID及其金额
    if (darenId && amount > 0) {
      const key = `${platform}:${darenId}`;

      // 初始化全局统计对象
      if (typeof globalThis.__unmatchedDarenIds === 'undefined') {
        globalThis.__unmatchedDarenIds = new Set();
      }
      if (typeof globalThis.__unmatchedDarenStats === 'undefined') {
        globalThis.__unmatchedDarenStats = {};
      }

      // 添加到Set（只记录前50个）
      if (globalThis.__unmatchedDarenIds.size < 50) {
        globalThis.__unmatchedDarenIds.add(key);
      }

      // 统计金额（分GMV和GSV）
      if (!globalThis.__unmatchedDarenStats[key]) {
        globalThis.__unmatchedDarenStats[key] = {
          platform: platform,
          darenId: darenId,
          gmv: 0,
          gsv: 0,
          count: 0
        };
      }
      globalThis.__unmatchedDarenStats[key].count++;
      if (isGsv) {
        globalThis.__unmatchedDarenStats[key].gsv += amount;
      } else {
        globalThis.__unmatchedDarenStats[key].gmv += amount;
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

    // 3b. 解析商品数量（如果列存在）
    let quantity = 1;
    if (cfg.cols.quantity != null && row.length > cfg.cols.quantity) {
      quantity = parseQuantity(row[cfg.cols.quantity]);
    }

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

    // 6. 分类 - 传入金额用于统计未匹配的订单
    const classification = classifyOrder(darenId, darenName, platform, channelMaps, amount, true);
    if (classification.skip) continue;

    // 7. 特殊规则：达人ID 284088526715758 只计算4月1日及之后的订单
    if (darenId === '284088526715758' && day < '2026-04-01') {
      continue;
    }

    orders.push({
      date: day,
      platform: platform,
      amount: amount,
      quantity: quantity,
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

    // 3b. 解析商品数量（如果列存在）
    let quantity = 1;
    if (cfg.cols.quantity != null && row.length > cfg.cols.quantity) {
      quantity = parseQuantity(row[cfg.cols.quantity]);
    }

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

    // 6. 分类 - 传入金额用于统计未匹配的订单
    const classification = classifyOrder(darenId, darenName, platform, channelMaps, amount, false);
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
      quantity: quantity,
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

    // 过滤掉"未知"渠道
    if (channel === '未知') return;

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

/** ==================== 周度聚合（服务商按渠道） ==================== */
function aggregateFuwuByChannelWeekly(dailyPoints) {
  const bucket = {};
  const channels = new Set();

  dailyPoints.forEach(p => {
    const week = weekStartFromDateStr(p.date);
    if (!week) return;
    Object.keys(p).forEach(key => {
      if (key === 'date') return;
      channels.add(key);
      if (!bucket[week]) {
        bucket[week] = {};
      }
      if (!bucket[week][key]) {
        bucket[week][key] = 0;
      }
      bucket[week][key] += p[key];
    });
  });

  const sortedWeeks = Object.keys(bucket).sort();
  const sortedChannels = Array.from(channels).sort();

  return {
    days: sortedWeeks,
    channels: sortedChannels,
    data: sortedWeeks.map(week => {
      const weekData = { date: week };
      sortedChannels.forEach(channel => {
        weekData[channel] = Number((bucket[week][channel] || 0).toFixed(2));
      });
      return weekData;
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
  const unmatchedProducts = new Set();

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

    // 如果匹配到型号，按型号名称累加金额和数量（自动合并相同型号）
    if (matchedModelName) {
      const day = order.date;
      if (!dailyBucket[day]) {
        dailyBucket[day] = {};
      }
      if (!dailyBucket[day][matchedModelName]) {
        dailyBucket[day][matchedModelName] = { amount: 0, quantity: 0 };
      }
      dailyBucket[day][matchedModelName].amount += order.amount;
      dailyBucket[day][matchedModelName].quantity += (order.quantity || 1);
    } else {
      // 记录未匹配的产品名称
      unmatchedProducts.add(order.product);
    }
  });

  // 输出未匹配的产品名称
  if (unmatchedProducts.size > 0) {
    console.log('=== 未匹配到产品型号的商品名称 ===');
    console.log('未匹配数量:', unmatchedProducts.size);
    console.log('未匹配列表:', Array.from(unmatchedProducts).sort());
  }

  // 转换为数组格式
  const result = [];
  Object.keys(dailyBucket).sort().forEach(day => {
    const dayData = { date: day };
    Object.keys(dailyBucket[day]).forEach(modelName => {
      // 存储金额（万元）和数量
      dayData[modelName] = {
        amount: Number((dailyBucket[day][modelName].amount / 10000).toFixed(2)),
        quantity: dailyBucket[day][modelName].quantity
      };
    });
    result.push(dayData);
  });

  return {
    daily: result,
    unmatchedProducts: Array.from(unmatchedProducts).sort()
  };
}

/**
 * 按筛选条件聚合型号分布数据（支持按渠道名称筛选）
 * @param {Array} allOrders - 订单列表
 * @param {Array} modelMapping - 型号映射表
 * @param {Function} filterFn - 过滤函数，接收order返回boolean
 * @returns {Object} { daily: [...], unmatchedProducts: [...] }
 */
function aggregateModelDistributionByDayFiltered(allOrders, modelMapping, filterFn) {
  const dailyBucket = {};
  const mappingList = modelMapping || [];
  const unmatchedProducts = new Set();

  allOrders.forEach(order => {
    // 先应用过滤函数
    if (!filterFn(order)) return;
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

    // 如果匹配到型号，按型号名称累加金额和数量
    if (matchedModelName) {
      const day = order.date;
      if (!dailyBucket[day]) {
        dailyBucket[day] = {};
      }
      if (!dailyBucket[day][matchedModelName]) {
        dailyBucket[day][matchedModelName] = { amount: 0, quantity: 0 };
      }
      dailyBucket[day][matchedModelName].amount += order.amount;
      dailyBucket[day][matchedModelName].quantity += (order.quantity || 1);
    } else {
      unmatchedProducts.add(order.product);
    }
  });

  // 转换为数组格式
  const result = [];
  Object.keys(dailyBucket).sort().forEach(day => {
    const dayData = { date: day };
    Object.keys(dailyBucket[day]).forEach(modelName => {
      dayData[modelName] = {
        amount: Number((dailyBucket[day][modelName].amount / 10000).toFixed(2)),
        quantity: dailyBucket[day][modelName].quantity
      };
    });
    result.push(dayData);
  });

  return {
    daily: result,
    unmatchedProducts: Array.from(unmatchedProducts).sort()
  };
}

/**
 * 按达人昵称分别聚合型号分布数据
 * 用于达人型号分布-GSV图表的筛选功能
 * @param {Array} allOrders - 订单数据
 * @param {Array} modelMapping - 型号映射表
 * @param {Function} filterFn - 过滤函数（如直对+服务商）
 * @param {Array} expectedDarenList - 预期的达人昵称列表（从渠道映射表获取）
 * @param {Object} darenIdToDarenNameMap - 达人ID -> 达人昵称的映射（非视频号平台）
 * @param {Object} shipinhaoNameToDarenNameMap - 视频号达人昵称 -> 达人昵称的映射（视频号）
 * @returns {Object} - { byDaren: {达人昵称: {daily: [...]}}, darenList: [{name, id}] }
 */
function aggregateModelDistributionByDaren(allOrders, modelMapping, filterFn, expectedDarenList, darenIdToDarenNameMap, shipinhaoNameToDarenNameMap) {
  const byDaren = {}; // 按达人分组的型号分布数据
  const darenInfoMap = {}; // 达人信息映射（昵称->{id, platforms:Set, totalAmount}）
  const mappingList = modelMapping || [];
  const darenIdMap = darenIdToDarenNameMap || {};
  const shipinhaoMap = shipinhaoNameToDarenNameMap || {};

  // 初始化所有预期的达人（即使暂时没有订单数据）
  if (expectedDarenList && expectedDarenList.length > 0) {
    expectedDarenList.forEach(darenName => {
      if (darenName && !byDaren[darenName]) {
        byDaren[darenName] = {};
        darenInfoMap[darenName] = ''; // ID未知，设为空
      }
    });
  }

  allOrders.forEach(order => {
    // 应用过滤函数（如只保留直对+服务商）
    if (!filterFn(order)) return;
    if (!order || !order.product || !order.date) return;

    // 获取达人昵称：
    // - 视频号：通过 shipinhaoNameToDarenNameMap 查找
    // - 其他平台：通过 darenIdToDarenNameMap 查找（用 order.darenId）
    let darenName = '';
    if (order.platform === 'shipinhao') {
      // 视频号：order.darenId 存储的是达人昵称本身，直接用于查找
      const shipinhaoName = order.darenId || '';
      darenName = shipinhaoMap[shipinhaoName] || shipinhaoName;
    } else {
      // 其他平台：通过达人ID查找昵称
      const darenId = order.darenId || '';
      darenName = darenIdMap[darenId] || '';
    }

    // 如果无法获取达人昵称，跳过此订单
    if (!darenName) return;

    // 记录达人信息（包括平台和金额）
    if (!darenInfoMap[darenName]) {
      darenInfoMap[darenName] = { id: order.darenId || '', platforms: new Set(), totalAmount: 0 };
    }
    darenInfoMap[darenName].platforms.add(order.platform);
    darenInfoMap[darenName].totalAmount += order.amount;

    // 初始化该达人的数据桶
    if (!byDaren[darenName]) {
      byDaren[darenName] = {};
    }

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

    // 如果匹配到型号，累加数据
    if (matchedModelName) {
      const day = order.date;
      if (!byDaren[darenName][day]) {
        byDaren[darenName][day] = {};
      }
      if (!byDaren[darenName][day][matchedModelName]) {
        byDaren[darenName][day][matchedModelName] = { amount: 0, quantity: 0 };
      }
      byDaren[darenName][day][matchedModelName].amount += order.amount;
      byDaren[darenName][day][matchedModelName].quantity += (order.quantity || 1);
    }
  });

  // 转换数据格式
  const result = {};
  Object.keys(byDaren).forEach(darenName => {
    const dailyBucket = byDaren[darenName];
    const dailyArray = [];
    Object.keys(dailyBucket).sort().forEach(day => {
      const dayData = { date: day };
      Object.keys(dailyBucket[day]).forEach(modelName => {
        dayData[modelName] = {
          amount: Number((dailyBucket[day][modelName].amount / 10000).toFixed(2)),
          quantity: dailyBucket[day][modelName].quantity
        };
      });
      dailyArray.push(dayData);
    });
    result[darenName] = { daily: dailyArray };
  });

  // 生成达人列表（按昵称排序）- 使用预期的达人列表顺序
  let darenNames = expectedDarenList && expectedDarenList.length > 0
    ? expectedDarenList.filter(name => byDaren[name] !== undefined)
    : Object.keys(darenInfoMap).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  // 添加不在预期列表中但有数据的达人
  Object.keys(byDaren).forEach(name => {
    if (!darenNames.includes(name)) {
      darenNames.push(name);
    }
  });

  const darenList = darenNames
    .map(name => {
      const info = darenInfoMap[name] || { id: '', platforms: new Set(), totalAmount: 0 };
      return {
        name,
        id: info.id || '',
        platforms: Array.from(info.platforms || []),
        totalAmount: info.totalAmount || 0
      };
    })
    .filter(item => item.totalAmount > 0) // 过滤掉0金额的达人
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return { byDaren: result, darenList };
}

/** ==================== 按日期和类别计算退款率 ====================
 * 退款率 = 1 - GSV / GMV
 * 输入: GMV日度数据 和 GSV日度数据
 * 输出: 每天的退款率（dp、zhidui、fuwu三类）
 */
function aggregateRefundRateByDayAndCategory(dailyPointsGmv, dailyPointsGsv) {
  // 构建GMV数据映射
  const gmvMap = {};
  dailyPointsGmv.forEach(p => {
    gmvMap[p.date] = { dp: p.dp || 0, zhidui: p.zhidui || 0, fuwu: p.fuwu || 0 };
  });

  // 计算每日退款率
  return dailyPointsGsv.map(p => {
    const gmv = gmvMap[p.date] || { dp: 0, zhidui: 0, fuwu: 0 };
    const rate = { date: p.date };

    // 计算各类退款率（退款率 = 1 - GSV/GMV），GMV为0时返回null
    rate.dp = gmv.dp > 0 ? Number((1 - p.dp / gmv.dp).toFixed(4)) : null;
    rate.zhidui = gmv.zhidui > 0 ? Number((1 - p.zhidui / gmv.zhidui).toFixed(4)) : null;
    rate.fuwu = gmv.fuwu > 0 ? Number((1 - p.fuwu / gmv.fuwu).toFixed(4)) : null;

    // 总体退款率（退款率 = 1 - 总GSV/总GMV）
    const totalGmv = gmv.dp + gmv.zhidui + gmv.fuwu;
    const totalGsv = p.dp + p.zhidui + p.fuwu;
    rate.total = totalGmv > 0 ? Number((1 - totalGsv / totalGmv).toFixed(4)) : null;

    return rate;
  });
}

/** ==================== 周度退款率聚合 ====================
 * 周度退款率 = 1 - 周度GSV总和 / 周度GMV总和
 */
function aggregateRefundRateByWeek(dailyPointsGmv, dailyPointsGsv) {
  // 按周聚合GMV
  const gmvBucket = {};
  dailyPointsGmv.forEach(p => {
    const ws = weekStartFromDateStr(p.date);
    if (!ws) return;
    if (!gmvBucket[ws]) {
      gmvBucket[ws] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gmvBucket[ws].dp += p.dp;
    gmvBucket[ws].zhidui += p.zhidui;
    gmvBucket[ws].fuwu += p.fuwu;
  });

  // 按周聚合GSV
  const gsvBucket = {};
  dailyPointsGsv.forEach(p => {
    const ws = weekStartFromDateStr(p.date);
    if (!ws) return;
    if (!gsvBucket[ws]) {
      gsvBucket[ws] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gsvBucket[ws].dp += p.dp;
    gsvBucket[ws].zhidui += p.zhidui;
    gsvBucket[ws].fuwu += p.fuwu;
  });

  // 计算周退款率
  return Object.keys(gmvBucket).sort().map(ws => {
    const gmv = gmvBucket[ws];
    const gsv = gsvBucket[ws] || { dp: 0, zhidui: 0, fuwu: 0 };
    const rate = { date: ws };

    rate.dp = gmv.dp > 0 ? Number((1 - gsv.dp / gmv.dp).toFixed(4)) : null;
    rate.zhidui = gmv.zhidui > 0 ? Number((1 - gsv.zhidui / gmv.zhidui).toFixed(4)) : null;
    rate.fuwu = gmv.fuwu > 0 ? Number((1 - gsv.fuwu / gmv.fuwu).toFixed(4)) : null;

    const totalGmv = gmv.dp + gmv.zhidui + gmv.fuwu;
    const totalGsv = gsv.dp + gsv.zhidui + gsv.fuwu;
    rate.total = totalGmv > 0 ? Number((1 - totalGsv / totalGmv).toFixed(4)) : null;

    return rate;
  });
}

/** ==================== 月度退款率聚合 ====================
 * 月度退款率 = 1 - 月度GSV总和 / 月度GMV总和
 */
function aggregateRefundRateByMonth(dailyPointsGmv, dailyPointsGsv) {
  // 按月聚合GMV
  const gmvBucket = {};
  dailyPointsGmv.forEach(p => {
    const month = monthFromDateStr(p.date);
    if (!month) return;
    if (!gmvBucket[month]) {
      gmvBucket[month] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gmvBucket[month].dp += p.dp;
    gmvBucket[month].zhidui += p.zhidui;
    gmvBucket[month].fuwu += p.fuwu;
  });

  // 按月聚合GSV
  const gsvBucket = {};
  dailyPointsGsv.forEach(p => {
    const month = monthFromDateStr(p.date);
    if (!month) return;
    if (!gsvBucket[month]) {
      gsvBucket[month] = { dp: 0, zhidui: 0, fuwu: 0 };
    }
    gsvBucket[month].dp += p.dp;
    gsvBucket[month].zhidui += p.zhidui;
    gsvBucket[month].fuwu += p.fuwu;
  });

  // 计算月退款率
  return Object.keys(gmvBucket).sort().map(m => {
    const gmv = gmvBucket[m];
    const gsv = gsvBucket[m] || { dp: 0, zhidui: 0, fuwu: 0 };
    const rate = { date: m };

    rate.dp = gmv.dp > 0 ? Number((1 - gsv.dp / gmv.dp).toFixed(4)) : null;
    rate.zhidui = gmv.zhidui > 0 ? Number((1 - gsv.zhidui / gmv.zhidui).toFixed(4)) : null;
    rate.fuwu = gmv.fuwu > 0 ? Number((1 - gsv.fuwu / gmv.fuwu).toFixed(4)) : null;

    const totalGmv = gmv.dp + gmv.zhidui + gmv.fuwu;
    const totalGsv = gsv.dp + gsv.zhidui + gsv.fuwu;
    rate.total = totalGmv > 0 ? Number((1 - totalGsv / totalGmv).toFixed(4)) : null;

    return rate;
  });
}

/** ==================== 服务商按渠道计算退款率（按日/周/月） ====================
 * 退款率 = 1 - GSV / GMV
 * 适用于日度、周度、月度数据
 */
function aggregateFuwuRefundRateByChannel(fuwuGmvData, fuwuGsvData) {
  // fuwuGmvData 和 fuwuGsvData 格式: { days, channels, data }
  const days = fuwuGmvData.days || [];
  // 合并两个数据集的渠道列表，确保一致性
  const channels = Array.from(new Set([
    ...(fuwuGmvData.channels || []),
    ...(fuwuGsvData.channels || [])
  ])).sort();

  // 构建GMV和GSV数据映射
  const gmvMap = {};
  fuwuGmvData.data.forEach(row => {
    gmvMap[row.date] = row;
  });
  const gsvMap = {};
  fuwuGsvData.data.forEach(row => {
    gsvMap[row.date] = row;
  });

  // 计算每个渠道的退款率
  const refundData = days.map(date => {
    const gmvRow = gmvMap[date] || {};
    const gsvRow = gsvMap[date] || {};
    const rateRow = { date: date };

    channels.forEach(ch => {
      const gmvVal = gmvRow[ch] || 0;
      const gsvVal = gsvRow[ch] || 0;
      // GMV为0时返回null，否则返回退款率（1 - GSV/GMV）
      rateRow[ch] = gmvVal > 0 ? Number((1 - gsvVal / gmvVal).toFixed(4)) : null;
    });

    return rateRow;
  });

  return {
    days: days,
    channels: channels,
    data: refundData
  };
}

/** ==================== 计算四平台合并的总计（用于前端计算总退款率） ====================
 * 返回: { dp: {gmv, gsv}, zhidui: {gmv, gsv}, fuwu: {gmv, gsv} }
 */
function calculateTotalsByCategory(dailyPointsGmv, dailyPointsGsv) {
  const totals = {
    dp: { gmv: 0, gsv: 0 },
    zhidui: { gmv: 0, gsv: 0 },
    fuwu: { gmv: 0, gsv: 0 }
  };

  // 汇总GMV（数据已经是万元）
  dailyPointsGmv.forEach(p => {
    totals.dp.gmv += p.dp || 0;
    totals.zhidui.gmv += p.zhidui || 0;
    totals.fuwu.gmv += p.fuwu || 0;
  });

  // 汇总GSV
  dailyPointsGsv.forEach(p => {
    totals.dp.gsv += p.dp || 0;
    totals.zhidui.gsv += p.zhidui || 0;
    totals.fuwu.gsv += p.fuwu || 0;
  });

  // 计算总退款率
  totals.dp.refundRate = totals.dp.gmv > 0 ? Number((1 - totals.dp.gsv / totals.dp.gmv).toFixed(4)) : null;
  totals.zhidui.refundRate = totals.zhidui.gmv > 0 ? Number((1 - totals.zhidui.gsv / totals.zhidui.gmv).toFixed(4)) : null;
  totals.fuwu.refundRate = totals.fuwu.gmv > 0 ? Number((1 - totals.fuwu.gsv / totals.fuwu.gmv).toFixed(4)) : null;

  return totals;
}

/** ==================== 计算服务商各渠道的总计（用于前端计算总退款率） ====================
 * 返回: { 渠道名: {gmv, gsv, refundRate}, ... }
 */
function calculateFuwuTotalsByChannel(fuwuGmvData, fuwuGsvData) {
  const totals = {};
  const channels = fuwuGmvData.channels || [];

  // 初始化各渠道
  channels.forEach(ch => {
    totals[ch] = { gmv: 0, gsv: 0, refundRate: null };
  });

  // 汇总GMV
  fuwuGmvData.data.forEach(row => {
    channels.forEach(ch => {
      totals[ch].gmv += row[ch] || 0;
    });
  });

  // 汇总GSV
  fuwuGsvData.data.forEach(row => {
    channels.forEach(ch => {
      totals[ch].gsv += row[ch] || 0;
    });
  });

  // 计算各渠道总退款率
  channels.forEach(ch => {
    totals[ch].refundRate = totals[ch].gmv > 0 ? Number((1 - totals[ch].gsv / totals[ch].gmv).toFixed(4)) : null;
  });

  return totals;
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
  aggregateFuwuByChannelWeekly,
  aggregateFuwuByChannelMonthly,
  aggregateDpByChannel,
  aggregateDpByChannelWeekly,
  aggregateDpByChannelMonthly,
  aggregateDpRefundRateByChannel,
  calculateDpTotalsByChannel,
  aggregateDpByDarenMonthly,
  aggregateModelDistributionByDay,
  aggregateModelDistributionByDayFiltered,
  aggregateModelDistributionByDaren,
  parseExcelSerial,
  aggregateRefundRateByDayAndCategory,
  aggregateRefundRateByWeek,
  aggregateRefundRateByMonth,
  aggregateFuwuRefundRateByChannel,
  calculateTotalsByCategory,
  calculateFuwuTotalsByChannel
};
