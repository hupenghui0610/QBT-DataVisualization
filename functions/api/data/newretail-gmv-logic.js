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

  for (let r = 1; r < chValues.length; r++) { // skip header
    const row = chValues[r] || [];
    const channelName = String(row[0] || '').trim();
    const platform = String(row[1] || '').trim();
    const darenName = String(row[3] || '').trim();
    const darenId = String(row[4] || '').trim();

    if (!channelName) continue;

    // 视频号: 用昵称索引
    if (platform === '视频号' && darenName) {
      shipinhaoNameToChannel[darenName] = channelName;
    }

    // 其他平台: 用达人ID索引
    if (darenId) {
      darenIdToChannel[darenId] = channelName;
    }
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
    return { category: 'fuwu', channel: '未知' };
  }

  // 1. 直营开头 → 跳过
  if (channelName.indexOf('直营') === 0) {
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

    // 4. 检查订单状态 - GSV：剔除已关闭、交易关闭、已取消
    const status = String(row[cfg.cols.status] || '').trim();

    const statusLower = status.toLowerCase();
    if (status.includes('关闭') || status.includes('取消') || status.includes('退款') || status.includes('退货') ||
        statusLower.includes('close') || statusLower.includes('cancel') || statusLower.includes('refund')) {
      skipCount++;
      // 调试：记录前10个被跳过的订单
      if (debugLog.length < 10) {
        debugLog.push({ row: r, status, amount, day });
      }
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

    // 6. 分类
    const classification = classifyOrder(darenId, darenName, platform, channelMaps);
    if (classification.skip) continue;

    orders.push({
      date: day,
      platform: platform,
      amount: amount,
      category: classification.category,
      channel: classification.channel
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
    hasTime: 0,      // 有支付时间
    hasAmount: 0,    // 有金额
    hasDate: 0,      // 日期解析成功
    classified: 0,   // 分类完成
    ziyingSkipped: 0, // 直营被跳过
    noChannel: 0,    // 未映射出渠道
    final: 0         // 最终保留
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

    // 4. 检查订单状态 (剔除已关闭)
    const status = String(row[cfg.cols.status] || '').trim();
    if (status === '已关闭') continue;

    // 5. 解析达人ID/昵称
    let darenId = '';
    let darenName = '';
    if (cfg.cols.darenId != null) {
      darenId = parseDarenId(row[cfg.cols.darenId]);
    }
    if (cfg.cols.darenName != null) {
      darenName = parseDarenId(row[cfg.cols.darenName]);
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

    orders.push({
      date: day,
      platform: platform,
      amount: amount,
      category: classification.category,
      channel: classification.channel
    });
    stats.final++;
  }

  // 调试输出
  if (platform === 'xiaohongshu') {
    console.log(`[${platform}] GMV处理详情:`);
    console.log(`  总行数: ${stats.totalRows}`);
    console.log(`  有支付时间: ${stats.hasTime}`);
    console.log(`  日期解析成功: ${stats.hasDate}`);
    console.log(`  有金额: ${stats.hasAmount}`);
    console.log(`  分类完成: ${stats.classified}`);
    console.log(`  -> 其中 直营被跳过: ${stats.ziyingSkipped}`);
    console.log(`  -> 其中 未映射出渠道: ${stats.noChannel}`);
    console.log(`  最终保留: ${stats.final}`);
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
  parseExcelSerial
};
