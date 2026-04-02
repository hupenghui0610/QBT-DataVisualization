function pad2(n) {
  return String(n).padStart(2, '0');
}

function currentDateYmd() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function lastDateOfYearMonth(yearMonth) {
  var p = String(yearMonth || '').split('-');
  if (p.length !== 2) return '';
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  if (!isFinite(y) || !isFinite(m) || m < 1 || m > 12) return '';
  return String(yearMonth) + '-' + pad2(new Date(y, m, 0).getDate());
}

export function resolveMonthlyStatDate(yearMonth, nowYmd) {
  var ym = String(yearMonth || '');
  var today = String(nowYmd || currentDateYmd());
  if (today.slice(0, 7) === ym) return today;
  return lastDateOfYearMonth(ym);
}

function unwrapFeishuCell(v) {
  if (v == null) return v;
  if (typeof v === 'object' && !Array.isArray(v)) {
    if (v.text != null && v.text !== '') return v.text;
    if (v.value !== undefined && v.value !== null && v.value !== '') return v.value;
    if (typeof v.stringValue === 'string') return v.stringValue;
  }
  return v;
}

function parseNum(v) {
  var raw = unwrapFeishuCell(v);
  if (typeof raw === 'string' && /^[\s\u00a0]*[=＝]/.test(raw)) return 0;
  var s = String(raw == null ? '' : raw).replace(/[,，\s\u00a0]/g, '');
  var wan = s.match(/^([\d.]+)\s*万/);
  if (wan) {
    var w = parseFloat(wan[1]);
    return isFinite(w) ? w * 10000 : 0;
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseFeishuCellDate(cell) {
  cell = unwrapFeishuCell(cell);
  if (cell == null || cell === '') return '';
  if (typeof cell === 'number' && isFinite(cell) && cell > 20000 && cell < 60000) {
    var utcDays = Math.floor(cell - 25569);
    var d0 = new Date(utcDays * 86400 * 1000);
    return d0.getFullYear() + '-' + pad2(d0.getMonth() + 1) + '-' + pad2(d0.getDate());
  }
  var s = String(cell).trim();
  var ymd8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd8) return ymd8[1] + '-' + ymd8[2] + '-' + ymd8[3];
  s = s.replace(/年|月/g, '-').replace(/日/g, '').replace(/\./g, '-').replace(/\//g, '-');
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
  var tryD = new Date(s);
  if (!isNaN(tryD.getTime())) {
    return tryD.getFullYear() + '-' + pad2(tryD.getMonth() + 1) + '-' + pad2(tryD.getDate());
  }
  return '';
}

function parseMapByDate(values, colIndex) {
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      if (!ds) continue;
      bucket[ds] = (bucket[ds] || 0) + parseNum(row[colIndex]);
    }
  }
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return bucket;
}

function parseDailySalesLearnMap(values) {
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[1]);
      if (!ds) continue;
      bucket[ds] = (bucket[ds] || 0) + parseNum(row[6]);
    }
  }
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return bucket;
}

function parseDailySalesQinziMap(values) {
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      if (!ds) continue;
      bucket[ds] = (bucket[ds] || 0) + parseNum(row[6]);
    }
  }
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return bucket;
}

