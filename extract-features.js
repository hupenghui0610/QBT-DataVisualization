/**
 * 电商大盘及竞争数据 - 多维度特征值提取
 * 依赖: npm install xlsx
 * 运行:
 *   node extract-features.js
 *     默认读取 当前目录/电商大盘及竞争数据-情报通.xlsx，输出 当前目录/features-output.json
 *   node extract-features.js "你的xlsx路径" "输出json路径"
 * 输出: features-output.json（或第二个参数指定的路径）
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ============ 配置：请修改为你的 xlsx 文件路径 ============
const DEFAULT_INPUT = path.join(
  process.cwd(),
  '电商大盘及竞争数据-情报通.xlsx'
);
const DEFAULT_OUTPUT = path.join(process.cwd(), 'features-output.json');

// 若通过命令行传入路径则使用命令行参数
const inputPath = process.argv[2] || DEFAULT_INPUT;
const outputPath = process.argv[3] || DEFAULT_OUTPUT;

// ============ 工具：Excel 序列号转日期字符串 ============
function excelDateToStr(serial) {
  const utc_days = Math.floor(serial - 25569);
  const d = new Date(utc_days * 86400 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============ 1. 读取 xlsx ============
function loadData(filePath) {
  const wb = XLSX.readFile(filePath, { type: 'file' });
  const sheetName = wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
  const header = raw[0];
  const rows = raw.slice(1).map((r) => ({
    渠道: r[0],
    价格段: r[1],
    日期: r[2],
    日期_str: excelDateToStr(r[2]),
    销量: Number(r[3]) || 0,
    销售额: Number(r[4]) || 0,
  }));
  return { header, rows };
}

// 客单价计算时排除 0-1k 价格段（全项目统一）
const EXCLUDE_PRICE_FOR_AVG = '0-1k';

// ============ 2. 维度一：渠道维度 ============
function dimension1_channel(rows) {
  const totalSales = rows.reduce((s, r) => s + r.销量, 0);
  const totalAmount = rows.reduce((s, r) => s + r.销售额, 0);
  const byChannel = {};
  const byChannelExclude01k = {};
  rows.forEach((r) => {
    if (!byChannel[r.渠道]) byChannel[r.渠道] = { 销量: 0, 销售额: 0 };
    byChannel[r.渠道].销量 += r.销量;
    byChannel[r.渠道].销售额 += r.销售额;
    if (r.价格段 !== EXCLUDE_PRICE_FOR_AVG) {
      if (!byChannelExclude01k[r.渠道]) byChannelExclude01k[r.渠道] = { 销量: 0, 销售额: 0 };
      byChannelExclude01k[r.渠道].销量 += r.销量;
      byChannelExclude01k[r.渠道].销售额 += r.销售额;
    }
  });
  const list = Object.entries(byChannel).map(([渠道, v]) => {
    const ex = byChannelExclude01k[渠道] || { 销量: 0, 销售额: 0 };
    const 客单价 = ex.销量 ? ex.销售额 / ex.销量 : 0;
    return {
      渠道,
      销量: v.销量,
      销售额: v.销售额,
      销量占比: totalSales ? v.销量 / totalSales : 0,
      销售额占比: totalAmount ? v.销售额 / totalAmount : 0,
      客单价,
    };
  });
  return {
    说明: '各渠道销量合计、销售额合计、占比、客单价（客单价已排除0-1k）',
    全盘销量合计: totalSales,
    全盘销售额合计: totalAmount,
    按渠道: list,
  };
}

// ============ 3. 维度二：价格段维度 ============
function dimension2_priceRange(rows) {
  const totalSales = rows.reduce((s, r) => s + r.销量, 0);
  const totalAmount = rows.reduce((s, r) => s + r.销售额, 0);
  const byPrice = {};
  rows.forEach((r) => {
    if (!byPrice[r.价格段]) byPrice[r.价格段] = { 销量: 0, 销售额: 0 };
    byPrice[r.价格段].销量 += r.销量;
    byPrice[r.价格段].销售额 += r.销售额;
  });
  const list = Object.entries(byPrice).map(([价格段, v]) => ({
    价格段,
    销量: v.销量,
    销售额: v.销售额,
    销量占比: totalSales ? v.销量 / totalSales : 0,
    销售额占比: totalAmount ? v.销售额 / totalAmount : 0,
    销量占比与销售额占比差: totalSales && totalAmount
      ? v.销量 / totalSales - v.销售额 / totalAmount
      : 0,
  }));
  return {
    说明: '各价格段销量、销售额、占比、销量占比与销售额占比差异',
    全盘销量合计: totalSales,
    全盘销售额合计: totalAmount,
    按价格段: list,
  };
}

// ============ 4. 维度三：时间趋势（月度销量、销售额、环比、同比） ============
function dimension3_timeTrend(rows) {
  const byDate = {};
  rows.forEach((r) => {
    const d = r.日期_str;
    if (!byDate[d]) byDate[d] = { 销量: 0, 销售额: 0 };
    byDate[d].销量 += r.销量;
    byDate[d].销售额 += r.销售额;
  });
  const dates = Object.keys(byDate).sort();
  const list = dates.map((d, i) => {
    const curr = byDate[d];
    const prev = i > 0 ? byDate[dates[i - 1]] : null;
    const sameMonthLastYear = dates.find((x) => {
      const [y] = x.split('-');
      const [cy] = d.split('-');
      return x !== d && x.slice(5) === d.slice(5) && parseInt(y, 10) === parseInt(cy, 10) - 1;
    });
    const lastYear = sameMonthLastYear ? byDate[sameMonthLastYear] : null;
    return {
      日期: d,
      销量: curr.销量,
      销售额: curr.销售额,
      销量环比: prev && prev.销量 ? curr.销量 / prev.销量 - 1 : null,
      销售额环比: prev && prev.销售额 ? curr.销售额 / prev.销售额 - 1 : null,
      销量同比: lastYear && lastYear.销量 ? curr.销量 / lastYear.销量 - 1 : null,
      销售额同比: lastYear && lastYear.销售额 ? curr.销售额 / lastYear.销售额 - 1 : null,
    };
  });
  return {
    说明: '全盘月度销量、销售额、环比/同比',
    按日期: list,
  };
}

// ============ 5. 维度四：渠道 × 时间 ============
function dimension4_channelTime(rows) {
  const byChannelDate = {};
  let byDateTotal = {};
  rows.forEach((r) => {
    const key = `${r.渠道}\t${r.日期_str}`;
    if (!byChannelDate[key]) byChannelDate[key] = { 渠道: r.渠道, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byChannelDate[key].销量 += r.销量;
    byChannelDate[key].销售额 += r.销售额;
    byDateTotal[r.日期_str] = (byDateTotal[r.日期_str] || 0) + r.销量;
  });
  const byDateTotalAmount = {};
  rows.forEach((r) => {
    byDateTotalAmount[r.日期_str] = (byDateTotalAmount[r.日期_str] || 0) + r.销售额;
  });
  const list = Object.values(byChannelDate).map((v) => ({
    ...v,
    当月全盘销量: byDateTotal[v.日期] || 0,
    当月全盘销售额: byDateTotalAmount[v.日期] || 0,
    当月销量占比: byDateTotal[v.日期] ? v.销量 / byDateTotal[v.日期] : 0,
    当月销售额占比: byDateTotalAmount[v.日期] ? v.销售额 / byDateTotalAmount[v.日期] : 0,
  }));
  return {
    说明: '各渠道按月销量、销售额及当月占比',
    按渠道与日期: list,
  };
}

// ============ 6. 维度五：价格段 × 时间 ============
function dimension5_priceTime(rows) {
  const byPriceDate = {};
  const byDateTotal = {};
  const byDateTotalAmount = {};
  rows.forEach((r) => {
    const key = `${r.价格段}\t${r.日期_str}`;
    if (!byPriceDate[key]) byPriceDate[key] = { 价格段: r.价格段, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byPriceDate[key].销量 += r.销量;
    byPriceDate[key].销售额 += r.销售额;
    byDateTotal[r.日期_str] = (byDateTotal[r.日期_str] || 0) + r.销量;
    byDateTotalAmount[r.日期_str] = (byDateTotalAmount[r.日期_str] || 0) + r.销售额;
  });
  const list = Object.values(byPriceDate).map((v) => ({
    ...v,
    当月销量占比: byDateTotal[v.日期] ? v.销量 / byDateTotal[v.日期] : 0,
    当月销售额占比: byDateTotalAmount[v.日期] ? v.销售额 / byDateTotalAmount[v.日期] : 0,
  }));
  return {
    说明: '各价格段月度销量、销售额及当月占比',
    按价格段与日期: list,
  };
}

// ============ 7. 维度六：渠道 × 价格段 ============
function dimension6_channelPrice(rows) {
  const byChannel = {};
  rows.forEach((r) => {
    byChannel[r.渠道] = (byChannel[r.渠道] || 0) + r.销量;
  });
  const byChannelAmount = {};
  rows.forEach((r) => {
    byChannelAmount[r.渠道] = (byChannelAmount[r.渠道] || 0) + r.销售额;
  });
  const byKey = {};
  rows.forEach((r) => {
    const key = `${r.渠道}\t${r.价格段}`;
    if (!byKey[key]) byKey[key] = { 渠道: r.渠道, 价格段: r.价格段, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  const list = Object.values(byKey).map((v) => {
    const 客单价 = v.价格段 === EXCLUDE_PRICE_FOR_AVG ? null : (v.销量 ? v.销售额 / v.销量 : 0);
    return {
      ...v,
      客单价,
      渠道内销量占比: byChannel[v.渠道] ? v.销量 / byChannel[v.渠道] : 0,
      渠道内销售额占比: byChannelAmount[v.渠道] ? v.销售额 / byChannelAmount[v.渠道] : 0,
    };
  });
  return {
    说明: '各渠道在各价格段的销量、销售额、客单价（0-1k不参与客单价）、渠道内占比',
    按渠道与价格段: list,
  };
}

// ============ 8. 维度七：渠道 × 价格段 × 时间 ============
function dimension7_channelPriceTime(rows) {
  const byDateTotal = {};
  const byDateTotalAmount = {};
  rows.forEach((r) => {
    byDateTotal[r.日期_str] = (byDateTotal[r.日期_str] || 0) + r.销量;
    byDateTotalAmount[r.日期_str] = (byDateTotalAmount[r.日期_str] || 0) + r.销售额;
  });
  const byKey = {};
  rows.forEach((r) => {
    const key = `${r.渠道}\t${r.价格段}\t${r.日期_str}`;
    if (!byKey[key]) byKey[key] = { 渠道: r.渠道, 价格段: r.价格段, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  const list = Object.values(byKey).map((v) => ({
    ...v,
    当月销量占比: byDateTotal[v.日期] ? v.销量 / byDateTotal[v.日期] : 0,
    当月销售额占比: byDateTotalAmount[v.日期] ? v.销售额 / byDateTotalAmount[v.日期] : 0,
  }));
  return {
    说明: '各渠道×价格段×日期的月度销量、销售额及当月占比',
    按渠道与价格段与日期: list,
  };
}

// ============ 9. 维度八：客单价衍生（汇总各层级，均排除0-1k） ============
function dimension8_avgPrice(rows) {
  const d1 = dimension1_channel(rows);
  const d2 = dimension2_priceRange(rows);
  const d6 = dimension6_channelPrice(rows);
  const byDate = {};
  rows.forEach((r) => {
    if (r.价格段 === EXCLUDE_PRICE_FOR_AVG) return;
    if (!byDate[r.日期_str]) byDate[r.日期_str] = { 销量: 0, 销售额: 0 };
    byDate[r.日期_str].销量 += r.销量;
    byDate[r.日期_str].销售额 += r.销售额;
  });
  const 按时间客单价 = Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([日期, v]) => ({
      日期,
      销量: v.销量,
      销售额: v.销售额,
      客单价: v.销量 ? v.销售额 / v.销量 : 0,
    }));
  const 按价格段列表 = d2.按价格段
    .filter((x) => x.价格段 !== EXCLUDE_PRICE_FOR_AVG)
    .map((x) => ({ 价格段: x.价格段, 客单价: x.销量 ? x.销售额 / x.销量 : 0 }));
  const 按渠道与价格段列表 = d6.按渠道与价格段
    .filter((x) => x.价格段 !== EXCLUDE_PRICE_FOR_AVG)
    .map((x) => ({ 渠道: x.渠道, 价格段: x.价格段, 客单价: x.客单价 }));
  return {
    说明: '各维度下客单价（全部已排除0-1k）',
    按渠道: d1.按渠道.map((x) => ({ 渠道: x.渠道, 客单价: x.客单价 })),
    按价格段: 按价格段列表,
    按渠道与价格段: 按渠道与价格段列表,
    按时间: 按时间客单价,
  };
}

// ============ 10. 维度九：增长与占比（渠道/价格段 按月占比及占比环比） ============
function dimension9_shareGrowth(rows) {
  const d4 = dimension4_channelTime(rows);
  const d5 = dimension5_priceTime(rows);
  const byDateChannel = {};
  d4.按渠道与日期.forEach((v) => {
    if (!byDateChannel[v.日期]) byDateChannel[v.日期] = {};
    byDateChannel[v.日期][v.渠道] = v.当月销量占比;
  });
  const dates = Object.keys(byDateChannel).sort();
  const 渠道销量占比随时间 = [];
  dates.forEach((d, i) => {
    const prev = i > 0 ? byDateChannel[dates[i - 1]] : null;
    Object.entries(byDateChannel[d]).forEach(([渠道, 占比]) => {
      渠道销量占比随时间.push({
        日期: d,
        渠道,
        销量占比: 占比,
        销量占比环比: prev && prev[渠道] != null && prev[渠道] !== 0 ? 占比 / prev[渠道] - 1 : null,
      });
    });
  });
  const byDatePrice = {};
  d5.按价格段与日期.forEach((v) => {
    if (!byDatePrice[v.日期]) byDatePrice[v.日期] = {};
    byDatePrice[v.日期][v.价格段] = v.当月销量占比;
  });
  const 价格段销量占比随时间 = [];
  dates.forEach((d, i) => {
    const prev = i > 0 ? byDatePrice[dates[i - 1]] : null;
    Object.entries(byDatePrice[d] || {}).forEach(([价格段, 占比]) => {
      价格段销量占比随时间.push({
        日期: d,
        价格段,
        销量占比: 占比,
        销量占比环比: prev && prev[价格段] != null && prev[价格段] !== 0 ? 占比 / prev[价格段] - 1 : null,
      });
    });
  });
  return {
    说明: '各渠道/价格段按月占比及占比环比',
    渠道销量占比随时间,
    价格段销量占比随时间,
  };
}

// ============ 11. 维度十：集中度与排名 ============
function dimension10_ranking(rows) {
  const d1 = dimension1_channel(rows);
  const d2 = dimension2_priceRange(rows);
  const byChannel = d1.按渠道.sort((a, b) => b.销量 - a.销量);
  const totalSales = d1.全盘销量合计;
  const totalAmount = d1.全盘销售额合计;
  let sumS = 0, sumA = 0;
  const 渠道按销量排名 = byChannel.map((x, i) => {
    sumS += x.销量;
    sumA += x.销售额;
    return {
      排名: i + 1,
      渠道: x.渠道,
      销量: x.销量,
      销售额: x.销售额,
      销量占比: x.销量占比,
      CRn_销量: totalSales ? sumS / totalSales : 0,
      CRn_销售额: totalAmount ? sumA / totalAmount : 0,
    };
  });
  const 渠道按销售额排名 = [...d1.按渠道].sort((a, b) => b.销售额 - a.销售额).map((x, i) => ({
    排名: i + 1,
    渠道: x.渠道,
    销售额: x.销售额,
    销量: x.销量,
  }));
  const byPrice = d2.按价格段.sort((a, b) => b.销量 - a.销量);
  let sumPS = 0, sumPA = 0;
  const 价格段按销量排名 = byPrice.map((x, i) => {
    sumPS += x.销量;
    sumPA += x.销售额;
    return {
      排名: i + 1,
      价格段: x.价格段,
      销量: x.销量,
      销售额: x.销售额,
      销量占比: x.销量占比,
      CRn_销量: d2.全盘销量合计 ? sumPS / d2.全盘销量合计 : 0,
      CRn_销售额: d2.全盘销售额合计 ? sumPA / d2.全盘销售额合计 : 0,
    };
  });
  const cr1 = 渠道按销量排名[0];
  const cr2 = 渠道按销量排名[1];
  const cr3 = 渠道按销量排名[2];
  return {
    说明: '渠道/价格段 销量与销售额排名、CR1/CR2/CR3',
    渠道按销量排名,
    渠道按销售额排名,
    价格段按销量排名,
    渠道集中度: {
      CR1_销量: cr1 ? cr1.CRn_销量 : 0,
      CR2_销量: cr2 ? 渠道按销量排名[1].CRn_销量 : 0,
      CR3_销量: cr3 ? 渠道按销量排名[2].CRn_销量 : 0,
      CR1_销售额: cr1 ? cr1.CRn_销售额 : 0,
      CR2_销售额: cr2 ? 渠道按销量排名[1].CRn_销售额 : 0,
      CR3_销售额: cr3 ? 渠道按销量排名[2].CRn_销售额 : 0,
    },
    价格段集中度: {
      CR1_销量: 价格段按销量排名[0]?.CRn_销量 ?? 0,
      CR2_销量: 价格段按销量排名[1]?.CRn_销量 ?? 0,
      CR3_销量: 价格段按销量排名[2]?.CRn_销量 ?? 0,
    },
  };
}

// ============ 主流程 ============
function main() {
  console.log('读取文件:', inputPath);
  const { rows } = loadData(inputPath);
  console.log('数据行数:', rows.length);

  const result = {
    数据说明: {
      数据源: inputPath,
      提取时间: new Date().toISOString(),
      原始行数: rows.length,
    },
    维度一_渠道维度: dimension1_channel(rows),
    维度二_价格段维度: dimension2_priceRange(rows),
    维度三_时间趋势: dimension3_timeTrend(rows),
    维度四_渠道与时间: dimension4_channelTime(rows),
    维度五_价格段与时间: dimension5_priceTime(rows),
    维度六_渠道与价格段: dimension6_channelPrice(rows),
    维度七_渠道与价格段与时间: dimension7_channelPriceTime(rows),
    维度八_客单价衍生: dimension8_avgPrice(rows),
    维度九_增长与占比: dimension9_shareGrowth(rows),
    维度十_集中度与排名: dimension10_ranking(rows),
  };

  const jsonStr = JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, jsonStr, 'utf8');
  console.log('已保存:', outputPath);
}

main();
