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

function isPriceSegment01k(seg) {
  const s = String(seg == null ? '' : seg).trim().toLowerCase();
  return s === '0-1k';
}

function canonicalBrandKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\/／&＆()（）\-\s·.]+/g, '');
}

function normalizeBrand(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const key = canonicalBrandKey(s);
  const aliasRules = [
    { brand: '学而思', keys: ['学而思'] },
    { brand: '科大讯飞', keys: ['科大讯飞', '讯飞'] },
    { brand: '作业帮', keys: ['作业帮'] },
    { brand: '小猿', keys: ['小猿'] },
    { brand: '小度', keys: ['小度'] },
    { brand: 'BBK/步步高', keys: ['bbk步步高', '步步高', 'bbk'] },
    { brand: 'SEEWO/希沃', keys: ['seewo希沃', '希沃', 'seewo'] },
    { brand: 'BOE/京东方', keys: ['boe京东方', '京东方', 'boe', '小课屏'] },
    { brand: '清北道远', keys: ['清北道远'] },
    { brand: '智能精准学', keys: ['智能精准学', '精准学', '寒雪老师'] },
  ];
  for (const rule of aliasRules) {
    if (rule.keys.some((alias) => key === alias || key.includes(alias) || alias.includes(key))) {
      return rule.brand;
    }
  }
  return s;
}