function buildGmvCombinedPoints(gmvCombined, dailySales, douyinSales) {
  var jdV = (((gmvCombined || {}).jdValueRange || {}).values) || [];
  var tmV = (((gmvCombined || {}).tmallValueRange || {}).values) || [];
  var vr1 = (((dailySales || {}).valueRange || {}).values) || [];
  var vr2 = (((dailySales || {}).valueRange2 || {}).values) || [];
  var dy1 = (((douyinSales || {}).valueRange || {}).values) || [];
  var dy2 = (((douyinSales || {}).valueRange2 || {}).values) || [];
  var dy3 = (((douyinSales || {}).valueRange3 || {}).values) || [];
  var jdThirdMap = parseMapByDate(jdV, 5);
  var mapLearn = parseDailySalesLearnMap(vr1);
  var mapQinzi = parseDailySalesQinziMap(vr2);
  var mapTmShop = parseMapByDate(tmV, 6);
  var mapTmLearn = parseMapByDate(tmV, 10);
  var mapTmQinzi = parseMapByDate(tmV, 12);
  var mapDyShop = parseMapByDate(dy1, 3);
  var mapDyDarenShop = parseMapByDate(dy1, 5);
  var mapDyLearn = parseMapByDate(dy2, 6);
  var mapDyQinzi = parseMapByDate(dy3, 6);
  var all = {};
  [jdThirdMap, mapLearn, mapQinzi, mapTmShop, mapTmLearn, mapTmQinzi, mapDyShop, mapDyDarenShop, mapDyLearn, mapDyQinzi].forEach(function (mp) {
    Object.keys(mp).forEach(function (d) {
      all[d] = true;
    });
  });
  return Object.keys(all).sort().map(function (d) {
    return {
      date: d,
      jdGmv: Number(jdThirdMap[d]) || 0,
      tmallGmv: Number(mapTmShop[d]) || 0,
      dySelfGmv: Number(mapDyShop[d]) || 0,
      dp: 0,
      daren: 0,
    };
  });
}

function buildGsvCombinedPoints(gmvCombined, douyinSales) {
  var jdV = (((gmvCombined || {}).jdValueRange || {}).values) || [];
  var jd1 = (((gmvCombined || {}).jdSheet1ValueRange || {}).values) || [];
  var jd2 = (((gmvCombined || {}).jdSheet2ValueRange || {}).values) || [];
  var tmV = (((gmvCombined || {}).tmallValueRange || {}).values) || [];
  var dy1 = (((douyinSales || {}).valueRange || {}).values) || [];
  var dy2 = (((douyinSales || {}).valueRange2 || {}).values) || [];
  var dy3 = (((douyinSales || {}).valueRange3 || {}).values) || [];
  var GSV_JD_FACTOR = 0.75;
  var jdShopRaw = parseMapByDate(jdV, 5);
  var jdLearnRaw = parseMapByDate(jd1, 6);
  var jdQinziRaw = parseMapByDate(jd2, 6);
  var jdGsvShop = {};
  var jdGsvLearn = {};
  var jdGsvQinzi = {};
  Object.keys(jdShopRaw).forEach(function (d) { jdGsvShop[d] = (Number(jdShopRaw[d]) || 0) * GSV_JD_FACTOR; });
  Object.keys(jdLearnRaw).forEach(function (d) { jdGsvLearn[d] = (Number(jdLearnRaw[d]) || 0) * GSV_JD_FACTOR; });
  Object.keys(jdQinziRaw).forEach(function (d) { jdGsvQinzi[d] = (Number(jdQinziRaw[d]) || 0) * GSV_JD_FACTOR; });
  var mapGmv = parseMapByDate(tmV, 6);
  var mapTmH = parseMapByDate(tmV, 7);
  var sumH = 0;
  var sumG = 0;
  Object.keys(mapTmH).forEach(function (d) { sumH += Math.abs(Number(mapTmH[d]) || 0); });
  Object.keys(mapGmv).forEach(function (d) { sumG += Math.abs(Number(mapGmv[d]) || 0); });
  var useFallback = sumH < 1e-6 && sumG > 1e-6;
  var mapDyH = parseMapByDate(dy1, 6);
  var mapDyKLearn = parseMapByDate(dy2, 10);
  var mapDyKQinzi = parseMapByDate(dy3, 10);
  var mapDyJ = parseMapByDate(dy1, 9);
  var all = {};
  [jdGsvShop, jdGsvLearn, jdGsvQinzi, mapTmH, mapGmv, mapDyH, mapDyKLearn, mapDyKQinzi, mapDyJ].forEach(function (mp) {
    Object.keys(mp).forEach(function (d) { all[d] = true; });
  });
  return Object.keys(all).sort().map(function (d) {
    var tmallGsvShop = mapTmH[d] != null ? Number(mapTmH[d]) : 0;
    if (useFallback) tmallGsvShop = (Number(mapGmv[d]) || 0) * 0.75;
    return {
      date: d,
      jdGsv: Number(jdGsvShop[d]) || 0,
      tmallGsv: tmallGsvShop,
      dySelfGsv: Number(mapDyH[d]) || 0,
      dpGsv: 0,
      darenGsv: 0,
    };
  });
}

