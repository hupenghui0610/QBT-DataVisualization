/**
 * 三站分品牌分价格 - 前十大品牌特征值提取
 * 参照《电商大盘竞争数据-多维度分析与特征提取》的逻辑，对分品牌表提取特征。
 * 依赖: npm install xlsx
 * 运行:
 *   node extract-features-brand-top10.js
 *     默认读取 当前目录/情报通-三站分品牌分价格销量销售额.xlsx，输出 当前目录/features-brand-top10.json
 *   node extract-features-brand-top10.js "xlsx路径" "输出json路径"
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_INPUT = path.join(process.cwd(), '情报通-三站分品牌分价格销量销售额.xlsx');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'features-brand-top10.json');
const inputPath = process.argv[2] || DEFAULT_INPUT;
const outputPath = process.argv[3] || DEFAULT_OUTPUT;

// 固定前十大品牌名单（SEEWO/希沃 与 seewo/希沃 已通过 normalizeBrand 统一为 SEEWO/希沃）
const FIXED_TOP_BRANDS = [
  '学而思',
  '科大讯飞',
  '作业帮',
  '小猿',
  '小度',
  'BBK/步步高',
  'SEEWO/希沃',
  'BOE/京东方',
  '清北道远',
  '智能精准学',
];

function excelDateToStr(serial) {
  if (typeof serial !== 'number') return String(serial || '').slice(0, 10);
  const utc_days = Math.floor(serial - 25569);
  const d = new Date(utc_days * 86400 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 品牌名称清洗：SEEWO/希沃 与 seewo/希沃 视为同一品牌，统一为 SEEWO/希沃
function normalizeBrand(name) {
  const s = String(name || '').trim();
  if (s.toLowerCase() === 'seewo/希沃') return 'SEEWO/希沃';
  return s;
}

// 读取分品牌 Excel，兼容两种表头：含「类目名称」或不含
function loadDataBrand(filePath) {
  const wb = XLSX.readFile(filePath, { type: 'file' });
  const sheetName = wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
  const header = (raw[0] || []).map((h) => String(h || '').trim());
  const hasCategory = header.includes('类目名称');
  const col = hasCategory
    ? { 渠道: 0, 品牌: 2, 价格段: 3, 日期: 4, 销量: 5, 销售额: 6 }
    : { 渠道: 0, 品牌: 1, 价格段: 2, 日期: 3, 销量: 4, 销售额: 5 };
  let rows = raw.slice(1).map((r) => ({
    渠道: r[col.渠道],
    品牌: normalizeBrand(r[col.品牌]),
    价格段: r[col.价格段],
    日期: r[col.日期],
    日期_str: excelDateToStr(r[col.日期]),
    销量: Number(r[col.销量]) || 0,
    销售额: Number(r[col.销售额]) || 0,
  }));
  rows = rows.filter((r) => r.价格段 !== '0-1k');
  return { header, rows };
}

// 仅保留固定前十大品牌数据
function filterTopRows(rows, topBrands) {
  const set = new Set(topBrands);
  return rows.filter((r) => set.has(r.品牌));
}

// ============ 1. 前十大品牌销量、销额对比 ============
function feature1_销量销额对比(rows, topBrands) {
  const byBrand = {};
  rows.forEach((r) => {
    if (!byBrand[r.品牌]) byBrand[r.品牌] = { 销量: 0, 销售额: 0 };
    byBrand[r.品牌].销量 += r.销量;
    byBrand[r.品牌].销售额 += r.销售额;
  });
  const totalSales = rows.reduce((s, r) => s + r.销量, 0);
  const totalAmount = rows.reduce((s, r) => s + r.销售额, 0);
  const 按品牌 = topBrands.map((品牌) => {
    const v = byBrand[品牌] || { 销量: 0, 销售额: 0 };
    return {
      品牌,
      销量: v.销量,
      销售额: v.销售额,
      销量占比: totalSales ? v.销量 / totalSales : 0,
      销售额占比: totalAmount ? v.销售额 / totalAmount : 0,
    };
  });
  return { 说明: '前十大品牌销量、销售额对比', 按品牌 };
}

// ============ 2. 前十大品牌在三大渠道中各自的销量销额占比 ============
function feature2_各品牌三大渠道占比(rows, topBrands) {
  const byBrand = {};
  rows.forEach((r) => {
    byBrand[r.品牌] = (byBrand[r.品牌] || 0) + r.销量;
  });
  const byBrandAmount = {};
  rows.forEach((r) => {
    byBrandAmount[r.品牌] = (byBrandAmount[r.品牌] || 0) + r.销售额;
  });
  const byKey = {};
  rows.forEach((r) => {
    const key = `${r.品牌}\t${r.渠道}`;
    if (!byKey[key]) byKey[key] = { 品牌: r.品牌, 渠道: r.渠道, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  const 按品牌与渠道 = Object.values(byKey)
    .filter((v) => topBrands.includes(v.品牌))
    .map((v) => ({
      ...v,
      品牌内销量占比: byBrand[v.品牌] ? v.销量 / byBrand[v.品牌] : 0,
      品牌内销售额占比: byBrandAmount[v.品牌] ? v.销售额 / byBrandAmount[v.品牌] : 0,
    }));
  return { 说明: '前十大品牌在三大渠道的销量、销售额及品牌内占比', 按品牌与渠道 };
}

// ============ 3. 前十大品牌各月份市场占有率（堆叠面积图用） ============
// allRows: 全量用于算当月全市场总量；topRows: 仅前十大用于算各品牌销量
function feature3_各月份市场占有率(allRows, topRows, topBrands) {
  const byDateTotal = {};
  allRows.forEach((r) => {
    byDateTotal[r.日期_str] = (byDateTotal[r.日期_str] || 0) + r.销量;
  });
  const byBrandDate = {};
  topRows.forEach((r) => {
    const key = `${r.品牌}\t${r.日期_str}`;
    if (!byBrandDate[key]) byBrandDate[key] = { 品牌: r.品牌, 日期: r.日期_str, 销量: 0 };
    byBrandDate[key].销量 += r.销量;
  });
  const dates = [...new Set(allRows.map((r) => r.日期_str))].sort();
  const 按日期 = dates;
  const 各品牌按日期市占率 = {};
  topBrands.forEach((品牌) => {
    各品牌按日期市占率[品牌] = dates.map((日期) => {
      const total = byDateTotal[日期] || 0;
      const key = `${品牌}\t${日期}`;
      const 销量 = (byBrandDate[key] && byBrandDate[key].销量) || 0;
      return total ? 销量 / total : 0;
    });
  });
  return {
    说明: '前十大品牌各月份市场占有率，用于堆叠面积图',
    按日期: 按日期,
    各品牌按日期市占率,
  };
}

// ============ 4. 前十大品牌客单价对比 ============
function feature5_客单价对比(rows, topBrands) {
  const byBrand = {};
  rows.forEach((r) => {
    if (!byBrand[r.品牌]) byBrand[r.品牌] = { 销量: 0, 销售额: 0 };
    byBrand[r.品牌].销量 += r.销量;
    byBrand[r.品牌].销售额 += r.销售额;
  });
  const 按品牌 = topBrands.map((品牌) => {
    const v = byBrand[品牌] || { 销量: 0, 销售额: 0 };
    return {
      品牌,
      销量: v.销量,
      销售额: v.销售额,
      客单价: v.销量 ? v.销售额 / v.销量 : 0,
    };
  });
  return { 说明: '前十大品牌客单价对比', 按品牌 };
}

// ============ 5. 前十大品牌每个品牌在不同价格段中的销量随时间（每品牌一堆叠面积） ============
function feature6_各品牌价格段销量随时间(rows, topBrands) {
  const byBrand = {};
  topBrands.forEach((品牌) => {
    byBrand[品牌] = { 按日期: [], 按价格段与日期: {} };
  });
  const dateSet = new Set();
  rows.forEach((r) => dateSet.add(r.日期_str));
  const dates = [...dateSet].sort();
  topBrands.forEach((品牌) => {
    byBrand[品牌].按日期 = dates;
  });
  rows.forEach((r) => {
    const key = `${r.品牌}\t${r.价格段}\t${r.日期_str}`;
    if (!byBrand[r.品牌]) return;
    if (!byBrand[r.品牌].按价格段与日期[r.价格段]) byBrand[r.品牌].按价格段与日期[r.价格段] = {};
    byBrand[r.品牌].按价格段与日期[r.价格段][r.日期_str] = (byBrand[r.品牌].按价格段与日期[r.价格段][r.日期_str] || 0) + r.销量;
  });
  const 按品牌 = {};
  topBrands.forEach((品牌) => {
    const 按价格段与日期 = byBrand[品牌].按价格段与日期;
    const 价格段列表 = Object.keys(按价格段与日期).sort();
    按品牌[品牌] = {
      按日期: byBrand[品牌].按日期,
      价格段列表,
      按价格段与日期: 价格段列表.map((价格段) => ({
        价格段,
        按日期: dates.map((日期) => ({
          日期,
          销量: 按价格段与日期[价格段][日期] || 0,
        })),
      })),
    };
  });
  return {
    说明: '前十大品牌每个品牌在不同价格段中的销量随时间，每品牌可绘一堆叠面积图',
    按品牌,
  };
}

// 品牌×日期 明细，供页面临时间筛选 B1/B5 使用
function feature_品牌与日期(rowsTop) {
  const byKey = {};
  rowsTop.forEach((r) => {
    const key = `${r.品牌}\t${r.日期_str}`;
    if (!byKey[key]) byKey[key] = { 品牌: r.品牌, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  return Object.values(byKey);
}

// 前十大品牌 × 渠道 × 日期（用于 B2 按时间筛选后算占比）
function feature_品牌与渠道与日期(rowsTop) {
  const byKey = {};
  rowsTop.forEach((r) => {
    const key = `${r.品牌}\t${r.渠道}\t${r.日期_str}`;
    if (!byKey[key]) byKey[key] = { 品牌: r.品牌, 渠道: r.渠道, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  return Object.values(byKey);
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error('文件不存在:', inputPath);
    process.exit(1);
  }
  console.log('读取:', inputPath);
  const { rows } = loadDataBrand(inputPath);
  console.log('数据行数:', rows.length, '(已剔除0-1k)');
  const topBrands = FIXED_TOP_BRANDS.slice();
  console.log('前十大品牌(固定名单):', topBrands);
  const rowsTop = filterTopRows(rows, topBrands);

  const result = {
    数据说明: {
      数据源: inputPath,
      提取时间: new Date().toISOString(),
      原始行数: rows.length,
      前十大品牌: topBrands,
    },
    '品牌销量/销额': feature1_销量销额对比(rowsTop, topBrands),
    '品牌渠道占比': feature2_各品牌三大渠道占比(rowsTop, topBrands),
    '品牌市占率': feature3_各月份市场占有率(rows, rowsTop, topBrands),
    '品牌客单价': feature5_客单价对比(rowsTop, topBrands),
    '品牌价格段分布': feature6_各品牌价格段销量随时间(rowsTop, topBrands),
    品牌与日期: feature_品牌与日期(rowsTop),
    品牌与渠道与日期: feature_品牌与渠道与日期(rowsTop),
  };

  const jsonStr = JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, jsonStr, 'utf8');
  console.log('已保存:', outputPath);
}

main();
