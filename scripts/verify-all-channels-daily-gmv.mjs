/**
 * 全渠道按日 GMV：与 feishu-channel-order-trend 聚合逻辑一致（达人→渠道首行优先、剔除已关闭、AH 日、I 金额）。
 * FEISHU_APP_ID / FEISHU_APP_SECRET 必填。
 */
const SPREADSHEET_TOKEN =
  process.env.FEISHU_CHANNEL_ORDER_SPREADSHEET_TOKEN || 'P1zusUMg2haMGctskH6cydLqn5e';
const CHANNEL_RANGE = process.env.FEISHU_CHANNEL_MAP_RANGE || 'ghju03!A1:E2000';
const ORDER_RANGE = process.env.FEISHU_ORDER_DETAIL_RANGE || 'tuec5U!I1:AO20000';
const SKIP_ROWS = Math.max(0, parseInt(process.env.FEISHU_CHANNEL_ORDER_SKIP_ROWS || '1', 10) || 1);

const COL_I_FULL = 8, COL_AO_FULL = 40, COL_AH_FULL = 33, COL_AK_FULL = 36;
const COL_I_NARROW = 0, COL_AO_NARROW = 32, COL_AH_NARROW = 25, COL_AK_NARROW = 28;

function orderRangeUsesIColumnOrigin(orderRange) {
  const bang = orderRange.indexOf('!');
  if (bang < 0) return false;
  return /I[0-9]*:/i.test(orderRange.slice(bang + 1));
}
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}
function ymdFromExcelSerial(serial) {
  const whole = Math.floor(Number(serial));
  if (whole < 1 || whole > 6000000) return null;
  const utc_days = whole - 25569;
  const ms = utc_days * 86400 * 1000;
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}
function parseDayFromAH(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !isNaN(v)) return ymdFromExcelSerial(v);
  const str = String(v).trim();
  if (!str) return null;
  const numOnly = parseFloat(str);
  if (!isNaN(numOnly) && /^-?\d+(\.\d+)?$/.test(str.trim()) && numOnly >= 1 && numOnly < 6000000) {
    const fromSerial = ymdFromExcelSerial(numOnly);
    if (fromSerial) return fromSerial;
  }
  const part = str.split(/\s+/)[0];
  const parts = part.split(/[\/\-]/);
  if (parts.length >= 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (y && m && d) return y + '-' + pad2(m) + '-' + pad2(d);
  }
  const t = Date.parse(str.replace(/\//g, '-'));
  if (!isNaN(t)) {
    const dt2 = new Date(t);
    return dt2.getFullYear() + '-' + pad2(dt2.getMonth() + 1) + '-' + pad2(dt2.getDate());
  }
  return null;
}
function parseAmount(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

async function getTenantToken(appId, appSecret) {
  const tr = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: String(appId), app_secret: String(appSecret) }),
  });
  const tj = await tr.json();
  if (tj.code !== 0) throw new Error('tenant_token: ' + (tj.msg || tj.code));
  return tj.tenant_access_token;
}
async function fetchRange(token, spreadsheetToken, range, valueRenderOption) {
  const vro = encodeURIComponent(String(valueRenderOption));
  const qs = '?value_render_option=' + vro + '&valueRenderOption=' + vro;
  const url =
    'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/' +
    encodeURIComponent(spreadsheetToken) +
    '/values/' +
    encodeURIComponent(range) +
    qs;
  const sr = await fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' },
  });
  return sr.json();
}

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    console.error('缺少 FEISHU_APP_ID / FEISHU_APP_SECRET');
    process.exit(1);
  }
  const narrow = orderRangeUsesIColumnOrigin(ORDER_RANGE);
  const colI = narrow ? COL_I_NARROW : COL_I_FULL;
  const colAO = narrow ? COL_AO_NARROW : COL_AO_FULL;
  const colAH = narrow ? COL_AH_NARROW : COL_AH_FULL;
  const colAK = narrow ? COL_AK_NARROW : COL_AK_FULL;

  const token = await getTenantToken(appId, appSecret);
  const [chJson, ordJson] = await Promise.all([
    fetchRange(token, SPREADSHEET_TOKEN, CHANNEL_RANGE, 'FormattedValue'),
    fetchRange(token, SPREADSHEET_TOKEN, ORDER_RANGE, 'UnformattedValue'),
  ]);
  if (!chJson || chJson.code !== 0) {
    console.error('渠道表失败', chJson);
    process.exit(2);
  }
  if (!ordJson || ordJson.code !== 0) {
    console.error('订单表失败', ordJson);
    process.exit(3);
  }
  const chValues = (chJson.data && chJson.data.valueRange && chJson.data.valueRange.values) || [];
  const ordValues = (ordJson.data && ordJson.data.valueRange && ordJson.data.valueRange.values) || [];

  const darenToChannel = {};
  for (let r = SKIP_ROWS; r < chValues.length; r++) {
    const crow = chValues[r] || [];
    const chName = String(crow[0] || '').trim();
    const darenId = String(crow[4] || '').trim();
    if (!chName || !darenId) continue;
    if (darenToChannel[darenId] === undefined) darenToChannel[darenId] = chName;
  }
  const channelSet = {};
  for (const d0 in darenToChannel) {
    channelSet[darenToChannel[d0]] = true;
  }
  const channels = Object.keys(channelSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const totals = {};
  let rowsOpen = 0;
  let rowsClosed = 0;
  let rowsNoDay = 0;
  let rowsNoDaren = 0;
  let rowsUnmapped = 0;

  for (let ri = SKIP_ROWS; ri < ordValues.length; ri++) {
    const row = ordValues[ri] || [];
    const needLen = colAO > colAK ? colAO : colAK;
    if (row.length <= needLen) continue;
    const status = String(row[colAK] || '').trim();
    if (status === '已关闭') {
      rowsClosed++;
      continue;
    }
    const daren = String(row[colAO] || '').trim();
    if (!daren) {
      rowsNoDaren++;
      continue;
    }
    const channel = darenToChannel[daren];
    if (!channel) {
      rowsUnmapped++;
      continue;
    }
    const day = parseDayFromAH(row[colAH]);
    if (!day) {
      rowsNoDay++;
      continue;
    }
    const amt = parseAmount(row[colI]);
    if (!totals[day]) totals[day] = {};
    totals[day][channel] = (totals[day][channel] || 0) + amt;
    rowsOpen++;
  }

  const dates = Object.keys(totals)
    .filter(Boolean)
    .sort();

  console.log('=== 全渠道按日 GMV（与 feishu-channel-order-trend 一致）===');
  console.log('token', SPREADSHEET_TOKEN);
  console.log('渠道范围', CHANNEL_RANGE);
  console.log('订单范围', ORDER_RANGE);
  console.log('列下标 I,AO,AH,AK 窄表=', narrow, [colI, colAO, colAH, colAK]);
  console.log('--- 订单扫描 ---');
  console.log(
    '计入行',
    rowsOpen,
    '已关闭跳过',
    rowsClosed,
    '无达人',
    rowsNoDaren,
    '无渠道映射',
    rowsUnmapped,
    '无有效日期',
    rowsNoDay
  );
  console.log('--- 各渠道 ---');
  for (let ci = 0; ci < channels.length; ci++) {
    const cname = channels[ci];
    let sumCh = 0;
    const lines = [];
    for (let di = 0; di < dates.length; di++) {
      const dt = dates[di];
      const v = totals[dt] && totals[dt][cname] != null ? totals[dt][cname] : 0;
      if (v !== 0) {
        lines.push(dt + '\t' + v);
        sumCh += v;
      }
    }
    console.log('');
    console.log('【' + cname + '】合计 ' + sumCh + (lines.length ? '' : '（无按日明细）'));
    if (lines.length) {
      console.log('日期\tGMV');
      for (const ln of lines) console.log(ln);
    }
  }
  console.log('');
  console.log('--- 全表按日合计（所有渠道）---');
  let grand = 0;
  for (const dt of dates) {
    let daySum = 0;
    for (const cname of channels) {
      daySum += totals[dt] && totals[dt][cname] != null ? totals[dt][cname] : 0;
    }
    if (daySum !== 0) {
      console.log(dt, daySum);
      grand += daySum;
    }
  }
  console.log('全表合计', grand);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