function parseNumberCell(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = String(v).replace(/[,，\s\u00a0]/g, '');
  const wan = s.match(/^(-?[\d.]+)\s*万$/);
  if (wan) {
    const n = parseFloat(wan[1]);
    return isFinite(n) ? n * 10000 : 0;
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function excelDateToStr(serial) {
  if (typeof serial === 'number' && isFinite(serial)) {
    const utcDays = Math.floor(serial - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const raw = String(serial == null ? '' : serial).trim();
  if (!raw) return '';
  const normalized = raw.replace(/[./]/g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }
  return raw.slice(0, 10);
}

/** 将日期统一为月份第一天（用于品牌图表按月汇总） */
function toMonthStart(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[1]}-${m[2]}-01`;
}

function hasAnyValue(row) {
  return Array.isArray(row) && row.some((v) => v != null && String(v).trim() !== '');
}

function parseDaPanRowsFromValues(values) {
  const header = Array.isArray(values) && values.length ? values[0] : [];
  let rows = (values || [])
    .slice(1)
    .filter(hasAnyValue)
    .map((r) => ({
      渠道: r[0],
      价格段: r[1],
      日期: r[2],
      日期_str: excelDateToStr(r[2]),
      销量: parseNumberCell(r[3]),
      销售额: parseNumberCell(r[4]),
    }))
    .filter((r) => r.渠道 || r.价格段 || r.日期_str || r.销量 || r.销售额);
  rows = rows.filter((r) => !isPriceSegment01k(r.价格段));
  return { header, rows };
}

function parseBrandRowsFromValues(values) {
  const header = ((values && values[0]) || []).map((h) => String(h || '').trim());
  const hasCategory = header.includes('类目名称');
  const col = hasCategory
    ? { 渠道: 0, 品牌: 2, 价格段: 3, 日期: 4, 销量: 5, 销售额: 6 }
    : { 渠道: 0, 品牌: 1, 价格段: 2, 日期: 3, 销量: 4, 销售额: 5 };
  let rows = (values || [])
    .slice(1)
    .filter(hasAnyValue)
    .map((r) => ({
      渠道: r[col.渠道],
      品牌: normalizeBrand(r[col.品牌]),
      价格段: r[col.价格段],
      日期: r[col.日期],
      日期_str: toMonthStart(excelDateToStr(r[col.日期])),
      销量: parseNumberCell(r[col.销量]),
      销售额: parseNumberCell(r[col.销售额]),
    }))
    .filter((r) => r.品牌 || r.渠道 || r.价格段 || r.日期_str || r.销量 || r.销售额);
  rows = rows.filter((r) => !isPriceSegment01k(r.价格段));
  return { header, rows };
}

function dimension1_channel(rows) {
  const totalSales = rows.reduce((s, r) => s + r.销量, 0);
  const totalAmount = rows.reduce((s, r) => s + r.销售额, 0);
  const byChannel = {};
  rows.forEach((r) => {
    if (!byChannel[r.渠道]) byChannel[r.渠道] = { 销量: 0, 销售额: 0 };
    byChannel[r.渠道].销量 += r.销量;
    byChannel[r.渠道].销售额 += r.销售额;
  });
  const list = Object.entries(byChannel).map(([渠道, v]) => ({
    渠道,
    销量: v.销量,
    销售额: v.销售额,
    销量占比: totalSales ? v.销量 / totalSales : 0,
    销售额占比: totalAmount ? v.销售额 / totalAmount : 0,
    客单价: v.销量 ? v.销售额 / v.销量 : 0,
  }));
  return {
    说明: '各渠道销量合计、销售额合计、占比、客单价（已剔除0-1k）',
    全盘销量合计: totalSales,
    全盘销售额合计: totalAmount,
    按渠道: list,
  };
}

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
    销量占比与销售额占比差:
      totalSales && totalAmount ? v.销量 / totalSales - v.销售额 / totalAmount : 0,
  }));
  return {
    说明: '各价格段销量、销售额、占比（已剔除0-1k）',
    全盘销量合计: totalSales,
    全盘销售额合计: totalAmount,
    按价格段: list,
  };
}

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
    const [cy, cm] = d.split('-');
    const targetYear = parseInt(cy, 10) - 1;
    const lastYearSum = { 销量: 0, 销售额: 0 };
    dates.forEach((x) => {
      const [yx, mx] = x.split('-');
      if (parseInt(yx, 10) === targetYear && mx === cm) {
        lastYearSum.销量 += byDate[x].销量;
        lastYearSum.销售额 += byDate[x].销售额;
      }
    });
    return {
      日期: d,
      销量: curr.销量,
      销售额: curr.销售额,
      销量环比: prev && prev.销量 ? curr.销量 / prev.销量 - 1 : null,
      销售额环比: prev && prev.销售额 ? curr.销售额 / prev.销售额 - 1 : null,
      销量同比: lastYearSum.销量 ? curr.销量 / lastYearSum.销量 - 1 : null,
      销售额同比: lastYearSum.销售额 ? curr.销售额 / lastYearSum.销售额 - 1 : null,
    };
  });
  return { 说明: '全盘月度销量、销售额、环比/同比', 按日期: list };
}

function dimension4_channelTime(rows) {
  const byChannelDate = {};
  const byDateTotal = {};
  const byDateTotalAmount = {};
  rows.forEach((r) => {
    const key = `${r.渠道}\t${r.日期_str}`;
    if (!byChannelDate[key]) byChannelDate[key] = { 渠道: r.渠道, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byChannelDate[key].销量 += r.销量;
    byChannelDate[key].销售额 += r.销售额;
    byDateTotal[r.日期_str] = (byDateTotal[r.日期_str] || 0) + r.销量;
    byDateTotalAmount[r.日期_str] = (byDateTotalAmount[r.日期_str] || 0) + r.销售额;
  });
  const list = Object.values(byChannelDate).map((v) => ({
    ...v,
    当月全盘销量: byDateTotal[v.日期] || 0,
    当月全盘销售额: byDateTotalAmount[v.日期] || 0,
    当月销量占比: byDateTotal[v.日期] ? v.销量 / byDateTotal[v.日期] : 0,
    当月销售额占比: byDateTotalAmount[v.日期] ? v.销售额 / byDateTotalAmount[v.日期] : 0,
  }));
  return { 说明: '各渠道按月销量、销售额及当月占比', 按渠道与日期: list };
}

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
  return { 说明: '各价格段月度销量、销售额及当月占比', 按价格段与日期: list };
}

function dimension6_channelPrice(rows) {
  const byChannel = {};
  const byChannelAmount = {};
  rows.forEach((r) => {
    byChannel[r.渠道] = (byChannel[r.渠道] || 0) + r.销量;
    byChannelAmount[r.渠道] = (byChannelAmount[r.渠道] || 0) + r.销售额;
  });
  const byKey = {};
  rows.forEach((r) => {
    const key = `${r.渠道}\t${r.价格段}`;
    if (!byKey[key]) byKey[key] = { 渠道: r.渠道, 价格段: r.价格段, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  const list = Object.values(byKey).map((v) => ({
    ...v,
    客单价: v.销量 ? v.销售额 / v.销量 : 0,
    渠道内销量占比: byChannel[v.渠道] ? v.销量 / byChannel[v.渠道] : 0,
    渠道内销售额占比: byChannelAmount[v.渠道] ? v.销售额 / byChannelAmount[v.渠道] : 0,
  }));
  return { 说明: '各渠道在各价格段的销量、销售额、客单价、渠道内占比（已剔除0-1k）', 按渠道与价格段: list };
}

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
  return { 说明: '各渠道×价格段×日期的月度销量、销售额及当月占比', 按渠道与价格段与日期: list };
}

function dimension8_avgPrice(rows) {
  const d1 = dimension1_channel(rows);
  const d2 = dimension2_priceRange(rows);
  const d6 = dimension6_channelPrice(rows);
  const byDate = {};
  rows.forEach((r) => {
    if (!byDate[r.日期_str]) byDate[r.日期_str] = { 销量: 0, 销售额: 0 };
    byDate[r.日期_str].销量 += r.销量;
    byDate[r.日期_str].销售额 += r.销售额;
  });
  const 按时间客单价 = Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([日期, v]) => ({ 日期, 销量: v.销量, 销售额: v.销售额, 客单价: v.销量 ? v.销售额 / v.销量 : 0 }));
  return {
    说明: '各维度下客单价（已剔除0-1k）',
    按渠道: d1.按渠道.map((x) => ({ 渠道: x.渠道, 客单价: x.客单价 })),
    按价格段: d2.按价格段.map((x) => ({ 价格段: x.价格段, 客单价: x.销量 ? x.销售额 / x.销量 : 0 })),
    按渠道与价格段: d6.按渠道与价格段.map((x) => ({ 渠道: x.渠道, 价格段: x.价格段, 客单价: x.客单价 })),
    按时间: 按时间客单价,
  };
}

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
  return { 说明: '各渠道/价格段按月占比及占比环比', 渠道销量占比随时间, 价格段销量占比随时间 };
}

function dimension10_ranking(rows) {
  const d1 = dimension1_channel(rows);
  const d2 = dimension2_priceRange(rows);
  const byChannel = d1.按渠道.sort((a, b) => b.销量 - a.销量);
  const totalSales = d1.全盘销量合计;
  const totalAmount = d1.全盘销售额合计;
  let sumS = 0;
  let sumA = 0;
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
  let sumPS = 0;
  let sumPA = 0;
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
      CR1_销量: 价格段按销量排名[0] ? 价格段按销量排名[0].CRn_销量 : 0,
      CR2_销量: 价格段按销量排名[1] ? 价格段按销量排名[1].CRn_销量 : 0,
      CR3_销量: 价格段按销量排名[2] ? 价格段按销量排名[2].CRn_销量 : 0,
    },
  };
}

function filterTopRows(rows, topBrands) {
  const set = new Set(topBrands);
  return rows.filter((r) => set.has(r.品牌));
}

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
    return { 品牌, 销量: v.销量, 销售额: v.销售额, 销量占比: totalSales ? v.销量 / totalSales : 0, 销售额占比: totalAmount ? v.销售额 / totalAmount : 0 };
  });
  return { 说明: '前十大品牌销量、销售额对比', 按品牌 };
}

function feature2_各品牌三大渠道占比(rows, topBrands) {
  const priceSegments = [...new Set(rows.map((r) => r.价格段))].filter(Boolean);
  function calcForRows(subRows) {
    const byBrand = {};
    const byBrandAmount = {};
    subRows.forEach((r) => {
      byBrand[r.品牌] = (byBrand[r.品牌] || 0) + r.销量;
      byBrandAmount[r.品牌] = (byBrandAmount[r.品牌] || 0) + r.销售额;
    });
    const byKey = {};
    subRows.forEach((r) => {
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
    return 按品牌与渠道;
  }
  const 按品牌与渠道 = calcForRows(rows);
  const 按价格段 = {};
  priceSegments.forEach((seg) => {
    按价格段[seg] = { 按品牌与渠道: calcForRows(rows.filter((r) => r.价格段 === seg)) };
  });
  return { 说明: '前十大品牌在三大渠道的销量、销售额及品牌内占比', 按品牌与渠道, 按价格段 };
}

function feature3_各月份市场占有率(allRows, topRows, topBrands) {
  const priceSegments = [...new Set(allRows.map((r) => r.价格段))].filter(Boolean);
  function calcForRows(subAll, subTop) {
    const byDateTotal = {};
    const byDateTotalAmount = {};
    subAll.forEach((r) => {
      byDateTotal[r.日期_str] = (byDateTotal[r.日期_str] || 0) + r.销量;
      byDateTotalAmount[r.日期_str] = (byDateTotalAmount[r.日期_str] || 0) + r.销售额;
    });
    const byBrandDate = {};
    subTop.forEach((r) => {
      const key = `${r.品牌}\t${r.日期_str}`;
      if (!byBrandDate[key]) byBrandDate[key] = { 品牌: r.品牌, 日期: r.日期_str, 销量: 0, 销售额: 0 };
      byBrandDate[key].销量 += r.销量;
      byBrandDate[key].销售额 += r.销售额;
    });
    const dates = [...new Set(subAll.map((r) => r.日期_str))].sort();
    const 各品牌按日期市占率 = {};
    const 各品牌按日期市占率_销额 = {};
    topBrands.forEach((品牌) => {
      各品牌按日期市占率[品牌] = dates.map((日期) => {
        const total = byDateTotal[日期] || 0;
        const key = `${品牌}\t${日期}`;
        const 销量 = (byBrandDate[key] && byBrandDate[key].销量) || 0;
        return total ? 销量 / total : 0;
      });
      各品牌按日期市占率_销额[品牌] = dates.map((日期) => {
        const total = byDateTotalAmount[日期] || 0;
        const key = `${品牌}\t${日期}`;
        const 销售额 = (byBrandDate[key] && byBrandDate[key].销售额) || 0;
        return total ? 销售额 / total : 0;
      });
    });
    return { 按日期: dates, 各品牌按日期市占率, 各品牌按日期市占率_销额 };
  }
  const result = calcForRows(allRows, topRows);
  const 按价格段 = {};
  priceSegments.forEach((seg) => {
    按价格段[seg] = calcForRows(
      allRows.filter((r) => r.价格段 === seg),
      topRows.filter((r) => r.价格段 === seg),
    );
  });
  return { 说明: '前十大品牌各月份市场占有率，用于堆叠面积图', 按日期: result.按日期, 各品牌按日期市占率: result.各品牌按日期市占率, 各品牌按日期市占率_销额: result.各品牌按日期市占率_销额, 按价格段 };
}

function feature5_客单价对比(rows, topBrands) {
  const byBrand = {};
  rows.forEach((r) => {
    if (!byBrand[r.品牌]) byBrand[r.品牌] = { 销量: 0, 销售额: 0 };
    byBrand[r.品牌].销量 += r.销量;
    byBrand[r.品牌].销售额 += r.销售额;
  });
  const 按品牌 = topBrands.map((品牌) => {
    const v = byBrand[品牌] || { 销量: 0, 销售额: 0 };
    return { 品牌, 销量: v.销量, 销售额: v.销售额, 客单价: v.销量 ? v.销售额 / v.销量 : 0 };
  });
  return { 说明: '前十大品牌客单价对比', 按品牌 };
}

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
    byBrand[r.品牌].按价格段与日期[r.价格段][r.日期_str] =
      (byBrand[r.品牌].按价格段与日期[r.价格段][r.日期_str] || 0) + r.销量;
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
        按日期: dates.map((日期) => ({ 日期, 销量: 按价格段与日期[价格段][日期] || 0 })),
      })),
    };
  });
  return { 说明: '前十大品牌每个品牌在不同价格段中的销量随时间，每品牌可绘一堆叠面积图', 按品牌 };
}

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

function feature_品牌与渠道与日期(rowsTop) {
  const byKey = {};
  rowsTop.forEach((r) => {
    const key = `${r.品牌}\t${r.渠道}\t${r.价格段}\t${r.日期_str}`;
    if (!byKey[key]) byKey[key] = { 品牌: r.品牌, 渠道: r.渠道, 价格段: r.价格段, 日期: r.日期_str, 销量: 0, 销售额: 0 };
    byKey[key].销量 += r.销量;
    byKey[key].销售额 += r.销售额;
  });
  return Object.values(byKey);
}

function buildDaPanPayloadFromValues(values, sourceLabel) {
  const parsed = parseDaPanRowsFromValues(values);
  const rows = parsed.rows;
  return {
    数据说明: {
      数据源: sourceLabel || 'sheet1',
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
}

function buildBrandPayloadFromValues(values, sourceLabel) {
  const parsed = parseBrandRowsFromValues(values);
  const rows = parsed.rows;
  const topBrands = FIXED_TOP_BRANDS.slice();
  const rowsTop = filterTopRows(rows, topBrands);
  return {
    数据说明: {
      数据源: sourceLabel || 'sheet2',
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
}

module.exports = {
  FIXED_TOP_BRANDS,
  isPriceSegment01k,
  normalizeBrand,
  excelDateToStr,
  parseDaPanRowsFromValues,
  parseBrandRowsFromValues,
  buildDaPanPayloadFromValues,
  buildBrandPayloadFromValues,
};