function buildDouyinTrendPointsDaily(douyinTrend) {
  var values = (((douyinTrend || {}).valueRange || {}).values) || [];
  if (!values || !values.length) return [];
  var DP_ALWAYS = { '希沃官方帐号': true, '希沃官方账号': true, '希沃官方直播间': true };
  var DP_FROM_20260401 = { '希沃亲子屏官方直播间': true, '希沃官方旗舰店': true };
  var CUTOVER = '2026-04-01';
  var bucket = {};
  function scan(startRow) {
    for (var r = startRow; r < values.length; r++) {
      var row = values[r];
      if (!row) continue;
      var ds = parseFeishuCellDate(row[0]);
      var acc = String(unwrapFeishuCell(row[1]) == null ? '' : unwrapFeishuCell(row[1])).trim();
      if (!ds || !acc) continue;
      var gmv = parseNum(row[5]);
      var refund = parseNum(row[13]);
      var gsv = gmv - refund;
      if (!bucket[ds]) bucket[ds] = { dp: 0, daren: 0, dpGsv: 0, darenGsv: 0 };
      if (DP_ALWAYS[acc] || (DP_FROM_20260401[acc] && ds >= CUTOVER)) {
        bucket[ds].dp += gmv;
        bucket[ds].dpGsv += gsv;
      } else if (!DP_FROM_20260401[acc]) {
        bucket[ds].daren += gmv;
        bucket[ds].darenGsv += gsv;
      }
    }
  }
  scan(1);
  if (!Object.keys(bucket).length) scan(0);
  return Object.keys(bucket).sort().map(function (d) {
    var b = bucket[d] || {};
    return {
      date: d,
      dp: Number(b.dp) || 0,
      daren: Number(b.daren) || 0,
      dpGsv: Number(b.dpGsv) || 0,
      darenGsv: Number(b.darenGsv) || 0,
    };
  });
}

function sumMonthlyAllChannelGmvGsv(yearMonth, gmvDaily, gsvDaily, dyDaily) {
  var ym = String(yearMonth || '');
  var startD = ym + '-01';
  var p = ym.split('-');
  var endD = ym + '-' + pad2(new Date(parseInt(p[0], 10), parseInt(p[1], 10), 0).getDate());
  var sumGmv = { jd: 0, tm: 0, dy: 0, dp: 0, daren: 0 };
  var sumGsv = { jd: 0, tm: 0, dy: 0, dp: 0, daren: 0 };
  (gmvDaily || []).forEach(function (pt) {
    if (!pt || !pt.date || pt.date < startD || pt.date > endD) return;
    sumGmv.jd += Number(pt.jdGmv) || 0;
    sumGmv.tm += Number(pt.tmallGmv) || 0;
    sumGmv.dy += Number(pt.dySelfGmv) || 0;
  });
  (gsvDaily || []).forEach(function (pt) {
    if (!pt || !pt.date || pt.date < startD || pt.date > endD) return;
    sumGsv.jd += Number(pt.jdGsv) || 0;
    sumGsv.tm += Number(pt.tmallGsv) || 0;
    sumGsv.dy += Number(pt.dySelfGsv) || 0;
  });
  (dyDaily || []).forEach(function (pt) {
    if (!pt || !pt.date || pt.date < startD || pt.date > endD) return;
    sumGmv.dp += Number(pt.dp) || 0;
    sumGmv.daren += Number(pt.daren) || 0;
    sumGsv.dp += Number(pt.dpGsv) || 0;
    sumGsv.daren += Number(pt.darenGsv) || 0;
  });
  return { yearMonth: ym, sumGmv: sumGmv, sumGsv: sumGsv };
}

function rate(gmv, gsv) {
  var a = Number(gmv) || 0;
  var b = Number(gsv) || 0;
  if (!(a > 0)) return 0;
  return (1 - b / a) * 100;
}

function toWan(n) {
  return (Number(n || 0) / 10000).toFixed(2);
}

export function buildMonthlyCumulativeSummary(yearMonth, gmvCombined, douyinSales, douyinTrend) {
  var gmvDaily = buildGmvCombinedPoints(gmvCombined, {}, douyinSales);
  var gsvDaily = buildGsvCombinedPoints(gmvCombined, douyinSales);
  var dyDaily = buildDouyinTrendPointsDaily(douyinTrend);
  var pack = sumMonthlyAllChannelGmvGsv(yearMonth, gmvDaily, gsvDaily, dyDaily);
  var sg = pack.sumGmv;
  var ss = pack.sumGsv;
  var totalGmv = (sg.jd || 0) + (sg.tm || 0) + (sg.dy || 0) + (sg.dp || 0) + (sg.daren || 0);
  var totalGsv = (ss.jd || 0) + (ss.tm || 0) + (ss.dy || 0) + (ss.dp || 0) + (ss.daren || 0);
  var hasAnyData = !!(
    totalGmv > 0 ||
    totalGsv > 0 ||
    gmvDaily.some(function (pt) { return pt && pt.date && pt.date.slice(0, 7) === yearMonth; }) ||
    gsvDaily.some(function (pt) { return pt && pt.date && pt.date.slice(0, 7) === yearMonth; }) ||
    dyDaily.some(function (pt) { return pt && pt.date && pt.date.slice(0, 7) === yearMonth; })
  );
  return {
    yearMonth: yearMonth,
    generatedAt: new Date().toISOString(),
    hasAnyData: hasAnyData,
    summary: {
      totalGmv: totalGmv,
      totalGsv: totalGsv,
      refundRatePct: Number(rate(totalGmv, totalGsv).toFixed(2)),
      totalGmvWan: toWan(totalGmv),
      totalGsvWan: toWan(totalGsv),
    },
    channels: [
      { key: 'jd', label: '京东', gmv: sg.jd, gsv: ss.jd },
      { key: 'tmall', label: '天猫', gmv: sg.tm, gsv: ss.tm },
      { key: 'dySelf', label: '抖音自播', gmv: sg.dy, gsv: ss.dy },
      { key: 'dp', label: '抖音DP', gmv: sg.dp, gsv: ss.dp },
      { key: 'daren', label: '抖音达人', gmv: sg.daren, gsv: ss.daren },
    ].map(function (item) {
      return {
        key: item.key,
        label: item.label,
        gmv: item.gmv,
        gsv: item.gsv,
        gmvWan: toWan(item.gmv),
        gsvWan: toWan(item.gsv),
        refundRatePct: Number(rate(item.gmv, item.gsv).toFixed(2)),
      };
    }),
  };
}

export function formatMonthlyCumulativeMessage(summaryPayload, statDate) {
  var ch = {};
  (summaryPayload.channels || []).forEach(function (item) {
    ch[item.key] = item;
  });
  function line(key) {
    var x = ch[key] || { gmvWan: '0.00', gsvWan: '0.00', refundRatePct: 0 };
    var label = x.label || '';
    return label + '：GMV ' + x.gmvWan + '万｜GSV ' + x.gsvWan + '万｜退款率 ' + Number(x.refundRatePct || 0).toFixed(2) + '%';
  }
  function formatGeneratedAt(isoString) {
    var d = new Date(isoString || new Date().toISOString());
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  return [
    '月度累计达成播报｜' + String(summaryPayload.yearMonth || '').replace(/^(\d{4})-(\d{2})$/, '$1年$2月'),
    '统计日期：' + String(statDate || ''),
    '统计口径：当月1日至统计日期累计',
    '--------------',
    '总GMV：' + (((summaryPayload.summary || {}).totalGmvWan) || '0.00') + '万',
    '总GSV：' + (((summaryPayload.summary || {}).totalGsvWan) || '0.00') + '万',
    '退款率：' + Number((((summaryPayload.summary || {}).refundRatePct) || 0)).toFixed(2) + '%',
    '--------------',
    line('jd'),
    line('tmall'),
    line('dySelf'),
    line('dp'),
    line('daren'),
    '生成时间：' + formatGeneratedAt(summaryPayload.generatedAt),
  ].join('\n');
}
